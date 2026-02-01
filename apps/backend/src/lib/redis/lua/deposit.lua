--[[
  Deposit - Add USDC to user balance
  
  KEYS:
    1. bal:{userId} - User balance hash
  
  ARGV:
    1. userId
    2. amount (in lamports)
    3. transactionSignature
    4. timestamp
    
  RETURNS:
    JSON object with:
    - success: boolean
    - newBalance: number
    - error: string (if failed)
--]]

local balKey = KEYS[1]

local userId = ARGV[1]
local amount = tonumber(ARGV[2])
local txSignature = ARGV[3]
local timestamp = ARGV[4]

if amount <= 0 then
  return cjson.encode({
    success = false,
    error = 'Amount must be positive'
  })
end

-- Initialize balance if not exists
local exists = redis.call('EXISTS', balKey)
if exists == 0 then
  redis.call('HSET', balKey,
    'usdc_available', 0,
    'usdc_locked', 0,
    'yes_available', 0,
    'yes_locked', 0,
    'no_available', 0,
    'no_locked', 0
  )
end

-- Add to available USDC
local newBalance = redis.call('HINCRBY', balKey, 'usdc_available', amount)

-- Record deposit event
redis.call('XADD', 'stream:deposits', '*',
  'user_id', userId,
  'amount', amount,
  'tx_signature', txSignature,
  'timestamp', timestamp,
  'new_balance', newBalance
)

return cjson.encode({
  success = true,
  newBalance = newBalance
})
