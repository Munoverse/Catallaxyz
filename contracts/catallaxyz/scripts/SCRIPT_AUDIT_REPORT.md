# Scripts Audit Report
**Date:** January 30, 2026  
**Location:** `/home/eero/Catallaxyz/contracts/catallaxyz/scripts/`

## Executive Summary

This audit identified **20 scripts** (15 TypeScript, 4 shell scripts, 1 utility) with several areas for improvement:
- ✅ **Well-organized** treasury initialization scripts
- ⚠️ **Redundancy** between individual treasury scripts and mainnet initialization
- ⚠️ **Missing scripts** referenced in package.json
- ⚠️ **Consolidation opportunities** for minting scripts
- ✅ **Good utility** scripts for configuration and verification

---

## 📋 Complete Script Inventory

### TypeScript Scripts (15)

| Script | Purpose | Status | Notes |
|--------|---------|--------|-------|
| `check-program-config.ts` | Check program configuration and treasury status | ✅ Active | Well-structured, comprehensive |
| `create-test-usdc.ts` | Create test USDC token mint on devnet | ✅ Active | Creates mint + config file |
| `create-twish-token.ts` | Create Twish token mint for tipping | ✅ Active | Similar structure to create-test-usdc |
| `initialize-creator-treasury.ts` | Initialize creator incentive treasury | ✅ Active | **Redundant** (see consolidation) |
| `initialize-mainnet.ts` | One-click mainnet initialization | ✅ Active | **Consolidates** multiple treasury inits |
| `initialize-platform-treasury.ts` | Initialize platform treasury | ✅ Active | **Redundant** (see consolidation) |
| `initialize-reward-treasury.ts` | Initialize reward treasury | ✅ Active | **Redundant** (see consolidation) |
| `initialize-treasury.ts` | Initialize VRF treasury | ✅ Active | **Redundant** (see consolidation) |
| `initialize-with-tusdc.ts` | Initialize Global account with tUSDC | ✅ Active | Devnet-specific initialization |
| `mint-test-usdc.ts` | Mint test USDC to self | ✅ Active | **Could consolidate** with mint-tusdc-to-user |
| `mint-tusdc-to-user.ts` | Mint tUSDC to specified user | ✅ Active | **Could consolidate** with mint-test-usdc |
| `mint-twish.ts` | Mint Twish tokens (flexible recipient) | ✅ Active | Well-designed, handles both cases |
| `set-keeper.ts` | Set/update keeper wallet address | ✅ Active | Admin function |
| `sync-constants.ts` | Sync constants from Rust to TypeScript | ✅ Active | Build utility |
| `verify-security.ts` | Security verification checklist | ✅ Active | Comprehensive security checks |

### Shell Scripts (4)

| Script | Purpose | Status | Notes |
|--------|---------|--------|-------|
| `check-balances.sh` | Check SOL and token balances | ✅ Active | Useful utility |
| `deploy-idl.sh` | Deploy IDL to on-chain | ✅ Active | Deployment utility |
| `regenerate-program-id.sh` | Regenerate program ID and update configs | ✅ Active | Development utility |
| `setup-test-accounts-v2.sh` | Setup multiple test accounts | ✅ Active | **Missing** older version reference |

### Utility Files (1)

| File | Purpose | Status |
|------|---------|-------|
| `utils/anchor-config.ts` | Anchor configuration reader | ✅ Active | Shared utility, well-designed |

---

## 🔍 Detailed Findings

### 1. Redundant Scripts

#### **Treasury Initialization Scripts** ⚠️ **HIGH PRIORITY**

**Issue:** Four separate treasury initialization scripts that are all consolidated in `initialize-mainnet.ts`:

- `initialize-platform-treasury.ts` (198 lines)
- `initialize-reward-treasury.ts` (187 lines)
- `initialize-creator-treasury.ts` (181 lines)
- `initialize-treasury.ts` (198 lines) - VRF treasury

**Analysis:**
- All four scripts follow **identical patterns**:
  - Same error handling
  - Same verification logic
  - Same account checking
  - Same transaction flow
