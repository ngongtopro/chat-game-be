-- Migration: Restructure Caro game tables
-- This adds caro_games and caro_moves tables to separate game logic from rooms

-- Drop existing constraints and modify caro_rooms table
ALTER TABLE caro_rooms DROP COLUMN IF EXISTS player1_id CASCADE;
ALTER TABLE caro_rooms DROP COLUMN IF EXISTS player2_id CASCADE;
ALTER TABLE caro_rooms DROP COLUMN IF EXISTS bet_amount CASCADE;
ALTER TABLE caro_rooms DROP COLUMN IF EXISTS winner_id CASCADE;
ALTER TABLE caro_rooms DROP COLUMN IF EXISTS board_state CASCADE;
ALTER TABLE caro_rooms DROP COLUMN IF EXISTS current_turn CASCADE;

-- Caro game rooms (simplified - only room management)
-- Keeping existing caro_rooms but simplified structure
ALTER TABLE caro_rooms 
  ALTER COLUMN status SET DEFAULT 'waiting';

-- Add finished_at if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'caro_rooms' AND column_name = 'finished_at'
  ) THEN
    ALTER TABLE caro_rooms ADD COLUMN finished_at TIMESTAMP;
  END IF;
END $$;

-- Caro games table (individual game instances within a room)
CREATE TABLE IF NOT EXISTS caro_games (
  id SERIAL PRIMARY KEY,
  room_id INTEGER REFERENCES caro_rooms(id) ON DELETE CASCADE,
  player1_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  player2_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  current_player INTEGER, -- 1 or 2
  status VARCHAR(20) DEFAULT 'playing', -- playing, finished, draw
  winner_id INTEGER REFERENCES users(id),
  bet_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  board_size INTEGER DEFAULT 15 CHECK (board_size >= 5 AND board_size <= 50),
  win_condition INTEGER DEFAULT 5 CHECK (win_condition >= 3 AND win_condition <= 10),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  finished_at TIMESTAMP
);

-- Caro moves table (individual moves in a game)
CREATE TABLE IF NOT EXISTS caro_moves (
  id SERIAL PRIMARY KEY,
  game_id INTEGER REFERENCES caro_games(id) ON DELETE CASCADE,
  player_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  row INTEGER NOT NULL,
  col INTEGER NOT NULL,
  move_number INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_move_position UNIQUE(game_id, row, col),
  CONSTRAINT valid_position CHECK (row >= 0 AND col >= 0)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_caro_games_room_id ON caro_games(room_id);
CREATE INDEX IF NOT EXISTS idx_caro_games_player1 ON caro_games(player1_id);
CREATE INDEX IF NOT EXISTS idx_caro_games_player2 ON caro_games(player2_id);
CREATE INDEX IF NOT EXISTS idx_caro_games_status ON caro_games(status);
CREATE INDEX IF NOT EXISTS idx_caro_moves_game_id ON caro_moves(game_id);
CREATE INDEX IF NOT EXISTS idx_caro_moves_move_number ON caro_moves(game_id, move_number);

-- Add comments for documentation
COMMENT ON TABLE caro_rooms IS 'Caro game rooms - persistent containers that can host multiple games';
COMMENT ON TABLE caro_games IS 'Individual Caro game instances - each game is a match between two players';
COMMENT ON TABLE caro_moves IS 'Individual moves in a Caro game - complete move history for replay and analysis';

COMMENT ON COLUMN caro_games.board_size IS 'Size of the game board (e.g., 15 for 15x15, 20 for 20x20)';
COMMENT ON COLUMN caro_games.win_condition IS 'Number of consecutive marks needed to win (typically 5)';
COMMENT ON COLUMN caro_moves.move_number IS 'Sequential move number starting from 1';
