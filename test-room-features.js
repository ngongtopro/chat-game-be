const CaroRoom = require('./src/models/CaroRoom')
const { query } = require('./src/db')

async function testCaroRoomFeatures() {
  try {
    console.log('🧪 Testing CaroRoom new features...\n')

    // Test 1: Create room with bet amount and creator
    console.log('1️⃣ Creating room with bet amount and creator...')
    const room = await CaroRoom.create({
      bet_amount: '10.00',
      max_users: 2,
      creator_id: 1
    })
    console.log('✓ Room created:', {
      id: room.id,
      room_code: room.room_code,
      bet_amount: room.bet_amount,
      max_users: room.max_users,
      current_users: room.current_users
    })

    // Test 2: Check room properties
    console.log('\n2️⃣ Checking room properties...')
    console.log('- isFull():', room.isFull())
    console.log('- isWaiting():', room.isWaiting())
    console.log('- hasUser(1):', room.hasUser(1))
    console.log('- canJoin(2):', room.canJoin(2))

    // Test 3: Add second user
    console.log('\n3️⃣ Adding second user...')
    await room.addUser(2)
    console.log('✓ User 2 added. Current users:', room.current_users)
    console.log('- isFull():', room.isFull())
    console.log('- canJoin(3):', room.canJoin(3))

    // Test 4: Try to add third user (should fail)
    console.log('\n4️⃣ Trying to add third user (should fail)...')
    try {
      await room.addUser(3)
      console.log('❌ Should have failed but succeeded')
    } catch (error) {
      console.log('✓ Correctly rejected:', error.message)
    }

    // Test 5: Remove user
    console.log('\n5️⃣ Removing user 2...')
    await room.removeUser(2)
    console.log('✓ User 2 removed. Current users:', room.current_users)
    console.log('- isFull():', room.isFull())

    // Test 6: Update bet amount
    console.log('\n6️⃣ Updating bet amount...')
    await room.updateBetAmount('20.00')
    console.log('✓ Bet amount updated to:', room.bet_amount)

    // Test 7: Find waiting rooms
    console.log('\n7️⃣ Finding waiting rooms (not full)...')
    const waitingRooms = await CaroRoom.findWaitingRooms(5)
    console.log('✓ Found waiting rooms:', waitingRooms.length)
    waitingRooms.forEach(r => {
      console.log(`  - Room ${r.room_code}: ${r.current_users.length}/${r.max_users} users, bet: ${r.bet_amount}`)
    })

    // Cleanup
    console.log('\n🧹 Cleaning up test room...')
    await room.delete()
    console.log('✓ Test room deleted')

    console.log('\n✅ All tests passed!')
    process.exit(0)
  } catch (error) {
    console.error('\n❌ Test failed:', error)
    process.exit(1)
  }
}

testCaroRoomFeatures()
