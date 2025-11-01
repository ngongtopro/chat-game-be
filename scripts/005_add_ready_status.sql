-- Migration: Add ready status for players
-- This adds player1_ready and player2_ready fields to track when players are ready to start

-- Add ready status columns to caro_games table
ALTER TABLE caro_games 
  ADD COLUMN IF NOT EXISTS player1_ready BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS player2_ready BOOLEAN DEFAULT FALSE;

-- Update existing games to set ready status based on game status
UPDATE caro_games 
SET player1_ready = TRUE, player2_ready = TRUE 
WHERE status = 'playing' OR status = 'finished';

-- Add comments for documentation
COMMENT ON COLUMN caro_games.player1_ready IS 'Whether player 1 is ready to start the game';
COMMENT ON COLUMN caro_games.player2_ready IS 'Whether player 2 is ready to start the game';
