/**
 * Migration script to restructure Caro game tables
 * This adds caro_games and caro_moves tables
 */

require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function runMigration() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Starting Caro game restructure migration...\n');

    // Read the migration SQL file
    const migrationSQL = fs.readFileSync(
      path.join(__dirname, 'scripts', '003_caro_game_restructure.sql'),
      'utf8'
    );

    // Execute the migration
    await client.query('BEGIN');
    await client.query(migrationSQL);
    await client.query('COMMIT');

    console.log('✅ Migration completed successfully!\n');
    console.log('📋 Tables created/modified:');
    console.log('   - caro_rooms (simplified)');
    console.log('   - caro_games (new)');
    console.log('   - caro_moves (new)');
    console.log('\n📊 Checking tables...\n');

    // Verify tables exist
    const tableCheck = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('caro_rooms', 'caro_games', 'caro_moves')
      ORDER BY table_name
    `);

    console.log('✅ Verified tables:');
    tableCheck.rows.forEach(row => {
      console.log(`   ✓ ${row.table_name}`);
    });

    // Check columns in new tables
    console.log('\n📋 caro_games columns:');
    const gameColumns = await client.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'caro_games'
      ORDER BY ordinal_position
    `);
    gameColumns.rows.forEach(col => {
      console.log(`   - ${col.column_name}: ${col.data_type}`);
    });

    console.log('\n📋 caro_moves columns:');
    const moveColumns = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'caro_moves'
      ORDER BY ordinal_position
    `);
    moveColumns.rows.forEach(col => {
      console.log(`   - ${col.column_name}: ${col.data_type}`);
    });

    console.log('\n✨ Migration completed successfully!');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', error.message);
    console.error('\nError details:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the migration
runMigration();
