const express = require("express")
const { db } = require("../db/helpers")
const { authMiddleware } = require("../auth")
const { eq, and, or, sql, desc, isNull, max } = require("drizzle-orm")
const schema = require("../db/schema")

const router = express.Router()

// Join game room
router.post("/join-room", authMiddleware, async (req, res) => {
  try {
    const { roomCode } = req.body
    console.log(`[Caro] User ${req.userId} joining room ${roomCode}`)
    
    const result = await db.transaction(async (tx) => {
      // Get room and game info with explicit column selection
      const roomResult = await tx
        .select({
          roomId: sql`${schema.caroRooms.id}`.as('room_id'),
          roomCode: sql`${schema.caroRooms.roomCode}`.as('room_code'),
          roomStatus: sql`${schema.caroRooms.status}`.as('room_status'),
          gameId: sql`${schema.caroGames.id}`.as('game_id'),
          player1Id: sql`${schema.caroGames.player1Id}`.as('player1_id'),
          player2Id: sql`${schema.caroGames.player2Id}`.as('player2_id'),
          player1Ready: sql`${schema.caroGames.player1Ready}`.as('player1_ready'),
          player2Ready: sql`${schema.caroGames.player2Ready}`.as('player2_ready'),
          betAmount: sql`${schema.caroGames.betAmount}`.as('bet_amount'),
          currentPlayer: sql`${schema.caroGames.currentPlayer}`.as('current_player'),
          gameStatus: sql`${schema.caroGames.status}`.as('game_status'),
          currentPlayerCount: sql`${schema.caroGames.currentPlayerCount}`.as('current_player_count'),
          timeLimitMinutes: sql`${schema.caroGames.timeLimitMinutes}`.as('time_limit_minutes'),
          player1TimeLeft: sql`${schema.caroGames.player1TimeLeft}`.as('player1_time_left'),
          player2TimeLeft: sql`${schema.caroGames.player2TimeLeft}`.as('player2_time_left')
        })
        .from(schema.caroRooms)
        .innerJoin(schema.caroGames, eq(schema.caroRooms.id, schema.caroGames.roomId))
        .where(
          and(
            eq(schema.caroRooms.roomCode, roomCode),
            eq(schema.caroRooms.status, "waiting")
          )
        )
        .limit(1)

      if (roomResult.length === 0) {
        throw new Error("Room not found or already started")
      }

      const game = roomResult[0]

      // Check if room is full (2 players)
      if (game.player2Id && game.player2Id !== req.userId && game.player1Id !== req.userId) {
        throw new Error("Room is full")
      }

      // If player1 tries to join their own room, just return room info
      if (game.player1Id === req.userId) {
        // Increment player count if not already counted
        if (game.currentPlayerCount === 0) {
          await tx
            .update(schema.caroGames)
            .set({ currentPlayerCount: 1 })
            .where(eq(schema.caroGames.id, game.gameId))
        }

        // Get full room info
        const fullRoom = await getRoomDetails(tx, roomCode)
        return fullRoom
      }

      // Update game with player2 and increment player count
      await tx
        .update(schema.caroGames)
        .set({ 
          player2Id: req.userId,
          currentPlayerCount: 2
        })
        .where(eq(schema.caroGames.id, game.gameId))

      // Get full room info with players and stats
      const fullRoom = await getRoomDetails(tx, roomCode)
      return fullRoom
    })

    // Broadcast room update to lobby
    const io = req.app.get("io")
    io.to("caro:lobby").emit("caro:room-updated", result)
    
    console.log(`[Caro] Room ${roomCode} updated: player 2 (${req.userId}) joined`)
    
    // Notify players in the room that both players have joined
    io.to(`caro:${roomCode}`).emit("caro:room-updated", result)

    res.json({ room: result })
  } catch (error) {
    console.error("[Caro] Join room error:", error)
    const statusCode = error.message === "Room not found or already started" ? 404 :
                       error.message === "Room is full" ? 400 : 500
    res.status(statusCode).json({ 
      error: error.message || "Failed to join room" 
    })
  }
})

