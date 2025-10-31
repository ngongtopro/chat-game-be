const { query } = require("../db")

class CaroRoom {
  constructor(data) {
    this.id = data.id
    this.room_code = data.room_code
    this.status = data.status || 'waiting'
    this.created_at = data.created_at
    this.finished_at = data.finished_at
  }

  // Status constants
  static STATUS = {
    WAITING: 'waiting',
    ACTIVE: 'active', 
    FINISHED: 'finished'
  }

  // Static methods
  static async create({ room_code = null }) {
    try {
      // Generate room code if not provided
      if (!room_code) {
        room_code = CaroRoom.generateRoomCode()
      }

      const result = await query(
        'INSERT INTO caro_rooms (room_code) VALUES ($1) RETURNING *',
        [room_code]
      )
      return new CaroRoom(result.rows[0])
    } catch (error) {
      throw error
    }
  }

  static async findById(id) {
    try {
      const result = await query('SELECT * FROM caro_rooms WHERE id = $1', [id])
      return result.rows.length > 0 ? new CaroRoom(result.rows[0]) : null
    } catch (error) {
      throw error
    }
  }

  static async findByRoomCode(room_code) {
    try {
      const result = await query('SELECT * FROM caro_rooms WHERE room_code = $1', [room_code])
      return result.rows.length > 0 ? new CaroRoom(result.rows[0]) : null
    } catch (error) {
      throw error
    }
  }

  static async findByUserId(user_id, limit = 20) {
    try {
      const result = await query(`
        SELECT DISTINCT cr.*
        FROM caro_rooms cr
        JOIN caro_games cg ON cr.id = cg.room_id
        WHERE cg.player1_id = $1 OR cg.player2_id = $1
        ORDER BY cr.created_at DESC
        LIMIT $2
      `, [user_id, limit])

      return result.rows.map(row => new CaroRoom(row))
    } catch (error) {
      throw error
    }
  }

  static async findWaitingRooms(limit = 10) {
    try {
      const result = await query(`
        SELECT cr.*
        FROM caro_rooms cr
        WHERE cr.status = 'waiting'
        ORDER BY cr.created_at ASC
        LIMIT $1
      `, [limit])

      return result.rows.map(row => new CaroRoom(row))
    } catch (error) {
      throw error
    }
  }

  static async findActiveRooms(limit = 10) {
    try {
      const result = await query(`
        SELECT cr.*
        FROM caro_rooms cr
        WHERE cr.status = 'active'
        ORDER BY cr.created_at DESC
        LIMIT $1
      `, [limit])

      return result.rows.map(row => new CaroRoom(row))
    } catch (error) {
      throw error
    }
  }

  static generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase()
  }

  // Instance methods
  async updateStatus(status) {
    try {
      const result = await query(
        'UPDATE caro_rooms SET status = $1 WHERE id = $2 RETURNING *',
        [status, this.id]
      )

      if (result.rows.length > 0) {
        Object.assign(this, result.rows[0])
      }
      return this
    } catch (error) {
      throw error
    }
  }

  async finish() {
    try {
      const result = await query(
        'UPDATE caro_rooms SET status = $1, finished_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
        ['finished', this.id]
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
      await query('DELETE FROM caro_rooms WHERE id = $1', [this.id])
      return true
    } catch (error) {
      throw error
    }
  }

  // Helper methods
  isWaiting() {
    return this.status === 'waiting'
  }

  isActive() {
    return this.status === 'active'
  }

  isFinished() {
    return this.status === 'finished'
  }

  // Relations
  async getGames() {
    const CaroGame = require('./CaroGame')
    return await CaroGame.findByRoomId(this.id)
  }

  async getCurrentGame() {
    const CaroGame = require('./CaroGame')
    return await CaroGame.findCurrentByRoomId(this.id)
  }

  async getChatMessages() {
    const CaroRoomMessage = require('./CaroRoomMessage')
    return await CaroRoomMessage.findByRoomId(this.id)
  }
}

module.exports = CaroRoom