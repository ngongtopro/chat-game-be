-- Add description column to transactions table
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS description TEXT;

-- Add index for better performance
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at DESC);
