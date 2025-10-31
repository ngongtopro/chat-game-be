const { query } = require("../db")

class ChatMessage {
  constructor(data) {
    this.id = data.id
    this.sender_id = data.sender_id
    this.receiver_id = data.receiver_id
    this.message = data.message
    this.is_read = data.is_read || false
    this.created_at = data.created_at
  }

  // Static methods
  static async create({ sender_id, receiver_id, message }) {
    try {
      const result = await query(
        'INSERT INTO chat_messages (sender_id, receiver_id, message) VALUES ($1, $2, $3) RETURNING *',
        [sender_id, receiver_id, message]
      )
      return new ChatMessage(result.rows[0])
    } catch (error) {
      throw error
    }
  }

  static async findById(id) {
    try {
      const result = await query('SELECT * FROM chat_messages WHERE id = $1', [id])
      return result.rows.length > 0 ? new ChatMessage(result.rows[0]) : null
    } catch (error) {
      throw error
    }
  }

  static async findByConversation(user1_id, user2_id, limit = 50, offset = 0) {
    try {
      const result = await query(`
        SELECT cm.*, 
               sender.username as sender_username,
               receiver.username as receiver_username
        FROM chat_messages cm
        JOIN users sender ON cm.sender_id = sender.id
        JOIN users receiver ON cm.receiver_id = receiver.id
        WHERE (cm.sender_id = $1 AND cm.receiver_id = $2) 
           OR (cm.sender_id = $2 AND cm.receiver_id = $1)
        ORDER BY cm.created_at DESC
        LIMIT $3 OFFSET $4
      `, [user1_id, user2_id, limit, offset])

      return result.rows.map(row => {
        const message = new ChatMessage(row)
        message.sender_username = row.sender_username
        message.receiver_username = row.receiver_username
        return message
      }).reverse() // Reverse to show oldest first
    } catch (error) {
      throw error
    }
  }

  static async findConversationsList(user_id, limit = 20) {
    try {
      const result = await query(`
        WITH recent_messages AS (
          SELECT 
            cm.*,
            CASE 
              WHEN cm.sender_id = $1 THEN cm.receiver_id 
              ELSE cm.sender_id 
            END as other_user_id,
            ROW_NUMBER() OVER (
              PARTITION BY CASE 
                WHEN cm.sender_id = $1 THEN cm.receiver_id 
                ELSE cm.sender_id 
              END 
              ORDER BY cm.created_at DESC
            ) as rn
          FROM chat_messages cm
          WHERE cm.sender_id = $1 OR cm.receiver_id = $1
        )
        SELECT 
          rm.*, 
          u.username as other_username,
          u.avatar_url as other_avatar_url,
          unread.unread_count
        FROM recent_messages rm
        JOIN users u ON rm.other_user_id = u.id
        LEFT JOIN (
          SELECT receiver_id, sender_id, COUNT(*) as unread_count
          FROM chat_messages 
          WHERE receiver_id = $1 AND is_read = false
          GROUP BY receiver_id, sender_id
        ) unread ON unread.sender_id = rm.other_user_id
        WHERE rm.rn = 1
        ORDER BY rm.created_at DESC
        LIMIT $2
      `, [user_id, limit])

      return result.rows.map(row => {
        const message = new ChatMessage(row)
        message.other_user = {
          id: row.other_user_id,
          username: row.other_username,
          avatar_url: row.other_avatar_url
        }
        message.unread_count = parseInt(row.unread_count) || 0
        return message
      })
    } catch (error) {
      throw error
    }
  }

  static async findUnreadMessages(receiver_id, sender_id = null) {
    try {
      let sql = 'SELECT * FROM chat_messages WHERE receiver_id = $1 AND is_read = false'
      let params = [receiver_id]

      if (sender_id) {
        sql += ' AND sender_id = $2'
        params.push(sender_id)
      }

      sql += ' ORDER BY created_at ASC'

      const result = await query(sql, params)
      return result.rows.map(row => new ChatMessage(row))
    } catch (error) {
      throw error
    }
  }

