/**
 * Drizzle Helper Functions
 * Các hàm helper để dễ dàng chuyển đổi từ raw SQL sang Drizzle ORM
 */

const { db } = require('./index')
const { eq, and, or, sql, desc, asc, isNull, isNotNull, like, gte, lte } = require('drizzle-orm')
const schema = require('./schema')

/**
 * User Helpers
 */
const UserHelper = {
  // Tìm user theo ID
  async findById(userId) {
    const result = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1)
    return result[0] || null
  },

  // Tìm user theo username
  async findByUsername(username) {
    const result = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.username, username))
      .limit(1)
    return result[0] || null
  },

  // Tìm user theo email
  async findByEmail(email) {
    const result = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1)
    return result[0] || null
  },

  // Tạo user mới
  async create({ username, email, passwordHash, type = 'regular', avatarUrl = null }) {
    const result = await db
      .insert(schema.users)
      .values({
        username,
        email,
        passwordHash,
        type,
        avatarUrl
      })
      .returning()
    return result[0]
  },

  // Update user
  async update(userId, data) {
    const result = await db
      .update(schema.users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.users.id, userId))
      .returning()
    return result[0]
  }
}

/**
 * Wallet Helpers
 */
const WalletHelper = {
  // Get wallet by user ID
  async getByUserId(userId) {
    const result = await db
      .select()
      .from(schema.wallets)
      .where(eq(schema.wallets.userId, userId))
      .limit(1)
    return result[0] || null
  },

  // Create wallet
  async create(userId, initialBalance = 0) {
    const result = await db
      .insert(schema.wallets)
      .values({
        userId,
        balance: initialBalance.toString()
      })
      .returning()
    return result[0]
  },

  // Update balance (increment/decrement)
  async updateBalance(userId, amount) {
    const result = await db
      .update(schema.wallets)
      .set({
        balance: sql`${schema.wallets.balance} + ${amount}`,
        updatedAt: new Date()
      })
      .where(eq(schema.wallets.userId, userId))
      .returning()
    return result[0]
  },

  // Get balance
  async getBalance(userId) {
    const wallet = await this.getByUserId(userId)
    return wallet ? parseFloat(wallet.balance) : 0
  }
}

/**
 * Transaction Helpers
 */
const TransactionHelper = {
  // Create transaction
  async create({ userId, amount, type, source, description = null }) {
    const result = await db
      .insert(schema.transactions)
      .values({
        userId,
        amount: amount.toString(),
        type,
        source,
        description
      })
      .returning()
    return result[0]
  },

  // Get transactions by user
  async getByUserId(userId, limit = 50, offset = 0) {
    return await db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.userId, userId))
      .orderBy(desc(schema.transactions.createdAt))
      .limit(limit)
      .offset(offset)
  }
}

/**
 * Caro Room Helpers
 */
