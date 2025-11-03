// Import Drizzle database instance
const { db, pool } = require('./db/index')

// For backward compatibility, keep the pool connection events
pool.on("connect", () => {
  console.log("[v0] Connected to PostgreSQL database (legacy)")
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
  db, // Export Drizzle instance
}
