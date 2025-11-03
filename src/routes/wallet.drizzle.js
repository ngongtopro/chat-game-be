const express = require("express")
const { db, WalletHelper, TransactionHelper } = require("../db/helpers")
const { authMiddleware } = require("../auth")

const router = express.Router()

// Get wallet balance
router.get("/balance", authMiddleware, async (req, res) => {
  try {
    const wallet = await WalletHelper.getByUserId(req.userId)

    if (!wallet) {
      return res.status(404).json({ error: "Wallet not found" })
    }

    res.json({ 
      wallet,
      balance: parseFloat(wallet.balance)
    })
  } catch (error) {
    console.error("[Wallet] Get balance error:", error)
    res.status(500).json({ error: "Failed to get balance" })
  }
})

// Get transaction history
router.get("/transactions", authMiddleware, async (req, res) => {
  try {
    const transactions = await TransactionHelper.getByUserId(req.userId, 50)

    res.json({ transactions })
  } catch (error) {
    console.error("[Wallet] Get transactions error:", error)
    res.status(500).json({ error: "Failed to get transactions" })
  }
})

// Deposit money
router.post("/deposit", authMiddleware, async (req, res) => {
  try {
    const { amount, source } = req.body

    if (amount <= 0) {
      return res.status(400).json({ error: "Invalid amount" })
    }

    // Use transaction to ensure atomicity
    const result = await db.transaction(async (tx) => {
      // Update wallet balance
      const wallet = await WalletHelper.updateBalance(req.userId, amount)

      // Create transaction record
      await TransactionHelper.create({
        userId: req.userId,
        amount,
        type: "deposit",
        source: source || "manual",
        description: "Deposit to wallet"
      })

      return wallet
    })

    res.json({ wallet: result })
  } catch (error) {
    console.error("[Wallet] Deposit error:", error)
    res.status(500).json({ error: "Deposit failed" })
  }
})

// Withdraw money
router.post("/withdraw", authMiddleware, async (req, res) => {
  try {
    const { amount } = req.body

    if (amount <= 0) {
      return res.status(400).json({ error: "Invalid amount" })
    }

    // Use transaction to ensure atomicity
    const result = await db.transaction(async (tx) => {
      // Check balance
      const currentBalance = await WalletHelper.getBalance(req.userId)

      if (currentBalance < amount) {
        throw new Error("Insufficient balance")
      }

      // Update wallet (deduct)
      const wallet = await WalletHelper.updateBalance(req.userId, -amount)

      // Create transaction record
      await TransactionHelper.create({
        userId: req.userId,
        amount: -amount,
        type: "withdraw",
        source: "manual",
        description: "Withdraw from wallet"
      })

      return wallet
    })

    res.json({ wallet: result })
  } catch (error) {
    if (error.message === "Insufficient balance") {
      return res.status(400).json({ error: "Insufficient balance" })
    }
    
    console.error("[Wallet] Withdraw error:", error)
    res.status(500).json({ error: "Withdraw failed" })
  }
})

module.exports = router
