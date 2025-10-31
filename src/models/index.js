// Models index file - exports all models for easy importing

const User = require('./User')
const Wallet = require('./Wallet')
const Transaction = require('./Transaction')
const Friendship = require('./Friendship')
const PlantModel = require('./PlantModel')
const FarmSlot = require('./FarmSlot')
const CaroStats = require('./CaroStats')
const CaroRoom = require('./CaroRoom')
const CaroGame = require('./CaroGame')
const CaroMove = require('./CaroMove')
const ChatMessage = require('./ChatMessage')
const CaroRoomMessage = require('./CaroRoomMessage')

module.exports = {
  User,
  Wallet,
  Transaction,
  Friendship,
  PlantModel,
  FarmSlot,
  CaroStats,
  CaroRoom,
  CaroGame,
  CaroMove,
  ChatMessage,
  CaroRoomMessage
}