const { query } = require('./src/db')

async function checkDatabase() {
  try {
    console.log('[Check] Checking database structure...\n')
    
    // Check caro_rooms
    const rooms = await query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'caro_rooms'
      ORDER BY ordinal_position;
    `)
    console.log('[Table Structure] caro_rooms:')
    console.table(rooms.rows)
    
    // Check caro_games
    const games = await query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'caro_games'
      ORDER BY ordinal_position;
    `)
    console.log('\n[Table Structure] caro_games:')
    console.table(games.rows)
    
    // Check caro_moves
    const moves = await query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'caro_moves'
      ORDER BY ordinal_position;
    `)
    console.log('\n[Table Structure] caro_moves:')
    console.table(moves.rows)
    
    process.exit(0)
  } catch (error) {
    console.error('[Check] Error:', error)
    process.exit(1)
  }
}

checkDatabase()