// Leave game room
router.post("/leave-room", authMiddleware, async (req, res) => {
  try {
    const { roomCode } = req.body
    console.log(`[Caro] User ${req.userId} leaving room ${roomCode}`)
    
    const result = await db.transaction(async (tx) => {
      // Get room and game info
      const roomResult = await tx
        .select({
          roomId: sql`${schema.caroRooms.id}`.as('room_id'),
          roomCode: sql`${schema.caroRooms.roomCode}`.as('room_code'),
          roomStatus: sql`${schema.caroRooms.status}`.as('room_status'),
          gameId: sql`${schema.caroGames.id}`.as('game_id'),
          player1Id: sql`${schema.caroGames.player1Id}`.as('player1_id'),
          player2Id: sql`${schema.caroGames.player2Id}`.as('player2_id'),
          currentPlayerCount: sql`${schema.caroGames.currentPlayerCount}`.as('current_player_count'),
          gameStatus: sql`${schema.caroGames.status}`.as('game_status')
        })
        .from(schema.caroRooms)
        .innerJoin(schema.caroGames, eq(schema.caroRooms.id, schema.caroGames.roomId))
        .where(eq(schema.caroRooms.roomCode, roomCode))
        .limit(1)

      if (roomResult.length === 0) {
        throw new Error("Room not found")
      }

      const game = roomResult[0]

      // Check if user is in this room
      if (game.player1Id !== req.userId && game.player2Id !== req.userId) {
        throw new Error("You are not in this room")
      }

      // Don't allow leaving if game is in progress
      if (game.gameStatus === "playing") {
        throw new Error("Cannot leave room while game is in progress")
      }

      // Decrease player count
      const newCount = Math.max(0, game.currentPlayerCount - 1)
      await tx
        .update(schema.caroGames)
        .set({ currentPlayerCount: newCount })
        .where(eq(schema.caroGames.id, game.gameId))

      // If room becomes empty and game hasn't started, reset player2
      if (newCount === 0 && game.gameStatus === "waiting") {
        await tx
          .update(schema.caroGames)
          .set({ player2Id: null })
          .where(eq(schema.caroGames.id, game.gameId))
      }

      return { success: true, currentPlayerCount: newCount }
    })

    // Broadcast room update to lobby
    const io = req.app.get("io")
    io.to("caro:lobby").emit("caro:room-updated", { roomCode, ...result })
    
    console.log(`[Caro] User ${req.userId} left room ${roomCode}`)
    
    res.json(result)
  } catch (error) {
    console.error("[Caro] Leave room error:", error)
    const statusCode = error.message === "Room not found" ? 404 :
                       error.message === "You are not in this room" ? 400 :
                       error.message === "Cannot leave room while game is in progress" ? 400 : 500
    res.status(statusCode).json({ 
      error: error.message || "Failed to leave room" 
    })
  }
})

