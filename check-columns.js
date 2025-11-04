const { pool } = require('./src/db');

pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'caro_games' ORDER BY ordinal_position")
  .then(r => {
    console.log('Columns in caro_games:', r.rows.map(row => row.column_name).join(', '));
    process.exit(0);
  })
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
