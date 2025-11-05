// Example integration for caro routes with new room features

const express = require("express")
const { db } = require("../db/helpers")
const { authMiddleware } = require("../auth")
const { eq, and, sql } = require("drizzle-orm")
const schema = require("../db/schema")
const CaroRoom = require("../models/CaroRoom")

const router = express.Router()

// Create room with bet amount
router.post("/create-room", authMiddleware, async (req, res) => {
  try {
    const { betAmount = "0.00", maxUsers = 2 } = req.body
    
    // Validate bet amount
    const bet = parseFloat(betAmount)
    if (isNaN(bet) || bet < 0) {
      return res.status(400).json({ error: "Invalid bet amount" })
    }

    // Check user has enough balance (if bet > 0)
    if (bet > 0) {
      const walletResult = await db
        .select()
        .from(schema.wallets)
        .where(eq(schema.wallets.userId, req.userId))
        .limit(1)

      if (walletResult.length === 0) {
        return res.status(400).json({ error: "Wallet not found" })
      }

      const balance = parseFloat(walletResult[0].balance)
      if (balance < bet) {
        return res.status(400).json({ 
          error: "Insufficient balance",
          required: bet,
          current: balance
        })
      }
    }

    // Create room with creator
    const room = await CaroRoom.create({
      bet_amount: betAmount,
      max_users: maxUsers,
      creator_id: req.userId
    })

    // Create game with bet amount from room
    const gameResult = await db
      .insert(schema.caroGames)
      .values({
        roomId: room.id,
        player1Id: req.userId,
        betAmount: room.bet_amount, // Use bet from room
        currentPlayerCount: 1
      })
      .returning()

    res.json({ 
      room: {
        id: room.id,
        roomCode: room.room_code,
        status: room.status,
        betAmount: room.bet_amount,
        maxUsers: room.max_users,
        currentUsers: room.current_users
      },
      game: gameResult[0]
    })
  } catch (error) {
    console.error("[Caro] Create room error:", error)
    res.status(500).json({ error: "Failed to create room" })
  }
})

// Join room - updated to use room user management
router.post("/join-room", authMiddleware, async (req, res) => {
  try {
    const { roomCode } = req.body
    console.log(`[Caro] User ${req.userId} joining room ${roomCode}`)
    
    const result = await db.transaction(async (tx) => {
      // Get room
      const room = await CaroRoom.findByRoomCode(roomCode)
      if (!room) {
        throw new Error("Room not found")
      }

      // Check if can join
      if (!room.canJoin(req.userId)) {
        if (room.isFull()) {
          throw new Error("Room is full")
        }
        if (room.hasUser(req.userId)) {
          throw new Error("You are already in this room")
        }
        throw new Error("Cannot join room")
      }

      // Check balance
      const bet = parseFloat(room.bet_amount)
      if (bet > 0) {
        const walletResult = await tx
          .select()
          .from(schema.wallets)
          .where(eq(schema.wallets.userId, req.userId))
          .limit(1)

        if (walletResult.length === 0 || parseFloat(walletResult[0].balance) < bet) {
          throw new Error("Insufficient balance to join this room")
        }
      }

      // Add user to room
      await room.addUser(req.userId)

      // Get game
      const gameResult = await tx
        .select()
        .from(schema.caroGames)
        .where(eq(schema.caroGames.roomId, room.id))
        .limit(1)

      if (gameResult.length === 0) {
        throw new Error("Game not found")
      }

      const game = gameResult[0]

      // If player1 rejoining, just return room info
      if (game.player1Id === req.userId) {
        return await getRoomDetails(tx, roomCode)
      }

      // Update game with player2
      await tx
        .update(schema.caroGames)
        .set({ 
          player2Id: req.userId,
          currentPlayerCount: 2
        })
        .where(eq(schema.caroGames.id, game.id))

      return await getRoomDetails(tx, roomCode)
    })

    // Broadcast updates
    const io = req.app.get("io")
    io.to("caro:lobby").emit("caro:room-updated", result)
    io.to(`caro:${roomCode}`).emit("caro:room-updated", result)

    res.json({ room: result })
  } catch (error) {
    console.error("[Caro] Join room error:", error)
    const statusCode = 
      error.message === "Room not found" ? 404 :
      error.message === "Room is full" ? 400 :
      error.message === "Insufficient balance to join this room" ? 400 : 500
    res.status(statusCode).json({ error: error.message })
  }
})