// Helper function to get room details
async function getRoomDetails(tx, roomCode) {
  const fullRoom = await tx
    .select({
      id: sql`${schema.caroRooms.id}`.as('id'),
      roomCode: sql`${schema.caroRooms.roomCode}`.as('room_code'),
      status: sql`${schema.caroRooms.status}`.as('status'),
      createdAt: sql`${schema.caroRooms.createdAt}`.as('created_at'),
      finishedAt: sql`${schema.caroRooms.finishedAt}`.as('finished_at'),
      gameId: sql`${schema.caroGames.id}`.as('game_id'),
      player1Id: sql`${schema.caroGames.player1Id}`.as('player1_id'),
      player2Id: sql`${schema.caroGames.player2Id}`.as('player2_id'),
      player1Ready: sql`${schema.caroGames.player1Ready}`.as('player1_ready'),
      player2Ready: sql`${schema.caroGames.player2Ready}`.as('player2_ready'),
      winnerId: sql`${schema.caroGames.winnerId}`.as('winner_id'),
      betAmount: sql`${schema.caroGames.betAmount}`.as('bet_amount'),
      boardState: sql`${schema.caroGames.boardState}`.as('board_state'),
      currentPlayer: sql`${schema.caroGames.currentPlayer}`.as('current_player'),
      gameStatus: sql`${schema.caroGames.status}`.as('game_status'),
      currentPlayerCount: sql`${schema.caroGames.currentPlayerCount}`.as('current_player_count'),
      timeLimitMinutes: sql`${schema.caroGames.timeLimitMinutes}`.as('time_limit_minutes'),
      player1TimeLeft: sql`${schema.caroGames.player1TimeLeft}`.as('player1_time_left'),
      player2TimeLeft: sql`${schema.caroGames.player2TimeLeft}`.as('player2_time_left'),
      lastMoveTime: sql`${schema.caroGames.lastMoveTime}`.as('last_move_time'),
      winCondition: sql`5`.as('win_condition'),
      player1Username: sql`u1.username`.as('player1_username'),
      player2Username: sql`u2.username`.as('player2_username'),
      player1Games: sql`COALESCE(cs1.games_played, 0)`.as('player1_games'),
      player1Wins: sql`COALESCE(cs1.games_won, 0)`.as('player1_wins'),
      player1Level: sql`COALESCE(cs1.level, 1)`.as('player1_level'),
      player2Games: sql`COALESCE(cs2.games_played, 0)`.as('player2_games'),
      player2Wins: sql`COALESCE(cs2.games_won, 0)`.as('player2_wins'),
      player2Level: sql`COALESCE(cs2.level, 1)`.as('player2_level')
    })
    .from(schema.caroRooms)
    .innerJoin(schema.caroGames, eq(schema.caroRooms.id, schema.caroGames.roomId))
    .innerJoin(sql`users u1`, eq(schema.caroGames.player1Id, sql`u1.id`))
    .leftJoin(sql`users u2`, eq(schema.caroGames.player2Id, sql`u2.id`))
    .leftJoin(sql`caro_stats cs1`, eq(schema.caroGames.player1Id, sql`cs1.user_id`))
    .leftJoin(sql`caro_stats cs2`, eq(schema.caroGames.player2Id, sql`cs2.user_id`))
    .where(eq(schema.caroRooms.roomCode, roomCode))
    .limit(1)

  return fullRoom[0]
}

