use anchor_lang::prelude::*;
use crate::constants::MAX_OUTCOME_TOKENS;

#[account]
pub struct Market {
    pub creator: Pubkey,
    pub global: Pubkey,
    /// Unique market identifier (per creator)
    pub market_id: [u8; 32],
    /// Market creation timestamp (unix seconds)
    pub created_at: i64,
    /// Last market activity timestamp (unix seconds)
    /// Updated on each order/swap; used for inactivity-based termination.
    pub last_activity_ts: i64,
    /// Market status:
    /// 0: Active - market is active and trading
    /// 1: Settled - market has been settled (outcome determined)
    /// 4: Terminated - market terminated due to inactivity (7 days)
    pub status: u8,
    pub switchboard_queue: Pubkey,
    /// Fixed Switchboard randomness account for this market
    pub randomness_account: Pubkey,
    
    // CTF Protocol fields - Binary market tokens
    /// Binary outcome token mints (fixed-size array)
    /// For binary markets: [YES, NO, default, default, ...]
    /// Only first 2 slots are used for binary markets
    /// 
    /// Benefits of fixed arrays:
    /// 1. Predictable rent cost (no account reallocation needed)
    /// 2. Faster serialization/deserialization
    /// 3. Better safety (compile-time bounds checking)
    pub outcome_token_mints: [Pubkey; MAX_OUTCOME_TOKENS],

    // ============================================
    // Collateral & Position Supply Tracking
    // ============================================
    /// Total USDC collateral backing YES/NO positions
    pub total_position_collateral: u64,
    /// Total YES supply (1 YES minted per 1 USDC split)
    pub total_yes_supply: u64,
    /// Total NO supply (1 NO minted per 1 USDC split)
    pub total_no_supply: u64,
    /// Total redeemable USDC locked at settlement/termination
    pub total_redeemable_usdc: u64,
    /// Total USDC already redeemed
    pub total_redeemed_usdc: u64,
    
    pub last_trade_outcome: Option<u8>, // Last winning outcome
    pub reference_agent: Option<Pubkey>, // Last trader (reference agent)
    pub total_trades: u64, // Total number of trades recorded

    // ============================================
    // Last-trade metadata (for inactivity termination)
    // ============================================
    /// Last observed trade/order slot (best-effort; may be None for brand-new markets)
    pub last_trade_slot: Option<u64>,
    /// Last observed YES price (scaled by 10^6, 0-1_000_000)
    pub last_trade_yes_price: Option<u64>,
    /// Last observed NO price (scaled by 10^6, 0-1_000_000)
    pub last_trade_no_price: Option<u64>,
    
    // ============================================
    // Random Termination Fields
    // ============================================
    /// Whether random termination is enabled (enabled by default)
    pub random_termination_enabled: bool,
    /// Termination probability per trade (scaled by 10^6, e.g., 1000 = 0.1%)
    pub termination_probability: u32,
    /// Whether market has been randomly terminated
    pub is_randomly_terminated: bool,
    /// Final YES price when terminated (scaled by 10^6)
    pub final_yes_price: Option<u64>,
    /// Final NO price when terminated (scaled by 10^6)
    pub final_no_price: Option<u64>,
    /// Can users redeem tokens (after termination)
    pub can_redeem: bool,
    /// Trade that triggered termination
    pub termination_trade_slot: Option<u64>,
    
    // ============================================
    // VRF Uniqueness Fields (Per-trade unique randomness)
    // ============================================
    /// Trade nonce - incremented on each trade that opts for VRF check
    /// Used to ensure unique randomness: hash(vrf_value, market, user, nonce, slot)
    pub trade_nonce: u64,
    
    // ============================================
    // Creator Incentive Tracking
    // Fee rates are read from Global account (see Global.calculate_taker_fee_rate())
    // ============================================
    
    /// Accrued creator incentive amount (USDC lamports)
    /// Tracks 5% of taker fees allocated to market creator
    pub creator_incentive_accrued: u64,
    
    // ============================================
    // Admin Controls
    // ============================================
    /// Whether market is paused by admin (emergency stop)
    pub is_paused: bool,
    /// Timestamp when market was paused
    pub paused_at: Option<i64>,
    
    pub bump: u8,
}

