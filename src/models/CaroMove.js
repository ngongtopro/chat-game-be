const { query } = require("../db")

class CaroMove {
  constructor(data) {
    this.id = data.id
    this.game_id = data.game_id
    this.index_turn = data.index_turn
    this.x = data.x
    this.y = data.y
    this.value_turn = data.value_turn // 'X' or 'O'
    this.created_at = data.created_at
  }

  // Static methods
  static async create({ game_id, index_turn, x, y, value_turn }) {
    try {
      const result = await query(
        `INSERT INTO caro_moves (game_id, index_turn, x, y, value_turn) 
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [game_id, index_turn, x, y, value_turn]
      )
      return new CaroMove(result.rows[0])
    } catch (error) {
      throw error
    }
  }

  static async findById(id) {
    try {
      const result = await query('SELECT * FROM caro_moves WHERE id = $1', [id])
      return result.rows.length > 0 ? new CaroMove(result.rows[0]) : null
    } catch (error) {
      throw error
    }
  }

  static async findByGameId(game_id) {
    try {
      const result = await query(
        'SELECT * FROM caro_moves WHERE game_id = $1 ORDER BY index_turn ASC',
        [game_id]
      )
      return result.rows.map(row => new CaroMove(row))
    } catch (error) {
      throw error
    }
  }

  static async findByGameAndPosition(game_id, x, y) {
    try {
      const result = await query(
        'SELECT * FROM caro_moves WHERE game_id = $1 AND x = $2 AND y = $3',
        [game_id, x, y]
      )
      return result.rows.length > 0 ? new CaroMove(result.rows[0]) : null
    } catch (error) {
      throw error
    }
  }

  static async findLastByGameId(game_id) {
    try {
      const result = await query(
        'SELECT * FROM caro_moves WHERE game_id = $1 ORDER BY index_turn DESC LIMIT 1',
        [game_id]
      )
      return result.rows.length > 0 ? new CaroMove(result.rows[0]) : null
    } catch (error) {
      throw error
    }
  }

  static async getCountByGameId(game_id) {
    try {
      const result = await query(
        'SELECT COUNT(*) as count FROM caro_moves WHERE game_id = $1',
        [game_id]
      )
      return parseInt(result.rows[0].count) || 0
    } catch (error) {
      throw error
    }
  }

  static async findMovesByTurn(game_id, value_turn) {
    try {
      const result = await query(
        'SELECT * FROM caro_moves WHERE game_id = $1 AND value_turn = $2 ORDER BY index_turn ASC',
        [game_id, value_turn]
      )
      return result.rows.map(row => new CaroMove(row))
    } catch (error) {
      throw error
    }
  }

  static async findMovesInRange(game_id, start_turn, end_turn) {
    try {
      const result = await query(
        'SELECT * FROM caro_moves WHERE game_id = $1 AND index_turn BETWEEN $2 AND $3 ORDER BY index_turn ASC',
        [game_id, start_turn, end_turn]
      )
      return result.rows.map(row => new CaroMove(row))
    } catch (error) {
      throw error
    }
  }

  static async deleteByGameId(game_id) {
    try {
      await query('DELETE FROM caro_moves WHERE game_id = $1', [game_id])
      return true
    } catch (error) {
      throw error
    }
  }

  static async getBoardState(game_id) {
    try {
      const moves = await CaroMove.findByGameId(game_id)
      const board = new Map()
      
      moves.forEach(move => {
        board.set(`${move.x},${move.y}`, {
          value: move.value_turn,
          turn: move.index_turn,
          timestamp: move.created_at
        })
      })

      return board
    } catch (error) {
      throw error
    }
  }

  static async getBoardArray(game_id, minX = -10, maxX = 10, minY = -10, maxY = 10) {
    try {
      const moves = await CaroMove.findByGameId(game_id)
      const width = maxX - minX + 1
      const height = maxY - minY + 1
      
      // Initialize board with null values
      const board = Array(height).fill().map(() => Array(width).fill(null))
      
      moves.forEach(move => {
        const boardX = move.x - minX
        const boardY = move.y - minY
        
        if (boardX >= 0 && boardX < width && boardY >= 0 && boardY < height) {
          board[boardY][boardX] = {
            value: move.value_turn,
            turn: move.index_turn,
            timestamp: move.created_at
          }
        }
      })

      return {
        board: board,
        width: width,
        height: height,
        offsetX: minX,
        offsetY: minY
      }
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
      const sql = `UPDATE caro_moves SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`
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
      await query('DELETE FROM caro_moves WHERE id = $1', [this.id])
      return true
    } catch (error) {
      throw error
    }
  }

  // Helper methods
  isX() {
    return this.value_turn === 'X'
  }

  isO() {
    return this.value_turn === 'O'
  }

  getPosition() {
    return { x: this.x, y: this.y }
  }

  getDistanceFromCenter() {
    return Math.sqrt(this.x * this.x + this.y * this.y)
  }

  isAdjacentTo(otherMove) {
    const dx = Math.abs(this.x - otherMove.x)
    const dy = Math.abs(this.y - otherMove.y)
    return dx <= 1 && dy <= 1 && (dx + dy > 0)
  }

  // Relations
  async getGame() {
    const CaroGame = require('./CaroGame')
    return await CaroGame.findById(this.game_id)
  }

  async getPlayer() {
    const game = await this.getGame()
    if (!game) return null
    
    const User = require('./User')
    const playerId = this.value_turn === 'X' ? game.player1_id : game.player2_id
    return await User.findById(playerId)
  }

  async getPreviousMove() {
    if (this.index_turn <= 1) return null
    
    const result = await query(
      'SELECT * FROM caro_moves WHERE game_id = $1 AND index_turn = $2',
      [this.game_id, this.index_turn - 1]
    )
    return result.rows.length > 0 ? new CaroMove(result.rows[0]) : null
  }

  async getNextMove() {
    const result = await query(
      'SELECT * FROM caro_moves WHERE game_id = $1 AND index_turn = $2',
      [this.game_id, this.index_turn + 1]
    )
    return result.rows.length > 0 ? new CaroMove(result.rows[0]) : null
  }

  // Static analysis methods
  static async analyzeGame(game_id) {
    try {
      const moves = await CaroMove.findByGameId(game_id)
      
      if (moves.length === 0) {
        return {
          totalMoves: 0,
          xMoves: 0,
          oMoves: 0,
          gameLength: 0,
          coverage: { minX: 0, maxX: 0, minY: 0, maxY: 0 }
        }
      }

      const xMoves = moves.filter(m => m.value_turn === 'X').length
      const oMoves = moves.filter(m => m.value_turn === 'O').length
      
      const positions = moves.map(m => ({ x: m.x, y: m.y }))
      const minX = Math.min(...positions.map(p => p.x))
      const maxX = Math.max(...positions.map(p => p.x))
      const minY = Math.min(...positions.map(p => p.y))
      const maxY = Math.max(...positions.map(p => p.y))

      const startTime = new Date(moves[0].created_at)
      const endTime = new Date(moves[moves.length - 1].created_at)
      const gameLength = endTime - startTime // in milliseconds

      return {
        totalMoves: moves.length,
        xMoves: xMoves,
        oMoves: oMoves,
        gameLength: gameLength,
        coverage: { minX, maxX, minY, maxY },
        boardSize: {
          width: maxX - minX + 1,
          height: maxY - minY + 1
        }
      }
    } catch (error) {
      throw error
    }
  }

  static async getGameTimeline(game_id) {
    try {
      const moves = await CaroMove.findByGameId(game_id)
      
      return moves.map((move, index) => ({
        turn: move.index_turn,
        player: move.value_turn,
        position: { x: move.x, y: move.y },
        timestamp: move.created_at,
        timeSinceStart: index > 0 ? 
          new Date(move.created_at) - new Date(moves[0].created_at) : 0
      }))
    } catch (error) {
      throw error
    }
  }
}

module.exports = CaroMove