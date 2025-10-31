require("dotenv").config()

const express = require("express")
const http = require("http")
const { Server } = require("socket.io")
const cors = require("cors")
const cookieParser = require("cookie-parser")
const { setupSocketHandlers } = require("./socket")

// Import routes
const authRoutes = require("./routes/auth")
const friendsRoutes = require("./routes/friends")
const walletRoutes = require("./routes/wallet")
const farmRoutes = require("./routes/farm")
const caroRoutes = require("./routes/caro")
const chatRoutes = require("./routes/chat")

const app = express()
const server = http.createServer(app)

// Socket.io setup
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
  },
})

// Middleware
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
  }),
)
app.use(express.json())
app.use(cookieParser())

// Make io accessible to routes
app.set("io", io)

// Routes
app.use("/api/auth", authRoutes)
app.use("/api/friends", friendsRoutes)
app.use("/api/wallet", walletRoutes)
app.use("/api/farm", farmRoutes)
app.use("/api/caro", caroRoutes)
app.use("/api/chat", chatRoutes)

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "Server is running" })
})

// Setup socket handlers
setupSocketHandlers(io)

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("[v0] Error:", err)
  res.status(500).json({ error: "Internal server error" })
})

const PORT = process.env.PORT || 3001

server.listen(PORT, () => {
  console.log(`[v0] Backend server running on port ${PORT}`)
  console.log(`[v0] Database: ${process.env.DB_HOST || "100.64.192.68"}:${process.env.DB_PORT || 5432}`)
})