const CaroRoomHelper = {
  // Get room with game info
  async getRoomByCode(roomCode) {
    const result = await db
      .select()
      .from(schema.caroRooms)
      .innerJoin(schema.caroGames, eq(schema.caroRooms.id, schema.caroGames.roomId))
      .where(eq(schema.caroRooms.roomCode, roomCode))
      .limit(1)
    
    if (result.length === 0) return null
    return { ...result[0].caro_rooms, ...result[0].caro_games }
  },

  // Get room with full details (players, stats)
  async getRoomWithDetails(roomCode) {
    const result = await db
      .select({
        // Room fields
        id: schema.caroRooms.id,
        roomCode: schema.caroRooms.roomCode,
        status: schema.caroRooms.status,
        createdAt: schema.caroRooms.createdAt,
        finishedAt: schema.caroRooms.finishedAt,
        // Game fields
        gameId: schema.caroGames.id,
        player1Id: schema.caroGames.player1Id,
        player2Id: schema.caroGames.player2Id,
        player1Ready: schema.caroGames.player1Ready,
        player2Ready: schema.caroGames.player2Ready,
        winnerId: schema.caroGames.winnerId,
        betAmount: schema.caroGames.betAmount,
        boardState: schema.caroGames.boardState,
        currentTurn: schema.caroGames.currentTurn,
        gameStatus: schema.caroGames.status,
        // Player 1
        player1Username: sql`u1.username`.as('player1_username'),
        player1Games: sql`cs1.games_played`.as('player1_games'),
        player1Wins: sql`cs1.games_won`.as('player1_wins'),
        player1Level: sql`cs1.level`.as('player1_level'),
        // Player 2
        player2Username: sql`u2.username`.as('player2_username'),
        player2Games: sql`cs2.games_played`.as('player2_games'),
        player2Wins: sql`cs2.games_won`.as('player2_wins'),
        player2Level: sql`cs2.level`.as('player2_level')
      })
      .from(schema.caroRooms)
      .innerJoin(schema.caroGames, eq(schema.caroRooms.id, schema.caroGames.roomId))
      .innerJoin(sql`users u1`, eq(schema.caroGames.player1Id, sql`u1.id`))
      .leftJoin(sql`users u2`, eq(schema.caroGames.player2Id, sql`u2.id`))
      .leftJoin(sql`caro_stats cs1`, eq(schema.caroGames.player1Id, sql`cs1.user_id`))
      .leftJoin(sql`caro_stats cs2`, eq(schema.caroGames.player2Id, sql`cs2.user_id`))
      .where(eq(schema.caroRooms.roomCode, roomCode))
      .limit(1)

    return result[0] || null
  },

  // Get available rooms (waiting for player 2)
  async getAvailableRooms(limit = 10) {
    return await db
      .select()
      .from(schema.caroRooms)
      .innerJoin(schema.caroGames, eq(schema.caroRooms.id, schema.caroGames.roomId))
      .where(
        and(
          eq(schema.caroRooms.status, 'waiting'),
          isNull(schema.caroGames.player2Id)
        )
      )
      .orderBy(asc(schema.caroRooms.createdAt))
      .limit(limit)
  }
}

/**
 * Caro Stats Helpers
 */
const CaroStatsHelper = {
  // Get stats by user ID
  async getByUserId(userId) {
    const result = await db
      .select()
      .from(schema.caroStats)
      .where(eq(schema.caroStats.userId, userId))
      .limit(1)
    return result[0] || null
  },

  // Upsert stats (increment games/wins/earnings)
  async incrementStats(userId, won = false, earnings = 0) {
    await db
      .insert(schema.caroStats)
      .values({
        userId,
        gamesPlayed: 1,
        gamesWon: won ? 1 : 0,
        totalEarnings: earnings.toString()
      })
      .onConflictDoUpdate({
        target: schema.caroStats.userId,
        set: {
          gamesPlayed: sql`${schema.caroStats.gamesPlayed} + 1`,
          gamesWon: won ? sql`${schema.caroStats.gamesWon} + 1` : schema.caroStats.gamesWon,
          totalEarnings: sql`${schema.caroStats.totalEarnings} + ${earnings}`,
          updatedAt: new Date()
        }
      })
  }
}

/**
 * Friendship Helpers
 */
const FriendshipHelper = {
  // Get friends list
  async getFriends(userId) {
    return await db
      .select({
        friendId: sql`CASE 
          WHEN ${schema.friendships.userId} = ${userId} THEN ${schema.friendships.friendId}
          ELSE ${schema.friendships.userId}
        END`.as('friend_id'),
        friendUsername: sql`u.username`.as('friend_username'),
        status: schema.friendships.status,
        createdAt: schema.friendships.createdAt
      })
      .from(schema.friendships)
      .innerJoin(
        sql`users u`,
        sql`u.id = CASE 
          WHEN ${schema.friendships.userId} = ${userId} THEN ${schema.friendships.friendId}
          ELSE ${schema.friendships.userId}
        END`
      )
      .where(
        and(
          or(
            eq(schema.friendships.userId, userId),
            eq(schema.friendships.friendId, userId)
          ),
          eq(schema.friendships.status, 'accepted')
        )
      )
  }
}

module.exports = {
  db,
  sql,
  eq,
  and,
  or,
  desc,
  asc,
  isNull,
  isNotNull,
  like,
  gte,
  lte,
  schema,
  UserHelper,
  WalletHelper,
  TransactionHelper,
  CaroRoomHelper,
  CaroStatsHelper,
  FriendshipHelper
}
