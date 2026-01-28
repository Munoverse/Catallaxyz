# Catallaxyz Initialization Scripts

This folder contains all initialization and admin scripts for Catallaxyz.

## 📋 Script Overview

### Initialization Scripts

| Script | Purpose | Network | Command |
|------|------|------|------|
| `create-test-usdc.ts` | Create a test USDC mint | Devnet | `yarn create-test-usdc` |
| `initialize-with-tusdc.ts` | Initialize Global with test USDC | Devnet | `yarn init-with-tusdc` |
| `initialize-platform-treasury.ts` | Initialize platform treasury | Devnet/Mainnet | `yarn init-platform-treasury` |
| `initialize-reward-treasury.ts` | Initialize reward treasury | Devnet/Mainnet | `yarn init-reward-treasury` |
| `initialize-creator-treasury.ts` | Initialize creator incentive treasury | Devnet/Mainnet | `yarn init-creator-treasury` |
| `initialize-treasury.ts` | Initialize VRF treasury | Devnet/Mainnet | `yarn init-treasury` |
| `initialize-mainnet.ts` | One-click mainnet initialization | **Mainnet** | `yarn init-mainnet` |

### Admin Scripts

| Script | Purpose | Command |
|------|------|------|
| `mint-test-usdc.ts` | Mint test USDC | `yarn mint-test-usdc <amount>` |
| `mint-tusdc-to-user.ts` | Mint test USDC to a user | `yarn mint-tusdc-to <address> <amount>` |
| `check-program-config.ts` | Check program configuration | `yarn check-config` |
| `verify-security.ts` | Security verification | `yarn verify-security` |

---

## 🚀 Devnet Initialization Flow

### Step 1: Create test USDC

```bash
cd catallaxyz
yarn create-test-usdc
```

This creates:
- A new tUSDC mint (6 decimals)
- A config file saved to `test-usdc-config.json`

### Step 2: Initialize Global

```bash
yarn init-with-tusdc
```

This:
- Initializes the Global account with tUSDC
- Sets authority to the current wallet

### Step 3: Initialize Platform Treasury

```bash
yarn init-platform-treasury
```

This:
- Creates the platform treasury token account
- Collects trading fees and creation fees

### Step 4: Initialize Reward Treasury

```bash
yarn init-reward-treasury
```

This:
- Creates the reward treasury token account
- Funds liquidity rewards

### Step 5: Initialize Creator Treasury

```bash
yarn init-creator-treasury
```

This:
- Creates the creator treasury token account
- Collects creator incentives

### Step 6: Initialize VRF Treasury

```bash
yarn init-treasury
```

This:
- Creates the VRF treasury token account
- Pays VRF-related fees

### Step 7: Verify configuration

```bash
yarn check-config
```

Confirm all accounts are initialized correctly.

### Step 8: Mint test USDC

```bash
# Mint 10,000 tUSDC to yourself
yarn mint-test-usdc 10000

# Mint to another user
yarn mint-tusdc-to <user-address> 1000
```

---

## 🌐 Mainnet Initialization Flow

### ⚠️ Important

**Mainnet deployment is irreversible. Make sure to:**
1. Complete a code audit
2. Test thoroughly on Devnet
3. Prepare at least 10 SOL
4. Back up keys
5. Use hardware wallet or multisig (recommended)

### Environment setup

```bash
# 1. Configure Solana CLI
solana config set --url https://api.mainnet-beta.solana.com
solana config set --keypair ~/.config/solana/mainnet-deployer.json

# 2. Check balance
solana balance
# Ensure at least 5-10 SOL

# 3. Configure environment variables (paid RPC recommended)
export ANCHOR_PROVIDER_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
export ANCHOR_WALLET=~/.config/solana/mainnet-deployer.json
```

### Option 1: One-click initialization (recommended)

```bash
cd catallaxyz
yarn init-mainnet
```

