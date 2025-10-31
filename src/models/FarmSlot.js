const { query } = require("../db")

class FarmSlot {
  constructor(data) {
    this.id = data.id
    this.user_id = data.user_id
    this.slot_x = data.slot_x
    this.slot_y = data.slot_y
    this.plant_model_id = data.plant_model_id
    this.planted_at = data.planted_at
    this.harvest_ready_at = data.harvest_ready_at
    this.is_harvested = data.is_harvested || false
  }

  // Static methods
  static async create({ user_id, slot_x, slot_y, plant_model_id = null }) {
    try {
      const result = await query(
        'INSERT INTO farm_slots (user_id, slot_x, slot_y, plant_model_id) VALUES ($1, $2, $3, $4) RETURNING *',
        [user_id, slot_x, slot_y, plant_model_id]
      )
      return new FarmSlot(result.rows[0])
    } catch (error) {
      throw error
    }
  }

  static async findById(id) {
    try {
      const result = await query('SELECT * FROM farm_slots WHERE id = $1', [id])
      return result.rows.length > 0 ? new FarmSlot(result.rows[0]) : null
    } catch (error) {
      throw error
    }
  }

  static async findByUserAndPosition(user_id, slot_x, slot_y) {
    try {
      const result = await query(
        'SELECT * FROM farm_slots WHERE user_id = $1 AND slot_x = $2 AND slot_y = $3',
        [user_id, slot_x, slot_y]
      )
      return result.rows.length > 0 ? new FarmSlot(result.rows[0]) : null
    } catch (error) {
      throw error
    }
  }

  static async findByUserId(user_id) {
    try {
      const result = await query(`
        SELECT fs.*, pm.name as plant_name, pm.growth_time, pm.harvest_value, pm.seed_cost, pm.image_url
        FROM farm_slots fs
        LEFT JOIN plant_models pm ON fs.plant_model_id = pm.id
        WHERE fs.user_id = $1
        ORDER BY fs.slot_x, fs.slot_y
      `, [user_id])

      return result.rows.map(row => {
        const farmSlot = new FarmSlot(row)
        if (row.plant_name) {
          farmSlot.plant = {
            id: row.plant_model_id,
            name: row.plant_name,
            growth_time: row.growth_time,
            harvest_value: parseFloat(row.harvest_value),
            seed_cost: parseFloat(row.seed_cost),
            image_url: row.image_url
          }
        }
        return farmSlot
      })
    } catch (error) {
      throw error
    }
  }

  static async findByPlantModelId(plant_model_id) {
    try {
      const result = await query(
        'SELECT * FROM farm_slots WHERE plant_model_id = $1 ORDER BY planted_at DESC',
        [plant_model_id]
      )
      return result.rows.map(row => new FarmSlot(row))
    } catch (error) {
      throw error
    }
  }

  static async findActiveByPlantModelId(plant_model_id) {
    try {
      const result = await query(
        'SELECT * FROM farm_slots WHERE plant_model_id = $1 AND planted_at IS NOT NULL AND is_harvested = false ORDER BY planted_at DESC',
        [plant_model_id]
      )
      return result.rows.map(row => new FarmSlot(row))
    } catch (error) {
      throw error
    }
  }

  static async findReadyForHarvest(user_id) {
    try {
      const result = await query(`
        SELECT fs.*, pm.name as plant_name, pm.harvest_value
        FROM farm_slots fs
        JOIN plant_models pm ON fs.plant_model_id = pm.id
        WHERE fs.user_id = $1 
          AND fs.planted_at IS NOT NULL 
          AND fs.is_harvested = false 
          AND fs.harvest_ready_at <= CURRENT_TIMESTAMP
        ORDER BY fs.harvest_ready_at ASC
      `, [user_id])

      return result.rows.map(row => {
        const farmSlot = new FarmSlot(row)
        farmSlot.plant = {
          name: row.plant_name,
          harvest_value: parseFloat(row.harvest_value)
        }
        return farmSlot
      })
    } catch (error) {
      throw error
    }
  }

  static async initializeUserFarm(user_id) {
    try {
      await query('BEGIN')
      
      // Create 10x10 grid of farm slots
      for (let x = 0; x < 10; x++) {
        for (let y = 0; y < 10; y++) {
          await query(
            'INSERT INTO farm_slots (user_id, slot_x, slot_y) VALUES ($1, $2, $3) ON CONFLICT (user_id, slot_x, slot_y) DO NOTHING',
            [user_id, x, y]
          )
        }
      }
      
      await query('COMMIT')
      return await FarmSlot.findByUserId(user_id)
    } catch (error) {
      await query('ROLLBACK')
      throw error
    }
  }

