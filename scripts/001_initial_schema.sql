-- Users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  type VARCHAR(20) DEFAULT 'regular', -- regular, admin
  avatar_url VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Friends table (bidirectional friendship)
CREATE TABLE IF NOT EXISTS friendships (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  friend_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'pending', -- pending, accepted, blocked
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, friend_id)
);

-- Wallets table
CREATE TABLE IF NOT EXISTS wallets (
  id SERIAL PRIMARY KEY,
  user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  balance DECIMAL(15, 2) DEFAULT 0.00,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Transaction history
CREATE TABLE IF NOT EXISTS transactions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  amount DECIMAL(15, 2) NOT NULL,
  type VARCHAR(50) NOT NULL, -- deposit, withdraw, game_win, game_loss, farm_harvest
  source VARCHAR(100), -- description of source
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Plant models (admin managed)
CREATE TABLE IF NOT EXISTS plant_models (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  growth_time INTEGER NOT NULL, -- in seconds
  harvest_value DECIMAL(10, 2) NOT NULL,
  seed_cost DECIMAL(10, 2) NOT NULL,
  image_url VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User farm slots (10x10 grid per user)
CREATE TABLE IF NOT EXISTS farm_slots (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  slot_x INTEGER NOT NULL CHECK (slot_x >= 0 AND slot_x < 10),
  slot_y INTEGER NOT NULL CHECK (slot_y >= 0 AND slot_y < 10),
  plant_model_id INTEGER REFERENCES plant_models(id) ON DELETE SET NULL,
  planted_at TIMESTAMP,
  harvest_ready_at TIMESTAMP,
  is_harvested BOOLEAN DEFAULT FALSE,
  UNIQUE(user_id, slot_x, slot_y)
);

-- Caro game stats per user
CREATE TABLE IF NOT EXISTS caro_stats (
  id SERIAL PRIMARY KEY,
  user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  games_played INTEGER DEFAULT 0,
  games_won INTEGER DEFAULT 0,
  level INTEGER DEFAULT 1,
  total_earnings DECIMAL(15, 2) DEFAULT 0.00
);

-- Caro game rooms
CREATE TABLE IF NOT EXISTS caro_rooms (
  id SERIAL PRIMARY KEY,
  room_code VARCHAR(20) UNIQUE NOT NULL,
  player1_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  player2_id INTEGER,
  bet_amount DECIMAL(10, 2) NOT NULL,
  status VARCHAR(20) DEFAULT 'waiting', -- waiting, playing, finished
  winner_id INTEGER REFERENCES users(id),
  board_state TEXT, -- JSON string of board state
  current_turn INTEGER, -- 1 or 2
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  finished_at TIMESTAMP
);

-- Chat messages (direct messages)
CREATE TABLE IF NOT EXISTS chat_messages (
  id SERIAL PRIMARY KEY,
  sender_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  receiver_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Caro room chat messages
CREATE TABLE IF NOT EXISTS caro_room_messages (
  id SERIAL PRIMARY KEY,
  room_id INTEGER REFERENCES caro_rooms(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_friendships_user_id ON friendships(user_id);
CREATE INDEX IF NOT EXISTS idx_friendships_friend_id ON friendships(friend_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_farm_slots_user_id ON farm_slots(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender ON chat_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_receiver ON chat_messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_caro_rooms_status ON caro_rooms(status);
