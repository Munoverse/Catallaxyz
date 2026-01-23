# Catallaxyz - Prediction Market Protocol

A Solana-based binary prediction market protocol built with Anchor framework, featuring dynamic fee curves, random termination mechanism, and off-chain order matching.

---

# Catallaxyz - Prediction Market Protocol (Beta, not yet market-validated or publicly tested)

In current prediction markets, most markets depend on short-term, foreseeable outcomes and lack subjective prediction markets. In addition, outcomes are typically determined via oracles and UMA. In real operation, however, insider trading and UMA manipulation often occur, causing users to lose funds.

This project is based on the Harvard team's paper "Self-Resolving Prediction Markets for Unverifiable Outcomes" https://arxiv.org/abs/2306.04305
It implements markets that require no external result verification, addressing unverifiable, highly subjective outcomes. Markets are randomly terminated without relying on UMA for control.
The paper introduces a self-settling prediction market based on negative cross-entropy: the information increment from participation affects rewards to participating voters, and the market is randomly terminated by selecting the last K agents, on the belief that later participants have the most information.
In Catallaxyz, users provide prediction values and reference agent predictions through trades and orders. The termination probability implied by negative cross-entropy is implemented via Switchboard VRF random termination. Users effectively realize information-increment rewards through price spreads during trading, thereby implementing the paper's negative-cross-entropy self-settling market.
In Catallaxyz, users can freely create markets. Unlike traditional prediction markets where the winner takes all and losers' positions go to zero, Catallaxyz settles to a probability, and redemption is based on position × probability (price). Currently only binary markets are supported.

Innovations:
1. Random termination mechanism: during trading, random termination is selected by default. After a buy order succeeds, Switchboard VRF automatically provides a random number with a 0.1% chance to terminate the market. After termination, USDC redemption is based on the terminating order. For example, if the final terminating order trades YES at 0.8 USDC, then NO is priced at 1 - YES USDC.
This design prevents losers' funds from going to zero and follows the paper's design. If a user holds only YES bought at 0.5 USDC, they profit 0.3 USDC at redemption. If a user holds only NO bought at 0.1 USDC, they can still profit 0.1 USDC at redemption. If both YES and NO are bought at low prices, users can profit by merging before termination. If YES + NO > 1 USDC, they can also profit by splitting and selling.
2. Meme coin tipping: market rankings on the homepage are determined by supporters tipping market creators. Meme coins can be used to tip commenters and market creators, affecting market and comment rankings.

The meme coin CA will be publicly announced when released; it has not been released yet.
Catallaxyz's CLOB is also based on off-chain matching with on-chain verification. Users trade without gas fees, completely free. Limit orders have no fees; market order fees are at most 3.2% around the 50% price point and 0.2% at extreme prices (probabilities).
Solana was chosen for its low gas fees and fast, responsive VRF functionality.

---

# Catallaxyz - 预测市场协议（测试版，还未经过市场验证和公开测试）

在目前的预测市场中，所有的市场都是依赖于短期内可预见结果的市场，缺乏主观预测市场。而且预测市场都是基于预言机和UMA来决定结果，但是在市场实际运行中，往往存在大量的内幕交易和UMA操纵，导致用户损失资金。

本项目基于哈佛大学团队的论文《Self-Resolving Prediction Markets for Unverifiable Outcomes》https://arxiv.org/abs/2306.04305
实现了无需外部结果验证，解决不可验证问题，主观性较强的市场，通过随机终结市场，不需要UMA来控制市场
论文中创新的提出了基于负交叉熵的自结算预测市场，用户参与的信息增量影响了参与投票的用户提供奖励，并且选择最后K个代理人随机终结市场，因为确信后面的人总是掌握信息最多的人。
在Catallaxyz中，用户通过交易和订单提供预测值和参考代理人的预测值，通过swtichboard VRF随机终止市场来实现负交叉熵中的市场终止概率，用户在交易过程中实际通过差价已经提前实现了信息增量所带来的奖励，通过这种方式来实现了论文中基于负交叉熵的自结算预测市场。
在Catallaxyz中，用户可以自由的创建市场，不同于以往的预测市场，最终赢家赢得一切，而输的人则是头寸归零，Catallaxyz中，最终的结果仍然是概率，最后仍是以头寸*概率（价格）赎回，目前仅支持二元市场。

