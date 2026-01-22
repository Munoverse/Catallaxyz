/// Lightweight Switchboard VRF Integration
/// 
/// This module provides minimal Switchboard randomness parsing without the full SDK dependency.
/// It only includes what we need: parsing RandomnessAccountData and extracting random values.

use anchor_lang::prelude::*;

/// Switchboard Program ID (Mainnet/Devnet)
pub const SWITCHBOARD_PROGRAM_ID: Pubkey = pubkey!("SBondMDrcV3K4kxZR1HNVT7osZxAHVHgYXL5Ze1oMUv");

/// Minimal RandomnessAccountData structure
/// Based on Switchboard's on-demand randomness format
#[derive(Clone, Copy, Debug)]
pub struct RandomnessAccountData {
    /// The queue this randomness account belongs to
    pub queue: Pubkey,
    /// The random value (32 bytes)
    pub value: [u8; 32],
    /// Slot when randomness was generated
    pub slot: u64,
    /// Timestamp when randomness was generated
    pub timestamp: i64,
}

impl RandomnessAccountData {
    /// Parse randomness account data from raw bytes
    /// 
    /// Switchboard RandomnessAccountData layout (simplified):
    /// - 8 bytes: discriminator
    /// - 32 bytes: queue pubkey
    /// - 32 bytes: random value
    /// - 8 bytes: slot
    /// - 8 bytes: timestamp
    /// - ... (other fields we don't need)
    pub fn parse(data: &[u8]) -> Result<Self> {
        require!(
            data.len() >= 88, // Minimum size for our needs
            ErrorCode::AccountDidNotDeserialize
        );

        // Extract fields
        let queue = Pubkey::try_from(&data[8..40])
            .map_err(|_| ErrorCode::AccountDidNotDeserialize)?;
        
        let mut value = [0u8; 32];
        value.copy_from_slice(&data[40..72]);
        
        let slot = u64::from_le_bytes(
            data[72..80].try_into()
                .map_err(|_| ErrorCode::AccountDidNotDeserialize)?
        );
        
        let timestamp = i64::from_le_bytes(
            data[80..88].try_into()
                .map_err(|_| ErrorCode::AccountDidNotDeserialize)?
        );

        Ok(Self {
            queue,
            value,
            slot,
            timestamp,
        })
    }

    /// Get the random value if it's recent enough
    /// 
    /// # Arguments
    /// * `current_slot` - Current blockchain slot to validate recency
    /// 
    /// # Returns
    /// The 32-byte random value if valid
    pub fn get_value(&self, current_slot: u64) -> Result<[u8; 32]> {
        // Check if randomness is not too old (within 150 slots ≈ 1 minute)
        require!(
            current_slot.saturating_sub(self.slot) <= 150,
            ErrorCode::ConstraintRaw
        );

        Ok(self.value)
    }

    /// Get a normalized random number in range [0, max)
    pub fn get_random_u64(&self, max: u64) -> u64 {
        // SAFETY: value is always 32 bytes, so taking first 8 bytes is safe
        let random_u64 = u64::from_le_bytes(
            self.value[0..8].try_into()
                .expect("value array is always 32 bytes")
        );
        random_u64 % max
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_randomness() {
        let mut data = vec![0u8; 88];
        
        // Discriminator (8 bytes)
        data[0..8].copy_from_slice(&[1, 2, 3, 4, 5, 6, 7, 8]);
        
        // Queue pubkey (32 bytes)
        let queue = Pubkey::new_unique();
        data[8..40].copy_from_slice(queue.as_ref());
        
        // Random value (32 bytes)
        data[40..72].copy_from_slice(&[0xFFu8; 32]);
        
        // Slot (8 bytes)
        let slot = 12345u64;
        data[72..80].copy_from_slice(&slot.to_le_bytes());
        
        // Timestamp (8 bytes)
        let timestamp = 1234567890i64;
        data[80..88].copy_from_slice(&timestamp.to_le_bytes());

        let parsed = RandomnessAccountData::parse(&data).unwrap();
        assert_eq!(parsed.queue, queue);
        assert_eq!(parsed.slot, slot);
        assert_eq!(parsed.timestamp, timestamp);
    }
}

