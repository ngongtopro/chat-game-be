const { Pool } = require("pg")
const fs = require("fs")
const path = require("path")

// Load environment variables
require("dotenv").config()

// Create PostgreSQL connection pool
const pool = new Pool({
  host: process.env.DB_HOST || "100.64.192.68",
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || "nonfar",
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
})

async function setupDatabase() {
  const client = await pool.connect()
  
  try {
    console.log("🚀 Bắt đầu thiết lập database...")
    
    // Read and execute initial schema
    console.log("📋 Đang tạo các bảng...")
    const schemaSQL = fs.readFileSync(
      path.join(__dirname, "scripts", "001_initial_schema.sql"),
      "utf8"
    )
    await client.query(schemaSQL)
    console.log("✅ Đã tạo các bảng thành công!")
    
    // Read and execute seed data
    console.log("🌱 Đang thêm dữ liệu mẫu...")
    const seedSQL = fs.readFileSync(
      path.join(__dirname, "scripts", "002_seed_plants.sql"),
      "utf8"
    )
    await client.query(seedSQL)
    console.log("✅ Đã thêm dữ liệu mẫu thành công!")
    
    // Verify tables
    console.log("\n📊 Kiểm tra các bảng đã tạo:")
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `)
    
    tablesResult.rows.forEach(row => {
      console.log(`  - ${row.table_name}`)
    })
    
    console.log("\n✨ Thiết lập database hoàn tất!")
    
  } catch (error) {
    console.error("❌ Lỗi khi thiết lập database:", error)
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

// Run setup
setupDatabase()
  .then(() => {
    console.log("\n👍 Database đã sẵn sàng!")
    process.exit(0)
  })
  .catch((error) => {
    console.error("\n💥 Thiết lập thất bại:", error.message)
    process.exit(1)
  })
