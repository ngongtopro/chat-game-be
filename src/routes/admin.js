const express = require("express")
const { db, UserHelper, WalletHelper } = require("../db/helpers")
const { eq, desc, like, or, sql } = require("drizzle-orm")
const { users, wallets, caroRooms, caroGames, caroStats } = require("../db/schema")
const { authMiddleware } = require("../auth")

const router = express.Router()

// Middleware to check if user is admin
const adminMiddleware = async (req, res, next) => {
  try {
    const user = await UserHelper.findById(req.userId)
    
    if (!user || user.type !== 'admin') {
      return res.status(403).json({ error: "Admin access required" })
    }
    
    next()
  } catch (error) {
    console.error("[Admin] Auth check error:", error)
    res.status(500).json({ error: "Failed to verify admin access" })
  }
}

// Apply auth and admin middleware to all routes
router.use(authMiddleware)
router.use(adminMiddleware)

// ============ USER MANAGEMENT ============

// Get all users with pagination and search
router.get("/users", async (req, res) => {
  try {
    const { page = 1, limit = 20, search = "" } = req.query
    const offset = (parseInt(page) - 1) * parseInt(limit)

    let query = db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        type: users.type,
        avatarUrl: users.avatarUrl,
        createdAt: users.createdAt,
        balance: wallets.balance
      })
      .from(users)
      .leftJoin(wallets, eq(users.id, wallets.userId))
      .orderBy(desc(users.createdAt))
      .limit(parseInt(limit))
      .offset(offset)

    // Add search filter if provided
    if (search) {
      query = query.where(
        or(
          like(users.username, `%${search}%`),
          like(users.email, `%${search}%`)
        )
      )
    }

    const usersList = await query

    // Get total count
    const totalResult = await db
      .select({ count: sql`count(*)` })
      .from(users)
    const total = parseInt(totalResult[0].count)

    res.json({
      users: usersList,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    })
  } catch (error) {
    console.error("[Admin] Get users error:", error)
    res.status(500).json({ error: "Failed to get users" })
  }
})

// Get user details
router.get("/users/:userId", async (req, res) => {
  try {
    const { userId } = req.params

    const userDetails = await db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        type: users.type,
        avatarUrl: users.avatarUrl,
        createdAt: users.createdAt,
        balance: wallets.balance,
        gamesPlayed: caroStats.gamesPlayed,
        gamesWon: caroStats.gamesWon,
        totalEarnings: caroStats.totalEarnings,
        level: caroStats.level
      })
      .from(users)
      .leftJoin(wallets, eq(users.id, wallets.userId))
      .leftJoin(caroStats, eq(users.id, caroStats.userId))
      .where(eq(users.id, parseInt(userId)))
      .limit(1)

    if (userDetails.length === 0) {
      return res.status(404).json({ error: "User not found" })
    }

    res.json({ user: userDetails[0] })
  } catch (error) {
    console.error("[Admin] Get user details error:", error)
    res.status(500).json({ error: "Failed to get user details" })
  }
})

// Update user (balance, type, etc)
router.patch("/users/:userId", async (req, res) => {
  try {
    const { userId } = req.params
    const { type, balanceChange } = req.body

    // Update user type if provided
    if (type && ['admin', 'regular'].includes(type)) {
      await db
        .update(users)
        .set({ type, updatedAt: new Date() })
        .where(eq(users.id, parseInt(userId)))
    }

    // Update balance if provided
    if (balanceChange && !isNaN(parseFloat(balanceChange))) {
      await db
        .update(wallets)
        .set({
          balance: sql`${wallets.balance} + ${parseFloat(balanceChange)}`,
          updatedAt: new Date()
        })
        .where(eq(wallets.userId, parseInt(userId)))
    }

    res.json({ message: "User updated successfully" })
  } catch (error) {
    console.error("[Admin] Update user error:", error)
    res.status(500).json({ error: "Failed to update user" })
  }
})

// Delete user
router.delete("/users/:userId", async (req, res) => {
  try {
    const { userId } = req.params

    // Don't allow deleting self
    if (parseInt(userId) === req.userId) {
      return res.status(400).json({ error: "Cannot delete your own account" })
    }

    await db
      .delete(users)
      .where(eq(users.id, parseInt(userId)))

    res.json({ message: "User deleted successfully" })
  } catch (error) {
    console.error("[Admin] Delete user error:", error)
    res.status(500).json({ error: "Failed to delete user" })
  }
})

