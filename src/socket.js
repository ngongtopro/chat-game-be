const { verifyToken } = require("./auth")
const { query } = require("./db")

function setupSocketHandlers(io) {
  // Authentication middleware for socket connections
  io.use((socket, next) => {
    // Try to get token from auth (sent by client)
    let token = socket.handshake.auth.token

    // If no token in auth, try to get from cookies
    if (!token && socket.handshake.headers.cookie) {
      const cookies = socket.handshake.headers.cookie.split(';')
      const tokenCookie = cookies.find(c => c.trim().startsWith('token='))
      if (tokenCookie) {
        token = tokenCookie.split('=')[1]
      }
    }

    if (!token) {
      console.log("[Socket] No token provided in handshake or cookies")
      return next(new Error("Authentication required"))
    }

    const decoded = verifyToken(token)

    if (!decoded) {
      console.log("[Socket] Invalid token")
      return next(new Error("Invalid token"))
    }

    socket.userId = decoded.userId
    console.log(`[Socket] User authenticated: ${socket.userId}`)
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
    socket.on("join-chat", (chatId) => {
      socket.join(`chat:${chatId}`)
      console.log(`[v0] User ${socket.userId} joined chat: ${chatId}`)
    })

    socket.on("leave-chat", (chatId) => {
      socket.leave(`chat:${chatId}`)
      console.log(`[v0] User ${socket.userId} left chat: ${chatId}`)
    })

    socket.on("send-message", async (data) => {
      const { chatId, message } = data
      // Broadcast to all users in the chat room
      socket.to(`chat:${chatId}`).emit("message-received", message)
      console.log(`[v0] Message sent to chat: ${chatId}`)
    })

    socket.on("typing", (data) => {
      const { chatId } = data
      // Broadcast typing indicator to other users in the chat
      socket.to(`chat:${chatId}`).emit("user-typing")
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