// Get room info
router.get("/room/:roomCode", authMiddleware, async (req, res) => {
  try {
    const { roomCode } = req.params

    // Get room with full details
    const roomResult = await db
      .select({
        roomCode: sql`${schema.caroRooms.roomCode}`.as('room_code'),
        roomStatus: sql`${schema.caroRooms.status}`.as('room_status'),
        createdAt: sql`${schema.caroRooms.createdAt}`.as('created_at'),
        finishedAt: sql`${schema.caroRooms.finishedAt}`.as('finished_at'),
        gameId: sql`${schema.caroGames.id}`.as('game_id'),
        player1Id: sql`${schema.caroGames.player1Id}`.as('player1_id'),
        player2Id: sql`${schema.caroGames.player2Id}`.as('player2_id'),
        currentPlayer: sql`${schema.caroGames.currentPlayer}`.as('current_player'),
        gameStatus: sql`${schema.caroGames.status}`.as('game_status'),
        winnerId: sql`${schema.caroGames.winnerId}`.as('winner_id'),
        betAmount: sql`${schema.caroGames.betAmount}`.as('bet_amount'),
        currentPlayerCount: sql`${schema.caroGames.currentPlayerCount}`.as('current_player_count'),
        timeLimitMinutes: sql`${schema.caroGames.timeLimitMinutes}`.as('time_limit_minutes'),
        player1TimeLeft: sql`${schema.caroGames.player1TimeLeft}`.as('player1_time_left'),
        player2TimeLeft: sql`${schema.caroGames.player2TimeLeft}`.as('player2_time_left'),
        lastMoveTime: sql`${schema.caroGames.lastMoveTime}`.as('last_move_time'),
        winCondition: sql`5`.as('win_condition'),
        player1Ready: sql`${schema.caroGames.player1Ready}`.as('player1_ready'),
        player2Ready: sql`${schema.caroGames.player2Ready}`.as('player2_ready'),
        player1Username: sql`u1.username`.as('player1_username'),
        player1Avatar: sql`u1.avatar_url`.as('player1_avatar'),
        player2Username: sql`u2.username`.as('player2_username'),
        player2Avatar: sql`u2.avatar_url`.as('player2_avatar'),
        player1Games: sql`COALESCE(cs1.games_played, 0)`.as('player1_games'),
        player1Wins: sql`COALESCE(cs1.games_won, 0)`.as('player1_wins'),
        player1Level: sql`COALESCE(cs1.level, 1)`.as('player1_level'),
        player2Games: sql`COALESCE(cs2.games_played, 0)`.as('player2_games'),
        player2Wins: sql`COALESCE(cs2.games_won, 0)`.as('player2_wins'),
        player2Level: sql`COALESCE(cs2.level, 1)`.as('player2_level')
      })
      .from(schema.caroRooms)
      .innerJoin(schema.caroGames, eq(schema.caroRooms.id, schema.caroGames.roomId))
      .innerJoin(sql`users u1`, eq(schema.caroGames.player1Id, sql`u1.id`))
      .leftJoin(sql`users u2`, eq(schema.caroGames.player2Id, sql`u2.id`))
      .leftJoin(sql`caro_stats cs1`, eq(schema.caroGames.player1Id, sql`cs1.user_id`))
      .leftJoin(sql`caro_stats cs2`, eq(schema.caroGames.player2Id, sql`cs2.user_id`))
      .where(eq(schema.caroRooms.roomCode, roomCode))
      .limit(1)

    if (roomResult.length === 0) {
      return res.status(404).json({ error: "Room not found" })
    }

    const room = roomResult[0]

    // Get all moves for this game
    const movesResult = await db
      .select({
        id: schema.caroMoves.id,
        gameId: schema.caroMoves.gameId,
        playerId: schema.caroMoves.playerId,
        row: schema.caroMoves.x,
        col: schema.caroMoves.y,
        moveNumber: schema.caroMoves.moveNumber,
        createdAt: schema.caroMoves.createdAt,
        playerUsername: sql`u.username`.as('player_username')
      })
      .from(schema.caroMoves)
      .innerJoin(sql`users u`, eq(schema.caroMoves.playerId, sql`u.id`))
      .where(eq(schema.caroMoves.gameId, room.gameId))
      .orderBy(schema.caroMoves.moveNumber)

    // Build board state from moves
    const board = {}
    movesResult.forEach(move => {
      const key = `${move.row}-${move.col}`
      board[key] = move.playerId === room.player1Id ? 1 : 2
    })

    res.json({ 
      room: {
        ...room,
        board_state: board,
        moves: movesResult
      }
    })
  } catch (error) {
    console.error("[Caro] Get room error:", error)
    res.status(500).json({ error: "Failed to get room info" })
  }
})

