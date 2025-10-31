const { Pool } = require("pg")

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
})

// Test connection
pool.on("connect", () => {
  console.log("[v0] Connected to PostgreSQL database")
})

pool.on("error", (err) => {
  console.error("[v0] Unexpected error on idle client", err)
  process.exit(-1)
})

// Query helper function
async function query(text, params) {
  const start = Date.now()
  try {
    const res = await pool.query(text, params)
    const duration = Date.now() - start
    console.log("[v0] Executed query", { text, duration, rows: res.rowCount })
    return res
  } catch (error) {
    console.error("[v0] Database query error:", error)
    throw error
  }
}

// Get a client from the pool
async function getClient() {
  const client = await pool.connect()
  const query = client.query
  const release = client.release

  // Set a timeout of 5 seconds, after which we will log this client's last query
  const timeout = setTimeout(() => {
    console.error("[v0] A client has been checked out for more than 5 seconds!")
  }, 5000)

  // Monkey patch the query method to keep track of the last query executed
  client.query = (...args) => {
    client.lastQuery = args
    return query.apply(client, args)
  }

  client.release = () => {
    clearTimeout(timeout)
    client.query = query
    client.release = release
    return release.apply(client)
  }

  return client
}

module.exports = {
  query,
  getClient,
  pool,
}
