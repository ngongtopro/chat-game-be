const { pgTable, serial, varchar, timestamp, integer, decimal, text, boolean, jsonb, unique } = require('drizzle-orm/pg-core');
const { relations } = require('drizzle-orm');

// Users table
const users = pgTable('users', {
  id: serial('id').primaryKey(),
  username: varchar('username', { length: 50 }).notNull().unique(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  type: varchar('type', { length: 20 }).default('regular').notNull(),
  avatarUrl: varchar('avatar_url', { length: 500 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
});

// Friendships table
const friendships = pgTable('friendships', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  friendId: integer('friend_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 20 }).default('pending').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull()
}, (table) => ({
  uniqueFriendship: unique().on(table.userId, table.friendId)
}));

// Wallets table
const wallets = pgTable('wallets', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  balance: decimal('balance', { precision: 15, scale: 2 }).default('0.00').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
});

// Transactions table
const transactions = pgTable('transactions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  type: varchar('type', { length: 50 }).notNull(),
  source: varchar('source', { length: 100 }),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull()
});

// Plant models table
const plantModels = pgTable('plant_models', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  growthTime: integer('growth_time').notNull(),
  harvestValue: decimal('harvest_value', { precision: 10, scale: 2 }).notNull(),
  seedCost: decimal('seed_cost', { precision: 10, scale: 2 }).notNull(),
  imageUrl: varchar('image_url', { length: 500 }),
  createdAt: timestamp('created_at').defaultNow().notNull()
});

// Farm slots table
const farmSlots = pgTable('farm_slots', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  slotIndex: integer('slot_index').notNull(),
  plantModelId: integer('plant_model_id').references(() => plantModels.id, { onDelete: 'set null' }),
  plantedAt: timestamp('planted_at'),
  harvestableAt: timestamp('harvestable_at'),
  status: varchar('status', { length: 20 }).default('empty').notNull()
}, (table) => ({
  uniqueUserSlot: unique().on(table.userId, table.slotIndex)
}));

// Chat messages table
const chatMessages = pgTable('chat_messages', {
  id: serial('id').primaryKey(),
  chatId: integer('chat_id').notNull(),
  senderId: integer('sender_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  message: text('message').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull()
});

// Caro rooms table
const caroRooms = pgTable('caro_rooms', {
  id: serial('id').primaryKey(),
  roomCode: varchar('room_code', { length: 20 }).notNull().unique(),
  status: varchar('status', { length: 20 }).default('waiting').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  finishedAt: timestamp('finished_at')
});

// Caro games table
const caroGames = pgTable('caro_games', {
  id: serial('id').primaryKey(),
  roomId: integer('room_id').notNull().references(() => caroRooms.id, { onDelete: 'cascade' }),
  player1Id: integer('player1_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  player2Id: integer('player2_id').references(() => users.id, { onDelete: 'cascade' }),
  player1Ready: boolean('player1_ready').default(false).notNull(),
  player2Ready: boolean('player2_ready').default(false).notNull(),
  winnerId: integer('winner_id').references(() => users.id, { onDelete: 'set null' }),
  betAmount: decimal('bet_amount', { precision: 10, scale: 2 }).notNull(),
  boardState: jsonb('board_state').default({}).notNull(),
  currentPlayer: integer('current_player').default(1).notNull(),
  status: varchar('status', { length: 20 }).default('waiting').notNull(),
  timeLimitMinutes: integer('time_limit_minutes'),
  player1TimeLeft: integer('player1_time_left'),
  player2TimeLeft: integer('player2_time_left'),
  lastMoveTime: timestamp('last_move_time'),
  currentPlayerCount: integer('current_player_count').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  finishedAt: timestamp('finished_at')
});

// Caro moves table
const caroMoves = pgTable('caro_moves', {
  id: serial('id').primaryKey(),
  gameId: integer('game_id').notNull().references(() => caroGames.id, { onDelete: 'cascade' }),
  playerId: integer('player_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  x: integer('x').notNull(),
  y: integer('y').notNull(),
  moveNumber: integer('move_number').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull()
});

// Caro room messages table
const caroRoomMessages = pgTable('caro_room_messages', {
  id: serial('id').primaryKey(),
  roomId: integer('room_id').notNull().references(() => caroRooms.id, { onDelete: 'cascade' }),
  senderId: integer('sender_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  message: text('message').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull()
});

// Caro stats table
const caroStats = pgTable('caro_stats', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  gamesPlayed: integer('games_played').default(0).notNull(),
  gamesWon: integer('games_won').default(0).notNull(),
  totalEarnings: decimal('total_earnings', { precision: 15, scale: 2 }).default('0.00').notNull(),
  level: integer('level').default(1).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
});

// Relations
const usersRelations = relations(users, ({ many, one }) => ({
  friendshipsInitiated: many(friendships, { relationName: 'userFriendships' }),
  friendshipsReceived: many(friendships, { relationName: 'friendFriendships' }),
  wallet: one(wallets, {
    fields: [users.id],
    references: [wallets.userId]
  }),
  transactions: many(transactions),
  farmSlots: many(farmSlots),
  chatMessages: many(chatMessages),
  caroGamesAsPlayer1: many(caroGames, { relationName: 'player1Games' }),
  caroGamesAsPlayer2: many(caroGames, { relationName: 'player2Games' }),
  caroMoves: many(caroMoves),
  caroRoomMessages: many(caroRoomMessages),
  caroStats: one(caroStats, {
    fields: [users.id],
    references: [caroStats.userId]
  })
}));

const caroRoomsRelations = relations(caroRooms, ({ one, many }) => ({
  game: one(caroGames, {
    fields: [caroRooms.id],
    references: [caroGames.roomId]
  }),
  messages: many(caroRoomMessages)
}));

const caroGamesRelations = relations(caroGames, ({ one, many }) => ({
  room: one(caroRooms, {
    fields: [caroGames.roomId],
    references: [caroRooms.id]
  }),
  player1: one(users, {
    fields: [caroGames.player1Id],
    references: [users.id],
    relationName: 'player1Games'
  }),
  player2: one(users, {
    fields: [caroGames.player2Id],
    references: [users.id],
    relationName: 'player2Games'
  }),
  winner: one(users, {
    fields: [caroGames.winnerId],
    references: [users.id]
  }),
  moves: many(caroMoves)
}));

module.exports = {
  users,
  friendships,
  wallets,
  transactions,
  plantModels,
  farmSlots,
  chatMessages,
  caroRooms,
  caroGames,
  caroMoves,
  caroRoomMessages,
  caroStats,
  usersRelations,
  caroRoomsRelations,
  caroGamesRelations
};