/// Market status constants
pub mod market_status {
    pub const ACTIVE: u8 = 0;
    pub const SETTLED: u8 = 1;
    pub const TERMINATED: u8 = 4;
}

impl Market {
    // Space calculation - Binary market only (optimized)
    // discriminator(8) + creator(32) + global(32) + market_id(32) + created_at(8) + last_activity_ts(8) + status(1)
    // + switchboard_queue(32) + randomness_account(32)
    // + outcome_token_mints: [Pubkey; 20] (32 * 20 = 640)
    // + total_position_collateral(8) + total_yes_supply(8) + total_no_supply(8)
    // + total_redeemable_usdc(8) + total_redeemed_usdc(8)
    // + last_trade_outcome(1+1)
    // + reference_agent(1+32) + total_trades(8)
    // + last_trade_slot(1+8) + last_trade_yes_price(1+8) + last_trade_no_price(1+8)
    // + random_termination_enabled(1) + termination_probability(4) + is_randomly_terminated(1)
    // + final_yes_price(1+8) + final_no_price(1+8) + can_redeem(1) + termination_trade_slot(1+8)
    // + trade_nonce(8)
    // + creator_incentive_accrued(8) [fee rates moved to Global]
    // + is_paused(1) + paused_at(1+8)
    // + bump(1)
    pub const INIT_SPACE: usize = 8 + 32 + 32 + 32 + 8 + 8 + 1 + 32 + 32
        + 640 + 8 + 8 + 8 + 8 + 8 + 1 + 1 + 1 + 32 + 8
        + 1 + 8 + 1 + 8 + 1 + 8
        + 1 + 4 + 1 + 1 + 8 + 1 + 8 + 1 + 1 + 8
        + 8  // trade_nonce
        + 8  // creator_incentive_accrued (fee rates removed, read from Global)
        + 1 + 1 + 8
        + 1;
    // ≈ 990 bytes (binary market only, fee rates moved to Global)
    // Saves 20 bytes per market account
    // Rent cost: ~0.007 SOL

    pub fn is_active(&self) -> bool {
        self.status == 0
    }

    // ============================================
    // Backward compatibility helper methods
    // ============================================

    /// Get YES token mint (for binary markets)
    pub fn yes_token_mint(&self) -> Option<Pubkey> {
        let mint = self.outcome_token_mints[0];
        if mint != Pubkey::default() {
            Some(mint)
        } else {
            None
        }
    }

    /// Get NO token mint (for binary markets)
    pub fn no_token_mint(&self) -> Option<Pubkey> {
        let mint = self.outcome_token_mints[1];
        if mint != Pubkey::default() {
            Some(mint)
        } else {
            None
        }
    }

    /// Check if tokens have been initialized
    pub fn tokens_initialized(&self) -> bool {
        self.outcome_token_mints[0] != Pubkey::default() &&
        self.outcome_token_mints[1] != Pubkey::default()
    }
    
    /// Get outcome token mint by index
    pub fn get_outcome_mint(&self, index: usize) -> Option<Pubkey> {
        if index < MAX_OUTCOME_TOKENS {
            let mint = self.outcome_token_mints[index];
            if mint != Pubkey::default() {
                return Some(mint);
            }
        }
        None
    }
    
    /// Set outcome token mint by index
    pub fn set_outcome_mint(&mut self, index: usize, mint: Pubkey) -> Result<()> {
        use crate::errors::TerminatorError;
        require!(
            index < MAX_OUTCOME_TOKENS,
            TerminatorError::InvalidOutcomeIndex
        );
        self.outcome_token_mints[index] = mint;
        Ok(())
    }
    
    /// Check if market can be traded (not terminated and not paused)
    pub fn can_trade(&self) -> bool {
        self.is_active() && !self.is_randomly_terminated && !self.is_paused
    }
    
    /// Pause market (admin only)
    pub fn pause(&mut self, now_ts: i64) {
        self.is_paused = true;
        self.paused_at = Some(now_ts);
    }
    
    /// Resume market (admin only)
    pub fn resume(&mut self) {
        self.is_paused = false;
        self.paused_at = None;
    }

    /// Update market activity timestamps and last slot.
    pub fn record_activity(&mut self, now_ts: i64, now_slot: u64) {
        self.last_activity_ts = now_ts;
        self.last_trade_slot = Some(now_slot);
    }

