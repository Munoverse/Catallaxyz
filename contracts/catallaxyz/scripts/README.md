# Catallaxyz 初始化脚本说明

本目录包含 Catallaxyz 项目的所有初始化和管理脚本。

## 📋 脚本总览

### 初始化脚本

| 脚本 | 用途 | 网络 | 命令 |
|------|------|------|------|
| `create-test-usdc.ts` | 创建测试 USDC mint | Devnet | `yarn create-test-usdc` |
| `initialize-with-tusdc.ts` | 使用测试 USDC 初始化 Global | Devnet | `yarn init-with-tusdc` |
| `initialize-platform-treasury.ts` | 初始化平台财库 | Devnet/Mainnet | `yarn init-platform-treasury` |
| `initialize-reward-treasury.ts` | 初始化奖励财库 | Devnet/Mainnet | `yarn init-reward-treasury` |
| `initialize-creator-treasury.ts` | 初始化创建者激励财库 | Devnet/Mainnet | `yarn init-creator-treasury` |
| `initialize-treasury.ts` | 初始化 VRF 财库 | Devnet/Mainnet | `yarn init-treasury` |
| `initialize-mainnet.ts` | 主网完整初始化（一键） | **Mainnet** | `yarn init-mainnet` |

### 管理脚本

| 脚本 | 用途 | 命令 |
|------|------|------|
| `mint-test-usdc.ts` | 铸造测试 USDC | `yarn mint-test-usdc <amount>` |
| `mint-tusdc-to-user.ts` | 给指定用户铸造测试 USDC | `yarn mint-tusdc-to <address> <amount>` |
| `check-program-config.ts` | 检查程序配置 | `yarn check-config` |
| `verify-security.ts` | 安全审计 | `yarn verify-security` |

---

## 🚀 Devnet 初始化流程

### 步骤 1: 创建测试 USDC

```bash
cd catallaxyz
yarn create-test-usdc
```

这会创建：
- 一个新的 tUSDC mint（6 decimals）
- 保存配置到 `test-usdc-config.json`

### 步骤 2: 初始化 Global 账户

```bash
yarn init-with-tusdc
```

这会：
- 使用 tUSDC 初始化 Global 账户
- 设置 authority 为当前钱包

### 步骤 3: 初始化 Platform Treasury

```bash
yarn init-platform-treasury
```

这会：
- 创建 Platform Treasury token 账户
- 用于收集交易费和创建费

### 步骤 4: 初始化 Reward Treasury

```bash
yarn init-reward-treasury
```

这会：
- 创建 Reward Treasury token 账户
- 用于收集流动性奖励资金

### 步骤 5: 初始化 Creator Treasury

```bash
yarn init-creator-treasury
```

这会：
- 创建 Creator Treasury token 账户
- 用于收集市场创建者激励资金

### 步骤 6: 初始化 VRF Treasury

```bash
yarn init-treasury
```

这会：
- 创建 VRF Treasury token 账户
- 用于 VRF 相关费用

### 步骤 7: 验证配置

```bash
yarn check-config
```

确认所有账户都已正确初始化。

### 步骤 8: 铸造测试 USDC

```bash
# 给自己铸造 10,000 tUSDC
yarn mint-test-usdc 10000

# 给其他用户铸造
yarn mint-tusdc-to <用户地址> 1000
```

---

## 🌐 Mainnet 初始化流程

### ⚠️ 重要提醒

**主网部署是不可逆的操作，请务必：**
1. 完成代码审计
2. 在 Devnet 充分测试
3. 准备至少 10 SOL
4. 备份密钥
5. 使用硬件钱包或多签（推荐）

### 环境准备

```bash
# 1. 配置 Solana CLI
solana config set --url https://api.mainnet-beta.solana.com
solana config set --keypair ~/.config/solana/mainnet-deployer.json

# 2. 检查余额
solana balance
# 应该有至少 5-10 SOL

# 3. 配置环境变量（推荐使用付费 RPC）
export ANCHOR_PROVIDER_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
export ANCHOR_WALLET=~/.config/solana/mainnet-deployer.json
```