创新点：
1.随机终结机制：用户在交易过程中，默认是勾选随机终结，买家在购买成功后，会自动Switchboard VRF获取随机数，有0.1%的概率来终结市场，市场终结后的头寸赎回时能兑换的USDC则是以该订单为准，例如用户在最后的终结订单中交易的是yes的价格是0.8USDC，则no的价格会是1-yes USDC。
这样设计的能防止输家资金最终归零，也遵从论文设计，如果用户手里仅仅持有的yes当初是0.5USDC购买的，则在赎回时会盈利0.3USDC，如果仅仅持有no如果当初是0.1USDC购买的，则在赎回时候还能盈利0.1USDC，如果当初在低价买入yes和no，市场终结之前，也能通过合并来获利，如果yes+no>1USDC，则可以通过拆分卖出来获利
2.meme coin打赏，首页中市场的排名是市场支持者对市场创建者的打赏而决定顺序的，memecoin可以用来打赏给评论和市场创建者，影响市场排行和评论排行

meme coin以后发布时会公开CA，目前还没有发布
Catallaxyz的CLOB也是基于链下撮合，链上验证，用户交易无需gas费，纯免费，限价单没有手续费，市价单的手续费最高在50%左右是3.2%，在两边极端价格（概率）是0.2%
选择solana链是因为上面低廉的gas费以及快速相应的VRF功能


---

## Table of Contents / 目录