// Make move
router.post("/move", authMiddleware, async (req, res) => {
  try {
    const { roomCode, x, y, player } = req.body

    const result = await db.transaction(async (tx) => {
      // Get room and game
      const roomResult = await tx
        .select({
          roomId: sql`${schema.caroRooms.id}`.as('room_id'),
          roomCode: sql`${schema.caroRooms.roomCode}`.as('room_code'),
          roomStatus: sql`${schema.caroRooms.status}`.as('room_status'),
          gameId: sql`${schema.caroGames.id}`.as('game_id'),
          player1Id: sql`${schema.caroGames.player1Id}`.as('player1_id'),
          player2Id: sql`${schema.caroGames.player2Id}`.as('player2_id'),
          currentPlayer: sql`${schema.caroGames.currentPlayer}`.as('current_player'),
          gameStatus: sql`${schema.caroGames.status}`.as('game_status'),
          betAmount: sql`${schema.caroGames.betAmount}`.as('bet_amount'),
          timeLimitMinutes: sql`${schema.caroGames.timeLimitMinutes}`.as('time_limit_minutes'),
          player1TimeLeft: sql`${schema.caroGames.player1TimeLeft}`.as('player1_time_left'),
          player2TimeLeft: sql`${schema.caroGames.player2TimeLeft}`.as('player2_time_left'),
          lastMoveTime: sql`${schema.caroGames.lastMoveTime}`.as('last_move_time')
        })
        .from(schema.caroRooms)
        .innerJoin(schema.caroGames, eq(schema.caroRooms.id, schema.caroGames.roomId))
        .where(
          and(
            eq(schema.caroRooms.roomCode, roomCode),
            eq(schema.caroRooms.status, "playing")
          )
        )
        .limit(1)

      if (roomResult.length === 0) {
        throw new Error("Room not found or game not in progress")
      }

      const game = roomResult[0]

      // Verify it's the player's turn
      if (game.currentPlayer !== player) {
        throw new Error("Not your turn")
      }

      // Check time limit if enabled
      let timeExpired = false
      let updatedPlayer1Time = game.player1TimeLeft
      let updatedPlayer2Time = game.player2TimeLeft

      if (game.timeLimitMinutes && game.lastMoveTime) {
        const now = new Date()
        const lastMove = new Date(game.lastMoveTime)
        const elapsedSeconds = Math.floor((now - lastMove) / 1000)

        if (player === 1 && game.player1TimeLeft !== null) {
          updatedPlayer1Time = game.player1TimeLeft - elapsedSeconds
          if (updatedPlayer1Time <= 0) {
            timeExpired = true
          }
        } else if (player === 2 && game.player2TimeLeft !== null) {
          updatedPlayer2Time = game.player2TimeLeft - elapsedSeconds
          if (updatedPlayer2Time <= 0) {
            timeExpired = true
          }
        }
      }

      // If time expired, opponent wins
      if (timeExpired) {
        const winnerId = player === 1 ? game.player2Id : game.player1Id
        const loserId = player === 1 ? game.player1Id : game.player2Id
        
        const winnings = await handleGameEnd(tx, game, winnerId, loserId, roomCode, 'timeout')
        
        return { 
          winner: player === 1 ? 2 : 1, 
          reason: 'timeout',
          winnings,
          winnerId,
          loserId
        }
      }

      // Get current move number
      const moveCountResult = await tx
        .select({ count: sql`COUNT(*)`.as('count') })
        .from(schema.caroMoves)
        .where(eq(schema.caroMoves.gameId, game.gameId))

      const moveNumber = parseInt(moveCountResult[0].count) + 1

      // Insert move
      const playerId = player === 1 ? game.player1Id : game.player2Id
      await tx
        .insert(schema.caroMoves)
        .values({
          gameId: game.gameId,
          playerId,
          x,
          y,
          moveNumber
        })

      // Update last move time and player times
      await tx
        .update(schema.caroGames)
        .set({
          lastMoveTime: new Date(),
          player1TimeLeft: updatedPlayer1Time,
          player2TimeLeft: updatedPlayer2Time
        })
        .where(eq(schema.caroGames.id, game.gameId))

      // Get all moves to check winner
      const movesResult = await tx
        .select()
        .from(schema.caroMoves)
        .where(eq(schema.caroMoves.gameId, game.gameId))
        .orderBy(schema.caroMoves.moveNumber)

      // Build board from moves
      const board = {}
      movesResult.forEach(move => {
        const key = `${move.x}-${move.y}`
        board[key] = move.playerId === game.player1Id ? 1 : 2
      })

      // Check for winner (default win condition is 5)
      const winCondition = 5
      const winner = checkWinner(board, x, y, player, winCondition)

      if (winner) {
        // Game finished
        const winnerId = player === 1 ? game.player1Id : game.player2Id
        const loserId = player === 1 ? game.player2Id : game.player1Id

        const winnings = await handleGameEnd(tx, game, winnerId, loserId, roomCode, 'win')

        return { winner: player, winnings, winnerId, loserId }
      } else {
        // Continue game - switch player
        const nextPlayer = game.currentPlayer === 1 ? 2 : 1
        await tx
          .update(schema.caroGames)
          .set({ currentPlayer: nextPlayer })
          .where(eq(schema.caroGames.id, game.gameId))

        return { 
          success: true, 
          nextPlayer,
          player1TimeLeft: updatedPlayer1Time,
          player2TimeLeft: updatedPlayer2Time
        }
      }
    })

    // Emit socket event
    const io = req.app.get("io")
    if (result.winner) {
      io.to(`caro:${roomCode}`).emit("caro:game-finished", result)
    } else {
      io.to(`caro:${roomCode}`).emit("caro:move-made", { 
        x, 
        y, 
        player,
        nextPlayer: result.nextPlayer,
        player1TimeLeft: result.player1TimeLeft,
        player2TimeLeft: result.player2TimeLeft
      })
    }

    res.json(result)
  } catch (error) {
    console.error("[Caro] Move error:", error)
    const statusCode = error.message === "Room not found or game not in progress" ? 404 :
                       error.message === "Not your turn" ? 400 : 500
    res.status(statusCode).json({ error: error.message || "Failed to make move" })
  }
})

