# Catallaxyz Initialization Scripts

This folder contains all initialization and admin scripts for Catallaxyz.

## ⚡ Configuration

**所有脚本现在从 `Anchor.toml` 自动读取配置，无需设置环境变量！**

```toml
# Anchor.toml
[provider]
cluster = "devnet"                           # 或 "mainnet", "localnet"
wallet = "~/.config/solana/id.json"          # 钱包路径
```

如果设置了环境变量 (`ANCHOR_PROVIDER_URL`, `ANCHOR_WALLET`)，则优先使用环境变量。

### 可选环境变量

| 变量 | 用途 | 默认值 |
|------|------|--------|
| `TEST_USDC_MINT` | Devnet 测试 USDC Mint 地址 | 必需（devnet 初始化） |
| `KEEPER_PUBLIC_KEY` | Keeper 公钥（可选） | 使用钱包公钥 |
| `OPERATOR_PUBLIC_KEY` | Operator 公钥（可选） | 使用钱包公钥 |

---

## 📋 Script Overview

### 初始化脚本（整合版）

| Script | Purpose | Network | Command |
|------|------|------|------|
| `create-test-usdc.ts` | 创建测试 USDC Mint | Devnet | `yarn ts-node scripts/create-test-usdc.ts` |
| `initialize-devnet.ts` | **一键 Devnet 初始化** | Devnet | `TEST_USDC_MINT=<mint> yarn ts-node scripts/initialize-devnet.ts` |
| `initialize-mainnet.ts` | **一键 Mainnet 初始化** | **Mainnet** | `yarn ts-node scripts/initialize-mainnet.ts` |

### Admin 脚本

| Script | Purpose | Command |
|------|------|------|
| `mint-test-usdc.ts` | 铸造测试 USDC | `yarn ts-node scripts/mint-test-usdc.ts <amount>` |
| `mint-tusdc-to-user.ts` | 向指定用户铸造 USDC | `yarn ts-node scripts/mint-tusdc-to-user.ts <address> <amount>` |
| `set-keeper.ts` | 设置 Keeper 地址 | `KEEPER_PUBLIC_KEY=<pubkey> yarn ts-node scripts/set-keeper.ts` |
| `check-program-config.ts` | 检查程序配置 | `yarn ts-node scripts/check-program-config.ts` |
| `verify-security.ts` | 安全性验证 | `yarn ts-node scripts/verify-security.ts` |
| `sync-constants.ts` | 同步常量 | `yarn ts-node scripts/sync-constants.ts` |

---

## 🚀 Devnet 初始化流程

### Step 1: 创建测试 USDC

```bash
cd contracts/catallaxyz
yarn ts-node scripts/create-test-usdc.ts
```

输出会显示 Mint 地址，保存到 `test-usdc-config.json`

### Step 2: 一键初始化所有账户

```bash
TEST_USDC_MINT=<上一步的mint地址> yarn ts-node scripts/initialize-devnet.ts
```

这个脚本会自动初始化：
1. ✅ Global 账户（使用测试 USDC）
2. ✅ Platform Treasury（平台金库）
3. ✅ Reward Treasury（奖励金库）
4. ✅ Creator Treasury（创作者金库）
5. ✅ VRF Treasury（VRF 金库）

### Step 3: 验证配置

```bash
yarn ts-node scripts/check-program-config.ts
```

### Step 4: 铸造测试 USDC（可选）

```bash
# 给自己铸造 10,000 tUSDC
yarn ts-node scripts/mint-test-usdc.ts 10000

# 给其他用户铸造
yarn ts-node scripts/mint-tusdc-to-user.ts <user-address> 1000
```

---

## 🌐 Mainnet 初始化流程

### ⚠️ 重要提醒

**Mainnet 部署不可逆！请确保：**
1. 完成代码审计
2. 在 Devnet 充分测试
3. 准备至少 10 SOL
4. 备份密钥
5. 使用硬件钱包或多签（推荐）

### 配置

```bash
# 1. 更新 Anchor.toml
# [provider]
# cluster = "mainnet"
# wallet = "~/.config/solana/mainnet-deployer.json"

# 或使用付费 RPC（推荐）:
# cluster = "https://mainnet.helius-rpc.com/?api-key=YOUR_KEY"

# 2. 检查余额
solana balance
# 确保至少有 5-10 SOL
```

### 一键初始化

```bash
yarn ts-node scripts/initialize-mainnet.ts
```

脚本会自动：
1. ✅ 检查网络和余额
2. ✅ 验证程序部署
3. ✅ 初始化 Global（使用真实 USDC）
4. ✅ 初始化所有金库
5. ✅ 最终验证

**脚本特点：**
- 10 秒确认延迟
- 自动检测已初始化账户
- 健壮的错误处理
- 详细日志

---

## 🔍 检查和验证

### 检查程序配置

```bash
yarn ts-node scripts/check-program-config.ts
```

示例输出：
```
✅ Global Account
   Authority: 7xK...abc
   USDC Mint: EPjF...1v

✅ Platform Treasury
   Balance: 0 USDC

✅ Reward Treasury
   Balance: 0 USDC

✅ Creator Treasury
   Balance: 0 USDC

✅ VRF Treasury
   Balance: 0 USDC
```

### 安全验证

```bash
yarn ts-node scripts/verify-security.ts
```

---

## 📝 重要地址

### Devnet
- tUSDC Mint: 存储在 `test-usdc-config.json`

### Mainnet
- USDC Mint: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`
- Program ID: 运行 `anchor keys list`

### PDA 推导

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

// Reward Treasury PDA
const [rewardTreasuryPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("reward_treasury")],
  programId
);

// Creator Treasury PDA
const [creatorTreasuryPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("creator_treasury")],
  programId
);

// VRF Treasury PDA
const [treasuryPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("treasury")],
  programId
);
```

---

## 🐛 故障排除

### 1. "Account does not exist" 错误

**原因**: Global 账户未初始化

**解决**:
```bash
# Devnet
TEST_USDC_MINT=<mint> yarn ts-node scripts/initialize-devnet.ts

# Mainnet
yarn ts-node scripts/initialize-mainnet.ts
```

### 2. "Insufficient SOL" 错误

**原因**: SOL 余额不足

**解决**:
```bash
# Devnet
solana airdrop 2

# Mainnet
# 从交易所转账 SOL
```

### 3. "Already initialized" 警告

**原因**: 账户已存在

**解决**: 这是预期行为，脚本会跳过已初始化的账户。

### 4. RPC 限流

**原因**: 公共 RPC 限制

**解决**: 使用付费 RPC 提供商
```bash
# Helius
export ANCHOR_PROVIDER_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY

# QuickNode
export ANCHOR_PROVIDER_URL=https://your-endpoint.quiknode.pro/YOUR_KEY/
```

---

## ⚡ 快速参考

```bash
# Devnet 完整流程
yarn ts-node scripts/create-test-usdc.ts
# 记录输出的 mint 地址
TEST_USDC_MINT=<mint> yarn ts-node scripts/initialize-devnet.ts
yarn ts-node scripts/check-program-config.ts
yarn ts-node scripts/mint-test-usdc.ts 10000

# Mainnet 完整流程
# 1. 更新 Anchor.toml: cluster = "mainnet"
# 2. 运行:
yarn ts-node scripts/initialize-mainnet.ts
```

---

**祝部署顺利！**
