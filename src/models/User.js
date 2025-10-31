const { query } = require("../db")

class User {
  constructor(data) {
    this.id = data.id
    this.username = data.username
    this.email = data.email
    this.password_hash = data.password_hash
    this.type = data.type || 'regular'
    this.avatar_url = data.avatar_url
    this.created_at = data.created_at
    this.updated_at = data.updated_at
  }

  // Static methods
  static async create({ username, email, password_hash, type = 'regular', avatar_url = null }) {
    try {
      const result = await query(
        `INSERT INTO users (username, email, password_hash, type, avatar_url) 
         VALUES ($1, $2, $3, $4, $5) 
         RETURNING *`,
        [username, email, password_hash, type, avatar_url]
      )
      return new User(result.rows[0])
    } catch (error) {
      throw error
    }
  }

  static async findById(id) {
    try {
      const result = await query('SELECT * FROM users WHERE id = $1', [id])
      return result.rows.length > 0 ? new User(result.rows[0]) : null
    } catch (error) {
      throw error
    }
  }

  static async findByUsername(username) {
    try {
      const result = await query('SELECT * FROM users WHERE username = $1', [username])
      return result.rows.length > 0 ? new User(result.rows[0]) : null
    } catch (error) {
      throw error
    }
  }

  static async findByEmail(email) {
    try {
      const result = await query('SELECT * FROM users WHERE email = $1', [email])
      return result.rows.length > 0 ? new User(result.rows[0]) : null
    } catch (error) {
      throw error
    }
  }

  static async findAll(limit = 50, offset = 0) {
    try {
      const result = await query(
        'SELECT * FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2',
        [limit, offset]
      )
      return result.rows.map(row => new User(row))
    } catch (error) {
      throw error
    }
  }

  // Instance methods
  async update(data) {
    try {
      const fields = []
      const values = []
      let paramCount = 1

      Object.keys(data).forEach(key => {
        if (data[key] !== undefined && key !== 'id') {
          fields.push(`${key} = $${paramCount}`)
          values.push(data[key])
          paramCount++
        }
      })

      if (fields.length === 0) return this

      fields.push(`updated_at = CURRENT_TIMESTAMP`)
      values.push(this.id)

      const sql = `UPDATE users SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`
      const result = await query(sql, values)

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
      await query('DELETE FROM users WHERE id = $1', [this.id])
      return true
    } catch (error) {
      throw error
    }
  }

  // Relations
  async getWallet() {
    const Wallet = require('./Wallet')
    return await Wallet.findByUserId(this.id)
  }

  async getFriends() {
    const Friendship = require('./Friendship')
    return await Friendship.getFriendsByUserId(this.id)
  }

  async getCaroStats() {
    const CaroStats = require('./CaroStats')
    return await CaroStats.findByUserId(this.id)
  }

  // Safe object (without password)
  toSafeObject() {
    const { password_hash, ...safeUser } = this
    return safeUser
  }
}

module.exports = User