require('dotenv').config();

module.exports = {
  schema: './src/db/schema.js',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    host: process.env.DB_HOST || "100.64.192.68",
    port: parseInt(process.env.DB_PORT || "5432"),
    database: process.env.DB_NAME || "nonfar",
    user: process.env.DB_USER || "myuser",
    password: process.env.DB_PASSWORD || "mypassword",
  },
};
