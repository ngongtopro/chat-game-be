-- Add betAmount, maxUsers and currentUsers to caro_rooms table
ALTER TABLE caro_rooms
ADD COLUMN IF NOT EXISTS bet_amount DECIMAL(10, 2) DEFAULT 0.00 NOT NULL,
ADD COLUMN IF NOT EXISTS max_users INTEGER DEFAULT 2 NOT NULL,
ADD COLUMN IF NOT EXISTS current_users JSONB DEFAULT '[]'::jsonb NOT NULL;

-- Add index for better performance
CREATE INDEX IF NOT EXISTS idx_caro_rooms_status ON caro_rooms(status);
CREATE INDEX IF NOT EXISTS idx_caro_rooms_current_users ON caro_rooms USING gin(current_users);
