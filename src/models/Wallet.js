const { query } = require("../db")

class Wallet {
  constructor(data) {
    this.id = data.id
    this.user_id = data.user_id
    this.balance = parseFloat(data.balance) || 0
    this.updated_at = data.updated_at
  }

  // Static methods
  static async create(user_id, initial_balance = 0) {
    try {
      const result = await query(
        'INSERT INTO wallets (user_id, balance) VALUES ($1, $2) RETURNING *',
        [user_id, initial_balance]
      )
      return new Wallet(result.rows[0])
    } catch (error) {
      throw error
    }
  }

  static async findByUserId(user_id) {
    try {
      const result = await query('SELECT * FROM wallets WHERE user_id = $1', [user_id])
      return result.rows.length > 0 ? new Wallet(result.rows[0]) : null
    } catch (error) {
      throw error
    }
  }

  static async findById(id) {
    try {
      const result = await query('SELECT * FROM wallets WHERE id = $1', [id])
      return result.rows.length > 0 ? new Wallet(result.rows[0]) : null
    } catch (error) {
      throw error
    }
  }

  // Instance methods
  async updateBalance(newBalance) {
    try {
      const result = await query(
        'UPDATE wallets SET balance = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
        [newBalance, this.id]
      )
      
      if (result.rows.length > 0) {
        Object.assign(this, result.rows[0])
        this.balance = parseFloat(this.balance)
      }
      return this
    } catch (error) {
      throw error
    }
  }

  async addMoney(amount, transactionType = 'deposit', source = null) {
    try {
      const newBalance = this.balance + parseFloat(amount)
      
      // Begin transaction
      await query('BEGIN')
      
      // Update wallet balance
      await this.updateBalance(newBalance)
      
      // Create transaction record
      const Transaction = require('./Transaction')
      await Transaction.create({
        user_id: this.user_id,
        amount: parseFloat(amount),
        type: transactionType,
        source: source
      })
      
      await query('COMMIT')
      return this
    } catch (error) {
      await query('ROLLBACK')
      throw error
    }
  }

  async subtractMoney(amount, transactionType = 'withdraw', source = null) {
    try {
      const amountToSubtract = parseFloat(amount)
      
      if (this.balance < amountToSubtract) {
        throw new Error('Insufficient balance')
      }
      
      const newBalance = this.balance - amountToSubtract
      
      // Begin transaction
      await query('BEGIN')
      
      // Update wallet balance
      await this.updateBalance(newBalance)
      
      // Create transaction record
      const Transaction = require('./Transaction')
      await Transaction.create({
        user_id: this.user_id,
        amount: -amountToSubtract, // Negative amount for subtraction
        type: transactionType,
        source: source
      })
      
      await query('COMMIT')
      return this
    } catch (error) {
      await query('ROLLBACK')
      throw error
    }
  }

  async getTransactionHistory(limit = 50, offset = 0) {
    const Transaction = require('./Transaction')
    return await Transaction.findByUserId(this.user_id, limit, offset)
  }

  // Relations
  async getUser() {
    const User = require('./User')
    return await User.findById(this.user_id)
  }
}

module.exports = Wallet