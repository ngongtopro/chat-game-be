const { Pool } = require('pg')

const pool = new Pool({
  host: '100.64.192.68',
  port: 5432,
  database: 'nonfar',
  user: 'myuser',
  password: 'mypassword',
})

async function checkTables() {
  try {
    const result = await pool.query(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE '%caro%' ORDER BY tablename"
    )
    console.log('Caro tables in database:', result.rows)
    
    // Check all tables
    const allTables = await pool.query(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename"
    )
    console.log('\nAll tables in database:', allTables.rows)
  } catch (error) {
    console.error('Error:', error.message)
  } finally {
    await pool.end()
  }
}

checkTables()