// Helper function to handle game end
async function handleGameEnd(tx, game, winnerId, loserId, roomCode, reason) {
  await tx
    .update(schema.caroGames)
    .set({ 
      status: "finished", 
      winnerId,
      finishedAt: new Date()
    })
    .where(eq(schema.caroGames.id, game.gameId))

  await tx
    .update(schema.caroRooms)
    .set({ 
      status: "finished",
      finishedAt: new Date()
    })
    .where(eq(schema.caroRooms.roomCode, roomCode))

  // Reset player count so room is no longer available
  await tx
    .update(schema.caroGames)
    .set({ currentPlayerCount: 0 })
    .where(eq(schema.caroGames.id, game.gameId))

  // Calculate winnings
  const betAmount = parseFloat(game.betAmount)
  const totalPot = betAmount * 2
  const winnings = totalPot * 0.8

  // Update wallets
  await tx
    .update(schema.wallets)
    .set({ 
      balance: sql`${schema.wallets.balance} + ${winnings}`,
      updatedAt: new Date()
    })
    .where(eq(schema.wallets.userId, winnerId))
  
  // Record transactions
  await tx
    .insert(schema.transactions)
    .values({
      userId: winnerId,
      amount: winnings.toString(),
      type: "game_win",
      source: "caro",
      description: `Won caro game in room ${roomCode}${reason === 'timeout' ? ' (opponent timeout)' : ''}`
    })

  await tx
    .insert(schema.transactions)
    .values({
      userId: loserId,
      amount: (-betAmount).toString(),
      type: "game_loss",
      source: "caro",
      description: `Lost caro game in room ${roomCode}${reason === 'timeout' ? ' (timeout)' : ''}`
    })

  // Update stats
  await tx
    .insert(schema.caroStats)
    .values({
      userId: winnerId,
      gamesPlayed: 1,
      gamesWon: 1,
      totalEarnings: winnings.toString()
    })
    .onConflictDoUpdate({
      target: schema.caroStats.userId,
      set: {
        gamesPlayed: sql`${schema.caroStats.gamesPlayed} + 1`,
        gamesWon: sql`${schema.caroStats.gamesWon} + 1`,
        totalEarnings: sql`${schema.caroStats.totalEarnings} + ${winnings}`,
        updatedAt: new Date()
      }
    })

  await tx
    .insert(schema.caroStats)
    .values({
      userId: loserId,
      gamesPlayed: 1,
      gamesWon: 0,
      totalEarnings: (-betAmount).toString()
    })
    .onConflictDoUpdate({
      target: schema.caroStats.userId,
      set: {
        gamesPlayed: sql`${schema.caroStats.gamesPlayed} + 1`,
        totalEarnings: sql`${schema.caroStats.totalEarnings} + ${-betAmount}`,
        updatedAt: new Date()
      }
    })

  return winnings
}

// Check for winner (N in a row)
function checkWinner(board, lastX, lastY, player, winCondition = 5) {
  const directions = [
    [0, 1],   // horizontal
    [1, 0],   // vertical
    [1, 1],   // diagonal \
    [1, -1]   // diagonal /
  ]

  for (const [dx, dy] of directions) {
    let count = 1

    // Check positive direction
    for (let i = 1; i < winCondition; i++) {
      const key = `${lastX + dx * i}-${lastY + dy * i}`
      if (board[key] === player) count++
      else break
    }

    // Check negative direction
    for (let i = 1; i < winCondition; i++) {
      const key = `${lastX - dx * i}-${lastY - dy * i}`
      if (board[key] === player) count++
      else break
    }

    if (count >= winCondition) return true
  }

  return false
}

