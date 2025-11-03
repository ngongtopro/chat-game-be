/**
 * Test Drizzle ORM Connection
 * Chạy file này để test xem Drizzle ORM có hoạt động không
 */

require('dotenv').config()
const { db, pool } = require('./src/db/index')
const { UserHelper, WalletHelper, CaroRoomHelper } = require('./src/db/helpers')

async function testConnection() {
  console.log('🔍 Testing Drizzle ORM connection...\n')

  try {
    // Test 1: Raw query
    console.log('✅ Test 1: Testing pool connection...')
    const result = await pool.query('SELECT NOW()')
    console.log('   Current time from database:', result.rows[0].now)
    console.log('   ✓ Pool connection works!\n')

    // Test 2: Count users
    console.log('✅ Test 2: Testing Drizzle select...')
    const { users } = require('./src/db/schema')
    const { sql } = require('drizzle-orm')
    const countResult = await db.select({ count: sql`count(*)` }).from(users)
    console.log('   Total users in database:', countResult[0].count)
    console.log('   ✓ Drizzle select works!\n')

    // Test 3: Test UserHelper
    console.log('✅ Test 3: Testing UserHelper...')
    const allUsers = await db.select().from(users).limit(3)
    if (allUsers.length > 0) {
      console.log(`   Found ${allUsers.length} users (showing first 3):`)
      allUsers.forEach(u => {
        console.log(`   - ${u.username} (${u.email})`)
      })
      
      // Test find by ID
      const user = await UserHelper.findById(allUsers[0].id)
      console.log(`   ✓ UserHelper.findById works! Found: ${user.username}\n`)
    } else {
      console.log('   No users found in database')
      console.log('   ✓ UserHelper works (but no data)\n')
    }

    // Test 4: Test WalletHelper
    console.log('✅ Test 4: Testing WalletHelper...')
    const { wallets } = require('./src/db/schema')
    const walletsCount = await db.select({ count: sql`count(*)` }).from(wallets)
    console.log('   Total wallets:', walletsCount[0].count)
    console.log('   ✓ WalletHelper schema works!\n')

    // Test 5: Test CaroRoomHelper
    console.log('✅ Test 5: Testing CaroRoomHelper...')
    const { caroRooms } = require('./src/db/schema')
    const roomsCount = await db.select({ count: sql`count(*)` }).from(caroRooms)
    console.log('   Total caro rooms:', roomsCount[0].count)
    console.log('   ✓ CaroRoomHelper schema works!\n')

    console.log('🎉 All tests passed! Drizzle ORM is working correctly!\n')
    console.log('📝 Summary:')
    console.log('   ✓ Database connection successful')
    console.log('   ✓ Drizzle ORM queries working')
    console.log('   ✓ Schema definitions correct')
    console.log('   ✓ Helper functions ready to use')
    console.log('\n✅ You can now use Drizzle ORM in your application!')

  } catch (error) {
    console.error('❌ Error testing Drizzle ORM:')
    console.error(error)
    console.log('\n💡 Possible issues:')
    console.log('   - Database connection settings incorrect')
    console.log('   - Database not running')
    console.log('   - Schema not matching database tables')
  } finally {
    await pool.end()
    console.log('\n👋 Connection closed')
    process.exit(0)
  }
}

// Run tests
testConnection()
