const express = require("express")
const { query, getClient } = require("../db")
const { authMiddleware } = require("../auth")

const router = express.Router()

// Create game room
router.post("/create-room", authMiddleware, async (req, res) => {
  const client = await getClient()
  
  try {
    const { betAmount } = req.body

    // Generate room code
    const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase()

    await client.query("BEGIN")

    // Create room
    const roomResult = await client.query(
      `INSERT INTO caro_rooms (room_code, status) 
       VALUES ($1, 'waiting') 
       RETURNING *`,
      [roomCode],
    )

    // Create game in the room
    const gameResult = await client.query(
      `INSERT INTO caro_games (room_id, player1_id, bet_amount, status, board_size, win_condition, current_player) 
       VALUES ($1, $2, $3, 'waiting', 15, 5, 1) 
       RETURNING *`,
      [roomResult.rows[0].id, req.userId, betAmount],
    )

    await client.query("COMMIT")

    // Get room with player info for broadcast
    const fullRoom = await query(
      `SELECT cr.room_code, cg.bet_amount, u.username as player1_username, cg.id as game_id
       FROM caro_rooms cr
       JOIN caro_games cg ON cr.id = cg.room_id
       JOIN users u ON cg.player1_id = u.id
       WHERE cr.room_code = $1`,
      [roomCode]
    )

    // Broadcast new room to lobby
    const io = req.app.get("io")
    io.to("caro:lobby").emit("caro:room-created", fullRoom.rows[0])

    res.json({ room: roomResult.rows[0], game: gameResult.rows[0] })
  } catch (error) {
    await client.query("ROLLBACK")
    console.error("[v0] Create room error:", error)
    res.status(500).json({ error: "Failed to create room" })
  } finally {
    client.release()
  }
})

// Join game room
router.post("/join-room", authMiddleware, async (req, res) => {
  const client = await getClient()

  try {
    const { roomCode } = req.body

    await client.query("BEGIN")

    // Get room and game info
    const roomResult = await client.query(
      `SELECT cr.*, cg.* 
       FROM caro_rooms cr
       JOIN caro_games cg ON cr.id = cg.room_id
       WHERE cr.room_code = $1 AND cr.status = 'waiting'`,
      [roomCode],
    )

    if (roomResult.rows.length === 0) {
      await client.query("ROLLBACK")
      return res.status(404).json({ error: "Room not found or already full" })
    }

    const game = roomResult.rows[0]

    // If player1 tries to join their own room, just return room info
    if (game.player1_id === req.userId) {
      await client.query("ROLLBACK")
      
      // Get full room info
      const fullRoom = await query(
        `SELECT cr.*, cg.*,
                u1.username as player1_username,
                u2.username as player2_username
         FROM caro_rooms cr
         JOIN caro_games cg ON cr.id = cg.room_id
         JOIN users u1 ON cg.player1_id = u1.id
         LEFT JOIN users u2 ON cg.player2_id = u2.id
         WHERE cr.room_code = $1`,
        [roomCode]
      )
      
      return res.json({ room: fullRoom.rows[0] })
    }

    // Update game with player2
    await client.query(
      `UPDATE caro_games 
       SET player2_id = $1
       WHERE id = $2`,
      [req.userId, game.id],
    )

    // Keep room status as waiting until both players are ready
    // The socket handler will change it to 'playing' when both are ready

    await client.query("COMMIT")

    // Get full room info with players
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

    // Broadcast room update to lobby (room is now full but not started yet)
    const io = req.app.get("io")
    io.to("caro:lobby").emit("caro:room-full", { roomCode })
    
    console.log(`[Caro] Room ${roomCode} updated: player 2 (${req.userId}) joined`)
    
    // Notify players in the room that both players have joined
    io.to(`caro:${roomCode}`).emit("caro:room-updated", fullRoom.rows[0])

    res.json({ room: fullRoom.rows[0] })
  } catch (error) {
    await client.query("ROLLBACK")
    console.error("[v0] Join room error:", error)
    res.status(500).json({ error: "Failed to join room" })
  } finally {
    client.release()
  }
})