// Get available rooms
router.get("/rooms", authMiddleware, async (req, res) => {
  console.log("[Caro] Fetching available rooms")
  try {
    const rooms = await db
      .select({
        roomCode: sql`${schema.caroRooms.roomCode}`.as('room_code'),
        currentPlayerCount: sql`${schema.caroGames.currentPlayerCount}`.as('current_player_count'),
        maxPlayers: sql`2`.as('max_players'),
        betAmount: sql`${schema.caroGames.betAmount}`.as('bet_amount'),
        currentUsers: sql`${schema.caroRooms.currentUsers}`.as('current_users'),
      })
      .from(schema.caroRooms)
      .leftJoin(schema.caroGames, eq(schema.caroRooms.id, schema.caroGames.roomId))
      .where(
        and(
          eq(schema.caroRooms.status, "waiting"),
          or(
            isNull(schema.caroGames.currentPlayerCount),
            sql`${schema.caroGames.currentPlayerCount} < 2`
          )
        )
      )
      .orderBy(desc(schema.caroRooms.createdAt))
      .limit(20)

    console.log("[Caro] Fetched rooms:", rooms.length)
    res.json({ rooms })
  } catch (error) {
    console.error("[Caro] Get rooms error:", error)
    res.status(500).json({ error: "Failed to get rooms" })
  }
})

// Leave game room
router.post("/leave-room", authMiddleware, async (req, res) => {
  try {
    const { roomCode } = req.body
    console.log(`[Caro] User ${req.userId} leaving room ${roomCode}`)
    
    const result = await db.transaction(async (tx) => {
      // Get room and game info
      const roomResult = await tx
        .select({
          roomId: sql`${schema.caroRooms.id}`.as('room_id'),
          roomCode: sql`${schema.caroRooms.roomCode}`.as('room_code'),
          roomStatus: sql`${schema.caroRooms.status}`.as('room_status'),
          gameId: sql`${schema.caroGames.id}`.as('game_id'),
          player1Id: sql`${schema.caroGames.player1Id}`.as('player1_id'),
          player2Id: sql`${schema.caroGames.player2Id}`.as('player2_id'),
          currentPlayerCount: sql`${schema.caroGames.currentPlayerCount}`.as('current_player_count'),
          gameStatus: sql`${schema.caroGames.status}`.as('game_status')
        })
        .from(schema.caroRooms)
        .innerJoin(schema.caroGames, eq(schema.caroRooms.id, schema.caroGames.roomId))
        .where(eq(schema.caroRooms.roomCode, roomCode))
        .limit(1)

      if (roomResult.length === 0) {
        throw new Error("Room not found")
      }

      const game = roomResult[0]

      // Check if user is in this room
      if (game.player1Id !== req.userId && game.player2Id !== req.userId) {
        throw new Error("You are not in this room")
      }

      // Don't allow leaving if game is in progress
      if (game.gameStatus === "playing") {
        throw new Error("Cannot leave room while game is in progress")
      }

      // Decrease player count
      const newCount = Math.max(0, game.currentPlayerCount - 1)
      await tx
        .update(schema.caroGames)
        .set({ currentPlayerCount: newCount })
        .where(eq(schema.caroGames.id, game.gameId))

      // If room becomes empty and game hasn't started, reset player2
      if (newCount === 0 && game.gameStatus === "waiting") {
        await tx
          .update(schema.caroGames)
          .set({ player2Id: null })
          .where(eq(schema.caroGames.id, game.gameId))
      }

      return { success: true, currentPlayerCount: newCount }
    })

    // Broadcast room update to lobby
    const io = req.app.get("io")
    io.to("caro:lobby").emit("caro:room-updated", { roomCode, ...result })
    
    console.log(`[Caro] User ${req.userId} left room ${roomCode}`)
    
    res.json(result)
  } catch (error) {
    console.error("[Caro] Leave room error:", error)
    const statusCode = error.message === "Room not found" ? 404 :
                       error.message === "You are not in this room" ? 400 :
                       error.message === "Cannot leave room while game is in progress" ? 400 : 500
    res.status(statusCode).json({ 
      error: error.message || "Failed to leave room" 
    })
  }
})

module.exports = router
