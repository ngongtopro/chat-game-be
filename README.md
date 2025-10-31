# Social Gaming Platform - Backend

Express.js backend server (Node.js + JavaScript) for the social gaming platform with Socket.io for real-time features.

## Setup

1. Install dependencies:
\`\`\`bash
cd backend
npm install
\`\`\`

2. Create `.env` file:
\`\`\`bash
cp .env.example .env
\`\`\`

3. Configure environment variables in `.env`:
- `DB_HOST`: PostgreSQL host (default: 100.64.192.68)
- `DB_PORT`: PostgreSQL port (default: 5432)
- `DB_NAME`: Database name (default: social_gaming)
- `DB_USER`: Database username
- `DB_PASSWORD`: Database password
- `JWT_SECRET`: Secret key for JWT tokens (change this!)
- `FRONTEND_URL`: Frontend URL (default: http://localhost:3000)
- `PORT`: Backend port (default: 3001)

4. Run database migrations:
\`\`\`bash
# Run the SQL scripts in your PostgreSQL database at 100.64.192.68:5432
# scripts/001_initial_schema.sql
# scripts/002_seed_plants.sql
\`\`\`

5. Start the server:
\`\`\`bash
# Development (with auto-reload)
npm run dev

# Production
npm start
\`\`\`

The backend will run on http://localhost:3001

## Database Connection

The backend connects to PostgreSQL at **100.64.192.68:5432** using the `pg` library. Make sure your database is accessible and the credentials in `.env` are correct.

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/logout` - Logout user
- `GET /api/auth/me` - Get current user

### Friends
- `GET /api/friends/search?q=query` - Search users
- `POST /api/friends/request` - Send friend request
- `POST /api/friends/accept` - Accept friend request
- `GET /api/friends/list` - Get friends list

### Wallet
- `GET /api/wallet/balance` - Get wallet balance
- `GET /api/wallet/transactions` - Get transaction history
- `POST /api/wallet/deposit` - Deposit money
- `POST /api/wallet/withdraw` - Withdraw money

### Farm
- `POST /api/farm/init` - Initialize farm
- `GET /api/farm/slots` - Get farm slots
- `POST /api/farm/plant` - Plant seed
- `POST /api/farm/harvest` - Harvest plant
- `GET /api/farm/plants` - Get available plants

### Caro Game
- `POST /api/caro/create-room` - Create game room
- `POST /api/caro/join-room` - Join game room
- `GET /api/caro/room/:roomCode` - Get room info
- `POST /api/caro/move` - Make game move
- `GET /api/caro/rooms` - Get available rooms

### Chat
- `GET /api/chat/conversations` - Get conversations
- `GET /api/chat/messages?friendId=id` - Get messages
- `POST /api/chat/send` - Send message

## Socket.io Events

### Client → Server
- `join-user-room` - Join personal room
- `join-chat` - Join chat room
- `join-caro-room` - Join caro game room
- `leave-caro-room` - Leave caro game room
- `caro-move` - Make caro move
- `caro-chat-message` - Send caro room chat
- `send-message` - Send direct message
- `farm-update` - Notify farm update

### Server → Client
- `player-joined` - Player joined caro room
- `player-left` - Player left caro room
- `caro-move-made` - Caro move made
- `caro-chat-received` - Caro chat message
- `message-received` - Direct message received
- `farm-updated` - Farm updated
