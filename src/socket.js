const { verifyToken } = require("./auth")
const { query } = require("./db")

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
      const friendsResult = await query(
        `SELECT CASE 
          WHEN user_id = $1 THEN friend_id 
          ELSE user_id 
        END as friend_id 
        FROM friendships 
        WHERE (user_id = $1 OR friend_id = $1) AND status = 'accepted'`,
        [socket.userId]
      )
      
      // Notify all friends that this user is online
      friendsResult.rows.forEach(row => {
        io.to(`user:${row.friend_id}`).emit("user-online", { userId: socket.userId })
      })

      console.log(`[Socket] User ${socket.userId} is now online, notified ${friendsResult.rows.length} friends`)
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

    socket.on("caro:join-room", (roomCode) => {
      socket.join(`caro:${roomCode}`)
      console.log(`[Caro] User ${socket.userId} joined room ${roomCode}`)
    })

    socket.on("caro:leave-room", (roomCode) => {
      socket.leave(`caro:${roomCode}`)
      console.log(`[Caro] User ${socket.userId} left room ${roomCode}`)
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
        const roomResult = await query(
          `SELECT cr.*, cg.* 
           FROM caro_rooms cr
           JOIN caro_games cg ON cr.id = cg.room_id
           WHERE cr.room_code = $1`,
          [roomCode]
        )

        if (roomResult.rows.length === 0) {
          return console.error(`[Caro] Room ${roomCode} not found`)
        }

        const game = roomResult.rows[0]
        
        // Determine which player is readying up
        const isPlayer1 = game.player1_id === socket.userId
        const isPlayer2 = game.player2_id === socket.userId

        if (!isPlayer1 && !isPlayer2) {
          return console.error(`[Caro] User ${socket.userId} is not in room ${roomCode}`)
        }

        // Update ready status
        const readyField = isPlayer1 ? 'player1_ready' : 'player2_ready'
        await query(
          `UPDATE caro_games 
           SET ${readyField} = TRUE
           WHERE id = $1`,
          [game.id]
        )

        // Get updated game info
        const updatedGame = await query(
          `SELECT cg.*, 
                  u1.username as player1_username,
                  u2.username as player2_username
           FROM caro_games cg
           JOIN users u1 ON cg.player1_id = u1.id
           LEFT JOIN users u2 ON cg.player2_id = u2.id
           WHERE cg.id = $1`,
          [game.id]
        )

        const updated = updatedGame.rows[0]

        // Broadcast ready status to room
        io.to(`caro:${roomCode}`).emit("caro:player-ready", {
          playerId: socket.userId,
          player1Ready: updated.player1_ready,
          player2Ready: updated.player2_ready
        })

        console.log(`[Caro] Player ${socket.userId} is ready in room ${roomCode}`)

        // If both players are ready, start the game
        if (updated.player1_ready && updated.player2_ready && updated.status === 'waiting') {
          await query(
            `UPDATE caro_games 
             SET status = 'playing'
             WHERE id = $1`,
            [game.id]
          )

          await query(
            `UPDATE caro_rooms 
             SET status = 'playing'
             WHERE room_code = $1`,
            [roomCode]
          )

          // Get full room info
          const fullRoom = await query(
            `SELECT cr.*, cg.*,
                    u1.username as player1_username,
                    u2.username as player2_username,
                    cs1.games_won as player1_wins, cs1.games_played as player1_games, cs1.level as player1_level,
                    cs2.games_won as player2_wins, cs2.games_played as player2_games, cs2.level as player2_level
             FROM caro_rooms cr
             JOIN caro_games cg ON cr.id = cg.room_id
             JOIN users u1 ON cg.player1_id = u1.id
             LEFT JOIN users u2 ON cg.player2_id = u2.id
             LEFT JOIN caro_stats cs1 ON cg.player1_id = cs1.user_id
             LEFT JOIN caro_stats cs2 ON cg.player2_id = cs2.user_id
             WHERE cr.room_code = $1`,
            [roomCode]
          )

          // Broadcast game start
          io.to(`caro:${roomCode}`).emit("caro:game-started", fullRoom.rows[0])
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
          const friendsResult = await query(
            `SELECT CASE 
              WHEN user_id = $1 THEN friend_id 
              ELSE user_id 
            END as friend_id 
            FROM friendships 
            WHERE (user_id = $1 OR friend_id = $1) AND status = 'accepted'`,
            [socket.userId]
          )
          
          // Notify all friends that this user is offline
          friendsResult.rows.forEach(row => {
            io.to(`user:${row.friend_id}`).emit("user-offline", { userId: socket.userId })
          })

          console.log(`[Socket] User ${socket.userId} is now offline, notified ${friendsResult.rows.length} friends`)
        } catch (error) {
          console.error("[Socket] Error notifying friends on disconnect:", error)
        }
      }
    })
  })
}

module.exports = { setupSocketHandlers, onlineUsers }