// ============ CARO ROOM MANAGEMENT ============

// Get all caro rooms
router.get("/caro/rooms", async (req, res) => {
  try {
    const { status = 'all', page = 1, limit = 20 } = req.query
    const offset = (parseInt(page) - 1) * parseInt(limit)

    let query = db
      .select({
        id: caroRooms.id,
        roomCode: caroRooms.roomCode,
        status: caroRooms.status,
        createdAt: caroRooms.createdAt,
        finishedAt: caroRooms.finishedAt,
        player1Username: sql`u1.username`.as('player1_username'),
        player2Username: sql`u2.username`.as('player2_username'),
        betAmount: caroGames.betAmount,
        gameStatus: caroGames.status
      })
      .from(caroRooms)
      .leftJoin(caroGames, eq(caroRooms.id, caroGames.roomId))
      .leftJoin(sql`users u1`, eq(caroGames.player1Id, sql`u1.id`))
      .leftJoin(sql`users u2`, eq(caroGames.player2Id, sql`u2.id`))
      .orderBy(desc(caroRooms.createdAt))
      .limit(parseInt(limit))
      .offset(offset)

    if (status !== 'all') {
      query = query.where(eq(caroRooms.status, status))
    }

    const rooms = await query

    res.json({ rooms })
  } catch (error) {
    console.error("[Admin] Get caro rooms error:", error)
    res.status(500).json({ error: "Failed to get caro rooms" })
  }
})

// Create caro room (admin only)
router.post("/caro/rooms", async (req, res) => {
  try {
    const { betAmount = 10 } = req.body

    // Generate unique room code
    const roomCode = `ADMIN-${Date.now().toString(36).toUpperCase()}`

    // Create room
    const [room] = await db
      .insert(caroRooms)
      .values({
        roomCode,
        status: 'waiting'
      })
      .returning()

    // Create game with admin as player1
    const [game] = await db
      .insert(caroGames)
      .values({
        roomId: room.id,
        player1Id: req.userId,
        betAmount: betAmount.toString(),
        boardState: {},
        currentTurn: 1,
        status: 'waiting'
      })
      .returning()

    res.json({
      message: "Room created successfully",
      room: {
        ...room,
        betAmount: game.betAmount
      }
    })
  } catch (error) {
    console.error("[Admin] Create caro room error:", error)
    res.status(500).json({ error: "Failed to create caro room" })
  }
})

// Close/Delete caro room
router.delete("/caro/rooms/:roomCode", async (req, res) => {
  try {
    const { roomCode } = req.params

    await db
      .update(caroRooms)
      .set({ 
        status: 'cancelled',
        finishedAt: new Date()
      })
      .where(eq(caroRooms.roomCode, roomCode))

    res.json({ message: "Room closed successfully" })
  } catch (error) {
    console.error("[Admin] Close caro room error:", error)
    res.status(500).json({ error: "Failed to close caro room" })
  }
})

// ============ STATISTICS ============

// Get dashboard statistics
router.get("/stats", async (req, res) => {
  try {
    // Total users
    const totalUsersResult = await db
      .select({ count: sql`count(*)` })
      .from(users)
    
    // Total active games
    const activeGamesResult = await db
      .select({ count: sql`count(*)` })
      .from(caroRooms)
      .where(eq(caroRooms.status, 'playing'))
    
    // Total waiting rooms
    const waitingRoomsResult = await db
      .select({ count: sql`count(*)` })
      .from(caroRooms)
      .where(eq(caroRooms.status, 'waiting'))

    // Total balance in system
    const totalBalanceResult = await db
      .select({ sum: sql`sum(balance)` })
      .from(wallets)

    res.json({
      stats: {
        totalUsers: parseInt(totalUsersResult[0].count),
        activeGames: parseInt(activeGamesResult[0].count),
        waitingRooms: parseInt(waitingRoomsResult[0].count),
        totalBalance: parseFloat(totalBalanceResult[0].sum || 0)
      }
    })
  } catch (error) {
    console.error("[Admin] Get stats error:", error)
    res.status(500).json({ error: "Failed to get statistics" })
  }
})

module.exports = router