// Get room info
router.get("/room/:roomCode", authMiddleware, async (req, res) => {
  try {
    const { roomCode } = req.params

    const result = await query(
      `SELECT cr.room_code, cr.status as room_status, cr.created_at, cr.finished_at,
              cg.id as game_id, cg.player1_id, cg.player2_id, cg.current_player, 
              cg.status as game_status, cg.winner_id, cg.bet_amount, cg.board_size, cg.win_condition,
              cg.player1_ready, cg.player2_ready,
              u1.username as player1_username, u1.avatar_url as player1_avatar,
              u2.username as player2_username, u2.avatar_url as player2_avatar,
              cs1.games_won as player1_wins, cs1.games_played as player1_games, cs1.level as player1_level,
              cs2.games_won as player2_wins, cs2.games_played as player2_games, cs2.level as player2_level
       FROM caro_rooms cr
       JOIN caro_games cg ON cr.id = cg.room_id
       JOIN users u1 ON cg.player1_id = u1.id
       LEFT JOIN users u2 ON cg.player2_id = u2.id
       LEFT JOIN caro_stats cs1 ON cg.player1_id = cs1.user_id
       LEFT JOIN caro_stats cs2 ON cg.player2_id = cs2.user_id
       WHERE cr.room_code = $1`,
      [roomCode],
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Room not found" })
    }

    const room = result.rows[0]

    // Get all moves for this game
    const movesResult = await query(
      `SELECT cm.*, u.username as player_username
       FROM caro_moves cm
       JOIN users u ON cm.player_id = u.id
       WHERE cm.game_id = $1
       ORDER BY cm.move_number ASC`,
      [room.game_id]
    )

    // Build board state from moves
    const board = {}
    movesResult.rows.forEach(move => {
      const key = `${move.row}-${move.col}`
      board[key] = move.player_id === room.player1_id ? 1 : 2
    })

    res.json({ 
      room: {
        ...room,
        board_state: board,
        moves: movesResult.rows
      }
    })
  } catch (error) {
    console.error("[v0] Get room error:", error)
    res.status(500).json({ error: "Failed to get room info" })
  }
})

