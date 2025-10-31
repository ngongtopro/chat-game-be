/**
 * Add description column to transactions table
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

async function addDescriptionColumn() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Adding description column to transactions table...\n');

    const migrationSQL = fs.readFileSync(
      path.join(__dirname, 'scripts', '004_add_transaction_description.sql'),
      'utf8'
    );

    await client.query(migrationSQL);

    console.log('✅ Description column added successfully!\n');

    // Verify column exists
    const result = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'transactions'
      ORDER BY ordinal_position
    `);

    console.log('📋 Transactions table columns:');
    result.rows.forEach(col => {
      console.log(`   - ${col.column_name}: ${col.data_type}`);
    });

    console.log('\n✨ Migration completed!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

addDescriptionColumn();
