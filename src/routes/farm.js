const express = require("express")
const { query, getClient } = require("../db")
const { authMiddleware } = require("../auth")

const router = express.Router()

// Initialize farm (create 10x10 slots)
router.post("/init", authMiddleware, async (req, res) => {
  const client = await getClient()

  try {
    await client.query("BEGIN")

    // Check if farm already exists
    const existing = await client.query("SELECT COUNT(*) FROM farm_slots WHERE user_id = $1", [req.userId])

    if (existing.rows[0].count > 0) {
      await client.query("ROLLBACK")
      return res.status(400).json({ error: "Farm already initialized" })
    }

    // Create 10x10 slots
    const slots = []
    for (let x = 0; x < 10; x++) {
      for (let y = 0; y < 10; y++) {
        slots.push(`(${req.userId}, ${x}, ${y})`)
      }
    }

    await client.query(`INSERT INTO farm_slots (user_id, x, y) VALUES ${slots.join(", ")}`)

    await client.query("COMMIT")

    res.json({ message: "Farm initialized successfully" })
  } catch (error) {
    await client.query("ROLLBACK")
    console.error("[v0] Init farm error:", error)
    res.status(500).json({ error: "Failed to initialize farm" })
  } finally {
    client.release()
  }
})

// Get farm slots
router.get("/slots", authMiddleware, async (req, res) => {
  try {
    const result = await query(
      `SELECT fs.*, p.name as plant_name, p.growth_time, p.reward_amount, p.icon
       FROM farm_slots fs
       LEFT JOIN plants p ON fs.plant_id = p.id
       WHERE fs.user_id = $1
       ORDER BY fs.x, fs.y`,
      [req.userId],
    )

    res.json({ slots: result.rows })
  } catch (error) {
    console.error("[v0] Get slots error:", error)
    res.status(500).json({ error: "Failed to get farm slots" })
  }
})

// Plant seed
router.post("/plant", authMiddleware, async (req, res) => {
  try {
    const { x, y, plantId } = req.body

    // Check if slot is empty
    const slotCheck = await query("SELECT * FROM farm_slots WHERE user_id = $1 AND x = $2 AND y = $3", [
      req.userId,
      x,
      y,
    ])

    if (slotCheck.rows.length === 0) {
      return res.status(404).json({ error: "Slot not found" })
    }

    if (slotCheck.rows[0].plant_id) {
      return res.status(400).json({ error: "Slot already occupied" })
    }

    // Get plant info
    const plantInfo = await query("SELECT * FROM plants WHERE id = $1", [plantId])

    if (plantInfo.rows.length === 0) {
      return res.status(404).json({ error: "Plant not found" })
    }

    const plant = plantInfo.rows[0]
    const harvestTime = new Date(Date.now() + plant.growth_time * 1000)

    // Plant the seed
    const result = await query(
      `UPDATE farm_slots 
       SET plant_id = $1, planted_at = NOW(), harvest_at = $2, status = 'growing'
       WHERE user_id = $3 AND x = $4 AND y = $5
       RETURNING *`,
      [plantId, harvestTime, req.userId, x, y],
    )

    res.json({ slot: result.rows[0] })
  } catch (error) {
    console.error("[v0] Plant error:", error)
    res.status(500).json({ error: "Failed to plant" })
  }
})

// Harvest plant
router.post("/harvest", authMiddleware, async (req, res) => {
  const client = await getClient()

  try {
    const { x, y } = req.body

    await client.query("BEGIN")

    // Get slot info
    const slotResult = await client.query(
      `SELECT fs.*, p.reward_amount 
       FROM farm_slots fs
       JOIN plants p ON fs.plant_id = p.id
       WHERE fs.user_id = $1 AND fs.x = $2 AND fs.y = $3`,
      [req.userId, x, y],
    )

    if (slotResult.rows.length === 0) {
      await client.query("ROLLBACK")
      return res.status(404).json({ error: "Slot not found" })
    }

    const slot = slotResult.rows[0]

    if (slot.status !== "ready") {
      await client.query("ROLLBACK")
      return res.status(400).json({ error: "Plant not ready to harvest" })
    }

    // Add money to wallet
    await client.query("UPDATE wallets SET balance = balance + $1 WHERE user_id = $2", [slot.reward_amount, req.userId])

    // Create transaction
    await client.query(
      "INSERT INTO transactions (user_id, type, amount, source, description) VALUES ($1, $2, $3, $4, $5)",
      [req.userId, "earn", slot.reward_amount, "farm", "Harvested plant"],
    )

    // Clear slot
    await client.query(
      `UPDATE farm_slots 
       SET plant_id = NULL, planted_at = NULL, harvest_at = NULL, status = 'empty'
       WHERE user_id = $1 AND x = $2 AND y = $3`,
      [req.userId, x, y],
    )

    await client.query("COMMIT")

    res.json({ reward: slot.reward_amount })
  } catch (error) {
    await client.query("ROLLBACK")
    console.error("[v0] Harvest error:", error)
    res.status(500).json({ error: "Failed to harvest" })
  } finally {
    client.release()
  }
})

// Get available plants
router.get("/plants", authMiddleware, async (req, res) => {
  try {
    const result = await query("SELECT * FROM plants ORDER BY growth_time")
    res.json({ plants: result.rows })
  } catch (error) {
    console.error("[v0] Get plants error:", error)
    res.status(500).json({ error: "Failed to get plants" })
  }
})

module.exports = router