    /// Record last observed binary price (best-effort).
    /// `outcome_index` is 0 = YES, 1 = NO; `price` is the traded outcome price in 10^6.
    pub fn record_binary_last_price(&mut self, outcome_index: u8, price: u64) -> Result<()> {
        use crate::errors::TerminatorError;
        require!(price <= 1_000_000, TerminatorError::InvalidInput);
        match outcome_index {
            0 => {
                self.last_trade_yes_price = Some(price);
                self.last_trade_no_price = Some(1_000_000u64.saturating_sub(price));
            }
            1 => {
                self.last_trade_no_price = Some(price);
                self.last_trade_yes_price = Some(1_000_000u64.saturating_sub(price));
            }
            _ => return err!(TerminatorError::InvalidOutcomeIndex),
        }
        Ok(())
    }

    /// Terminate market if inactivity timeout has elapsed.
    ///
    /// Returns `Ok(true)` if termination was executed, `Ok(false)` otherwise.
    pub fn terminate_if_inactive(&mut self, now_ts: i64, now_slot: u64) -> Result<bool> {
        use crate::constants::{INACTIVITY_TIMEOUT_SECONDS, PRICE_SCALE};

        if self.is_randomly_terminated || self.status != 0 {
            return Ok(false);
        }
        if now_ts.saturating_sub(self.last_activity_ts) < INACTIVITY_TIMEOUT_SECONDS {
            return Ok(false);
        }

        // Best-effort final price: prefer last observed YES, else derive from NO, else 0.5.
        let yes_price = match (self.last_trade_yes_price, self.last_trade_no_price) {
            (Some(yes), _) => yes.min(PRICE_SCALE),
            (None, Some(no)) => PRICE_SCALE.saturating_sub(no.min(PRICE_SCALE)),
            (None, None) => PRICE_SCALE / 2,
        };
        let no_price = PRICE_SCALE.saturating_sub(yes_price);

        self.last_trade_yes_price = Some(yes_price);
        self.last_trade_no_price = Some(no_price);

        self.terminate_market(yes_price, no_price, now_slot)?;
        Ok(true)
    }
    
    /// Set market termination state
    pub fn terminate_market(&mut self, yes_price: u64, no_price: u64, trade_slot: u64) -> Result<()> {
        self.is_randomly_terminated = true;
        self.final_yes_price = Some(yes_price);
        self.final_no_price = Some(no_price);
        self.can_redeem = true;
        self.termination_trade_slot = Some(trade_slot);
        self.status = market_status::TERMINATED;
        Ok(())
    }
    
    // ============================================
    // Per-trade Unique Randomness
    // ============================================
    
    /// Increment trade nonce and return the new value
    /// Used to ensure unique randomness per trade
    pub fn increment_trade_nonce(&mut self) -> u64 {
        self.trade_nonce = self.trade_nonce.saturating_add(1);
        self.trade_nonce
    }
    
    /// Generate unique randomness by combining VRF value with trade-specific data
    /// This ensures each trade gets unique randomness even if VRF value is the same
    /// 
    /// Formula: keccak256(vrf_value || market_key || user_key || trade_nonce || slot)
    pub fn derive_unique_randomness(
        &self,
        vrf_value: &[u8; 32],
        user_key: &Pubkey,
        slot: u64,
    ) -> [u8; 32] {
        // Build input for hash: vrf_value (32) + market (32) + user (32) + nonce (8) + slot (8)
        // Use blake3 hasher which is included in dependencies
        let mut input = Vec::with_capacity(112);
        input.extend_from_slice(vrf_value);
        input.extend_from_slice(self.switchboard_queue.as_ref()); // Use queue as market identifier
        input.extend_from_slice(user_key.as_ref());
        input.extend_from_slice(&self.trade_nonce.to_le_bytes());
        input.extend_from_slice(&slot.to_le_bytes());
        
        *blake3::hash(&input).as_bytes()
    }
    
    /// Convert derived randomness to a normalized value in range [0, max)
    pub fn get_unique_random_u64(unique_randomness: &[u8; 32], max: u64) -> u64 {
        let random_u64 = u64::from_le_bytes(
            unique_randomness[0..8].try_into()
                .expect("slice is always 8 bytes")
        );
        random_u64 % max
    }
}
