const { query } = require("../db")

class CaroGame {
  constructor(data) {
    this.id = data.id
    this.room_id = data.room_id
    this.player1_id = data.player1_id
    this.player2_id = data.player2_id
    this.bet_amount = parseFloat(data.bet_amount)
    this.status = data.status || 'waiting'
    this.winner_id = data.winner_id
    this.current_turn = data.current_turn || 1 // 1 for player1 (X), 2 for player2 (O)
    this.farest_x = data.farest_x || 0
    this.farest_y = data.farest_y || 0
    this.created_at = data.created_at
    this.finished_at = data.finished_at
  }

  // Status constants
  static STATUS = {
    WAITING: 'waiting',
    PLAYING: 'playing',
    FINISHED: 'finished'
  }

  // Static methods
  static async create({ room_id, player1_id, bet_amount }) {
    try {
      const result = await query(
        `INSERT INTO caro_games (room_id, player1_id, bet_amount) 
         VALUES ($1, $2, $3) RETURNING *`,
        [room_id, player1_id, bet_amount]
      )
      return new CaroGame(result.rows[0])
    } catch (error) {
      throw error
    }
  }

  static async findById(id) {
    try {
      const result = await query('SELECT * FROM caro_games WHERE id = $1', [id])
      return result.rows.length > 0 ? new CaroGame(result.rows[0]) : null
    } catch (error) {
      throw error
    }
  }

  static async findByRoomId(room_id, limit = 20) {
    try {
      const result = await query(
        'SELECT * FROM caro_games WHERE room_id = $1 ORDER BY created_at DESC LIMIT $2',
        [room_id, limit]
      )
      return result.rows.map(row => new CaroGame(row))
    } catch (error) {
      throw error
    }
  }

  static async findCurrentByRoomId(room_id) {
    try {
      const result = await query(
        'SELECT * FROM caro_games WHERE room_id = $1 AND status != $2 ORDER BY created_at DESC LIMIT 1',
        [room_id, 'finished']
      )
      return result.rows.length > 0 ? new CaroGame(result.rows[0]) : null
    } catch (error) {
      throw error
    }
  }

  static async findByUserId(user_id, limit = 20) {
    try {
      const result = await query(`
        SELECT cg.*, cr.room_code
        FROM caro_games cg
        JOIN caro_rooms cr ON cg.room_id = cr.id
        WHERE cg.player1_id = $1 OR cg.player2_id = $1
        ORDER BY cg.created_at DESC
        LIMIT $2
      `, [user_id, limit])

      return result.rows.map(row => {
        const game = new CaroGame(row)
        game.room_code = row.room_code
        return game
      })
    } catch (error) {
      throw error
    }
  }

  static async findWaitingGames(limit = 10) {
    try {
      const result = await query(`
        SELECT cg.*, cr.room_code, u1.username as player1_username
        FROM caro_games cg
        JOIN caro_rooms cr ON cg.room_id = cr.id
        JOIN users u1 ON cg.player1_id = u1.id
        WHERE cg.status = 'waiting' AND cg.player2_id IS NULL
        ORDER BY cg.created_at ASC
        LIMIT $1
      `, [limit])

      return result.rows.map(row => {
        const game = new CaroGame(row)
        game.room_code = row.room_code
        game.player1_username = row.player1_username
        return game
      })
    } catch (error) {
      throw error
    }
  }

  // Instance methods
  async joinGame(player2_id) {
    try {
      if (this.status !== 'waiting') {
        throw new Error('Game is not waiting for players')
      }

      if (this.player1_id === player2_id) {
        throw new Error('Cannot join your own game')
      }

      const result = await query(
        'UPDATE caro_games SET player2_id = $1, status = $2 WHERE id = $3 RETURNING *',
        [player2_id, 'playing', this.id]
      )

      if (result.rows.length > 0) {
        Object.assign(this, result.rows[0])
        this.bet_amount = parseFloat(this.bet_amount)
      }

      // Update room status to active
      const CaroRoom = require('./CaroRoom')
      const room = await CaroRoom.findById(this.room_id)
      if (room && room.status === 'waiting') {
        await room.updateStatus('active')
      }

      return this
    } catch (error) {
      throw error
    }
  }

  async makeMove(player_id, x, y) {
    try {
      if (this.status !== 'playing') {
        throw new Error('Game is not in playing state')
      }

      // Validate turn
      const isPlayer1Turn = this.current_turn === 1 && player_id === this.player1_id
      const isPlayer2Turn = this.current_turn === 2 && player_id === this.player2_id

      if (!isPlayer1Turn && !isPlayer2Turn) {
        throw new Error('Not your turn')
      }

      // Check if position is already occupied
      const CaroMove = require('./CaroMove')
      const existingMove = await CaroMove.findByGameAndPosition(this.id, x, y)
      if (existingMove) {
        throw new Error('Position already occupied')
      }

      await query('BEGIN')

      // Get current move count for indexTurn
      const moveCount = await CaroMove.getCountByGameId(this.id)
      const indexTurn = moveCount + 1

      // Create the move
      const valueTurn = this.current_turn === 1 ? 'X' : 'O'
      const move = await CaroMove.create({
        game_id: this.id,
        index_turn: indexTurn,
        x: x,
        y: y,
        value_turn: valueTurn
      })

      // Update farest positions
      const newFarestX = Math.max(this.farest_x, Math.abs(x))
      const newFarestY = Math.max(this.farest_y, Math.abs(y))

      // Check for win
      const winner = await this.checkWinner(x, y, valueTurn)
      let newStatus = 'playing'
      let winner_id = null
      let finished_at = null

      if (winner) {
        newStatus = 'finished'
        winner_id = winner === 'X' ? this.player1_id : this.player2_id
        finished_at = new Date()
      }

      // Switch turn if game continues
      const next_turn = newStatus === 'playing' ? (this.current_turn === 1 ? 2 : 1) : this.current_turn

      // Update game
      const result = await query(
        `UPDATE caro_games 
         SET current_turn = $1, farest_x = $2, farest_y = $3, status = $4, winner_id = $5, finished_at = $6 
         WHERE id = $7 RETURNING *`,
        [next_turn, newFarestX, newFarestY, newStatus, winner_id, finished_at, this.id]
      )

      if (result.rows.length > 0) {
        Object.assign(this, result.rows[0])
        this.bet_amount = parseFloat(this.bet_amount)
      }

      await query('COMMIT')

      // Handle game end
      if (newStatus === 'finished') {
        await this.handleGameEnd()
      }

      return {
        game: this,
        move: move,
        winner: winner
      }
    } catch (error) {
      await query('ROLLBACK')
      throw error
    }
  }