// Make move
router.post("/move", authMiddleware, async (req, res) => {
  const client = await getClient()
  
  try {
    const { roomCode, x, y, player } = req.body

    await client.query("BEGIN")

    // Get room and game
    const roomResult = await client.query(
      `SELECT cr.*, cg.*
       FROM caro_rooms cr
       JOIN caro_games cg ON cr.id = cg.room_id
       WHERE cr.room_code = $1 AND cr.status = 'playing'`,
      [roomCode]
    )

    if (roomResult.rows.length === 0) {
      await client.query("ROLLBACK")
      return res.status(404).json({ error: "Room not found or game not in progress" })
    }

    const game = roomResult.rows[0]

    // Verify it's the player's turn
    if (game.current_player !== player) {
      await client.query("ROLLBACK")
      return res.status(400).json({ error: "Not your turn" })
    }

    // Get current move number
    const moveCountResult = await client.query(
      "SELECT COUNT(*) as count FROM caro_moves WHERE game_id = $1",
      [game.id]
    )
    const moveNumber = parseInt(moveCountResult.rows[0].count) + 1

    // Insert move
    const playerId = player === 1 ? game.player1_id : game.player2_id
    await client.query(
      `INSERT INTO caro_moves (game_id, player_id, row, col, move_number)
       VALUES ($1, $2, $3, $4, $5)`,
      [game.id, playerId, x, y, moveNumber]
    )

    // Get all moves to check winner
    const movesResult = await client.query(
      `SELECT * FROM caro_moves WHERE game_id = $1 ORDER BY move_number ASC`,
      [game.id]
    )

    // Build board from moves
    const board = {}
    movesResult.rows.forEach(move => {
      const key = `${move.row}-${move.col}`
      board[key] = move.player_id === game.player1_id ? 1 : 2
    })

    // Check for winner
    const winner = checkWinner(board, x, y, player, game.win_condition || 5)

    if (winner) {
      // Game finished
      const winnerId = player === 1 ? game.player1_id : game.player2_id
      const loserId = player === 1 ? game.player2_id : game.player1_id

      await client.query(
        `UPDATE caro_games 
         SET status = 'finished', winner_id = $1, finished_at = NOW()
         WHERE id = $2`,
        [winnerId, game.id]
      )

      await client.query(
        `UPDATE caro_rooms 
         SET status = 'finished', finished_at = NOW()
         WHERE room_code = $1`,
        [roomCode]
      )

      // Calculate winnings
      const totalPot = game.bet_amount * 2
      const winnings = totalPot * 0.8

      // Update wallets
      await client.query("UPDATE wallets SET balance = balance + $1 WHERE user_id = $2", [winnings, winnerId])
      
      // Record transactions
      await client.query(
        "INSERT INTO transactions (user_id, amount, type, source, description) VALUES ($1, $2, $3, $4, $5)",
        [winnerId, winnings, "game_win", "caro", `Won caro game in room ${roomCode}`]
      )
      await client.query(
        "INSERT INTO transactions (user_id, amount, type, source, description) VALUES ($1, $2, $3, $4, $5)",
        [loserId, -game.bet_amount, "game_loss", "caro", `Lost caro game in room ${roomCode}`]
      )

      // Update stats
      await client.query(
        `INSERT INTO caro_stats (user_id, games_played, games_won, total_earnings)
         VALUES ($1, 1, 1, $2)
         ON CONFLICT (user_id) 
         DO UPDATE SET 
           games_played = caro_stats.games_played + 1,
           games_won = caro_stats.games_won + 1,
           total_earnings = caro_stats.total_earnings + $2`,
        [winnerId, winnings]
      )
      await client.query(
        `INSERT INTO caro_stats (user_id, games_played, games_won, total_earnings)
         VALUES ($1, 1, 0, $2)
         ON CONFLICT (user_id) 
         DO UPDATE SET 
           games_played = caro_stats.games_played + 1,
           total_earnings = caro_stats.total_earnings + $2`,
        [loserId, -game.bet_amount]
      )

      await client.query("COMMIT")

      // Emit socket event
      const io = req.app.get("io")
      io.to(`caro:${roomCode}`).emit("caro:game-finished", { 
        winner: player, 
        winnings,
        winnerId,
        loserId
      })

      res.json({ winner: player, winnings })
    } else {
      // Continue game - switch player
      const nextPlayer = game.current_player === 1 ? 2 : 1
      await client.query(
        "UPDATE caro_games SET current_player = $1 WHERE id = $2",
        [nextPlayer, game.id]
      )

      await client.query("COMMIT")

      // Emit socket event
      const io = req.app.get("io")
      io.to(`caro:${roomCode}`).emit("caro:move-made", { 
        x, 
        y, 
        player,
        nextPlayer
      })

      res.json({ success: true, nextPlayer })
    }
  } catch (error) {
    await client.query("ROLLBACK")
    console.error("[v0] Move error:", error)
    res.status(500).json({ error: "Failed to make move" })
  } finally {
    client.release()
  }
})

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
  try {
    const result = await query(
      `SELECT cr.room_code, cr.status as room_status, cr.created_at,
              cg.id as game_id, cg.player1_id, cg.bet_amount, cg.board_size, cg.win_condition,
              u.username as player1_username
       FROM caro_rooms cr
       JOIN caro_games cg ON cr.id = cg.room_id
       JOIN users u ON cg.player1_id = u.id
       WHERE cr.status = 'waiting'
       ORDER BY cr.created_at DESC
       LIMIT 20`,
    )
    console.log("[v0] Fetched rooms:", result.rows)
    res.json({ rooms: result.rows })
  } catch (error) {
    console.error("Get rooms error:", error)
    res.status(500).json({ error: "Failed to get rooms" })
  }
})

module.exports = router
