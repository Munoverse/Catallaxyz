--[[
  Cancel All Orders - Batch cancel all user orders for a market
  
  KEYS:
    1. user:{userId}:orders - User orders set
    2. bal:{userId} - User balance hash
  
  ARGV:
    1. userId
    2. marketId
    3. outcomeType (optional, empty string for all)
    4. timestamp
    
  RETURNS:
    JSON object with:
    - success: boolean
    - cancelledCount: number
    - totalUnlocked: number
    - error: string (if failed)
--]]

local userOrdersKey = KEYS[1]
local balKey = KEYS[2]

local userId = ARGV[1]
local marketId = ARGV[2]
local outcomeType = ARGV[3]
local timestamp = ARGV[4]

-- Get all user's orders
local orderIds = redis.call('SMEMBERS', userOrdersKey)

local cancelledCount = 0
local totalUsdcUnlocked = 0
local totalYesUnlocked = 0
local totalNoUnlocked = 0

for _, orderId in ipairs(orderIds) do
  local orderKey = 'order:' .. orderId
  local orderData = redis.call('HGETALL', orderKey)
  
  if #orderData > 0 then
    local order = {}
    for i = 1, #orderData, 2 do
      order[orderData[i]] = orderData[i + 1]
    end
    
    -- Check if order matches criteria
    local matches = order['market_id'] == marketId
    if outcomeType ~= '' then
      matches = matches and order['outcome_type'] == outcomeType
    end
    
    -- Check if cancellable
    local status = order['status']
    local cancellable = status == 'open' or status == 'partial'
    
    if matches and cancellable then
      local side = order['side']
      local ot = order['outcome_type']
      local price = tonumber(order['price'])
      local remainingAmount = tonumber(order['remaining_amount'])
      
      -- Calculate unlock amount
      local unlockAmount
      if side == 'buy' then
        unlockAmount = math.floor(remainingAmount * price / 1000000)
        totalUsdcUnlocked = totalUsdcUnlocked + unlockAmount
        redis.call('HINCRBY', balKey, 'usdc_locked', -unlockAmount)
        redis.call('HINCRBY', balKey, 'usdc_available', unlockAmount)
      else
        unlockAmount = remainingAmount
        if ot == 'yes' then
          totalYesUnlocked = totalYesUnlocked + unlockAmount
          redis.call('HINCRBY', balKey, 'yes_locked', -unlockAmount)
          redis.call('HINCRBY', balKey, 'yes_available', unlockAmount)
        else
          totalNoUnlocked = totalNoUnlocked + unlockAmount
          redis.call('HINCRBY', balKey, 'no_locked', -unlockAmount)
          redis.call('HINCRBY', balKey, 'no_available', unlockAmount)
        end
      end
      
      -- Remove from orderbook
      local bidsKey = 'ob:' .. marketId .. ':' .. ot .. ':bids'
      local asksKey = 'ob:' .. marketId .. ':' .. ot .. ':asks'
      local orderbookKey = side == 'buy' and bidsKey or asksKey
      redis.call('ZREM', orderbookKey, orderId)
      
      -- Update order status
      redis.call('HSET', orderKey,
        'status', 'cancelled',
        'cancelled_at', timestamp,
        'remaining_amount', 0
      )
      
      cancelledCount = cancelledCount + 1
      
      -- Publish order update
      redis.call('XADD', 'stream:orders', '*',
        'order_id', orderId,
        'user_id', userId,
        'market_id', marketId,
        'outcome_type', ot,
        'side', side,
        'status', 'cancelled',
        'timestamp', timestamp
      )
    end
  end
end

return cjson.encode({
  success = true,
  cancelledCount = cancelledCount,
  totalUnlocked = {
    usdc = totalUsdcUnlocked,
    yes = totalYesUnlocked,
    no = totalNoUnlocked
  }
})
