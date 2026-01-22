use anchor_lang::prelude::*;

#[account]
pub struct Global {
    pub authority: Pubkey,
    pub usdc_mint: Pubkey,
    pub settlement_signer: Pubkey,
    pub bump: u8,
    pub treasury_bump: u8, // VRF treasury bump (for Switchboard fees)
    pub platform_treasury_bump: u8, // Platform treasury bump (for trading & creation fees)
    pub total_fees_collected: u64, // Total fees collected in lamports (legacy, for VRF)
    pub total_trading_fees_collected: u64, // Total trading fees collected in USDC
    pub total_creation_fees_collected: u64, // Total market creation fees in USDC

    // ============================================
    // Global Fee Configuration (Platform-wide)
    // All markets read these values instead of storing their own
    // ============================================
    
    /// Center taker fee rate at 50% price (scaled by 10^6, e.g., 32000 = 3.2%)
    /// This is the MAXIMUM fee rate at 50-50 odds
    /// Default: 32000 (3.2%)
    pub center_taker_fee_rate: u32,
    
    /// Extreme taker fee rate at 0%/100% price (scaled by 10^6, e.g., 2000 = 0.2%)
    /// This is the MINIMUM fee rate, encouraging arbitrage and high-frequency trading
    /// Default: 2000 (0.2%)
    pub extreme_taker_fee_rate: u32,
    
    /// Platform fee share (scaled by 10^6, e.g., 750000 = 75%)
    /// Portion of taker fees sent to platform treasury
    pub platform_fee_rate: u32,

    /// Maker rebate rate (scaled by 10^6, e.g., 200000 = 20%)
    /// Portion of taker fees sent to rewards treasury (for liquidity providers)
    pub maker_rebate_rate: u32,

    /// Creator incentive rate (scaled by 10^6, e.g., 50000 = 5%)
    /// Portion of taker fees sent to market creator
    pub creator_incentive_rate: u32,
}

impl Global {
    // Space calculation:
    // discriminator(8) + authority(32) + usdc_mint(32) + settlement_signer(32)
    // + bump(1) + treasury_bump(1) + platform_treasury_bump(1)
    // + total_fees_collected(8) + total_trading_fees_collected(8) + total_creation_fees_collected(8)
    // + center_taker_fee_rate(4) + extreme_taker_fee_rate(4)
    // + platform_fee_rate(4) + maker_rebate_rate(4) + creator_incentive_rate(4)
    pub const INIT_SPACE: usize = 8 + 32 + 32 + 32 + 1 + 1 + 1 + 8 + 8 + 8 + 4 + 4 + 4 + 4 + 4;

    /// Calculate taker fee rate based on price using smooth curve
    /// 
    /// Formula: fee = center - (center - extreme) * |price - 0.5| / 0.5
    /// 
    /// Examples (with default rates):
    /// - price 0.50: 3.2% (center)
    /// - price 0.40/0.60: 2.6%
    /// - price 0.30/0.70: 2.0%
    /// - price 0.20/0.80: 1.4%
    /// - price 0.10/0.90: 0.8%
    /// - price 0.01/0.99: 0.2% (extreme)
    pub fn calculate_taker_fee_rate(&self, price: u64) -> u32 {
        const PRICE_SCALE: u64 = 1_000_000;
        const CENTER_PRICE: u64 = 500_000; // 0.5 scaled
        
        // Distance from center (0-500000)
        let distance_from_center = if price > CENTER_PRICE {
            price - CENTER_PRICE
        } else {
            CENTER_PRICE - price
        };
        
        // Rate range
        let rate_range = self.center_taker_fee_rate.saturating_sub(self.extreme_taker_fee_rate);
        
        // Calculate fee reduction: (rate_range * distance) / 500000
        let fee_reduction = (rate_range as u64 * distance_from_center) / CENTER_PRICE;
        
        // Final fee rate
        self.center_taker_fee_rate.saturating_sub(fee_reduction as u32)
    }
}

/// Default fee rates (can be updated via update_fee_rates instruction)
pub mod default_fees {
    pub const CENTER_TAKER_FEE_RATE: u32 = 32_000; // 3.2%
    pub const EXTREME_TAKER_FEE_RATE: u32 = 2_000; // 0.2%
    pub const PLATFORM_FEE_RATE: u32 = 750_000; // 75%
    pub const MAKER_REBATE_RATE: u32 = 200_000; // 20%
    pub const CREATOR_INCENTIVE_RATE: u32 = 50_000; // 5%
}
