const { verifyToken } = require("./auth")
const { query } = require("./db")

// Store online users: userId -> socketId
const onlineUsers = new Map()

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

  io.on("connection", async (socket) => {
    console.log(`[v0] User connected: ${socket.userId}`)

    // Check if user is already connected, disconnect old session
    if (onlineUsers.has(socket.userId)) {
      const oldSocketId = onlineUsers.get(socket.userId)
      const oldSocket = io.sockets.sockets.get(oldSocketId)
      if (oldSocket) {
        console.log(`[Socket] User ${socket.userId} already connected, disconnecting old session`)
        oldSocket.emit("force-disconnect", { 
          reason: "Login from another device/browser" 
        })
        oldSocket.disconnect(true)
      }
    }

    // Add user to online users
    onlineUsers.set(socket.userId, socket.id)

    // Join user's personal room
    socket.join(`user:${socket.userId}`)

    // Get user's friends and notify them
    try {
      const friendsResult = await query(
        `SELECT CASE 
          WHEN user_id = $1 THEN friend_id 
          ELSE user_id 
        END as friend_id 
        FROM friendships 
        WHERE (user_id = $1 OR friend_id = $1) AND status = 'accepted'`,
        [socket.userId]
      )
      
      // Notify all friends that this user is online
      friendsResult.rows.forEach(row => {
        io.to(`user:${row.friend_id}`).emit("user-online", { userId: socket.userId })
      })

      console.log(`[Socket] User ${socket.userId} is now online, notified ${friendsResult.rows.length} friends`)
    } catch (error) {
      console.error("[Socket] Error notifying friends:", error)
    }

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

    socket.on("disconnect", async () => {
      console.log(`[v0] User disconnected: ${socket.userId}`)
      
      // Remove user from online users
      onlineUsers.delete(socket.userId)

      // Get user's friends and notify them
      try {
        const friendsResult = await query(
          `SELECT CASE 
            WHEN user_id = $1 THEN friend_id 
            ELSE user_id 
          END as friend_id 
          FROM friendships 
          WHERE (user_id = $1 OR friend_id = $1) AND status = 'accepted'`,
          [socket.userId]
        )
        
        // Notify all friends that this user is offline
        friendsResult.rows.forEach(row => {
          io.to(`user:${row.friend_id}`).emit("user-offline", { userId: socket.userId })
        })

        console.log(`[Socket] User ${socket.userId} is now offline, notified ${friendsResult.rows.length} friends`)
      } catch (error) {
        console.error("[Socket] Error notifying friends on disconnect:", error)
      }
    })
  })
}

module.exports = { setupSocketHandlers, onlineUsers }
