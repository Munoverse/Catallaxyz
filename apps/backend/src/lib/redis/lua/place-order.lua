--[[
  Place Order - Atomic order placement and matching
  
  KEYS:
    1. bal:{userId} - User balance hash
    2. order:{orderId} - Order details hash
    3. ob:{marketId}:{outcome}:bids - Bid orderbook sorted set
    4. ob:{marketId}:{outcome}:asks - Ask orderbook sorted set
    5. user:{userId}:orders - User orders set
  
  ARGV:
    1. orderId
    2. userId
    3. marketId
    4. outcomeType (yes/no)
    5. side (buy/sell)
    6. orderType (limit/market)
    7. price (scaled by 1e6)
    8. amount (in lamports)
    9. timestamp
    10. clientOrderId (optional)
    
  RETURNS:
    JSON object with:
    - success: boolean
    - orderId: string
    - status: 'open' | 'partial' | 'filled' | 'rejected'
    - filledAmount: number
    - remainingAmount: number
    - fills: array of {makerOrderId, price, size, timestamp}
    - error: string (if failed)
--]]

local balKey = KEYS[1]
local orderKey = KEYS[2]
local bidsKey = KEYS[3]
local asksKey = KEYS[4]
local userOrdersKey = KEYS[5]

local orderId = ARGV[1]
local userId = ARGV[2]
local marketId = ARGV[3]
local outcomeType = ARGV[4]
local side = ARGV[5]
local orderType = ARGV[6]
local price = tonumber(ARGV[7])
local amount = tonumber(ARGV[8])
local timestamp = ARGV[9]
local clientOrderId = ARGV[10]

-- Helper function to return error
local function returnError(msg)
  return cjson.encode({
    success = false,
    error = msg
  })
end

-- Helper function to calculate required funds for buy order
local function calcRequiredFunds(amt, prc)
  return math.floor(amt * prc / 1000000)
end

-- Get user balance
local balance = redis.call('HGETALL', balKey)
local balanceMap = {}
for i = 1, #balance, 2 do
  balanceMap[balance[i]] = tonumber(balance[i + 1]) or 0
end

-- Initialize balance if not exists
if next(balanceMap) == nil then
  balanceMap = {
    usdc_available = 0,
    usdc_locked = 0,
    yes_available = 0,
    yes_locked = 0,
    no_available = 0,
    no_locked = 0
  }
end

-- Check and lock funds based on side
local requiredFunds
local lockField
local availableField

if side == 'buy' then
  -- Buying: lock USDC
  requiredFunds = calcRequiredFunds(amount, price)
  lockField = 'usdc_locked'
  availableField = 'usdc_available'
  
  if (balanceMap[availableField] or 0) < requiredFunds then
    return returnError('Insufficient USDC balance: available=' .. tostring(balanceMap[availableField] or 0) .. ', required=' .. tostring(requiredFunds))
  end
else
  -- Selling: lock outcome tokens
  requiredFunds = amount
  lockField = outcomeType .. '_locked'
  availableField = outcomeType .. '_available'
  
  if (balanceMap[availableField] or 0) < requiredFunds then
    return returnError('Insufficient ' .. outcomeType:upper() .. ' balance: available=' .. tostring(balanceMap[availableField] or 0) .. ', required=' .. tostring(requiredFunds))
  end
end

-- Lock the funds
redis.call('HINCRBY', balKey, availableField, -requiredFunds)
redis.call('HINCRBY', balKey, lockField, requiredFunds)

-- Store order details
redis.call('HSET', orderKey,
  'id', orderId,
  'user_id', userId,
  'market_id', marketId,
  'outcome_type', outcomeType,
  'side', side,
  'order_type', orderType,
  'price', price,
  'amount', amount,
  'filled_amount', 0,
  'remaining_amount', amount,
  'status', 'open',
  'created_at', timestamp,
  'client_order_id', clientOrderId or ''
)

-- Add to user's orders set
redis.call('SADD', userOrdersKey, orderId)

-- Try to match against opposite side
local oppositeKey = side == 'buy' and asksKey or bidsKey
local fills = {}
local filledAmount = 0
local remainingAmount = amount

-- Get potential matching orders
-- For buy: get asks with price <= our price (lowest first)
-- For sell: get bids with price >= our price (highest first)
local matchingOrders
if side == 'buy' then
  -- Get asks with score (price) <= our price
  matchingOrders = redis.call('ZRANGEBYSCORE', oppositeKey, '-inf', price, 'WITHSCORES')
else
  -- Get bids with score (negative price) >= -our price (meaning price >= our price)
  matchingOrders = redis.call('ZRANGEBYSCORE', oppositeKey, '-inf', -price, 'WITHSCORES')
end

