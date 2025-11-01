const express = require("express")
const bcrypt = require("bcryptjs")
const { query } = require("../db")
const { generateToken, authMiddleware } = require("../auth")

const router = express.Router()

// Register
router.post("/register", async (req, res) => {
  try {
    const { username, email, password } = req.body
    console.log(req.body)
    // Check if user exists
    const existingUser = await query("SELECT * FROM users WHERE username = $1 OR email = $2", [username, email])

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: "Username or email already exists" })
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10)

    // Create user
    const result = await query(
      "INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username, email, created_at",
      [username, email, hashedPassword],
    )

    const user = result.rows[0]

    // Create wallet for user
    await query("INSERT INTO wallets (user_id) VALUES ($1)", [user.id])

    // Generate token
    const token = generateToken(user.id)

    res.cookie("token", token, {
      httpOnly: false, // Allow client-side JavaScript access
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    })

    res.json({ user, token })
  } catch (error) {
    console.error("[v0] Register error:", error)
    res.status(500).json({ error: "Registration failed" })
  }
})

// Login
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body

    // Find user
    const result = await query("SELECT * FROM users WHERE username = $1", [username])

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid credentials" })
    }

    const user = result.rows[0]

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash)

    if (!validPassword) {
      return res.status(401).json({ error: "Invalid credentials" })
    }

    // Generate token
    const token = generateToken(user.id)

    res.cookie("token", token, {
      httpOnly: false, // Allow client-side JavaScript access
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    })

    const { password_hash, ...userWithoutPassword } = user
    res.json({ user: userWithoutPassword, token })
  } catch (error) {
    console.error("[v0] Login error:", error)
    res.status(500).json({ error: "Login failed" })
  }
})

// Logout
router.post("/logout", (req, res) => {
  res.clearCookie("token")
  res.json({ message: "Logged out successfully" })
})

// Get current user
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const result = await query("SELECT id, username, email, avatar_url, created_at FROM users WHERE id = $1", [
      req.userId,
    ])

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" })
    }

    res.json({ user: result.rows[0] })
  } catch (error) {
    console.error("[v0] Get user error:", error)
    res.status(500).json({ error: "Failed to get user" })
  }
})

module.exports = router
