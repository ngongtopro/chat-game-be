const { query } = require("../db")

class Transaction {
  constructor(data) {
    this.id = data.id
    this.user_id = data.user_id
    this.amount = parseFloat(data.amount)
    this.type = data.type
    this.source = data.source
    this.created_at = data.created_at
  }

  // Transaction types constants
  static TYPES = {
    DEPOSIT: 'deposit',
    WITHDRAW: 'withdraw',
    GAME_WIN: 'game_win',
    GAME_LOSS: 'game_loss',
    FARM_HARVEST: 'farm_harvest',
    SEED_PURCHASE: 'seed_purchase'
  }

  // Static methods
  static async create({ user_id, amount, type, source = null }) {
    try {
      const result = await query(
        'INSERT INTO transactions (user_id, amount, type, source) VALUES ($1, $2, $3, $4) RETURNING *',
        [user_id, amount, type, source]
      )
      return new Transaction(result.rows[0])
    } catch (error) {
      throw error
    }
  }

  static async findById(id) {
    try {
      const result = await query('SELECT * FROM transactions WHERE id = $1', [id])
      return result.rows.length > 0 ? new Transaction(result.rows[0]) : null
    } catch (error) {
      throw error
    }
  }

  static async findByUserId(user_id, limit = 50, offset = 0) {
    try {
      const result = await query(
        'SELECT * FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
        [user_id, limit, offset]
      )
      return result.rows.map(row => new Transaction(row))
    } catch (error) {
      throw error
    }
  }

  static async findByType(type, limit = 50, offset = 0) {
    try {
      const result = await query(
        'SELECT * FROM transactions WHERE type = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
        [type, limit, offset]
      )
      return result.rows.map(row => new Transaction(row))
    } catch (error) {
      throw error
    }
  }

  static async findByUserAndType(user_id, type, limit = 50, offset = 0) {
    try {
      const result = await query(
        'SELECT * FROM transactions WHERE user_id = $1 AND type = $2 ORDER BY created_at DESC LIMIT $3 OFFSET $4',
        [user_id, type, limit, offset]
      )
      return result.rows.map(row => new Transaction(row))
    } catch (error) {
      throw error
    }
  }

  static async getTotalByUserAndType(user_id, type) {
    try {
      const result = await query(
        'SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE user_id = $1 AND type = $2',
        [user_id, type]
      )
      return parseFloat(result.rows[0].total) || 0
    } catch (error) {
      throw error
    }
  }

  static async getDateRangeTransactions(user_id, startDate, endDate, limit = 100) {
    try {
      const result = await query(
        `SELECT * FROM transactions 
         WHERE user_id = $1 AND created_at >= $2 AND created_at <= $3 
         ORDER BY created_at DESC LIMIT $4`,
        [user_id, startDate, endDate, limit]
      )
      return result.rows.map(row => new Transaction(row))
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
        if (data[key] !== undefined && key !== 'id' && key !== 'created_at') {
          fields.push(`${key} = $${paramCount}`)
          values.push(data[key])
          paramCount++
        }
      })

      if (fields.length === 0) return this

      values.push(this.id)
      const sql = `UPDATE transactions SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`
      const result = await query(sql, values)

      if (result.rows.length > 0) {
        Object.assign(this, result.rows[0])
        this.amount = parseFloat(this.amount)
      }
      return this
    } catch (error) {
      throw error
    }
  }

  async delete() {
    try {
      await query('DELETE FROM transactions WHERE id = $1', [this.id])
      return true
    } catch (error) {
      throw error
    }
  }

  // Relations
  async getUser() {
    const User = require('./User')
    return await User.findById(this.user_id)
  }

  // Helper methods
  isDeposit() {
    return this.amount > 0
  }

  isWithdrawal() {
    return this.amount < 0
  }

  getAbsoluteAmount() {
    return Math.abs(this.amount)
  }
}

module.exports = Transaction