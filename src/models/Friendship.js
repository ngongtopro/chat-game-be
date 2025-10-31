const { query } = require("../db")

class Friendship {
  constructor(data) {
    this.id = data.id
    this.user_id = data.user_id
    this.friend_id = data.friend_id
    this.status = data.status || 'pending'
    this.created_at = data.created_at
  }

  // Status constants
  static STATUS = {
    PENDING: 'pending',
    ACCEPTED: 'accepted',
    BLOCKED: 'blocked'
  }

  // Static methods
  static async create(user_id, friend_id) {
    try {
      // Check if friendship already exists
      const existing = await Friendship.findByUsers(user_id, friend_id)
      if (existing) {
        throw new Error('Friendship already exists')
      }

      // Begin transaction to create bidirectional friendship
      await query('BEGIN')
      
      // Create friendship request
      const result1 = await query(
        'INSERT INTO friendships (user_id, friend_id, status) VALUES ($1, $2, $3) RETURNING *',
        [user_id, friend_id, 'pending']
      )

      // Create reverse relationship (for bidirectional lookup)
      await query(
        'INSERT INTO friendships (user_id, friend_id, status) VALUES ($1, $2, $3)',
        [friend_id, user_id, 'pending']
      )

      await query('COMMIT')
      return new Friendship(result1.rows[0])
    } catch (error) {
      await query('ROLLBACK')
      throw error
    }
  }

  static async findById(id) {
    try {
      const result = await query('SELECT * FROM friendships WHERE id = $1', [id])
      return result.rows.length > 0 ? new Friendship(result.rows[0]) : null
    } catch (error) {
      throw error
    }
  }

  static async findByUsers(user_id, friend_id) {
    try {
      const result = await query(
        'SELECT * FROM friendships WHERE user_id = $1 AND friend_id = $2',
        [user_id, friend_id]
      )
      return result.rows.length > 0 ? new Friendship(result.rows[0]) : null
    } catch (error) {
      throw error
    }
  }

  static async getFriendsByUserId(user_id, status = 'accepted') {
    try {
      const result = await query(`
        SELECT u.*, f.status, f.created_at as friendship_created_at
        FROM friendships f
        JOIN users u ON u.id = f.friend_id
        WHERE f.user_id = $1 AND f.status = $2
        ORDER BY f.created_at DESC
      `, [user_id, status])

      return result.rows.map(row => ({
        user: {
          id: row.id,
          username: row.username,
          email: row.email,
          avatar_url: row.avatar_url,
          created_at: row.created_at
        },
        friendship_status: row.status,
        friendship_created_at: row.friendship_created_at
      }))
    } catch (error) {
      throw error
    }
  }

  static async getFriendRequestsByUserId(user_id) {
    try {
      const result = await query(`
        SELECT u.*, f.id as friendship_id, f.created_at as request_created_at
        FROM friendships f
        JOIN users u ON u.id = f.user_id
        WHERE f.friend_id = $1 AND f.status = 'pending'
        ORDER BY f.created_at DESC
      `, [user_id])

      return result.rows.map(row => ({
        user: {
          id: row.id,
          username: row.username,
          email: row.email,
          avatar_url: row.avatar_url
        },
        friendship_id: row.friendship_id,
        request_created_at: row.request_created_at
      }))
    } catch (error) {
      throw error
    }
  }

  static async getSentRequestsByUserId(user_id) {
    try {
      const result = await query(`
        SELECT u.*, f.id as friendship_id, f.status, f.created_at as request_created_at
        FROM friendships f
        JOIN users u ON u.id = f.friend_id
        WHERE f.user_id = $1 AND f.status = 'pending'
        ORDER BY f.created_at DESC
      `, [user_id])

      return result.rows.map(row => ({
        user: {
          id: row.id,
          username: row.username,
          email: row.email,
          avatar_url: row.avatar_url
        },
        friendship_id: row.friendship_id,
        status: row.status,
        request_created_at: row.request_created_at
      }))
    } catch (error) {
      throw error
    }
  }

  // Instance methods
  async accept() {
    try {
      await query('BEGIN')
      
      // Update both directions to accepted
      await query(
        'UPDATE friendships SET status = $1 WHERE (user_id = $2 AND friend_id = $3) OR (user_id = $3 AND friend_id = $2)',
        ['accepted', this.user_id, this.friend_id]
      )
      
      await query('COMMIT')
      this.status = 'accepted'
      return this
    } catch (error) {
      await query('ROLLBACK')
      throw error
    }
  }

  async reject() {
    try {
      await query('BEGIN')
      
      // Delete both directions
      await query(
        'DELETE FROM friendships WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)',
        [this.user_id, this.friend_id]
      )
      
      await query('COMMIT')
      return true
    } catch (error) {
      await query('ROLLBACK')
      throw error
    }
  }

  async block() {
    try {
      await query('BEGIN')
      
      // Set status to blocked for the blocker, delete for the blocked user
      await query(
        'UPDATE friendships SET status = $1 WHERE user_id = $2 AND friend_id = $3',
        ['blocked', this.user_id, this.friend_id]
      )
      
      await query(
        'DELETE FROM friendships WHERE user_id = $1 AND friend_id = $2',
        [this.friend_id, this.user_id]
      )
      
      await query('COMMIT')
      this.status = 'blocked'
      return this
    } catch (error) {
      await query('ROLLBACK')
      throw error
    }
  }

  async unblock() {
    try {
      await query(
        'DELETE FROM friendships WHERE user_id = $1 AND friend_id = $2',
        [this.user_id, this.friend_id]
      )
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

  async getFriend() {
    const User = require('./User')
    return await User.findById(this.friend_id)
  }

  // Helper methods
  isPending() {
    return this.status === 'pending'
  }

  isAccepted() {
    return this.status === 'accepted'
  }

  isBlocked() {
    return this.status === 'blocked'
  }
}

module.exports = Friendship