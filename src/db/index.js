const { drizzle } = require('drizzle-orm/node-postgres');
const { Pool } = require('pg');
const schema = require('./schema');

// Create PostgreSQL connection pool
const pool = new Pool({
  host: process.env.DB_HOST || "100.64.192.68",
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || "nonfar",
  user: process.env.DB_USER || "myuser",
  password: process.env.DB_PASSWORD || "mypassword",
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test connection
pool.on("connect", () => {
  console.log("[Drizzle] Connected to PostgreSQL database");
});

pool.on("error", (err) => {
  console.error("[Drizzle] Unexpected error on idle client", err);
  process.exit(-1);
});

// Create Drizzle instance with schema
const db = drizzle(pool, { schema });

// Export both db and pool for backward compatibility
module.exports = {
  db,
  pool,
  // Re-export schema for convenience
  ...schema
};