- [Features / 功能特性](#features--功能特性)
- [Architecture / 架构](#architecture--架构)
- [Core Concepts / 核心概念](#core-concepts--核心概念)
- [Instructions / 指令](#instructions--指令)
- [Fee Structure / 费率结构](#fee-structure--费率结构)
- [Market Termination / 市场终止机制](#market-termination--市场终止机制)
- [Getting Started / 快速开始](#getting-started--快速开始)
- [Security / 安全性](#security--安全性)

---

## Features / 功能特性

### English

- **Binary Prediction Markets**: Create YES/NO outcome markets for any event
- **Dynamic Fee Curve**: Taker fees vary from 0.2% to 3.2% based on price distance from 50%
- **Off-chain Order Matching**: Efficient CLOB (Central Limit Order Book) with on-chain settlement
- **Random Termination**: VRF-based random termination mechanism using Switchboard
- **Inactivity Termination**: Markets auto-terminate after 7 days of inactivity
- **Position Split/Merge**: Convert USDC ↔ YES+NO tokens at 1:1 ratio
- **Creator Incentives**: 5% of taker fees allocated to market creators
- **Maker Rebates**: 20% of taker fees returned to liquidity providers

### 中文

- **二元预测市场**: 为任何事件创建 YES/NO 结果市场
- **动态费率曲线**: Taker 费率根据价格与 50% 的距离在 0.2% 到 3.2% 之间变化
- **链下订单撮合**: 高效的中央限价订单簿 (CLOB)，链上结算
- **随机终止**: 基于 Switchboard VRF 的随机终止机制
- **不活跃终止**: 市场在 7 天无活动后自动终止
- **仓位拆分/合并**: 以 1:1 比例转换 USDC ↔ YES+NO 代币
- **创建者激励**: 5% 的 taker 费用分配给市场创建者
- **Maker 返佣**: 20% 的 taker 费用返还给流动性提供者

---

## Architecture / 架构

### English

```
┌─────────────────────────────────────────────────────────────┐
│                      User Interface                         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Off-chain Matching Engine (CLOB)               │
│         Signs fills with settlement_signer key              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                 Catallaxyz Smart Contract                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │   Global    │  │   Market    │  │   User Accounts     │ │
│  │   State     │  │   State     │  │ (Balance/Position)  │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Solana Blockchain                        │
│              (SPL Token / Switchboard VRF)                  │
└─────────────────────────────────────────────────────────────┘
```

### 中文

```
┌─────────────────────────────────────────────────────────────┐
│                        用户界面                              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│               链下撮合引擎 (中央限价订单簿)                    │
│           使用 settlement_signer 密钥签名成交                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  Catallaxyz 智能合约                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │  全局状态    │  │  市场状态    │  │   用户账户          │ │
│  │  (Global)   │  │  (Market)   │  │ (余额/仓位)         │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Solana 区块链                           │
│               (SPL Token / Switchboard VRF)                 │
└─────────────────────────────────────────────────────────────┘
```

---

## Core Concepts / 核心概念

### Global State / 全局状态

| Field | Description (EN) | 描述 (中文) |
|-------|------------------|-------------|
| `authority` | Admin wallet that can update settings | 可更新设置的管理员钱包 |
| `usdc_mint` | USDC token mint address | USDC 代币铸造地址 |
| `settlement_signer` | Public key for verifying trade signatures | 用于验证交易签名的公钥 |
| `center_taker_fee_rate` | Fee rate at 50% price (3.2%) | 50% 价格时的费率 (3.2%) |
| `extreme_taker_fee_rate` | Fee rate at 0%/100% price (0.2%) | 0%/100% 价格时的费率 (0.2%) |

### Market State / 市场状态

| Field | Description (EN) | 描述 (中文) |
|-------|------------------|-------------|
| `creator` | Market creator's wallet | 市场创建者钱包 |
| `market_id` | Unique 32-byte market identifier | 唯一的 32 字节市场标识符 |
| `status` | 0=Active, 1=Settled, 4=Terminated | 0=活跃, 1=已结算, 4=已终止 |
| `outcome_token_mints` | YES/NO token mint addresses | YES/NO 代币铸造地址 |
| `termination_probability` | VRF termination chance per trade | 每笔交易的 VRF 终止概率 |
| `is_paused` | Emergency pause flag | 紧急暂停标志 |

### User Accounts / 用户账户

**UserBalance** - Tracks USDC deposited for trading / 追踪存入的 USDC 用于交易
```rust
pub struct UserBalance {
    pub user: Pubkey,
    pub market: Pubkey,
    pub usdc_balance: u64,
}
```

**UserPosition** - Tracks YES/NO token holdings / 追踪 YES/NO 代币持仓
```rust
pub struct UserPosition {
    pub user: Pubkey,
    pub market: Pubkey,
    pub yes_balance: u64,
    pub no_balance: u64,
}
```

---

## Instructions / 指令

### Initialization / 初始化

| Instruction | Description (EN) | 描述 (中文) |
|-------------|------------------|-------------|
| `initialize` | Initialize global program state | 初始化全局程序状态 |
| `init_treasury` | Create VRF fee treasury | 创建 VRF 费用金库 |
| `init_platform_treasury` | Create platform fee treasury | 创建平台费用金库 |
| `init_reward_treasury` | Create liquidity rewards treasury | 创建流动性奖励金库 |
| `init_creator_treasury` | Create creator incentives treasury | 创建创建者激励金库 |

### Market Management / 市场管理

| Instruction | Description (EN) | 描述 (中文) |
|-------------|------------------|-------------|
| `create_market` | Create a new prediction market (10 USDC fee) | 创建新预测市场 (10 USDC 费用) |
| `init_market_vault` | Initialize market's USDC vault | 初始化市场的 USDC 金库 |
| `pause_market` | Emergency pause (admin only) | 紧急暂停 (仅管理员) |
| `resume_market` | Resume paused market (admin only) | 恢复暂停的市场 (仅管理员) |

### Trading / 交易

| Instruction | Description (EN) | 描述 (中文) |
|-------------|------------------|-------------|
| `deposit_usdc` | Deposit USDC for trading | 存入 USDC 用于交易 |
| `withdraw_usdc` | Withdraw USDC from market | 从市场提取 USDC |
| `settle_trade` | Settle a signed trade from matching engine | 结算来自撮合引擎的签名交易 |
| `split_position_single` | Convert USDC → YES + NO tokens | 将 USDC 转换为 YES + NO 代币 |
| `merge_position_single` | Convert YES + NO → USDC | 将 YES + NO 代币转换为 USDC |

### Settlement & Termination / 结算与终止

| Instruction | Description (EN) | 描述 (中文) |
|-------------|------------------|-------------|
| `settle_market` | Settle market based on outcome | 根据结果结算市场 |
| `request_randomness` | Request Switchboard VRF | 请求 Switchboard VRF |
| `settle_with_randomness` | Check VRF for random termination | 检查 VRF 进行随机终止 |
| `terminate_if_inactive` | Terminate after 7 days inactivity (admin only) | 7 天无活动后终止 (仅管理员) |
| `redeem_single_outcome` | Redeem tokens for USDC after settlement | 结算后将代币兑换为 USDC |

### Admin / 管理

| Instruction | Description (EN) | 描述 (中文) |
|-------------|------------------|-------------|
| `update_fee_rates` | Update global fee configuration | 更新全局费率配置 |
| `update_market_params` | Update market parameters | 更新市场参数 |
| `withdraw_platform_fees` | Withdraw accumulated platform fees | 提取累积的平台费用 |
| `withdraw_reward_fees` | Withdraw from rewards treasury | 从奖励金库提取 |
| `distribute_liquidity_reward` | Distribute maker rewards | 分发 maker 奖励 |

---

## Fee Structure / 费率结构

### Dynamic Fee Curve / 动态费率曲线

**English:**

The taker fee rate varies based on the trade price using a linear interpolation:

```
Fee Rate = center_rate - (center_rate - extreme_rate) × |price - 0.5| / 0.5
```

| Price | Fee Rate |
|-------|----------|
| 0.50 (50%) | 3.2% (center) |
| 0.40 / 0.60 | 2.6% |
| 0.30 / 0.70 | 2.0% |
| 0.20 / 0.80 | 1.4% |
| 0.10 / 0.90 | 0.8% |
| 0.01 / 0.99 | 0.2% (extreme) |

**中文:**

Taker 费率根据交易价格使用线性插值变化:

```
费率 = 中心费率 - (中心费率 - 极端费率) × |价格 - 0.5| / 0.5
```

### Fee Distribution / 费用分配

| Recipient | Percentage | 接收方 | 百分比 |
|-----------|------------|--------|--------|
| Platform Treasury | 75% | 平台金库 | 75% |
| Maker Rebate | 20% | Maker 返佣 | 20% |
| Creator Incentive | 5% | 创建者激励 | 5% |

---

## Market Termination / 市场终止机制

### Random Termination (VRF) / 随机终止 (VRF)

**English:**

1. User opts-in to "check termination" when trading and pays 0.005 SOL VRF fee
2. After trade, frontend calls `settle_with_randomness`
3. Switchboard VRF generates random number
4. If random < termination_probability (default 0.1%), market terminates
5. Final price is based on last trade price

**中文:**

1. 用户交易时选择"检查终止"并支付 0.005 SOL VRF 费用
2. 交易后，前端调用 `settle_with_randomness`
3. Switchboard VRF 生成随机数
4. 如果随机数 < 终止概率 (默认 0.1%)，市场终止
5. 最终价格基于最后交易价格

### Inactivity Termination / 不活跃终止

**English:**

- If no trading activity for 7 consecutive days, the admin backend calls `terminate_if_inactive`
- Termination executor receives 0.10 USDC reward
- Final price uses last observed trade price (or 50% if no trades)
- Backend job: `yarn terminate-inactive` (logs to `backend/db/termination_log.json`)
- Optional cron: `yarn check-inactive` (set `ENABLE_INACTIVITY_TERMINATION=true`)

**中文:**

- 如果连续 7 天无交易活动，由管理员后台调用 `terminate_if_inactive`
- 最终价格使用最后观察到的交易价格 (如果市场从创建到终结都无交易则为 50%)
- 后台任务：`yarn terminate-inactive`（记录到 `backend/db/termination_log.json`）
- 可选定时任务：`yarn check-inactive`（设置 `ENABLE_INACTIVITY_TERMINATION=true`）

---

## Getting Started / 快速开始

### Prerequisites / 前置要求

- Rust 1.75+
- Solana CLI 1.18+
- Anchor 0.32.1
- Node.js 18+

### Build / 构建

```bash
cd contracts/catallaxyz

# Build the program
anchor build

# Run tests
anchor test
```

### Deploy / 部署

```bash
# Deploy to devnet
anchor deploy --provider.cluster devnet

# Deploy IDL
./scripts/deploy-idl.sh
```

### Initialize / 初始化

```bash
# Initialize program (see scripts/ for examples)
npx ts-node scripts/initialize-mainnet.ts
```

---

## Security / 安全性

### English

- **Signature Verification**: All trades are verified using Ed25519 signatures from the settlement signer
- **Overflow Protection**: All arithmetic operations use checked math
- **Access Control**: Admin functions restricted to authority wallet
- **Pause Mechanism**: Emergency pause capability for market protection
- **Invariant Checks**: Position collateral always equals YES + NO supply

### 中文

- **签名验证**: 所有交易都使用结算签名者的 Ed25519 签名进行验证
- **溢出保护**: 所有算术运算使用检查数学
- **访问控制**: 管理功能限制为授权钱包
- **暂停机制**: 具有紧急暂停能力以保护市场
- **不变量检查**: 仓位抵押始终等于 YES + NO 供应

---

## License / 许可证

MIT License
