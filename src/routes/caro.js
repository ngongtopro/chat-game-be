const express = require("express")
const { query, getClient } = require("../db")
const { authMiddleware } = require("../auth")

const router = express.Router()

// Create game room
router.post("/create-room", authMiddleware, async (req, res) => {
  try {
    const { betAmount } = req.body

    // Generate room code
    const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase()

    const result = await query(
      `INSERT INTO caro_rooms (room_code, player1_id, bet_amount, status) 
       VALUES ($1, $2, $3, 'waiting') 
       RETURNING *`,
      [roomCode, req.userId, betAmount],
    )

    res.json({ room: result.rows[0] })
  } catch (error) {
    console.error("[v0] Create room error:", error)
    res.status(500).json({ error: "Failed to create room" })
  }
})

// Join game room
router.post("/join-room", authMiddleware, async (req, res) => {
  const client = await getClient()

  try {
    const { roomCode } = req.body

    await client.query("BEGIN")

    // Get room info
    const roomResult = await client.query("SELECT * FROM caro_rooms WHERE room_code = $1 AND status = $2", [
      roomCode,
      "waiting",
    ])

    if (roomResult.rows.length === 0) {
      await client.query("ROLLBACK")
      return res.status(404).json({ error: "Room not found or already full" })
    }

    const room = roomResult.rows[0]

    if (room.player1_id === req.userId) {
      await client.query("ROLLBACK")
      return res.status(400).json({ error: "Cannot join your own room" })
    }

    // Update room
    const updatedRoom = await client.query(
      `UPDATE caro_rooms 
       SET player2_id = $1, status = 'playing', started_at = NOW()
       WHERE room_code = $2
       RETURNING *`,
      [req.userId, roomCode],
    )

    await client.query("COMMIT")

    res.json({ room: updatedRoom.rows[0] })
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
      `SELECT cg.*, 
              u1.username as player1_username, u1.avatar_url as player1_avatar,
              u2.username as player2_username, u2.avatar_url as player2_avatar,
              cs1.games_won as player1_wins, cs1.games_played as player1_games, cs1.level as player1_level,
              cs2.games_won as player2_wins, cs2.games_played as player2_games, cs2.level as player2_level
       FROM caro_rooms cg
       JOIN users u1 ON cg.player1_id = u1.id
       LEFT JOIN users u2 ON cg.player2_id = u2.id
       LEFT JOIN caro_stats cs1 ON cg.player1_id = cs1.user_id
       LEFT JOIN caro_stats cs2 ON cg.player2_id = cs2.user_id
       WHERE cg.room_code = $1`,
      [roomCode],
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Room not found" })
    }

    res.json({ room: result.rows[0] })
  } catch (error) {
    console.error("[v0] Get room error:", error)
    res.status(500).json({ error: "Failed to get room info" })
  }
})

// Make move
router.post("/move", authMiddleware, async (req, res) => {
  try {
    const { roomCode, x, y, board } = req.body

    // Get room
    const roomResult = await query("SELECT * FROM caro_rooms WHERE room_code = $1", [roomCode])

    if (roomResult.rows.length === 0) {
      return res.status(404).json({ error: "Room not found" })
    }

    const room = roomResult.rows[0]

    // Update board state
    await query("UPDATE caro_rooms SET board_state = $1, current_turn = $2 WHERE room_code = $3", [
      JSON.stringify(board),
      room.current_turn === "player1" ? "player2" : "player1",
      roomCode,
    ])

    res.json({ success: true })
  } catch (error) {
    console.error("[v0] Move error:", error)
    res.status(500).json({ error: "Failed to make move" })
  }
})

// Get available rooms
router.get("/rooms", authMiddleware, async (req, res) => {
  try {
    const result = await query(
      `SELECT cg.*, u.username as player1_username
       FROM caro_rooms cg
       JOIN users u ON cg.player1_id = u.id
       WHERE cg.status = 'waiting'
       ORDER BY cg.created_at DESC
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