  async checkWinner(lastX, lastY, lastValue) {
    try {
      const CaroMove = require('./CaroMove')
      const moves = await CaroMove.findByGameId(this.id)
      
      // Create board representation
      const board = new Map()
      moves.forEach(move => {
        board.set(`${move.x},${move.y}`, move.value_turn)
      })

      const directions = [
        [1, 0],   // horizontal
        [0, 1],   // vertical  
        [1, 1],   // diagonal
        [1, -1]   // anti-diagonal
      ]

      for (const [dx, dy] of directions) {
        let count = 1

        // Check positive direction
        let x = lastX + dx
        let y = lastY + dy
        while (board.get(`${x},${y}`) === lastValue) {
          count++
          x += dx
          y += dy
        }

        // Check negative direction
        x = lastX - dx
        y = lastY - dy
        while (board.get(`${x},${y}`) === lastValue) {
          count++
          x -= dx
          y -= dy
        }

        if (count >= 5) {
          return lastValue
        }
      }

      return null
    } catch (error) {
      throw error
    }
  }

  async handleGameEnd() {
    try {
      await query('BEGIN')

      const Wallet = require('./Wallet')
      const CaroStats = require('./CaroStats')

      // Update stats for both players
      const player1Stats = await CaroStats.findOrCreateByUserId(this.player1_id)
      let player2Stats = null
      if (this.player2_id) {
        player2Stats = await CaroStats.findOrCreateByUserId(this.player2_id)
      }

      if (this.winner_id) {
        // There's a winner
        const winnerWallet = await Wallet.findByUserId(this.winner_id)
        const winnings = this.bet_amount * 2 // Winner takes all

        if (winnerWallet) {
          await winnerWallet.addMoney(winnings, 'game_win', `Won Caro game`)
        }

        // Update stats
        if (this.winner_id === this.player1_id) {
          await player1Stats.recordGameResult(true, winnings)
          if (player2Stats) {
            await player2Stats.recordGameResult(false, 0)
          }
        } else if (player2Stats) {
          await player2Stats.recordGameResult(true, winnings)
          await player1Stats.recordGameResult(false, 0)
        }
      } else if (this.player2_id) {
        // Draw - refund bets
        const player1Wallet = await Wallet.findByUserId(this.player1_id)
        const player2Wallet = await Wallet.findByUserId(this.player2_id)

        if (player1Wallet) {
          await player1Wallet.addMoney(this.bet_amount, 'game_draw', `Draw in Caro game`)
        }
        if (player2Wallet) {
          await player2Wallet.addMoney(this.bet_amount, 'game_draw', `Draw in Caro game`)
        }

        // Update stats (both players get a game played, no wins)
        await player1Stats.recordGameResult(false, 0)
        if (player2Stats) {
          await player2Stats.recordGameResult(false, 0)
        }
      }

      await query('COMMIT')
    } catch (error) {
      await query('ROLLBACK')
      throw error
    }
  }

  async delete() {
    try {
      // Delete related moves first
      const CaroMove = require('./CaroMove')
      await CaroMove.deleteByGameId(this.id)
      
      await query('DELETE FROM caro_games WHERE id = $1', [this.id])
      return true
    } catch (error) {
      throw error
    }
  }

  // Helper methods
  isWaiting() {
    return this.status === 'waiting'
  }

  isPlaying() {
    return this.status === 'playing'
  }

  isFinished() {
    return this.status === 'finished'
  }

  getCurrentPlayerTurn() {
    return this.current_turn === 1 ? this.player1_id : this.player2_id
  }

  getOpponentId(player_id) {
    if (player_id === this.player1_id) return this.player2_id
    if (player_id === this.player2_id) return this.player1_id
    return null
  }

  getBoardSize() {
    return {
      width: (this.farest_x * 2) + 1,
      height: (this.farest_y * 2) + 1,
      centerX: this.farest_x,
      centerY: this.farest_y
    }
  }

  // Relations
  async getRoom() {
    const CaroRoom = require('./CaroRoom')
    return await CaroRoom.findById(this.room_id)
  }

  async getPlayer1() {
    const User = require('./User')
    return await User.findById(this.player1_id)
  }

  async getPlayer2() {
    if (!this.player2_id) return null
    
    const User = require('./User')
    return await User.findById(this.player2_id)
  }

  async getWinner() {
    if (!this.winner_id) return null
    
    const User = require('./User')
    return await User.findById(this.winner_id)
  }

  async getMoves() {
    const CaroMove = require('./CaroMove')
    return await CaroMove.findByGameId(this.id)
  }

  async getLastMove() {
    const CaroMove = require('./CaroMove')
    return await CaroMove.findLastByGameId(this.id)
  }
}

module.exports = CaroGame