const { verifyToken } = require("./auth")
const { db } = require("./db")
const { eq, and, or, sql } = require("drizzle-orm")
const { 
  users, 
  friendships, 
  caroRooms, 
  caroGames, 
  wallets, 
  transactions, 
  caroStats 
} = require("./db/schema")

// Store online users: userId -> socketId
const onlineUsers = new Map()

function setupSocketHandlers(io) {
  // Authentication middleware for socket connections
  io.use((socket, next) => {
    // Try to get token from auth (sent by client)
    let token = socket.handshake.auth.token

    // If no token in auth, try to get from cookies
    if (!token && socket.handshake.headers.cookie) {
      const cookies = socket.handshake.headers.cookie.split(';')
      const tokenCookie = cookies.find(c => c.trim().startsWith('token='))
      if (tokenCookie) {
        token = tokenCookie.split('=')[1]
      }
    }

    if (!token) {
      console.log("[Socket] No token provided in handshake or cookies")
      return next(new Error("Authentication required"))
    }

    const decoded = verifyToken(token)

    if (!decoded) {
      console.log("[Socket] Invalid token")
      return next(new Error("Invalid token"))
    }

    socket.userId = decoded.userId
    console.log(`[Socket] User authenticated: ${socket.userId}`)
    next()
  })

  io.on("connection", async (socket) => {
    console.log(`[Socket] User connected: ${socket.userId}, socket: ${socket.id}`)

    // Add/update user to online users (always use the latest socket)
    onlineUsers.set(socket.userId, socket.id)

    // Join user's personal room
    socket.join(`user:${socket.userId}`)

    // Get user's friends and notify them
    try {
      const friendsList = await db
        .select({
          friendId: sql`CASE 
            WHEN ${friendships.userId} = ${socket.userId} THEN ${friendships.friendId}
            ELSE ${friendships.userId}
          END`.as('friend_id')
        })
        .from(friendships)
        .where(
          and(
            or(
              eq(friendships.userId, socket.userId),
              eq(friendships.friendId, socket.userId)
            ),
            eq(friendships.status, 'accepted')
          )
        )
      
      // Notify all friends that this user is online
      friendsList.forEach(row => {
        io.to(`user:${row.friendId}`).emit("user-online", { userId: socket.userId })
      })

      console.log(`[Socket] User ${socket.userId} is now online, notified ${friendsList.length} friends`)
    } catch (error) {
      console.error("[Socket] Error notifying friends:", error)
    }

    // Farm events
    socket.on("farm:update", async (data) => {
      io.to(`user:${socket.userId}`).emit("farm:updated", data)
    })

    // Chat events
    socket.on("join-chat", (chatId) => {
      socket.join(`chat:${chatId}`)
      console.log(`[v0] User ${socket.userId} joined chat: ${chatId}`)
    })

    socket.on("leave-chat", (chatId) => {
      socket.leave(`chat:${chatId}`)
      console.log(`[v0] User ${socket.userId} left chat: ${chatId}`)
    })

    socket.on("send-message", async (data) => {
      const { chatId, message } = data
      // Broadcast to all users in the chat room
      socket.to(`chat:${chatId}`).emit("message-received", message)
      console.log(`[v0] Message sent to chat: ${chatId}`)
    })

    socket.on("typing", (data) => {
      const { chatId } = data
      // Broadcast typing indicator to other users in the chat
      socket.to(`chat:${chatId}`).emit("user-typing")
    })

    // Caro game events
    socket.on("caro:join-lobby", () => {
      socket.join("caro:lobby")
      console.log(`[Caro] User ${socket.userId} joined lobby`)
    })

    socket.on("caro:leave-lobby", () => {
      socket.leave("caro:lobby")
      console.log(`[Caro] User ${socket.userId} left lobby`)
    })

    socket.on("caro:join-room", async (roomCode) => {
      socket.join(`caro:${roomCode}`)
      console.log(`[Caro] User ${socket.userId} joined room ${roomCode}`)
      
      // Get room info and update player count
      try {
        const roomData = await db
          .select({
            gameId: caroGames.id,
            player1Id: caroGames.player1Id,
            player2Id: caroGames.player2Id,
            currentPlayerCount: caroGames.currentPlayerCount
          })
          .from(caroRooms)
          .innerJoin(caroGames, eq(caroRooms.id, caroGames.roomId))
          .where(eq(caroRooms.roomCode, roomCode))
          .limit(1)

        if (roomData.length > 0) {
          const game = roomData[0]
          
          // Get all users in this room
          const socketsInRoom = await io.in(`caro:${roomCode}`).fetchSockets()
          const userIdsInRoom = [...new Set(socketsInRoom.map(s => s.userId))]
          
          // Count actual players (not spectators)
          let actualPlayerCount = 0
          if (game.player1Id && userIdsInRoom.includes(game.player1Id)) actualPlayerCount++
          if (game.player2Id && userIdsInRoom.includes(game.player2Id)) actualPlayerCount++
          
          // Update player count
          await db
            .update(caroGames)
            .set({ currentPlayerCount: actualPlayerCount })
            .where(eq(caroGames.id, game.gameId))
          
          // Emit current online users to the joining user
          socket.emit("caro:room-users-online", { userIds: userIdsInRoom })
          
          // Notify others in room that this user is online
          socket.to(`caro:${roomCode}`).emit("caro:user-online", { userId: socket.userId })
          
          // Broadcast updated player count to lobby
          io.to("caro:lobby").emit("caro:room-player-count", { 
            roomCode, 
            playerCount: actualPlayerCount 
          })
        }
      } catch (error) {
        console.error(`[Caro] Error updating player count:`, error)
      }
    })

    socket.on("caro:leave-room", async (roomCode) => {
      try {
        // Get room and game info before leaving
        const roomData = await db
          .select()
          .from(caroRooms)
          .innerJoin(caroGames, eq(caroRooms.id, caroGames.roomId))
          .where(eq(caroRooms.roomCode, roomCode))
          .limit(1)

        if (roomData.length === 0) {
          socket.leave(`caro:${roomCode}`)
          return console.error(`[Caro] Room ${roomCode} not found`)
        }

        const game = { ...roomData[0].caro_rooms, ...roomData[0].caro_games }
        
        // Determine which player is leaving
        const isPlayer1 = game.player1Id === socket.userId
        const isPlayer2 = game.player2Id === socket.userId

        if (!isPlayer1 && !isPlayer2) {
          socket.leave(`caro:${roomCode}`)
          return console.log(`[Caro] User ${socket.userId} left room ${roomCode} (was spectator)`)
        }

        // Update player count
        const newPlayerCount = Math.max(0, (game.currentPlayerCount || 0) - 1)
        await db
          .update(caroGames)
          .set({ currentPlayerCount: newPlayerCount })
          .where(eq(caroGames.id, game.id))

        // If game is in progress, handle as forfeit (unless has time limit)
        const hasTimeLimit = game.timeLimitMinutes !== null
        if (game.status === 'playing' && !hasTimeLimit) {
          // No time limit - immediate forfeit
          const winnerId = isPlayer1 ? game.player2Id : game.player1Id
          const loserId = socket.userId
          const winner = isPlayer1 ? 2 : 1

          // Update game as finished with forfeit
          await db
            .update(caroGames)
            .set({ 
              status: 'finished', 
              winnerId: winnerId, 
              finishedAt: new Date() 
            })
            .where(eq(caroGames.id, game.id))

          await db
            .update(caroRooms)
            .set({ 
              status: 'finished', 
              finishedAt: new Date() 
            })
            .where(eq(caroRooms.roomCode, roomCode))

          // Calculate winnings (winner gets full pot)
          const totalPot = parseFloat(game.betAmount) * 2
          const winnings = totalPot * 0.8

          // Update wallets
          await db
            .update(wallets)
            .set({ 
              balance: sql`${wallets.balance} + ${winnings}` 
            })
            .where(eq(wallets.userId, winnerId))
          
          // Record transactions
          await db.insert(transactions).values({
            userId: winnerId,
            amount: winnings.toString(),
            type: "game_win",
            source: "caro",
            description: `Won caro game in room ${roomCode} (opponent forfeited)`
          })
          
          await db.insert(transactions).values({
            userId: loserId,
            amount: (-parseFloat(game.betAmount)).toString(),
            type: "game_loss",
            source: "caro",
            description: `Lost caro game in room ${roomCode} (forfeited)`
          })

          // Update stats - insert or update for winner
          await db
            .insert(caroStats)
            .values({
              userId: winnerId,
              gamesPlayed: 1,
              gamesWon: 1,
              totalEarnings: winnings.toString()
            })
            .onConflictDoUpdate({
              target: caroStats.userId,
              set: {
                gamesPlayed: sql`${caroStats.gamesPlayed} + 1`,
                gamesWon: sql`${caroStats.gamesWon} + 1`,
                totalEarnings: sql`${caroStats.totalEarnings} + ${winnings}`
              }
            })
          
          // Update stats - insert or update for loser
          await db
            .insert(caroStats)
            .values({
              userId: loserId,
              gamesPlayed: 1,
              gamesWon: 0,
              totalEarnings: (-parseFloat(game.betAmount)).toString()
            })
            .onConflictDoUpdate({
              target: caroStats.userId,
              set: {
                gamesPlayed: sql`${caroStats.gamesPlayed} + 1`,
                totalEarnings: sql`${caroStats.totalEarnings} + ${-parseFloat(game.betAmount)}`
              }
            })

          // Notify room of forfeit
          socket.to(`caro:${roomCode}`).emit("caro:player-left", {
            playerId: socket.userId,
            winner: winner,
            winnings: winnings,
            reason: 'forfeit'
          })
          
          // Notify room that user went offline
          socket.to(`caro:${roomCode}`).emit("caro:user-offline", { userId: socket.userId })

          console.log(`[Caro] Player ${socket.userId} forfeited game in room ${roomCode}`)
        } else if (game.status === 'playing' && hasTimeLimit) {
          // Has time limit - player can rejoin
          console.log(`[Caro] Player ${socket.userId} disconnected from room ${roomCode} (can rejoin)`)
          
          // Notify room that user went offline
          socket.to(`caro:${roomCode}`).emit("caro:user-offline", { userId: socket.userId })
          
          // Notify lobby about player count change
          io.to("caro:lobby").emit("caro:room-player-count", { 
            roomCode, 
            playerCount: newPlayerCount 
          })
        } else {
          // Game not started yet
          if (newPlayerCount === 0) {
            // No players left - reset room to defaults
            await db
              .update(caroGames)
              .set({ 
                player1Id: null,
                player2Id: null, 
                player1Ready: false, 
                player2Ready: false,
                currentPlayer: 1,
                currentPlayerCount: 0
              })
              .where(eq(caroGames.id, game.id))

            await db
              .update(caroRooms)
              .set({ status: 'cancelled' })
              .where(eq(caroRooms.roomCode, roomCode))

            // Notify lobby to remove room
            io.to("caro:lobby").emit("caro:room-removed", { roomCode })

            console.log(`[Caro] All players left room ${roomCode}, room reset and cancelled`)
          } else if (isPlayer1) {
            // Player 1 (host) is leaving - close the room
            await db
              .update(caroRooms)
              .set({ status: 'cancelled' })
              .where(eq(caroRooms.roomCode, roomCode))

            // Notify room that host left
            socket.to(`caro:${roomCode}`).emit("caro:room-closed", {
              reason: 'host_left'
            })
            
            // Notify room that user went offline
            socket.to(`caro:${roomCode}`).emit("caro:user-offline", { userId: socket.userId })

            // Notify lobby to remove room
            io.to("caro:lobby").emit("caro:room-removed", { roomCode })

            console.log(`[Caro] Host left room ${roomCode}, room closed`)
          } else if (isPlayer2) {
            // Player 2 is leaving - reset player2 and ready status
            await db
              .update(caroGames)
              .set({ 
                player2Id: null, 
                player1Ready: false, 
                player2Ready: false,
                currentPlayerCount: newPlayerCount
              })
              .where(eq(caroGames.id, game.id))

            // Get updated room info
            const updatedRoomData = await db
              .select({
                ...caroRooms,
                ...caroGames,
                player1Username: users.username
              })
              .from(caroRooms)
              .innerJoin(caroGames, eq(caroRooms.id, caroGames.roomId))
              .innerJoin(users, eq(caroGames.player1Id, users.id))
              .where(eq(caroRooms.roomCode, roomCode))
              .limit(1)

            console.log(`[Caro] Player 2 (${socket.userId}) left room ${roomCode}, notifying room`)

            // Notify room that player2 left (use io.to to include all sockets in room)
            io.to(`caro:${roomCode}`).emit("caro:room-updated", updatedRoomData[0])
            
            // Notify room that user went offline
            socket.to(`caro:${roomCode}`).emit("caro:user-offline", { userId: socket.userId })

            // Notify lobby that room is available again
            io.to("caro:lobby").emit("caro:room-available", updatedRoomData[0])
            
            // Notify lobby about player count change
            io.to("caro:lobby").emit("caro:room-player-count", { 
              roomCode, 
              playerCount: newPlayerCount 
            })

            console.log(`[Caro] Room ${roomCode} updated, room now available`)
          }
        }

        socket.leave(`caro:${roomCode}`)
        console.log(`[Caro] User ${socket.userId} left room ${roomCode}`)
      } catch (error) {
        console.error(`[Caro] Error handling leave room:`, error)
        socket.leave(`caro:${roomCode}`)
      }
    })

    socket.on("caro:move", (data) => {
      const { roomCode, x, y, player, board } = data
      // Broadcast move to all players in the room
      socket.to(`caro:${roomCode}`).emit("caro:move-made", { x, y, player, board })
      console.log(`[Caro] Move made in room ${roomCode}: (${x}, ${y}) by player ${player}`)
    })

    socket.on("caro:game-over", (data) => {
      const { roomCode, winner, winnings } = data
      // Broadcast game over to all players in the room
      io.to(`caro:${roomCode}`).emit("caro:game-finished", { winner, winnings })
      console.log(`[Caro] Game finished in room ${roomCode}, winner: ${winner}`)
    })

    socket.on("caro:player-ready", async (data) => {
      const { roomCode } = data
      
      try {
        // Get room and game info
        const roomData = await db
          .select()
          .from(caroRooms)
          .innerJoin(caroGames, eq(caroRooms.id, caroGames.roomId))
          .where(eq(caroRooms.roomCode, roomCode))
          .limit(1)

        if (roomData.length === 0) {
          return console.error(`[Caro] Room ${roomCode} not found`)
        }

        const game = { ...roomData[0].caro_rooms, ...roomData[0].caro_games }
        
        // Determine which player is readying up
        const isPlayer1 = game.player1Id === socket.userId
        const isPlayer2 = game.player2Id === socket.userId

        if (!isPlayer1 && !isPlayer2) {
          return console.error(`[Caro] User ${socket.userId} is not in room ${roomCode}`)
        }

        // Update ready status
        if (isPlayer1) {
          await db
            .update(caroGames)
            .set({ player1Ready: true })
            .where(eq(caroGames.id, game.id))
        } else {
          await db
            .update(caroGames)
            .set({ player2Ready: true })
            .where(eq(caroGames.id, game.id))
        }

        // Get updated game info
        const updatedGameData = await db
          .select({
            ...caroGames,
            player1Username: sql`u1.username`.as('player1_username'),
            player2Username: sql`u2.username`.as('player2_username')
          })
          .from(caroGames)
          .innerJoin(sql`users u1`, eq(caroGames.player1Id, sql`u1.id`))
          .leftJoin(sql`users u2`, eq(caroGames.player2Id, sql`u2.id`))
          .where(eq(caroGames.id, game.id))
          .limit(1)

        const updated = updatedGameData[0]

        // Broadcast ready status to room
        io.to(`caro:${roomCode}`).emit("caro:player-ready", {
          playerId: socket.userId,
          player1Ready: updated.player1Ready,
          player2Ready: updated.player2Ready
        })

        console.log(`[Caro] Player ${socket.userId} is ready in room ${roomCode}`)

        // If both players are ready, start the game
        if (updated.player1Ready && updated.player2Ready && updated.status === 'waiting') {
          // Initialize time controls if time limit is set
          const updateData = { status: 'playing' }
          if (updated.timeLimitMinutes) {
            const timeInSeconds = updated.timeLimitMinutes * 60
            updateData.player1TimeLeft = timeInSeconds
            updateData.player2TimeLeft = timeInSeconds
            updateData.lastMoveTime = new Date()
          }

          await db
            .update(caroGames)
            .set(updateData)
            .where(eq(caroGames.id, game.id))

          await db
            .update(caroRooms)
            .set({ status: 'playing' })
            .where(eq(caroRooms.roomCode, roomCode))

          // Get full room info with stats
          const fullRoomData = await db
            .select({
              ...caroRooms,
              ...caroGames,
              player1Username: sql`u1.username`.as('player1_username'),
              player2Username: sql`u2.username`.as('player2_username'),
              player1Wins: sql`cs1.games_won`.as('player1_wins'),
              player1Games: sql`cs1.games_played`.as('player1_games'),
              player1Level: sql`cs1.level`.as('player1_level'),
              player2Wins: sql`cs2.games_won`.as('player2_wins'),
              player2Games: sql`cs2.games_played`.as('player2_games'),
              player2Level: sql`cs2.level`.as('player2_level')
            })
            .from(caroRooms)
            .innerJoin(caroGames, eq(caroRooms.id, caroGames.roomId))
            .innerJoin(sql`users u1`, eq(caroGames.player1Id, sql`u1.id`))
            .leftJoin(sql`users u2`, eq(caroGames.player2Id, sql`u2.id`))
            .leftJoin(sql`caro_stats cs1`, eq(caroGames.player1Id, sql`cs1.user_id`))
            .leftJoin(sql`caro_stats cs2`, eq(caroGames.player2Id, sql`cs2.user_id`))
            .where(eq(caroRooms.roomCode, roomCode))
            .limit(1)

          // Broadcast game start
          io.to(`caro:${roomCode}`).emit("caro:game-started", fullRoomData[0])
          console.log(`[Caro] Game started in room ${roomCode}`)
        }
      } catch (error) {
        console.error(`[Caro] Error handling player ready:`, error)
      }
    })

    socket.on("disconnect", async (reason) => {
      console.log(`[Socket] User disconnected: ${socket.userId}, socket: ${socket.id}, reason: ${reason}`)
      
      // Remove from online users only if this is the current socket
      if (onlineUsers.get(socket.userId) === socket.id) {
        onlineUsers.delete(socket.userId)
        console.log(`[Socket] Removed user ${socket.userId} from online users`)
      } else {
        console.log(`[Socket] User ${socket.userId} has a newer socket, not removing from online users`)
      }

      // Get user's friends and notify them (only if removed from online users)
      if (!onlineUsers.has(socket.userId)) {
        try {
          const friendsList = await db
            .select({
              friendId: sql`CASE 
                WHEN ${friendships.userId} = ${socket.userId} THEN ${friendships.friendId}
                ELSE ${friendships.userId}
              END`.as('friend_id')
            })
            .from(friendships)
            .where(
              and(
                or(
                  eq(friendships.userId, socket.userId),
                  eq(friendships.friendId, socket.userId)
                ),
                eq(friendships.status, 'accepted')
              )
            )
          
          // Notify all friends that this user is offline
          friendsList.forEach(row => {
            io.to(`user:${row.friendId}`).emit("user-offline", { userId: socket.userId })
          })

          console.log(`[Socket] User ${socket.userId} is now offline, notified ${friendsList.length} friends`)
          
          // Notify all caro rooms that this user went offline
          const rooms = Array.from(socket.rooms).filter(room => room.startsWith('caro:') && room !== 'caro:lobby')
          rooms.forEach(room => {
            io.to(room).emit("caro:user-offline", { userId: socket.userId })
          })
        } catch (error) {
          console.error("[Socket] Error notifying friends on disconnect:", error)
        }
      }
    })
  })
}

module.exports = { setupSocketHandlers, onlineUsers }
