-- Add time control fields to caro_games
ALTER TABLE caro_games 
ADD COLUMN IF NOT EXISTS time_limit_minutes INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS player1_time_left INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS player2_time_left INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS last_move_time TIMESTAMP DEFAULT NULL,
ADD COLUMN IF NOT EXISTS current_player_count INTEGER DEFAULT 0;

-- Add index for faster queries (with IF NOT EXISTS check)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_caro_rooms_status') THEN
    CREATE INDEX idx_caro_rooms_status ON caro_rooms(status);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_caro_games_room_id') THEN
    CREATE INDEX idx_caro_games_room_id ON caro_games(room_id);
  END IF;
END $$;

COMMENT ON COLUMN caro_games.time_limit_minutes IS 'Time limit per player in minutes. NULL means no time limit.';
COMMENT ON COLUMN caro_games.player1_time_left IS 'Remaining time for player 1 in seconds. NULL means no time limit.';
COMMENT ON COLUMN caro_games.player2_time_left IS 'Remaining time for player 2 in seconds. NULL means no time limit.';
COMMENT ON COLUMN caro_games.last_move_time IS 'Timestamp of the last move made';
COMMENT ON COLUMN caro_games.current_player_count IS 'Number of players currently in the room';
