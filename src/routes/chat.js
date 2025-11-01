const express = require("express")
const { query } = require("../db")
const { authMiddleware } = require("../auth")
const { onlineUsers } = require("../socket")

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
    // Get all friends with their last messages (if any)
    const result = await query(
      `SELECT 
         CASE 
           WHEN f.user_id = $1 THEN f.friend_id
           ELSE f.user_id
         END as friend_id,
         u.username,
         u.avatar_url,
         (
           SELECT message 
           FROM chat_messages 
           WHERE (sender_id = $1 AND receiver_id = CASE WHEN f.user_id = $1 THEN f.friend_id ELSE f.user_id END)
              OR (sender_id = CASE WHEN f.user_id = $1 THEN f.friend_id ELSE f.user_id END AND receiver_id = $1)
           ORDER BY created_at DESC 
           LIMIT 1
         ) as last_message,
         (
           SELECT created_at 
           FROM chat_messages 
           WHERE (sender_id = $1 AND receiver_id = CASE WHEN f.user_id = $1 THEN f.friend_id ELSE f.user_id END)
              OR (sender_id = CASE WHEN f.user_id = $1 THEN f.friend_id ELSE f.user_id END AND receiver_id = $1)
           ORDER BY created_at DESC 
           LIMIT 1
         ) as last_message_time,
         (
           SELECT COUNT(*) 
           FROM chat_messages 
           WHERE sender_id = CASE WHEN f.user_id = $1 THEN f.friend_id ELSE f.user_id END
             AND receiver_id = $1 
             AND is_read = false
         ) as unread_count
       FROM friendships f
       JOIN users u ON u.id = CASE 
         WHEN f.user_id = $1 THEN f.friend_id
         ELSE f.user_id
       END
       WHERE (f.user_id = $1 OR f.friend_id = $1) AND f.status = 'accepted'
       ORDER BY last_message_time DESC NULLS LAST`,
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

// Get online users (friends only)
router.get("/online-users", authMiddleware, async (req, res) => {
  try {
    // Get user's friends
    const friendsResult = await query(
      `SELECT CASE 
        WHEN user_id = $1 THEN friend_id 
        ELSE user_id 
      END as friend_id 
      FROM friendships 
      WHERE (user_id = $1 OR friend_id = $1) AND status = 'accepted'`,
      [req.userId]
    )

    // Check which friends are online
    const onlineFriendIds = friendsResult.rows
      .map(row => row.friend_id)
      .filter(friendId => onlineUsers.has(friendId))

    res.json({ onlineUsers: onlineFriendIds })
  } catch (error) {
    console.error("[v0] Get online users error:", error)
    res.status(500).json({ error: "Failed to get online users" })
  }
})

module.exports = router
