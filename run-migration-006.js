const { query } = require('./src/db')
const fs = require('fs')
const path = require('path')

async function runMigration() {
  try {
    console.log('Running migration: 006_add_room_users_and_bet.sql')
    
    const sqlPath = path.join(__dirname, 'scripts', '006_add_room_users_and_bet.sql')
    const sql = fs.readFileSync(sqlPath, 'utf8')
    
    await query(sql)
    
    console.log('✓ Migration completed successfully')
    
    // Verify the changes
    const result = await query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'caro_rooms'
      ORDER BY ordinal_position
    `)
    
    console.log('\nCurrent caro_rooms table structure:')
    result.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type} (default: ${row.column_default || 'none'})`)
    })
    
    process.exit(0)
  } catch (error) {
    console.error('Migration failed:', error)
    process.exit(1)
  }
}

runMigration()
