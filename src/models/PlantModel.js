const { query } = require("../db")

class PlantModel {
  constructor(data) {
    this.id = data.id
    this.name = data.name
    this.growth_time = data.growth_time // in seconds
    this.harvest_value = parseFloat(data.harvest_value)
    this.seed_cost = parseFloat(data.seed_cost)
    this.image_url = data.image_url
    this.created_at = data.created_at
  }

  // Static methods
  static async create({ name, growth_time, harvest_value, seed_cost, image_url = null }) {
    try {
      const result = await query(
        'INSERT INTO plant_models (name, growth_time, harvest_value, seed_cost, image_url) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [name, growth_time, harvest_value, seed_cost, image_url]
      )
      return new PlantModel(result.rows[0])
    } catch (error) {
      throw error
    }
  }

  static async findById(id) {
    try {
      const result = await query('SELECT * FROM plant_models WHERE id = $1', [id])
      return result.rows.length > 0 ? new PlantModel(result.rows[0]) : null
    } catch (error) {
      throw error
    }
  }

  static async findByName(name) {
    try {
      const result = await query('SELECT * FROM plant_models WHERE name = $1', [name])
      return result.rows.length > 0 ? new PlantModel(result.rows[0]) : null
    } catch (error) {
      throw error
    }
  }

  static async findAll(limit = 50, offset = 0) {
    try {
      const result = await query(
        'SELECT * FROM plant_models ORDER BY name ASC LIMIT $1 OFFSET $2',
        [limit, offset]
      )
      return result.rows.map(row => new PlantModel(row))
    } catch (error) {
      throw error
    }
  }

  static async findAvailable() {
    try {
      const result = await query('SELECT * FROM plant_models ORDER BY seed_cost ASC')
      return result.rows.map(row => new PlantModel(row))
    } catch (error) {
      throw error
    }
  }

  // Instance methods
  async update(data) {
    try {
      const fields = []
      const values = []
      let paramCount = 1

      Object.keys(data).forEach(key => {
        if (data[key] !== undefined && key !== 'id' && key !== 'created_at') {
          fields.push(`${key} = $${paramCount}`)
          values.push(data[key])
          paramCount++
        }
      })

      if (fields.length === 0) return this

      values.push(this.id)
      const sql = `UPDATE plant_models SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`
      const result = await query(sql, values)

      if (result.rows.length > 0) {
        Object.assign(this, result.rows[0])
        this.harvest_value = parseFloat(this.harvest_value)
        this.seed_cost = parseFloat(this.seed_cost)
      }
      return this
    } catch (error) {
      throw error
    }
  }

  async delete() {
    try {
      // Check if plant is being used in farm slots
      const farmSlotsResult = await query(
        'SELECT COUNT(*) as count FROM farm_slots WHERE plant_model_id = $1',
        [this.id]
      )
      
      if (parseInt(farmSlotsResult.rows[0].count) > 0) {
        throw new Error('Cannot delete plant model that is currently planted in farm slots')
      }

      await query('DELETE FROM plant_models WHERE id = $1', [this.id])
      return true
    } catch (error) {
      throw error
    }
  }

  // Helper methods
  getGrowthTimeInMinutes() {
    return Math.floor(this.growth_time / 60)
  }

  getGrowthTimeInHours() {
    return Math.floor(this.growth_time / 3600)
  }

  getProfitMargin() {
    return this.harvest_value - this.seed_cost
  }

  getProfitMarginPercentage() {
    return ((this.harvest_value - this.seed_cost) / this.seed_cost) * 100
  }

  getProfitPerSecond() {
    return this.getProfitMargin() / this.growth_time
  }

  getHarvestReadyTime(plantedAt) {
    const plantedDate = new Date(plantedAt)
    return new Date(plantedDate.getTime() + (this.growth_time * 1000))
  }

  isReadyForHarvest(plantedAt) {
    const harvestReadyTime = this.getHarvestReadyTime(plantedAt)
    return new Date() >= harvestReadyTime
  }

  // Relations
  async getFarmSlots() {
    const FarmSlot = require('./FarmSlot')
    return await FarmSlot.findByPlantModelId(this.id)
  }

  async getActiveFarmSlots() {
    const FarmSlot = require('./FarmSlot')
    return await FarmSlot.findActiveByPlantModelId(this.id)
  }
}

module.exports = PlantModel