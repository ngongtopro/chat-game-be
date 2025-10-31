const { query } = require("../db")

class CaroStats {
  constructor(data) {
    this.id = data.id
    this.user_id = data.user_id
    this.games_played = data.games_played || 0
    this.games_won = data.games_won || 0
    this.level = data.level || 1
    this.total_earnings = parseFloat(data.total_earnings) || 0
    this.exp = parseFloat(data.exp) || 0
  }

  // Static methods
  static async create(user_id) {
    try {
      const result = await query(
        'INSERT INTO caro_stats (user_id) VALUES ($1) RETURNING *',
        [user_id]
      )
      return new CaroStats(result.rows[0])
    } catch (error) {
      throw error
    }
  }

  static async findById(id) {
    try {
      const result = await query('SELECT * FROM caro_stats WHERE id = $1', [id])
      return result.rows.length > 0 ? new CaroStats(result.rows[0]) : null
    } catch (error) {
      throw error
    }
  }

  static async findByUserId(user_id) {
    try {
      const result = await query('SELECT * FROM caro_stats WHERE user_id = $1', [user_id])
      return result.rows.length > 0 ? new CaroStats(result.rows[0]) : null
    } catch (error) {
      throw error
    }
  }

  static async findOrCreateByUserId(user_id) {
    try {
      let stats = await CaroStats.findByUserId(user_id)
      if (!stats) {
        stats = await CaroStats.create(user_id)
      }
      return stats
    } catch (error) {
      throw error
    }
  }

  static async getLeaderboard(limit = 10) {
    try {
      const result = await query(`
        SELECT cs.*, u.username, u.avatar_url
        FROM caro_stats cs
        JOIN users u ON cs.user_id = u.id
        ORDER BY cs.level DESC, cs.games_won DESC, cs.total_earnings DESC
        LIMIT $1
      `, [limit])

      return result.rows.map(row => ({
        stats: new CaroStats(row),
        user: {
          id: row.user_id,
          username: row.username,
          avatar_url: row.avatar_url
        }
      }))
    } catch (error) {
      throw error
    }
  }

  static async getTopWinners(limit = 10) {
    try {
      const result = await query(`
        SELECT cs.*, u.username, u.avatar_url
        FROM caro_stats cs
        JOIN users u ON cs.user_id = u.id
        WHERE cs.games_played > 0
        ORDER BY cs.games_won DESC, (cs.games_won::float / cs.games_played) DESC
        LIMIT $1
      `, [limit])

      return result.rows.map(row => ({
        stats: new CaroStats(row),
        user: {
          id: row.user_id,
          username: row.username,
          avatar_url: row.avatar_url
        }
      }))
    } catch (error) {
      throw error
    }
  }

  static async getTopEarners(limit = 10) {
    try {
      const result = await query(`
        SELECT cs.*, u.username, u.avatar_url
        FROM caro_stats cs
        JOIN users u ON cs.user_id = u.id
        ORDER BY cs.total_earnings DESC
        LIMIT $1
      `, [limit])

      return result.rows.map(row => ({
        stats: new CaroStats(row),
        user: {
          id: row.user_id,
          username: row.username,
          avatar_url: row.avatar_url
        }
      }))
    } catch (error) {
      throw error
    }
  }

  // Instance methods
  async incrementGamesPlayed() {
    try {
      const result = await query(
        'UPDATE caro_stats SET games_played = games_played + 1 WHERE id = $1 RETURNING *',
        [this.id]
      )

      if (result.rows.length > 0) {
        Object.assign(this, result.rows[0])
        this.total_earnings = parseFloat(this.total_earnings)
      }
      return this
    } catch (error) {
      throw error
    }
  }

  async incrementGamesWon() {
    try {
      const result = await query(
        'UPDATE caro_stats SET games_won = games_won + 1 WHERE id = $1 RETURNING *',
        [this.id]
      )

      if (result.rows.length > 0) {
        Object.assign(this, result.rows[0])
        this.total_earnings = parseFloat(this.total_earnings)
      }
      return this
    } catch (error) {
      throw error
    }
  }

  async addEarnings(amount) {
    try {
      const result = await query(
        'UPDATE caro_stats SET total_earnings = total_earnings + $1 WHERE id = $2 RETURNING *',
        [amount, this.id]
      )

      if (result.rows.length > 0) {
        Object.assign(this, result.rows[0])
        this.total_earnings = parseFloat(this.total_earnings)
      }
      return this
    } catch (error) {
      throw error
    }
  }

  async updateLevel(newLevel) {
    try {
      const result = await query(
        'UPDATE caro_stats SET level = $1 WHERE id = $2 RETURNING *',
        [newLevel, this.id]
      )

      if (result.rows.length > 0) {
        Object.assign(this, result.rows[0])
        this.total_earnings = parseFloat(this.total_earnings)
      }
      return this
    } catch (error) {
      throw error
    }
  }

  async recordGameResult(isWin, earnings = 0) {
    try {
      await query('BEGIN')

      // Increment games played
      await this.incrementGamesPlayed()

      // If win, increment wins and add earnings
      if (isWin) {
        await this.incrementGamesWon()
        if (earnings > 0) {
          await this.addEarnings(earnings)
        }
      }

      // Check for level up
      const newLevel = this.calculateLevel()
      if (newLevel > this.level) {
        await this.updateLevel(newLevel)
      }

      await query('COMMIT')
      return this
    } catch (error) {
      await query('ROLLBACK')
      throw error
    }
  }

  // Helper methods
  getWinRate() {
    if (this.games_played === 0) return 0
    return (this.games_won / this.games_played) * 100
  }

  getLossCount() {
    return this.games_played - this.games_won
  }

  calculateLevel() {
    // Level up formula: level = floor(sqrt(games_won)) + 1
    // This means: Level 1: 0-0 wins, Level 2: 1-3 wins, Level 3: 4-8 wins, etc.
    return Math.floor(Math.sqrt(this.games_won)) + 1
  }

  getNextLevelRequirement() {
    const currentLevel = this.level
    const winsNeededForNextLevel = Math.pow(currentLevel, 2)
    return winsNeededForNextLevel - this.games_won
  }

  getProgressToNextLevel() {
    const currentLevelMinWins = Math.pow(this.level - 1, 2)
    const nextLevelMinWins = Math.pow(this.level, 2)
    const totalWinsNeeded = nextLevelMinWins - currentLevelMinWins
    const currentProgress = this.games_won - currentLevelMinWins

    return {
      current: Math.max(currentProgress, 0),
      required: totalWinsNeeded,
      percentage: Math.min((currentProgress / totalWinsNeeded) * 100, 100)
    }
  }

  getRank() {
    // Simple ranking based on level and wins
    return this.level * 1000 + this.games_won
  }

  // Relations
  async getUser() {
    const User = require('./User')
    return await User.findById(this.user_id)
  }

  async getRecentGames(limit = 10) {
    const CaroRoom = require('./CaroRoom')
    return await CaroRoom.findByUserId(this.user_id, limit)
  }

  // Static helper methods
  static calculateLevelFromWins(wins) {
    return Math.floor(Math.sqrt(wins)) + 1
  }

  static getWinsRequiredForLevel(level) {
    return Math.pow(level - 1, 2)
  }
}

module.exports = CaroStats