  static async getUnreadCount(receiver_id, sender_id = null) {
    try {
      let sql = 'SELECT COUNT(*) as count FROM chat_messages WHERE receiver_id = $1 AND is_read = false'
      let params = [receiver_id]

      if (sender_id) {
        sql += ' AND sender_id = $2'
        params.push(sender_id)
      }

      const result = await query(sql, params)
      return parseInt(result.rows[0].count) || 0
    } catch (error) {
      throw error
    }
  }

  static async markAsRead(receiver_id, sender_id) {
    try {
      const result = await query(
        'UPDATE chat_messages SET is_read = true WHERE receiver_id = $1 AND sender_id = $2 AND is_read = false RETURNING *',
        [receiver_id, sender_id]
      )
      return result.rows.map(row => new ChatMessage(row))
    } catch (error) {
      throw error
    }
  }

  static async searchMessages(user_id, searchTerm, limit = 50) {
    try {
      const result = await query(`
        SELECT cm.*, 
               sender.username as sender_username,
               receiver.username as receiver_username
        FROM chat_messages cm
        JOIN users sender ON cm.sender_id = sender.id
        JOIN users receiver ON cm.receiver_id = receiver.id
        WHERE (cm.sender_id = $1 OR cm.receiver_id = $1)
          AND cm.message ILIKE $2
        ORDER BY cm.created_at DESC
        LIMIT $3
      `, [user_id, `%${searchTerm}%`, limit])

      return result.rows.map(row => {
        const message = new ChatMessage(row)
        message.sender_username = row.sender_username
        message.receiver_username = row.receiver_username
        return message
      })
    } catch (error) {
      throw error
    }
  }

  // Instance methods
  async markAsRead() {
    try {
      const result = await query(
        'UPDATE chat_messages SET is_read = true WHERE id = $1 RETURNING *',
        [this.id]
      )

      if (result.rows.length > 0) {
        Object.assign(this, result.rows[0])
      }
      return this
    } catch (error) {
      throw error
    }
  }

  async update(message) {
    try {
      const result = await query(
        'UPDATE chat_messages SET message = $1 WHERE id = $2 RETURNING *',
        [message, this.id]
      )

      if (result.rows.length > 0) {
        Object.assign(this, result.rows[0])
      }
      return this
    } catch (error) {
      throw error
    }
  }

  async delete() {
    try {
      await query('DELETE FROM chat_messages WHERE id = $1', [this.id])
      return true
    } catch (error) {
      throw error
    }
  }

  // Helper methods
  isUnread() {
    return !this.is_read
  }

  isSentBy(user_id) {
    return this.sender_id === user_id
  }

  isReceivedBy(user_id) {
    return this.receiver_id === user_id
  }

  getOtherUserId(current_user_id) {
    return current_user_id === this.sender_id ? this.receiver_id : this.sender_id
  }

  // Relations
  async getSender() {
    const User = require('./User')
    return await User.findById(this.sender_id)
  }

  async getReceiver() {
    const User = require('./User')
    return await User.findById(this.receiver_id)
  }

  // Static helper methods
  static async deleteConversation(user1_id, user2_id) {
    try {
      await query(
        'DELETE FROM chat_messages WHERE (sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1)',
        [user1_id, user2_id]
      )
      return true
    } catch (error) {
      throw error
    }
  }

  static async getMessageStats(user_id) {
    try {
      const result = await query(`
        SELECT 
          COUNT(*) as total_messages,
          COUNT(*) FILTER (WHERE sender_id = $1) as sent_messages,
          COUNT(*) FILTER (WHERE receiver_id = $1) as received_messages,
          COUNT(*) FILTER (WHERE receiver_id = $1 AND is_read = false) as unread_messages
        FROM chat_messages 
        WHERE sender_id = $1 OR receiver_id = $1
      `, [user_id])

      return {
        total_messages: parseInt(result.rows[0].total_messages) || 0,
        sent_messages: parseInt(result.rows[0].sent_messages) || 0,
        received_messages: parseInt(result.rows[0].received_messages) || 0,
        unread_messages: parseInt(result.rows[0].unread_messages) || 0
      }
    } catch (error) {
      throw error
    }
  }
}

module.exports = ChatMessage