- `initialize-mainnet.ts` already includes all four treasury initializations
- Individual scripts are still useful for **devnet step-by-step** initialization

**Recommendation:**
- ✅ **Keep individual scripts** for devnet flexibility
- ✅ **Consider** creating a shared utility function to reduce code duplication
- ⚠️ **Document** that mainnet users should use `initialize-mainnet.ts`

**Code Duplication:** ~700 lines of nearly identical code across 4 files

---

### 2. Scripts That Do Similar Things Differently

#### **Minting Scripts** ⚠️ **MEDIUM PRIORITY**

**Issue:** Three minting scripts with overlapping functionality:

1. `mint-test-usdc.ts` - Mints to self only
2. `mint-tusdc-to-user.ts` - Mints to specified user
3. `mint-twish.ts` - Handles both self and user (flexible)

**Analysis:**
- `mint-twish.ts` is **better designed** - handles both cases in one script
- `mint-test-usdc.ts` and `mint-tusdc-to-user.ts` could be **consolidated** like `mint-twish.ts`

**Recommendation:**
- ✅ **Consolidate** `mint-test-usdc.ts` and `mint-tusdc-to-user.ts` into a single script
- ✅ **Use** `mint-twish.ts` as the template for the consolidated version
- ⚠️ **Update** package.json scripts accordingly

**Example Consolidation:**
```typescript
// New: mint-tusdc.ts (consolidated)
// Usage: yarn mint-tusdc <amount>              - Mint to self
//        yarn mint-tusdc <address> <amount>    - Mint to user
```

---

### 3. Deprecated/Unused Scripts

#### **Missing Scripts Referenced in package.json** ❌ **CRITICAL**

**Issue:** `package.json` references scripts that **don't exist**:

```json
"setup-test-accounts": "ts-node scripts/setup-test-accounts.ts",        // ❌ Missing
"setup-test-accounts:sh": "bash scripts/setup-test-accounts.sh",           // ❌ Missing
```

**Analysis:**
- Only `setup-test-accounts-v2.sh` exists
- Package.json has references to non-existent files
- This will cause errors if users try to run these commands

**Recommendation:**
- ✅ **Remove** or **fix** package.json references:
  - Option 1: Remove the broken references
  - Option 2: Create the missing scripts
  - Option 3: Update references to point to `setup-test-accounts-v2.sh`

---

### 4. Scripts That Could Be Consolidated

#### **Token Creation Scripts** ⚠️ **LOW PRIORITY**

**Issue:** Two token creation scripts with very similar structure:

- `create-test-usdc.ts` (115 lines)
- `create-twish-token.ts` (122 lines)

**Analysis:**
- Both scripts follow the same pattern:
  - Create mint
  - Create token account
  - Mint initial supply
  - Save config file
- **Differences:** Token name, decimals, initial supply, config file name

**Recommendation:**
- ⚠️ **Consider** creating a generic `create-token.ts` script with parameters
- ✅ **OR** keep separate scripts for clarity (current approach is fine)
- **Priority:** Low - current separation is acceptable for clarity

---

### 5. Missing Scripts for Common Operations

#### **Suggested Missing Scripts** 💡

1. **`initialize-devnet.ts`** - One-click devnet initialization
   - Similar to `initialize-mainnet.ts` but for devnet
   - Would consolidate: create-test-usdc → init-with-tusdc → all treasuries
   - **Priority:** Medium

2. **`withdraw-from-treasury.ts`** - Admin script to withdraw from treasuries
   - Currently no script for treasury withdrawals
   - **Priority:** Medium

3. **`update-authority.ts`** - Transfer authority to new wallet
   - Security-critical operation
   - **Priority:** High

4. **`check-treasury-balances.ts`** - Quick treasury balance check
   - Currently only in `check-program-config.ts` (verbose)
   - **Priority:** Low

5. **`transfer-authority.ts`** - Transfer program authority
   - Critical for security and upgrades
   - **Priority:** High

6. **`upgrade-program.ts`** - Program upgrade helper
   - Deployment utility
   - **Priority:** Medium

