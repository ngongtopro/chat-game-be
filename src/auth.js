const jwt = require("jsonwebtoken")

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this"

// Generate JWT token
function generateToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: "7d" })
}

// Verify JWT token
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET)
  } catch (error) {
    return null
  }
}

// Authentication middleware
function authMiddleware(req, res, next) {
  let token = req.cookies.token

  // If no cookie token, check Authorization header
  if (!token) {
    const authHeader = req.headers.authorization
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7)
    }
  }

  if (!token) {
    return res.status(401).json({ error: "Authentication required" })
  }

  const decoded = verifyToken(token)

  if (!decoded) {
    return res.status(401).json({ error: "Invalid or expired token" })
  }

  req.userId = decoded.userId
  next()
}

module.exports = {
  generateToken,
  verifyToken,
  authMiddleware,
}
