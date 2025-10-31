const { verifyToken } = require("./auth")
const { query } = require("./db")

function setupSocketHandlers(io) {
  // Authentication middleware for socket connections
  io.use((socket, next) => {
    const token = socket.handshake.auth.token

    if (!token) {
      return next(new Error("Authentication required"))
    }

    const decoded = verifyToken(token)

    if (!decoded) {
      return next(new Error("Invalid token"))
    }

    socket.userId = decoded.userId
    next()
  })

  io.on("connection", (socket) => {
    console.log(`[v0] User connected: ${socket.userId}`)

    // Join user's personal room
    socket.join(`user:${socket.userId}`)

    // Farm events
    socket.on("farm:update", async (data) => {
      io.to(`user:${socket.userId}`).emit("farm:updated", data)
    })

    // Chat events
    socket.on("chat:join", (friendId) => {
      const roomId = [socket.userId, friendId].sort().join(":")
      socket.join(`chat:${roomId}`)
    })

    socket.on("chat:message", async (data) => {
      const { friendId, message } = data
      const roomId = [socket.userId, friendId].sort().join(":")

      try {
        const result = await query(
          "INSERT INTO chat_messages (sender_id, receiver_id, message) VALUES ($1, $2, $3) RETURNING *",
          [socket.userId, friendId, message],
        )

        io.to(`chat:${roomId}`).emit("chat:new_message", result.rows[0])
      } catch (error) {
        console.error("[v0] Chat message error:", error)
      }
    })

    // Caro game events
    socket.on("caro:join_room", (roomCode) => {
      socket.join(`caro:${roomCode}`)
    })

    socket.on("caro:move", async (data) => {
      const { roomCode, x, y } = data
      io.to(`caro:${roomCode}`).emit("caro:move_made", { userId: socket.userId, x, y })
    })

    socket.on("caro:game_over", (data) => {
      const { roomCode, winner } = data
      io.to(`caro:${roomCode}`).emit("caro:game_ended", { winner })
    })

    socket.on("disconnect", () => {
      console.log(`[v0] User disconnected: ${socket.userId}`)
    })
  })
}

module.exports = { setupSocketHandlers }