-- Process matches
local i = 1
while i <= #matchingOrders and remainingAmount > 0 do
  local makerOrderId = matchingOrders[i]
  local makerScore = tonumber(matchingOrders[i + 1])
  local makerPrice = side == 'buy' and makerScore or -makerScore
  
  -- Get maker order details
  local makerOrder = redis.call('HGETALL', 'order:' .. makerOrderId)
  local makerMap = {}
  for j = 1, #makerOrder, 2 do
    makerMap[makerOrder[j]] = makerOrder[j + 1]
  end
  
  if next(makerMap) ~= nil and tonumber(makerMap['remaining_amount']) > 0 then
    local makerRemaining = tonumber(makerMap['remaining_amount'])
    local executionPrice = makerPrice  -- Price-time priority: use maker's price
    
    -- Calculate fill size
    local fillSize = math.min(remainingAmount, makerRemaining)
    
    -- Record fill
    table.insert(fills, {
      makerOrderId = makerOrderId,
      makerUserId = makerMap['user_id'],
      price = executionPrice,
      size = fillSize,
      timestamp = timestamp
    })
    
    -- Update maker order
    local newMakerRemaining = makerRemaining - fillSize
    local newMakerFilled = tonumber(makerMap['filled_amount'] or 0) + fillSize
    local makerStatus = newMakerRemaining == 0 and 'filled' or 'partial'
    
    redis.call('HSET', 'order:' .. makerOrderId,
      'filled_amount', newMakerFilled,
      'remaining_amount', newMakerRemaining,
      'status', makerStatus
    )
    
    -- Remove from orderbook if fully filled
    if newMakerRemaining == 0 then
      redis.call('ZREM', oppositeKey, makerOrderId)
    end
    
    -- Update maker balance (they receive opposite of what taker gets)
    local makerBalKey = 'bal:' .. makerMap['user_id']
    if side == 'buy' then
      -- Taker buying, maker selling: maker gets USDC, loses locked tokens
      local makerTokenField = outcomeType .. '_locked'
      local fillCost = calcRequiredFunds(fillSize, executionPrice)
      redis.call('HINCRBY', makerBalKey, makerTokenField, -fillSize)
      redis.call('HINCRBY', makerBalKey, 'usdc_available', fillCost)
    else
      -- Taker selling, maker buying: maker gets tokens, loses locked USDC
      local fillCost = calcRequiredFunds(fillSize, executionPrice)
      redis.call('HINCRBY', makerBalKey, 'usdc_locked', -fillCost)
      redis.call('HINCRBY', makerBalKey, outcomeType .. '_available', fillSize)
    end
    
    -- Update taker balance for this fill
    if side == 'buy' then
      -- Taker buying: loses USDC, gains tokens
      local fillCost = calcRequiredFunds(fillSize, executionPrice)
      redis.call('HINCRBY', balKey, 'usdc_locked', -fillCost)
      redis.call('HINCRBY', balKey, outcomeType .. '_available', fillSize)
    else
      -- Taker selling: loses tokens, gains USDC
      local fillCost = calcRequiredFunds(fillSize, executionPrice)
      redis.call('HINCRBY', balKey, outcomeType .. '_locked', -fillSize)
      redis.call('HINCRBY', balKey, 'usdc_available', fillCost)
    end
    
    filledAmount = filledAmount + fillSize
    remainingAmount = remainingAmount - fillSize
  end
  
  i = i + 2
end

-- Determine final order status
local status
if remainingAmount == 0 then
  status = 'filled'
elseif filledAmount > 0 then
  status = 'partial'
else
  status = 'open'
end

-- Update taker order
redis.call('HSET', orderKey,
  'filled_amount', filledAmount,
  'remaining_amount', remainingAmount,
  'status', status
)

-- Add to orderbook if not fully filled (limit orders only)
if remainingAmount > 0 and orderType == 'limit' then
  local targetKey = side == 'buy' and bidsKey or asksKey
  local score = side == 'buy' and -price or price
  redis.call('ZADD', targetKey, score, orderId)
end

-- If market order and not fully filled, cancel remainder
if orderType == 'market' and remainingAmount > 0 then
  status = filledAmount > 0 and 'partial' or 'cancelled'
  redis.call('HSET', orderKey, 'status', status)
  
  -- Unlock remaining funds
  if side == 'buy' then
    local unlockAmount = calcRequiredFunds(remainingAmount, price)
    redis.call('HINCRBY', balKey, 'usdc_locked', -unlockAmount)
    redis.call('HINCRBY', balKey, 'usdc_available', unlockAmount)
  else
    redis.call('HINCRBY', balKey, outcomeType .. '_locked', -remainingAmount)
    redis.call('HINCRBY', balKey, outcomeType .. '_available', remainingAmount)
  end
end

-- Publish fills to stream for persistence
for _, fill in ipairs(fills) do
  redis.call('XADD', 'stream:fills', '*',
    'taker_order_id', orderId,
    'maker_order_id', fill.makerOrderId,
    'taker_user_id', userId,
    'maker_user_id', fill.makerUserId,
    'market_id', marketId,
    'outcome_type', outcomeType,
    'side', side,
    'price', fill.price,
    'size', fill.size,
    'timestamp', fill.timestamp
  )
end

-- Publish order event
redis.call('XADD', 'stream:orders', '*',
  'order_id', orderId,
  'user_id', userId,
  'market_id', marketId,
  'outcome_type', outcomeType,
  'side', side,
  'order_type', orderType,
  'price', price,
  'amount', amount,
  'filled_amount', filledAmount,
  'remaining_amount', remainingAmount,
  'status', status,
  'timestamp', timestamp
)

return cjson.encode({
  success = true,
  orderId = orderId,
  status = status,
  filledAmount = filledAmount,
  remainingAmount = remainingAmount,
  fills = fills
})