This script performs:
1. ✅ Network and balance checks
2. ✅ Program deployment verification
3. ✅ Global initialization (with real USDC)
4. ✅ Platform treasury initialization
5. ✅ VRF treasury initialization
6. ✅ Final verification

**Script highlights:**
- 10-second confirmation delay
- Auto-detects already-initialized accounts
- Robust error handling
- Detailed logs

### Option 2: Manual step-by-step initialization

If you want more control, run steps individually:

```bash
# 1. Edit initialize-with-tusdc.ts
# Replace the tUSDC mint with mainnet USDC:
# EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v

# 2. Run the steps
yarn init-with-tusdc
yarn init-platform-treasury
yarn init-treasury
yarn check-config
```

---

## 🔍 Checks and Verification

### Check program configuration

```bash
yarn check-config
```

Example output:
```
✅ Global Account
   Authority: 7xK...abc
   USDC Mint: EPjF...1v

✅ Platform Treasury
   Balance: 0 USDC

✅ VRF Treasury
   Balance: 0 USDC
```

### Security verification

```bash
yarn verify-security
```

Checklist:
- ✅ Authority configuration
- ✅ Treasury initialization
- ✅ Access control
- ✅ Fee configuration

---

## 📝 Important Addresses

### Devnet
- tUSDC Mint: stored in `test-usdc-config.json`

### Mainnet
- USDC Mint: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`
- Program ID: run `anchor keys list`

### PDA derivations
```typescript
// Global PDA
const [globalPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("global")],
  programId
);

// Platform Treasury PDA
const [platformTreasuryPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("platform_treasury")],
  programId
);

// VRF Treasury PDA
const [treasuryPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("treasury")],
  programId
);
```

---

## 🐛 Troubleshooting

### 1. "Account does not exist" error

**Cause**: Global account not initialized

**Fix**: Run initialization scripts
```bash
# Devnet
yarn init-with-tusdc

# Mainnet
yarn init-mainnet
```

### 2. "Insufficient SOL" error

**Cause**: Balance too low

**Fix**:
```bash
# Devnet
solana airdrop 2

# Mainnet
# Transfer SOL from an exchange
```

### 3. "Already initialized" warning

**Cause**: Account already exists

**Fix**: This is expected; the script skips initialized accounts.

### 4. RPC rate limits

**Cause**: Public RPC rate limits

**Fix**: Use a paid RPC provider
```bash
# Helius
export ANCHOR_PROVIDER_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY

# QuickNode
export ANCHOR_PROVIDER_URL=https://your-endpoint.quiknode.pro/YOUR_KEY/

# Alchemy
export ANCHOR_PROVIDER_URL=https://solana-mainnet.g.alchemy.com/v2/YOUR_KEY
```

### 5. "Not the authority" error

**Cause**: Current wallet is not the Global authority

**Fix**: Switch to the correct deployer wallet
```bash
solana config set --keypair <correct-keypair.json>
```

---

## 📚 Related Docs

- [Mainnet deployment guide](../MAINNET_DEPLOYMENT.md)
- [Deployment docs](../DEPLOYMENT.md)
- [Inactivity termination guide](../INACTIVITY_TERMINATION_GUIDE.md)

---

## 🆘 Need help?

If you run into issues:
1. Check logs for error messages
2. Run `yarn check-config` to verify current state
3. Check transaction status in Solana Explorer
4. Review the related docs

---

## ⚡ Quick Reference

```bash
# Devnet full flow
yarn create-test-usdc
yarn init-with-tusdc
yarn init-platform-treasury
yarn init-treasury
yarn check-config
yarn mint-test-usdc 10000

# Mainnet full flow
export ANCHOR_PROVIDER_URL=https://api.mainnet-beta.solana.com
export ANCHOR_WALLET=~/.config/solana/mainnet-deployer.json
yarn init-mainnet
```

---

**Good luck with your deployment!**
