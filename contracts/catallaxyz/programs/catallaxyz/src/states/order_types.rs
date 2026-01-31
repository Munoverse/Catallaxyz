use anchor_lang::prelude::*;

// ============================================
// Order Structure (Polymarket-style)
// ============================================

/// Order structure for atomic swaps
/// Matches Polymarket CTF Exchange order format
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
pub struct Order {
    /// Unique entropy value (prevents hash collision for identical params)
    pub salt: u64,
    
    /// Order creator (fund source)
    pub maker: Pubkey,
    
    /// Signature signer (can differ from maker for proxy wallets)
    pub signer: Pubkey,
    
    /// Specific taker address (Pubkey::default() = public order)
    pub taker: Pubkey,
    
    /// Market PDA
    pub market: Pubkey,
    
    /// Token ID: 0=USDC, 1=YES, 2=NO
    pub token_id: u8,
    
    /// Amount maker provides
    pub maker_amount: u64,
    
    /// Amount maker expects to receive
    pub taker_amount: u64,
    
    /// Expiration timestamp (0 = never expires)
    pub expiration: i64,
    
    /// User nonce (for batch cancellation via increment_nonce)
    pub nonce: u64,
    
    /// Fee rate in basis points (max 1000 = 10%)
    pub fee_rate_bps: u16,
    
    /// Side: 0=BUY, 1=SELL
    pub side: u8,
}

impl Order {
    /// Serialized size for space calculation
    pub const SERIALIZED_SIZE: usize = 8 + 32 + 32 + 32 + 32 + 1 + 8 + 8 + 8 + 8 + 2 + 1; // 172 bytes
    
    /// Check if order is a BUY order
    pub fn is_buy(&self) -> bool {
        self.side == 0
    }
    
    /// Check if order is a SELL order
    pub fn is_sell(&self) -> bool {
        self.side == 1
    }
    
    /// Check if order targets YES tokens
    pub fn is_yes(&self) -> bool {
        self.token_id == 1
    }
    
    /// Check if order targets NO tokens
    pub fn is_no(&self) -> bool {
        self.token_id == 2
    }
    
    /// Check if order is for USDC
    pub fn is_usdc(&self) -> bool {
        self.token_id == 0
    }
    
    /// Check if order has expired
    pub fn is_expired(&self, current_timestamp: i64) -> bool {
        self.expiration > 0 && self.expiration < current_timestamp
    }
    
    /// Check if order is public (any taker)
    pub fn is_public(&self) -> bool {
        self.taker == Pubkey::default()
    }
    
    /// Calculate price from maker/taker amounts
    /// Returns price scaled by PRICE_SCALE (10^6)
    pub fn calculate_price(&self) -> u64 {
        if self.is_buy() {
            // BUY: price = maker_amount (USDC) / taker_amount (tokens)
            // Scaled: price = maker_amount * PRICE_SCALE / taker_amount
            if self.taker_amount == 0 {
                return 0;
            }
            self.maker_amount
                .saturating_mul(crate::constants::PRICE_SCALE)
                .saturating_div(self.taker_amount)
        } else {
            // SELL: price = taker_amount (USDC) / maker_amount (tokens)
            // Scaled: price = taker_amount * PRICE_SCALE / maker_amount
            if self.maker_amount == 0 {
                return 0;
            }
            self.taker_amount
                .saturating_mul(crate::constants::PRICE_SCALE)
                .saturating_div(self.maker_amount)
        }
    }
}

/// Signed order with Ed25519 signature
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct SignedOrder {
    pub order: Order,
    pub signature: [u8; 64],
}

impl SignedOrder {
    pub const SERIALIZED_SIZE: usize = Order::SERIALIZED_SIZE + 64; // 236 bytes
}

// ============================================
// Match Types (Polymarket-style)
// ============================================

/// Match type determines how the trade is executed
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Copy)]
pub enum MatchType {
    /// Buy vs Sell - Direct swap of assets
    /// Taker buys YES from Maker who sells YES
    Complementary = 0,
    
    /// Buy vs Buy - Mint new tokens
    /// Taker buys YES, Maker buys NO -> Use USDC to mint YES+NO
    Mint = 1,
    
    /// Sell vs Sell - Merge tokens back to USDC
    /// Taker sells YES, Maker sells NO -> Merge YES+NO to USDC
    Merge = 2,
}

impl MatchType {
    /// Determine match type from two orders
    pub fn from_orders(taker: &Order, maker: &Order) -> Option<Self> {
        match (taker.side, maker.side) {
            // Taker BUY, Maker SELL = Complementary (direct swap)
            (0, 1) => Some(MatchType::Complementary),
            // Taker SELL, Maker BUY = Complementary (direct swap, reversed)
            (1, 0) => Some(MatchType::Complementary),
            // Taker BUY, Maker BUY = Mint (both want tokens, use USDC to mint)
            (0, 0) => {
                // For MINT: orders must be for complementary tokens (YES vs NO)
                if taker.token_id != maker.token_id && taker.token_id != 0 && maker.token_id != 0 {
                    Some(MatchType::Mint)
                } else {
                    None
                }
            }
            // Taker SELL, Maker SELL = Merge (both selling tokens, merge to USDC)
            (1, 1) => {
                // For MERGE: orders must be for complementary tokens (YES vs NO)
                if taker.token_id != maker.token_id && taker.token_id != 0 && maker.token_id != 0 {
                    Some(MatchType::Merge)
                } else {
                    None
                }
            }
            _ => None,
        }
    }
}

