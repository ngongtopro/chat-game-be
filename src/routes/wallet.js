const express = require("express")
const { query, getClient } = require("../db")
const { authMiddleware } = require("../auth")

const router = express.Router()

// Get wallet balance
router.get("/balance", authMiddleware, async (req, res) => {
  try {
    const result = await query("SELECT * FROM wallets WHERE user_id = $1", [req.userId])

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Wallet not found" })
    }

    res.json({ wallet: result.rows[0] })
  } catch (error) {
    console.error("[v0] Get balance error:", error)
    res.status(500).json({ error: "Failed to get balance" })
  }
})

// Get transaction history
router.get("/transactions", authMiddleware, async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM transactions 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT 50`,
      [req.userId],
    )

    res.json({ transactions: result.rows })
  } catch (error) {
    console.error("[v0] Get transactions error:", error)
    res.status(500).json({ error: "Failed to get transactions" })
  }
})

// Deposit money
router.post("/deposit", authMiddleware, async (req, res) => {
  const client = await getClient()

  try {
    const { amount, source } = req.body

    if (amount <= 0) {
      return res.status(400).json({ error: "Invalid amount" })
    }

    await client.query("BEGIN")

    // Update wallet
    const walletResult = await client.query(
      "UPDATE wallets SET balance = balance + $1, updated_at = NOW() WHERE user_id = $2 RETURNING *",
      [amount, req.userId],
    )

    // Create transaction record
    await client.query(
      "INSERT INTO transactions (user_id, type, amount, source, description) VALUES ($1, $2, $3, $4, $5)",
      [req.userId, "deposit", amount, source || "manual", "Deposit to wallet"],
    )

    await client.query("COMMIT")

    res.json({ wallet: walletResult.rows[0] })
  } catch (error) {
    await client.query("ROLLBACK")
    console.error("[v0] Deposit error:", error)
    res.status(500).json({ error: "Deposit failed" })
  } finally {
    client.release()
  }
})

// Withdraw money
router.post("/withdraw", authMiddleware, async (req, res) => {
  const client = await getClient()

  try {
    const { amount } = req.body

    if (amount <= 0) {
      return res.status(400).json({ error: "Invalid amount" })
    }

    await client.query("BEGIN")

    // Check balance
    const walletCheck = await client.query("SELECT balance FROM wallets WHERE user_id = $1", [req.userId])

    if (walletCheck.rows[0].balance < amount) {
      await client.query("ROLLBACK")
      return res.status(400).json({ error: "Insufficient balance" })
    }

    // Update wallet
    const walletResult = await client.query(
      "UPDATE wallets SET balance = balance - $1, updated_at = NOW() WHERE user_id = $2 RETURNING *",
      [amount, req.userId],
    )

    // Create transaction record
    await client.query("INSERT INTO transactions (user_id, type, amount, description) VALUES ($1, $2, $3, $4)", [
      req.userId,
      "withdraw",
      amount,
      "Withdraw from wallet",
    ])

    await client.query("COMMIT")

    res.json({ wallet: walletResult.rows[0] })
  } catch (error) {
    await client.query("ROLLBACK")
    console.error("[v0] Withdraw error:", error)
    res.status(500).json({ error: "Withdraw failed" })
  } finally {
    client.release()
  }
})

module.exports = router
