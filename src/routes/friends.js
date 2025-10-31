const express = require("express")
const { query } = require("../db")
const { authMiddleware } = require("../auth")

const router = express.Router()

// Search users
router.get("/search", authMiddleware, async (req, res) => {
  try {
    const { q } = req.query

    const result = await query(
      `SELECT id, username, email, avatar_url 
       FROM users 
       WHERE (username ILIKE $1 OR email ILIKE $1) AND id != $2
       LIMIT 20`,
      [`%${q}%`, req.userId],
    )

    res.json({ users: result.rows })
  } catch (error) {
    console.error("[v0] Search users error:", error)
    res.status(500).json({ error: "Search failed" })
  }
})

// Send friend request
router.post("/request", authMiddleware, async (req, res) => {
  try {
    const { friendId } = req.body

    // Check if already friends or request exists
    const existing = await query(
      `SELECT * FROM friendships 
       WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)`,
      [req.userId, friendId],
    )

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: "Friend request already exists" })
    }

    const result = await query("INSERT INTO friendships (user_id, friend_id, status) VALUES ($1, $2, $3) RETURNING *", [
      req.userId,
      friendId,
      "pending",
    ])

    res.json({ friendship: result.rows[0] })
  } catch (error) {
    console.error("[v0] Friend request error:", error)
    res.status(500).json({ error: "Failed to send friend request" })
  }
})

// Accept friend request
router.post("/accept", authMiddleware, async (req, res) => {
  try {
    const { friendId } = req.body

    const result = await query(
      `UPDATE friendships 
       SET status = 'accepted', updated_at = NOW() 
       WHERE user_id = $1 AND friend_id = $2 AND status = 'pending'
       RETURNING *`,
      [friendId, req.userId],
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Friend request not found" })
    }

    res.json({ friendship: result.rows[0] })
  } catch (error) {
    console.error("[v0] Accept friend error:", error)
    res.status(500).json({ error: "Failed to accept friend request" })
  }
})

// Get friends list
router.get("/list", authMiddleware, async (req, res) => {
  try {
    const result = await query(
      `SELECT u.id, u.username, u.email, u.avatar_url, f.status, f.created_at
       FROM friendships f
       JOIN users u ON (
         CASE 
           WHEN f.user_id = $1 THEN u.id = f.friend_id
           ELSE u.id = f.user_id
         END
       )
       WHERE (f.user_id = $1 OR f.friend_id = $1) AND f.status = 'accepted'`,
      [req.userId],
    )

    res.json({ friends: result.rows })
  } catch (error) {
    console.error("[v0] Get friends error:", error)
    res.status(500).json({ error: "Failed to get friends" })
  }
})

// Get pending requests
router.get("/requests", authMiddleware, async (req, res) => {
  try {
    const result = await query(
      `SELECT u.id, u.username, u.email, u.avatar_url, f.created_at
       FROM friendships f
       JOIN users u ON u.id = f.user_id
       WHERE f.friend_id = $1 AND f.status = 'pending'`,
      [req.userId],
    )

    res.json({ requests: result.rows })
  } catch (error) {
    console.error("[v0] Get requests error:", error)
    res.status(500).json({ error: "Failed to get friend requests" })
  }
})

module.exports = router