// Leave room - updated to use room user management
router.post("/leave-room", authMiddleware, async (req, res) => {
  try {
    const { roomCode } = req.body
    console.log(`[Caro] User ${req.userId} leaving room ${roomCode}`)
    
    const result = await db.transaction(async (tx) => {
      // Get room
      const room = await CaroRoom.findByRoomCode(roomCode)
      if (!room) {
        throw new Error("Room not found")
      }

      if (!room.hasUser(req.userId)) {
        throw new Error("You are not in this room")
      }

      // Get game to check status
      const gameResult = await tx
        .select()
        .from(schema.caroGames)
        .where(eq(schema.caroGames.roomId, room.id))
        .limit(1)

      if (gameResult.length > 0) {
        const game = gameResult[0]
        
        // Don't allow leaving if game is in progress
        if (game.status === "playing") {
          throw new Error("Cannot leave room while game is in progress")
        }

        // Update player count in game
        const newCount = Math.max(0, game.currentPlayerCount - 1)
        await tx
          .update(schema.caroGames)
          .set({ currentPlayerCount: newCount })
          .where(eq(schema.caroGames.id, game.id))

        // If player2 leaves, reset player2
        if (game.player2Id === req.userId) {
          await tx
            .update(schema.caroGames)
            .set({ player2Id: null, player2Ready: false })
            .where(eq(schema.caroGames.id, game.id))
        }
      }

      // Remove user from room
      await room.removeUser(req.userId)

      return { 
        success: true, 
        roomCode: room.room_code,
        currentUsers: room.current_users
      }
    })

    // Broadcast room update
    const io = req.app.get("io")
    io.to("caro:lobby").emit("caro:room-updated", { roomCode, ...result })
    
    res.json(result)
  } catch (error) {
    console.error("[Caro] Leave room error:", error)
    const statusCode = 
      error.message === "Room not found" ? 404 :
      error.message === "You are not in this room" ? 400 :
      error.message === "Cannot leave room while game is in progress" ? 400 : 500
    res.status(statusCode).json({ error: error.message })
  }
})

// Get available rooms (only rooms with space)
router.get("/rooms", authMiddleware, async (req, res) => {
  try {
    const { limit = 10 } = req.query
    
    // Use the updated findWaitingRooms that filters by current_users < max_users
    const rooms = await CaroRoom.findWaitingRooms(parseInt(limit))
    
    // Map to include useful info
    const roomList = rooms.map(room => ({
      roomCode: room.room_code,
      betAmount: room.bet_amount,
      currentUsers: room.current_users.length,
      maxUsers: room.max_users,
      isFull: room.isFull(),
      canJoin: room.canJoin(req.userId)
    }))

    res.json({ rooms: roomList })
  } catch (error) {
    console.error("[Caro] Get rooms error:", error)
    res.status(500).json({ error: "Failed to get rooms" })
  }
})

// Socket event: Both players ready - start game
async function handleBothPlayersReady(io, roomCode) {
  try {
    const room = await CaroRoom.findByRoomCode(roomCode)
    if (!room) {
      console.error(`[Caro] Room ${roomCode} not found`)
      return
    }

    const gameResult = await db
      .select()
      .from(schema.caroGames)
      .where(eq(schema.caroGames.roomId, room.id))
      .limit(1)

    if (gameResult.length === 0) {
      console.error(`[Caro] Game not found for room ${roomCode}`)
      return
    }

    const game = gameResult[0]

    // Check if both players are ready
    if (game.player1Ready && game.player2Ready) {
      // Start the game
      await db.transaction(async (tx) => {
        // Update game status with bet amount from room
        await tx
          .update(schema.caroGames)
          .set({ 
            status: 'playing',
            betAmount: room.bet_amount, // Ensure bet amount from room
            currentPlayer: 1,
            lastMoveTime: new Date()
          })
          .where(eq(schema.caroGames.id, game.id))

        // Update room status
        await tx
          .update(schema.caroRooms)
          .set({ status: 'active' })
          .where(eq(schema.caroRooms.id, room.id))

        // Deduct bet from both players if bet > 0
        const bet = parseFloat(room.bet_amount)
        if (bet > 0) {
          await tx
            .update(schema.wallets)
            .set({ 
              balance: sql`${schema.wallets.balance} - ${bet}`,
              updatedAt: new Date()
            })
            .where(eq(schema.wallets.userId, game.player1Id))

          await tx
            .update(schema.wallets)
            .set({ 
              balance: sql`${schema.wallets.balance} - ${bet}`,
              updatedAt: new Date()
            })
            .where(eq(schema.wallets.userId, game.player2Id))

          // Record transactions
          await tx.insert(schema.transactions).values({
            userId: game.player1Id,
            amount: (-bet).toString(),
            type: "game_bet",
            source: "caro",
            description: `Bet for caro game in room ${roomCode}`
          })

          await tx.insert(schema.transactions).values({
            userId: game.player2Id,
            amount: (-bet).toString(),
            type: "game_bet",
            source: "caro",
            description: `Bet for caro game in room ${roomCode}`
          })
        }
      })

      console.log(`[Caro] Game started in room ${roomCode} with bet ${room.bet_amount}`)
      
      // Emit game start event
      io.to(`caro:${roomCode}`).emit("caro:game-started", {
        roomCode,
        betAmount: room.bet_amount,
        currentPlayer: 1
      })
    }
  } catch (error) {
    console.error(`[Caro] Error starting game in room ${roomCode}:`, error)
  }
}

module.exports = router
module.exports.handleBothPlayersReady = handleBothPlayersReady
