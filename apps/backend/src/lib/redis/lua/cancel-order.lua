--[[
  Cancel Order - Atomic order cancellation and fund unlock
  
  KEYS:
    1. order:{orderId} - Order details hash
    2. bal:{userId} - User balance hash
    3. ob:{marketId}:{outcome}:bids - Bid orderbook sorted set
    4. ob:{marketId}:{outcome}:asks - Ask orderbook sorted set
    5. user:{userId}:orders - User orders set
  
  ARGV:
    1. orderId
    2. userId
    3. timestamp
    
  RETURNS:
    JSON object with:
    - success: boolean
    - orderId: string
    - unlockedAmount: number
    - error: string (if failed)
--]]

local orderKey = KEYS[1]
local balKey = KEYS[2]
local bidsKey = KEYS[3]
local asksKey = KEYS[4]
local userOrdersKey = KEYS[5]

local orderId = ARGV[1]
local userId = ARGV[2]
local timestamp = ARGV[3]

-- Helper function to return error
local function returnError(msg)
  return cjson.encode({
    success = false,
    error = msg
  })
end

-- Get order details
local orderData = redis.call('HGETALL', orderKey)
if #orderData == 0 then
  return returnError('Order not found')
end

local order = {}
for i = 1, #orderData, 2 do
  order[orderData[i]] = orderData[i + 1]
end

-- Verify ownership
if order['user_id'] ~= userId then
  return returnError('Not authorized to cancel this order')
end

-- Check if order is cancellable
local status = order['status']
if status == 'filled' or status == 'cancelled' then
  return returnError('Order cannot be cancelled (status: ' .. status .. ')')
end

local side = order['side']
local outcomeType = order['outcome_type']
local price = tonumber(order['price'])
local remainingAmount = tonumber(order['remaining_amount'])

-- Calculate amount to unlock
local unlockAmount
if side == 'buy' then
  -- Unlock USDC
  unlockAmount = math.floor(remainingAmount * price / 1000000)
  redis.call('HINCRBY', balKey, 'usdc_locked', -unlockAmount)
  redis.call('HINCRBY', balKey, 'usdc_available', unlockAmount)
else
  -- Unlock outcome tokens
  unlockAmount = remainingAmount
  local lockField = outcomeType .. '_locked'
  local availField = outcomeType .. '_available'
  redis.call('HINCRBY', balKey, lockField, -unlockAmount)
  redis.call('HINCRBY', balKey, availField, unlockAmount)
end

-- Remove from orderbook
local orderbookKey = side == 'buy' and bidsKey or asksKey
redis.call('ZREM', orderbookKey, orderId)

-- Update order status
redis.call('HSET', orderKey,
  'status', 'cancelled',
  'cancelled_at', timestamp,
  'remaining_amount', 0
)

-- Publish order update
redis.call('XADD', 'stream:orders', '*',
  'order_id', orderId,
  'user_id', userId,
  'market_id', order['market_id'],
  'outcome_type', outcomeType,
  'side', side,
  'status', 'cancelled',
  'timestamp', timestamp
)

return cjson.encode({
  success = true,
  orderId = orderId,
  unlockedAmount = unlockAmount
})