  // Instance methods
  async plant(plant_model_id) {
    try {
      // Get plant model to calculate harvest ready time
      const PlantModel = require('./PlantModel')
      const plantModel = await PlantModel.findById(plant_model_id)
      
      if (!plantModel) {
        throw new Error('Plant model not found')
      }

      if (this.plant_model_id) {
        throw new Error('Slot already has a plant')
      }

      const plantedAt = new Date()
      const harvestReadyAt = new Date(plantedAt.getTime() + (plantModel.growth_time * 1000))

      const result = await query(
        `UPDATE farm_slots 
         SET plant_model_id = $1, planted_at = $2, harvest_ready_at = $3, is_harvested = false 
         WHERE id = $4 RETURNING *`,
        [plant_model_id, plantedAt, harvestReadyAt, this.id]
      )

      if (result.rows.length > 0) {
        Object.assign(this, result.rows[0])
      }
      return this
    } catch (error) {
      throw error
    }
  }

  async harvest() {
    try {
      if (!this.plant_model_id || this.is_harvested) {
        throw new Error('Nothing to harvest')
      }

      if (!this.isReadyForHarvest()) {
        throw new Error('Plant is not ready for harvest')
      }

      // Get plant model for harvest value
      const PlantModel = require('./PlantModel')
      const plantModel = await PlantModel.findById(this.plant_model_id)

      if (!plantModel) {
        throw new Error('Plant model not found')
      }

      await query('BEGIN')

      // Mark as harvested
      const result = await query(
        'UPDATE farm_slots SET is_harvested = true WHERE id = $1 RETURNING *',
        [this.id]
      )

      if (result.rows.length > 0) {
        Object.assign(this, result.rows[0])
      }

      // Add money to user's wallet
      const Wallet = require('./Wallet')
      const wallet = await Wallet.findByUserId(this.user_id)
      
      if (wallet) {
        await wallet.addMoney(
          plantModel.harvest_value, 
          'farm_harvest', 
          `Harvested ${plantModel.name}`
        )
      }

      await query('COMMIT')
      return {
        farmSlot: this,
        harvestValue: plantModel.harvest_value,
        plantName: plantModel.name
      }
    } catch (error) {
      await query('ROLLBACK')
      throw error
    }
  }

  async clear() {
    try {
      const result = await query(
        `UPDATE farm_slots 
         SET plant_model_id = NULL, planted_at = NULL, harvest_ready_at = NULL, is_harvested = false 
         WHERE id = $1 RETURNING *`,
        [this.id]
      )

      if (result.rows.length > 0) {
        Object.assign(this, result.rows[0])
      }
      return this
    } catch (error) {
      throw error
    }
  }

  // Helper methods
  isEmpty() {
    return !this.plant_model_id
  }

  isPlanted() {
    return this.plant_model_id && this.planted_at && !this.is_harvested
  }

  isReadyForHarvest() {
    return this.isPlanted() && this.harvest_ready_at && new Date() >= new Date(this.harvest_ready_at)
  }

  getGrowthProgress() {
    if (!this.isPlanted()) return 0

    const plantedTime = new Date(this.planted_at).getTime()
    const readyTime = new Date(this.harvest_ready_at).getTime()
    const currentTime = new Date().getTime()

    const totalGrowthTime = readyTime - plantedTime
    const elapsedTime = currentTime - plantedTime

    const progress = Math.min(elapsedTime / totalGrowthTime, 1)
    return Math.max(progress, 0)
  }

  getRemainingTime() {
    if (!this.isPlanted() || this.isReadyForHarvest()) return 0

    const readyTime = new Date(this.harvest_ready_at).getTime()
    const currentTime = new Date().getTime()

    return Math.max(readyTime - currentTime, 0) // in milliseconds
  }

  // Relations
  async getUser() {
    const User = require('./User')
    return await User.findById(this.user_id)
  }

  async getPlantModel() {
    if (!this.plant_model_id) return null
    
    const PlantModel = require('./PlantModel')
    return await PlantModel.findById(this.plant_model_id)
  }
}

module.exports = FarmSlot