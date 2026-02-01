import { createServerClient } from './supabase.js';

export type BalanceRow = {
  id: string;
  user_id: string;
  usdc_available: string;
  usdc_locked: string;
  yes_available: string;
  yes_locked: string;
  no_available: string;
  no_locked: string;
};

export async function getOrCreateBalance(userId: string) {
  const supabase = createServerClient();
  const { data: existing } = await supabase
    .from('user_balances')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (existing) {
    return existing as BalanceRow;
  }

  const { data, error } = await supabase
    .from('user_balances')
    .insert({ user_id: userId })
    .select()
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Failed to initialize user balance');
  }

  return data as BalanceRow;
}

function asBigint(value: string | number | null | undefined) {
  return BigInt(value || 0);
}

/**
 * Lock funds for a new order using database transaction
 * This ensures atomic balance update with proper locking
 */
export async function lockFundsForOrder({
  userId,
  outcomeType,
  side,
  amount,
  price,
}: {
  userId: string;
  outcomeType: 'yes' | 'no';
  side: 'buy' | 'sell';
  amount: bigint;
  price: bigint;
}) {
  const supabase = createServerClient();
  
  // Use database function for atomic operation
  const { data, error } = await supabase.rpc('lock_funds_for_order', {
    p_user_id: userId,
    p_outcome_type: outcomeType,
    p_side: side,
    p_amount: amount.toString(),
    p_price: Number(price) / 1_000_000,  // Convert to decimal
  });
  
  if (error) {
    throw new Error(`Failed to lock funds: ${error.message}`);
  }
  
  const result = data as { success: boolean; error?: string };
  if (!result.success) {
    throw new Error(result.error || 'Failed to lock funds');
  }
}

// Note: applyFill was removed - use matching-engine.ts applyFillWithTransaction instead

/**
 * Unlock funds when an order is cancelled
 */
export async function unlockForOrder({
  userId,
  outcomeType,
  side,
  remainingAmount,
  price,
}: {
  userId: string;
  outcomeType: 'yes' | 'no';
  side: 'buy' | 'sell';
  remainingAmount: bigint;
  price: bigint;
}) {
  const supabase = createServerClient();
  
  // Use database function for atomic operation
  const { data, error } = await supabase.rpc('unlock_cancelled_order', {
    p_user_id: userId,
    p_outcome_type: outcomeType,
    p_side: side,
    p_remaining_amount: remainingAmount.toString(),
    p_price: Number(price) / 1_000_000,
  });
  
  if (error) {
    throw new Error(`Failed to unlock funds: ${error.message}`);
  }
  
  const result = data as { success: boolean; error?: string };
  if (!result.success) {
    throw new Error(result.error || 'Failed to unlock funds');
  }
}

/**
 * Get user's current balance
 */
export async function getUserBalance(userId: string): Promise<{
  usdcAvailable: bigint;
  usdcLocked: bigint;
  yesAvailable: bigint;
  yesLocked: bigint;
  noAvailable: bigint;
  noLocked: bigint;
}> {
  const balance = await getOrCreateBalance(userId);
  
  return {
    usdcAvailable: asBigint(balance.usdc_available),
    usdcLocked: asBigint(balance.usdc_locked),
    yesAvailable: asBigint(balance.yes_available),
    yesLocked: asBigint(balance.yes_locked),
    noAvailable: asBigint(balance.no_available),
    noLocked: asBigint(balance.no_locked),
  };
}

/**
 * Deposit USDC to user's available balance
 */
export async function depositUsdc(userId: string, amount: bigint): Promise<void> {
  const supabase = createServerClient();
  
  // Ensure balance exists
  const balance = await getOrCreateBalance(userId);
  
  // Try RPC first
  const { error } = await supabase.rpc('deposit_usdc_balance', {
    p_user_id: userId,
    p_amount: amount.toString(),
  });
  
  // Fallback if RPC doesn't exist - use direct update
  if (error?.code === 'PGRST202') {
    const currentBalance = asBigint(balance.usdc_available);
    const newBalance = (currentBalance + amount).toString();
    
    const { error: updateError } = await supabase
      .from('user_balances')
      .update({
        usdc_available: newBalance,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);
    
    if (updateError) {
      throw new Error(`Failed to deposit USDC: ${updateError.message}`);
    }
  } else if (error) {
    throw new Error(`Failed to deposit USDC: ${error.message}`);
  }
}

/**
 * Withdraw USDC from user's available balance
 */
export async function withdrawUsdc(userId: string, amount: bigint): Promise<void> {
  const supabase = createServerClient();
  const balance = await getOrCreateBalance(userId);
  
  if (asBigint(balance.usdc_available) < amount) {
    throw new Error('Insufficient USDC balance');
  }
  
  const { error } = await supabase
    .from('user_balances')
    .update({
      usdc_available: (asBigint(balance.usdc_available) - amount).toString(),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);
  
  if (error) {
    throw new Error(`Failed to withdraw USDC: ${error.message}`);
  }
}