### 方式 1: 一键初始化（推荐）

```bash
cd catallaxyz
yarn init-mainnet
```

这个脚本会自动完成：
1. ✅ 检查网络和余额
2. ✅ 验证程序已部署
3. ✅ 初始化 Global 账户（使用真实 USDC）
4. ✅ 初始化 Platform Treasury
5. ✅ 初始化 VRF Treasury
6. ✅ 最终验证

**脚本特点：**
- 有 10 秒确认等待期
- 自动检测已初始化的账户
- 完整的错误处理
- 详细的日志输出

### 方式 2: 手动逐步初始化

如果你想更多控制，可以分步执行：

```bash
# 1. 修改 initialize-with-tusdc.ts
# 将 tUSDC mint 改为主网 USDC:
# EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v

# 2. 逐步执行
yarn init-with-tusdc
yarn init-platform-treasury
yarn init-treasury
yarn check-config
```

---

## 🔍 检查和验证

### 检查程序配置

```bash
yarn check-config
```

输出示例：
```
✅ Global Account
   Authority: 7xK...abc
   USDC Mint: EPjF...1v
   
✅ Platform Treasury
   Balance: 0 USDC
   
✅ VRF Treasury
   Balance: 0 USDC
```

### 安全审计

```bash
yarn verify-security
```

检查项目：
- ✅ Authority 配置
- ✅ Treasury 初始化
- ✅ 权限设置
- ✅ 费率配置

---

## 📝 重要地址

### Devnet
- tUSDC Mint: 在 `test-usdc-config.json` 中

### Mainnet
- USDC Mint: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`
- Program ID: 运行 `anchor keys list` 查看

### PDA 计算
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

## 🐛 常见问题

### 1. "Account does not exist" 错误

**原因**: Global 账户未初始化

**解决**: 先运行初始化脚本
```bash
# Devnet
yarn init-with-tusdc

# Mainnet
yarn init-mainnet
```

### 2. "Insufficient SOL" 错误

**原因**: 余额不足

**解决**: 
```bash
# Devnet
solana airdrop 2

# Mainnet
# 从交易所转账 SOL
```

### 3. "Already initialized" 警告

**原因**: 账户已存在

**解决**: 这是正常的，脚本会跳过已初始化的账户

### 4. RPC Rate Limit

**原因**: 使用公共 RPC 有请求限制

**解决**: 使用付费 RPC 服务
```bash
# Helius
export ANCHOR_PROVIDER_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY

# QuickNode
export ANCHOR_PROVIDER_URL=https://your-endpoint.quiknode.pro/YOUR_KEY/

# Alchemy
export ANCHOR_PROVIDER_URL=https://solana-mainnet.g.alchemy.com/v2/YOUR_KEY
```

### 5. "Not the authority" 错误

**原因**: 当前钱包不是 Global 账户的 authority

**解决**: 切换到正确的部署钱包
```bash
solana config set --keypair <correct-keypair.json>
```

---

## 📚 相关文档

- [主网部署指南](../MAINNET_DEPLOYMENT.md)
- [部署文档](../DEPLOYMENT.md)
- [非活跃终止指南](../INACTIVITY_TERMINATION_GUIDE.md)

---

## 🆘 获取帮助

如果遇到问题：
1. 检查日志中的错误信息
2. 运行 `yarn check-config` 查看当前状态
3. 查看 Solana Explorer 确认交易状态
4. 阅读相关文档

---

## ⚡ 快速参考

```bash
# Devnet 完整流程
yarn create-test-usdc
yarn init-with-tusdc
yarn init-platform-treasury
yarn init-treasury
yarn check-config
yarn mint-test-usdc 10000

# Mainnet 完整流程
export ANCHOR_PROVIDER_URL=https://api.mainnet-beta.solana.com
export ANCHOR_WALLET=~/.config/solana/mainnet-deployer.json
yarn init-mainnet
```

---

**祝部署顺利！🚀**
