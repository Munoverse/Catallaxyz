# Type System Documentation

**AUDIT FIX v1.2.5**: Established unified type system with clear source of truth

## Type Authority Hierarchy

```
┌─────────────────────────────────────────────────────────────────┐
│                    RUST CONTRACT (Source of Truth)              │
│                    programs/catallaxyz/src/                     │
│                                                                 │
│  states/global.rs    → GlobalAccount                            │
│  states/market.rs    → MarketAccount, MarketStatus              │
│  states/user_balance.rs → UserBalance                           │
│  states/user_position.rs → UserPosition                         │
│  events.rs           → All event types                          │
└────────────────────────────────────────────────────────────────┬┘
                                                                  │
                              Anchor Build (auto-generates)        │
                                                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                    ANCHOR IDL (Generated)                       │
│                    target/idl/catallaxyz.json                   │
│                                                                 │
│  Contains: All account structures, instruction definitions      │
│  Usage: Auto-sync TypeScript types                              │
└────────────────────────────────────────────────────────────────┬┘
                                                                  │
                              Manual Sync (follow conventions)     │
                                                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                    TYPESCRIPT TYPES (Derived)                   │
│                    shared/types.ts (enums)                      │
│                    app/lib/types.ts (full types)                │
│                                                                 │
│  Must match: IDL structure + naming conventions                 │
│  Convention: Rust snake_case → TypeScript camelCase             │
└────────────────────────────────────────────────────────────────┬┘
                                                                  │
                              Manual Sync (follow TypeScript)      │
                                                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                    DATABASE SCHEMA (Derived)                    │
│                    database/schema.sql                          │
│                                                                 │
│  Must match: TypeScript types (with SQL naming conventions)     │
│  Convention: TypeScript camelCase → SQL snake_case              │
└─────────────────────────────────────────────────────────────────┘
```

## Field Naming Conventions

| Layer | Convention | Example |
|-------|-----------|---------|
| Rust Contract | snake_case | `usdc_balance`, `last_activity_ts` |
| Anchor IDL | camelCase (auto) | `usdcBalance`, `lastActivityTs` |
| TypeScript | camelCase | `usdcBalance`, `lastActivityTs` |
| Database | snake_case | `usdc_balance`, `last_activity_ts` |
| API JSON | camelCase | `usdcBalance`, `lastActivityTs` |

## Current Account Structures

### UserBalance (user_balance.rs)
```rust
pub struct UserBalance {
    pub user: Pubkey,        // 32 bytes
    pub market: Pubkey,      // 32 bytes
    pub usdc_balance: u64,   // 8 bytes
    pub bump: u8,            // 1 byte
}
```

TypeScript equivalent:
```typescript
interface UserBalanceAccount {
  user: PublicKey;
  market: PublicKey;
  usdcBalance: BN;
  bump: number;
}
```

### UserPosition (user_position.rs)
```rust
pub struct UserPosition {
    pub market: Pubkey,      // 32 bytes
    pub user: Pubkey,        // 32 bytes
    pub yes_balance: u64,    // 8 bytes
    pub no_balance: u64,     // 8 bytes
    pub bump: u8,            // 1 byte
}
```

TypeScript equivalent:
```typescript
interface UserPositionAccount {
  market: PublicKey;
  user: PublicKey;
  yesBalance: BN;  // Note: field name should match (was yesAmount)
  noBalance: BN;   // Note: field name should match (was noAmount)
  bump: number;
}
```

## Validation Script

Run the following to validate type consistency:

```bash
# From contracts/catallaxyz directory
npm run types:check
```

## Adding New Types

1. **Define in Rust** (programs/catallaxyz/src/)
2. **Build IDL**: `anchor build`
3. **Update TypeScript**: Edit `app/lib/types.ts` to match IDL
4. **Update Database**: Create migration in `database/migrations/`
5. **Run Validation**: `npm run types:check`

## Known Discrepancies (To Fix)

- [x] UserBalanceAccount: TypeScript had extra fields (fixed v1.2.5)
- [ ] UserPositionAccount: Field names `yesAmount/noAmount` should be `yesBalance/noBalance`
- [ ] TradingFeeCollected: Event now has maker/taker/outcome_type/side/size fields

## Synchronization Checklist

When modifying types:

- [ ] Update Rust struct
- [ ] Run `anchor build`
- [ ] Update TypeScript interface
- [ ] Update database schema/migration
- [ ] Update API route handlers if needed
- [ ] Run type validation
- [ ] Update this documentation
