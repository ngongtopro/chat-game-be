const express = require("express")
const { query } = require("../db")
const { authMiddleware } = require("../auth")

const router = express.Router()

// Get messages with a friend
router.get("/messages", authMiddleware, async (req, res) => {
  try {
    const { friendId } = req.query

    const result = await query(
      `SELECT cm.*, u.username as sender_username, u.avatar_url as sender_avatar
       FROM chat_messages cm
       JOIN users u ON cm.sender_id = u.id
       WHERE (cm.sender_id = $1 AND cm.receiver_id = $2) 
          OR (cm.sender_id = $2 AND cm.receiver_id = $1)
       ORDER BY cm.created_at ASC
       LIMIT 100`,
      [req.userId, friendId],
    )

    res.json({ messages: result.rows })
  } catch (error) {
    console.error("[v0] Get messages error:", error)
    res.status(500).json({ error: "Failed to get messages" })
  }
})

// Send message
router.post("/send", authMiddleware, async (req, res) => {
  try {
    const { receiverId, message } = req.body

    const result = await query(
      "INSERT INTO chat_messages (sender_id, receiver_id, message) VALUES ($1, $2, $3) RETURNING *",
      [req.userId, receiverId, message],
    )

    res.json({ message: result.rows[0] })
  } catch (error) {
    console.error("[v0] Send message error:", error)
    res.status(500).json({ error: "Failed to send message" })
  }
})

// Get conversations list
router.get("/conversations", authMiddleware, async (req, res) => {
  try {
    const result = await query(
      `SELECT DISTINCT ON (other_user_id)
              other_user_id as friend_id,
              u.username,
              u.avatar_url,
              last_message,
              last_message_time,
              COALESCE(
                (SELECT COUNT(*) 
                 FROM chat_messages 
                 WHERE sender_id = other_user_id 
                   AND receiver_id = $1 
                   AND is_read = false
                ), 0
              ) as unread_count
       FROM (
         SELECT 
           CASE 
             WHEN sender_id = $1 THEN receiver_id 
             ELSE sender_id 
           END as other_user_id,
           message as last_message,
           created_at as last_message_time
         FROM chat_messages
         WHERE sender_id = $1 OR receiver_id = $1
         ORDER BY created_at DESC
       ) conversations
       JOIN users u ON u.id = other_user_id
       ORDER BY other_user_id, last_message_time DESC`,
      [req.userId],
    )

    res.json({ conversations: result.rows })
  } catch (error) {
    console.error("[v0] Get conversations error:", error)
    res.status(500).json({ error: "Failed to get conversations" })
  }
})

// Mark messages as read
router.post("/mark-read", authMiddleware, async (req, res) => {
  try {
    const { friendId } = req.body

    await query(
      `UPDATE chat_messages 
       SET is_read = true 
       WHERE sender_id = $1 AND receiver_id = $2 AND is_read = false`,
      [friendId, req.userId],
    )

    res.json({ success: true })
  } catch (error) {
    console.error("[v0] Mark read error:", error)
    res.status(500).json({ error: "Failed to mark messages as read" })
  }
})

module.exports = router
