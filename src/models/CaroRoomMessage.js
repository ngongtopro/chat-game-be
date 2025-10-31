const { query } = require("../db")

class CaroRoomMessage {
  constructor(data) {
    this.id = data.id
    this.room_id = data.room_id
    this.user_id = data.user_id
    this.message = data.message
    this.created_at = data.created_at
  }

  // Static methods
  static async create({ room_id, user_id, message }) {
    try {
      const result = await query(
        'INSERT INTO caro_room_messages (room_id, user_id, message) VALUES ($1, $2, $3) RETURNING *',
        [room_id, user_id, message]
      )
      return new CaroRoomMessage(result.rows[0])
    } catch (error) {
      throw error
    }
  }

  static async findById(id) {
    try {
      const result = await query('SELECT * FROM caro_room_messages WHERE id = $1', [id])
      return result.rows.length > 0 ? new CaroRoomMessage(result.rows[0]) : null
    } catch (error) {
      throw error
    }
  }

  static async findByRoomId(room_id, limit = 50, offset = 0) {
    try {
      const result = await query(`
        SELECT crm.*, u.username, u.avatar_url
        FROM caro_room_messages crm
        JOIN users u ON crm.user_id = u.id
        WHERE crm.room_id = $1
        ORDER BY crm.created_at ASC
        LIMIT $2 OFFSET $3
      `, [room_id, limit, offset])

      return result.rows.map(row => {
        const message = new CaroRoomMessage(row)
        message.user = {
          id: row.user_id,
          username: row.username,
          avatar_url: row.avatar_url
        }
        return message
      })
    } catch (error) {
      throw error
    }
  }

  static async findByUserId(user_id, limit = 50, offset = 0) {
    try {
      const result = await query(`
        SELECT crm.*, cr.room_code
        FROM caro_room_messages crm
        JOIN caro_rooms cr ON crm.room_id = cr.id
        WHERE crm.user_id = $1
        ORDER BY crm.created_at DESC
        LIMIT $2 OFFSET $3
      `, [user_id, limit, offset])

      return result.rows.map(row => {
        const message = new CaroRoomMessage(row)
        message.room_code = row.room_code
        return message
      })
    } catch (error) {
      throw error
    }
  }

  static async findRecentByRoomId(room_id, limit = 20) {
    try {
      const result = await query(`
        SELECT crm.*, u.username, u.avatar_url
        FROM caro_room_messages crm
        JOIN users u ON crm.user_id = u.id
        WHERE crm.room_id = $1
        ORDER BY crm.created_at DESC
        LIMIT $2
      `, [room_id, limit])

      return result.rows.map(row => {
        const message = new CaroRoomMessage(row)
        message.user = {
          id: row.user_id,
          username: row.username,
          avatar_url: row.avatar_url
        }
        return message
      }).reverse() // Return in chronological order (oldest first)
    } catch (error) {
      throw error
    }
  }

  static async getMessageCount(room_id) {
    try {
      const result = await query(
        'SELECT COUNT(*) as count FROM caro_room_messages WHERE room_id = $1',
        [room_id]
      )
      return parseInt(result.rows[0].count) || 0
    } catch (error) {
      throw error
    }
  }

  static async deleteByRoomId(room_id) {
    try {
      await query('DELETE FROM caro_room_messages WHERE room_id = $1', [room_id])
      return true
    } catch (error) {
      throw error
    }
  }

  static async searchInRoom(room_id, searchTerm, limit = 50) {
    try {
      const result = await query(`
        SELECT crm.*, u.username, u.avatar_url
        FROM caro_room_messages crm
        JOIN users u ON crm.user_id = u.id
        WHERE crm.room_id = $1 AND crm.message ILIKE $2
        ORDER BY crm.created_at DESC
        LIMIT $3
      `, [room_id, `%${searchTerm}%`, limit])

      return result.rows.map(row => {
        const message = new CaroRoomMessage(row)
        message.user = {
          id: row.user_id,
          username: row.username,
          avatar_url: row.avatar_url
        }
        return message
      })
    } catch (error) {
      throw error
    }
  }

  // Instance methods
  async update(message) {
    try {
      const result = await query(
        'UPDATE caro_room_messages SET message = $1 WHERE id = $2 RETURNING *',
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
      await query('DELETE FROM caro_room_messages WHERE id = $1', [this.id])
      return true
    } catch (error) {
      throw error
    }
  }

  // Helper methods
  isSentBy(user_id) {
    return this.user_id === user_id
  }

  getTimeAgo() {
    const now = new Date()
    const messageTime = new Date(this.created_at)
    const diffInMs = now - messageTime
    const diffInMinutes = Math.floor(diffInMs / (1000 * 60))
    const diffInHours = Math.floor(diffInMinutes / 60)
    const diffInDays = Math.floor(diffInHours / 24)

    if (diffInMinutes < 1) {
      return 'Just now'
    } else if (diffInMinutes < 60) {
      return `${diffInMinutes} minute${diffInMinutes > 1 ? 's' : ''} ago`
    } else if (diffInHours < 24) {
      return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`
    } else if (diffInDays < 7) {
      return `${diffInDays} day${diffInDays > 1 ? 's' : ''} ago`
    } else {
      return messageTime.toLocaleDateString()
    }
  }

  // Relations
  async getUser() {
    const User = require('./User')
    return await User.findById(this.user_id)
  }

  async getRoom() {
    const CaroRoom = require('./CaroRoom')
    return await CaroRoom.findById(this.room_id)
  }

  // Static helper methods
  static async getMessageStatsByRoom(room_id) {
    try {
      const result = await query(`
        SELECT 
          COUNT(*) as total_messages,
          COUNT(DISTINCT user_id) as unique_users,
          MIN(created_at) as first_message_at,
          MAX(created_at) as last_message_at
        FROM caro_room_messages 
        WHERE room_id = $1
      `, [room_id])

      return {
        total_messages: parseInt(result.rows[0].total_messages) || 0,
        unique_users: parseInt(result.rows[0].unique_users) || 0,
        first_message_at: result.rows[0].first_message_at,
        last_message_at: result.rows[0].last_message_at
      }
    } catch (error) {
      throw error
    }
  }

  static async getMostActiveUsers(room_id, limit = 5) {
    try {
      const result = await query(`
        SELECT u.id, u.username, u.avatar_url, COUNT(crm.id) as message_count
        FROM caro_room_messages crm
        JOIN users u ON crm.user_id = u.id
        WHERE crm.room_id = $1
        GROUP BY u.id, u.username, u.avatar_url
        ORDER BY message_count DESC
        LIMIT $2
      `, [room_id, limit])

      return result.rows.map(row => ({
        user: {
          id: row.id,
          username: row.username,
          avatar_url: row.avatar_url
        },
        message_count: parseInt(row.message_count)
      }))
    } catch (error) {
      throw error
    }
  }

  // System message helpers
  static async createSystemMessage(room_id, message) {
    try {
      // Create system message with user_id as null or system user
      const result = await query(
        'INSERT INTO caro_room_messages (room_id, user_id, message) VALUES ($1, NULL, $2) RETURNING *',
        [room_id, message]
      )
      return new CaroRoomMessage(result.rows[0])
    } catch (error) {
      throw error
    }
  }

  isSystemMessage() {
    return this.user_id === null
  }
}

module.exports = CaroRoomMessage