7. **`backup-config.ts`** - Backup all configuration files
   - Safety utility
   - **Priority:** Low

8. **`validate-deployment.ts`** - Comprehensive deployment validation
   - Post-deployment checks
   - **Priority:** Medium

---

## 📊 Statistics

### Script Counts
- **Total Scripts:** 20
- **TypeScript:** 15
- **Shell Scripts:** 4
- **Utilities:** 1

### Code Duplication
- **Treasury scripts:** ~700 lines of duplicated code (4 files)
- **Minting scripts:** ~150 lines that could be consolidated (2 files)

### Missing References
- **Broken package.json entries:** 2

---

## ✅ Recommendations Summary

### Immediate Actions (High Priority)

1. **Fix package.json** - Remove or fix broken script references
   ```json
   // Remove or update:
   "setup-test-accounts": "...",
   "setup-test-accounts:sh": "..."
   ```

2. **Create missing admin scripts:**
   - `update-authority.ts` - Transfer authority
   - `transfer-authority.ts` - Authority management

### Short-term Improvements (Medium Priority)

3. **Consolidate minting scripts:**
   - Merge `mint-test-usdc.ts` + `mint-tusdc-to-user.ts` → `mint-tusdc.ts`
   - Use `mint-twish.ts` as template

4. **Create devnet initialization script:**
   - `initialize-devnet.ts` - One-click devnet setup

5. **Reduce treasury script duplication:**
   - Extract common logic to utility functions
   - Keep individual scripts but reduce code duplication

### Long-term Enhancements (Low Priority)

6. **Consider generic token creation script**
   - Evaluate if `create-token.ts` with parameters would be better

7. **Add utility scripts:**
   - `check-treasury-balances.ts`
   - `backup-config.ts`
   - `validate-deployment.ts`

---

## 🎯 Script Quality Assessment

### Excellent Scripts ⭐⭐⭐⭐⭐
- `initialize-mainnet.ts` - Comprehensive, well-structured
- `verify-security.ts` - Thorough security checks
- `mint-twish.ts` - Flexible design, handles multiple cases
- `check-program-config.ts` - Comprehensive configuration checking
- `utils/anchor-config.ts` - Well-designed utility

### Good Scripts ⭐⭐⭐⭐
- `initialize-with-tusdc.ts` - Clear devnet initialization
- `set-keeper.ts` - Good admin script
- `sync-constants.ts` - Useful build utility
- `check-balances.sh` - Useful utility script

### Scripts Needing Improvement ⭐⭐⭐
- Treasury initialization scripts (duplication)
- Minting scripts (could be consolidated)

---

## 📝 Notes

### Script Organization
- ✅ Scripts are well-organized in `/scripts/` directory
- ✅ Utilities properly separated in `/scripts/utils/`
- ✅ README.md provides good documentation

### Documentation
- ✅ README.md is comprehensive
- ⚠️ Some scripts lack inline documentation
- ⚠️ Missing JSDoc comments in some scripts

### Error Handling
- ✅ Most scripts have good error handling
- ✅ Consistent error messages
- ✅ Good user feedback

### Configuration Management
- ✅ Excellent use of `anchor-config.ts` utility
- ✅ Consistent configuration reading
- ✅ Good separation of concerns

---

## 🔄 Migration Path

If consolidating scripts, recommended order:

1. **Phase 1:** Fix package.json references (immediate)
2. **Phase 2:** Create missing admin scripts (1-2 weeks)
3. **Phase 3:** Consolidate minting scripts (2-3 weeks)
4. **Phase 4:** Refactor treasury scripts to reduce duplication (3-4 weeks)
5. **Phase 5:** Add utility scripts as needed (ongoing)

---

## 📚 Related Documentation

- `README.md` - Main scripts documentation
- `package.json` - Script commands reference
- `utils/anchor-config.ts` - Configuration utility

---

**Report Generated:** January 30, 2026  
**Auditor:** AI Assistant  
**Next Review:** Recommended in 3 months or after major refactoring
