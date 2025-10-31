/**
 * Verify the new Caro game structure
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function verifyStructure() {
  const client = await pool.connect();
  
  try {
    console.log('🔍 Verifying database structure...\n');

    // Check caro_rooms structure
    console.log('📋 caro_rooms table:');
    const roomsColumns = await client.query(`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'caro_rooms'
      ORDER BY ordinal_position
    `);
    roomsColumns.rows.forEach(col => {
      console.log(`   ${col.column_name.padEnd(20)} ${col.data_type.padEnd(25)} ${col.column_default || 'NULL'}`);
    });

    // Check caro_games structure
    console.log('\n📋 caro_games table:');
    const gamesColumns = await client.query(`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'caro_games'
      ORDER BY ordinal_position
    `);
    gamesColumns.rows.forEach(col => {
      console.log(`   ${col.column_name.padEnd(20)} ${col.data_type.padEnd(25)} ${col.column_default || 'NULL'}`);
    });

    // Check caro_moves structure
    console.log('\n📋 caro_moves table:');
    const movesColumns = await client.query(`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'caro_moves'
      ORDER BY ordinal_position
    `);
    movesColumns.rows.forEach(col => {
      console.log(`   ${col.column_name.padEnd(20)} ${col.data_type.padEnd(25)} ${col.column_default || 'NULL'}`);
    });

    // Check foreign key relationships
    console.log('\n🔗 Foreign Key Relationships:');
    const fkeys = await client.query(`
      SELECT
        tc.table_name, 
        kcu.column_name, 
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name 
      FROM information_schema.table_constraints AS tc 
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY' 
      AND tc.table_name IN ('caro_rooms', 'caro_games', 'caro_moves')
      ORDER BY tc.table_name, kcu.column_name
    `);
    fkeys.rows.forEach(fk => {
      console.log(`   ${fk.table_name}.${fk.column_name} → ${fk.foreign_table_name}.${fk.foreign_column_name}`);
    });

    // Check indexes
    console.log('\n📊 Indexes:');
    const indexes = await client.query(`
      SELECT
        tablename,
        indexname,
        indexdef
      FROM pg_indexes
      WHERE tablename IN ('caro_rooms', 'caro_games', 'caro_moves')
      AND schemaname = 'public'
      ORDER BY tablename, indexname
    `);
    indexes.rows.forEach(idx => {
      console.log(`   ${idx.tablename}: ${idx.indexname}`);
    });

    console.log('\n✅ Database structure verified successfully!');
    console.log('\n📝 Summary:');
    console.log(`   • caro_rooms: ${roomsColumns.rows.length} columns`);
    console.log(`   • caro_games: ${gamesColumns.rows.length} columns`);
    console.log(`   • caro_moves: ${movesColumns.rows.length} columns`);
    console.log(`   • Foreign keys: ${fkeys.rows.length}`);
    console.log(`   • Indexes: ${indexes.rows.length}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

verifyStructure();