// ============================================
// Token IDs
// ============================================

/// Token ID constants
pub mod token_id {
    pub const USDC: u8 = 0;
    pub const YES: u8 = 1;
    pub const NO: u8 = 2;
}

/// Side constants
pub mod side {
    pub const BUY: u8 = 0;
    pub const SELL: u8 = 1;
}

// ============================================
// Price Crossing Check
// ============================================

/// Check if two orders have crossing prices (can be matched)
/// 
/// For Complementary (Buy vs Sell):
/// - Taker BUY price >= Maker SELL price
/// 
/// For Mint (Buy vs Buy):
/// - Sum of prices <= PRICE_SCALE (1.0)
/// - i.e., taker_price + maker_price <= 1,000,000
/// 
/// For Merge (Sell vs Sell):
/// - Sum of prices >= PRICE_SCALE (1.0)
pub fn is_crossing(taker: &Order, maker: &Order, match_type: MatchType) -> bool {
    let taker_price = taker.calculate_price();
    let maker_price = maker.calculate_price();
    
    match match_type {
        MatchType::Complementary => {
            if taker.is_buy() {
                // Taker BUY: taker willing to pay >= maker asking
                taker_price >= maker_price
            } else {
                // Taker SELL: taker asking <= maker willing to pay
                taker_price <= maker_price
            }
        }
        MatchType::Mint => {
            // Both buying complementary tokens
            // Total price should be <= 1.0 (arbitrage opportunity)
            taker_price.saturating_add(maker_price) <= crate::constants::PRICE_SCALE
        }
        MatchType::Merge => {
            // Both selling complementary tokens
            // Total price should be >= 1.0 (can merge to get USDC)
            taker_price.saturating_add(maker_price) >= crate::constants::PRICE_SCALE
        }
    }
}

// ============================================
// Order Hashing
// ============================================

/// Domain separator for order signing
pub const DOMAIN_SEPARATOR: &[u8] = b"Catallaxyz Exchange v1";

/// Hash an order using Blake3
/// Returns 32-byte hash
pub fn hash_order(order: &Order) -> [u8; 32] {
    let order_bytes = order.try_to_vec().unwrap_or_default();
    
    let mut combined = Vec::with_capacity(DOMAIN_SEPARATOR.len() + order_bytes.len());
    combined.extend_from_slice(DOMAIN_SEPARATOR);
    combined.extend_from_slice(&order_bytes);
    
    *blake3::hash(&combined).as_bytes()
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_order_price_calculation() {
        // BUY order: 500,000 USDC for 1,000,000 YES tokens
        // Price = 500,000 * 1,000,000 / 1,000,000 = 500,000 (0.50)
        let buy_order = Order {
            salt: 1,
            maker: Pubkey::default(),
            signer: Pubkey::default(),
            taker: Pubkey::default(),
            market: Pubkey::default(),
            token_id: token_id::YES,
            maker_amount: 500_000,
            taker_amount: 1_000_000,
            expiration: 0,
            nonce: 0,
            fee_rate_bps: 0,
            side: side::BUY,
        };
        assert_eq!(buy_order.calculate_price(), 500_000);
        
        // SELL order: 1,000,000 YES tokens for 600,000 USDC
        // Price = 600,000 * 1,000,000 / 1,000,000 = 600,000 (0.60)
        let sell_order = Order {
            salt: 2,
            maker: Pubkey::default(),
            signer: Pubkey::default(),
            taker: Pubkey::default(),
            market: Pubkey::default(),
            token_id: token_id::YES,
            maker_amount: 1_000_000,
            taker_amount: 600_000,
            expiration: 0,
            nonce: 0,
            fee_rate_bps: 0,
            side: side::SELL,
        };
        assert_eq!(sell_order.calculate_price(), 600_000);
    }
    
    #[test]
    fn test_match_type_determination() {
        let buy_yes = Order {
            salt: 1,
            maker: Pubkey::default(),
            signer: Pubkey::default(),
            taker: Pubkey::default(),
            market: Pubkey::default(),
            token_id: token_id::YES,
            maker_amount: 500_000,
            taker_amount: 1_000_000,
            expiration: 0,
            nonce: 0,
            fee_rate_bps: 0,
            side: side::BUY,
        };
        
        let sell_yes = Order {
            token_id: token_id::YES,
            side: side::SELL,
            ..buy_yes.clone()
        };
        
        let buy_no = Order {
            token_id: token_id::NO,
            side: side::BUY,
            ..buy_yes.clone()
        };
        
        let sell_no = Order {
            token_id: token_id::NO,
            side: side::SELL,
            ..buy_yes.clone()
        };
        
        // BUY YES vs SELL YES = Complementary
        assert_eq!(MatchType::from_orders(&buy_yes, &sell_yes), Some(MatchType::Complementary));
        
        // BUY YES vs BUY NO = Mint
        assert_eq!(MatchType::from_orders(&buy_yes, &buy_no), Some(MatchType::Mint));
        
        // SELL YES vs SELL NO = Merge
        assert_eq!(MatchType::from_orders(&sell_yes, &sell_no), Some(MatchType::Merge));
    }
}
