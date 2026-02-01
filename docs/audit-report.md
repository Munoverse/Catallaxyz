# Catallaxyz 代码审计报告（前后端/合约/数据库）

生成时间：2026-01-31（第四次全面审计 + 修复）

---

## 审计范围

- **前端**：`apps/frontend/`（页面、组件、hooks、API 客户端）
- **后端**：`apps/backend/`（API 服务器、CLOB API、Data API、WebSocket、Workers）
- **合约**：`contracts/catallaxyz/programs/catallaxyz/`（指令、状态、常量）
- **数据层**：Redis（订单簿、缓存）、Supabase（持久化）、链上状态
- **共享**：`contracts/catallaxyz/shared/`（常量、类型、数据库工具）

---

## 审计摘要

| 类别 | 严重 | 中等 | 低优先级 |
|------|------|------|----------|
| 前端 | 5 | 4 | 5 |
| 后端 | 4 | 6 | 5 |
| 合约 | 4 | 4 | 7 |
| 数据层 | 5 | 6 | 9 |
| **总计** | **18** | **20** | **26** |

---

## 🔴 严重问题

### 前端严重问题

| # | 问题 | 位置 | 风险 | 状态 |
|---|------|------|------|------|
| F-C1 | XSS 风险 - `dangerouslySetInnerHTML` | `CommentItem.tsx:79`, `HeaderLogo.tsx:53,60` | 中高 | ⚠️ 待优化（已有 DOMPurify 保护） |
| F-C2 | 过度使用 `any` 类型 | 全局 121 处 | 中 | ⚠️ 逐步改进中 |
| F-C3 | 代码重复 - orderbook 过滤 | `TradingPanel.tsx`, `OrderbookView.tsx`, `ProbabilityChart.tsx` | 中 | ✅ 已修复 - 统一使用 `useOrderbookFilters` |
| F-C4 | 重复工具函数 | `solana/wallet.ts:20-29`, `solana/accounts.ts:211-219` | 低 | ✅ 已修复 - 合并到 wallet.ts 并重导出 |
| F-C5 | 未使用的 mock 数据 | `ProfileTabsEnhanced.tsx:20-21` | 低 | ✅ 已修复 - 删除 mock 数据 |

### 后端严重问题

| # | 问题 | 位置 | 风险 | 状态 |
|---|------|------|------|------|
| B-C1 | 开发模式堆栈追踪暴露 | `routes/users.ts:265,596,1049,1224` | 低（仅开发） | ⚠️ 生产环境已正确处理 |
| B-C2 | 部分路由缺少输入验证 | 多个路由文件 | 中 | ⚠️ 建议使用 Zod |
| B-C3 | 速率限制可能有缺口 | `server.ts:73-85` | 中 | ⚠️ 建议验证所有端点 |
| B-C4 | 错误响应格式不一致 | 多个路由文件 | 中 | ✅ 已添加标准格式文档到 error-handler.ts |

### 合约严重问题

| # | 问题 | 位置 | 风险 | 状态 |
|---|------|------|------|------|
| C-C1 | `match_orders.rs` 缺少 vault 余额验证 | `match_orders.rs:274-316` | 高 | ⚠️ 内部账本模式，无 vault CPI |
| C-C2 | `match_orders.rs` remaining_accounts 缺少账户约束 | `match_orders.rs:208-225` | 中 | ✅ 已修复 - 添加 market/user 约束验证 |
| C-C3 | 费用计算使用 `saturating_sub` 而非 `checked_sub` | `match_orders.rs:400,427` | 中低 | ✅ 已修复 - 使用 checked_sub |
| C-C4 | `settle_with_randomness.rs` 潜在竞态条件 | `settle_with_randomness.rs:129-132` | 中 | ⚠️ Solana 顺序执行已缓解 |

### 数据层严重问题

| # | 问题 | 位置 | 风险 | 状态 |
|---|------|------|------|------|
| D-C1 | Persist worker 流处理竞态条件 | `workers/persist.ts:279,324,369` | 高 | ✅ 已修复 - 添加幂等性检查和 upsert |
| D-C2 | 余额同步竞态条件 | `workers/persist.ts:499-558` | 高 | ⚠️ 建议使用分布式锁 |
| D-C3 | 交易同步缺少幂等性 | `sync-trades.ts:155` | 中 | ⚠️ 建议改进唯一标识符 |
| D-C4 | 事件同步失败时可跳过事件 | `sync-events.ts:782-812` | 高 | ✅ 已修复 - 仅更新成功处理的状态 |
| D-C5 | Settlement worker 缺少订单验证 | `settlement-worker.ts:74-111` | 中 | ⚠️ 建议添加验证 |

---

## 🟡 中等优先级问题

### 前端中等问题

| # | 问题 | 说明 |
|---|------|------|
| F-M1 | 缺少 memoization | `ProbabilityChart.tsx`, `TradingPanel.tsx` 需要 `useMemo`/`useCallback` |
| F-M2 | 生产环境 console 语句 | 发现 112 处，应使用 `frontend-logger.ts` |
| F-M3 | API 错误处理不一致 | 混合使用 console.error、toast、silent fail |
| F-M4 | 部分 fetch 未使用 `apiFetch` | `tips/history/page.tsx:63` 等使用直接 fetch |

### 后端中等问题

| # | 问题 | 说明 |
|---|------|------|
| B-M1 | 错误响应格式不一致 | 部分返回 `{ success: false, error }` 格式不统一 |
| B-M2 | 部分端点缺少分页限制 | `routes/users.ts`, `routes/markets.ts` |
| B-M3 | 数据库查询效率 | 部分查询可能受益于索引 |
| B-M4 | Worker 错误恢复不完整 | 缺少死信队列用于最大重试后的失败消息 |
| B-M5 | Redis Lua 脚本竞态条件 | `place-order.lua` 高并发下可能存在边缘情况 |
| B-M6 | Supabase 连接池未显式配置 | 建议根据负载配置连接池限制 |

### 合约中等问题

| # | 问题 | 说明 |
|---|------|------|
| C-M1 | `redeem_single_outcome.rs` 错误消息不清晰 | `MarketNotTerminated` 用于 final_price 缺失场景 |
| C-M2 | `fill_order.rs` operator 账户初始化验证不足 | 使用 `init_if_needed` 但未验证初始化状态 |
| C-M3 | `global.rs` 费用计算潜在溢出 | `fee_reduction` 计算使用 u64 乘法 |
| C-M4 | CPI 后账户重载不一致 | 部分指令重载（如 `deposit_usdc.rs`），部分不重载 |

### 数据层中等问题

| # | 问题 | 说明 |
|---|------|------|
| D-M1 | Redis 和 Postgres 无事务协调 | Redis 提交后 Postgres 单独写入，失败会导致不一致 |
| D-M2 | 余额同步频率过低 | 每 60 次迭代（约5分钟），高峰期漂移显著 |
| D-M3 | RPC 调用错误被静默忽略 | `sync-events.ts:249` 忽略 RPC 错误 |
| D-M4 | 订单状态更新竞态条件 | `sync-events.ts:356-377` 更新无锁 |
| D-M5 | Nonce 同步可能错误取消订单 | `sync-events.ts:460` 简单比较可能取消有效订单 |
| D-M6 | Failed match requeue 无重试 | `settlement-worker.ts:166` requeue 失败无处理 |

---

## 🟢 低优先级 / 优化机会

### 前端

| # | 问题 | 建议 |
|---|------|------|
| F-L1 | Tiptap 内容类型为 `any` | `types/index.ts:148` 定义正确类型 |
| F-L2 | 环境变量访问分散 | 集中到 `lib/constants.ts` |
| F-L3 | 组件导出有限 | `components/index.ts` 扩展导出 |
| F-L4 | Hook 命名不一致 | `usecatallaxyzProgram` → `useCatallaxyzProgram` |
| F-L5 | 缺少 Error Boundaries | 主要区域添加错误边界 |

### 后端

| # | 问题 | 建议 |
|---|------|------|
| B-L1 | 代码重复 | 认证/验证模式重复，提取到中间件 |
| B-L2 | 缓存策略 | 考虑 Redis 用于分布式缓存 |
| B-L3 | API 响应不一致 | 标准化响应包装格式 |
| B-L4 | 请求 ID 传播不完整 | 确保所有日志包含请求 ID |
| B-L5 | Worker 优雅关闭超时 | 10 秒可能不够，建议可配置 |

### 合约

| # | 问题 | 建议 |
|---|------|------|
| C-L1 | `match_orders.rs` 冗余检查 | `validate_order` 和 `validate_taker` 可合并 |
| C-L2 | `fill_order.rs` 事件缺少费用分配详情 | 添加 platform/maker/creator 分成信息 |
| C-L3 | `saturating_sub` vs `checked_sub` 不一致 | 标准化使用 `checked_sub` |
| C-L4 | `order_types.rs:97-107` 缺少边界检查 | 价格计算可能静默产生错误结果 |
| C-L5 | 多处使用通用 `InvalidInput` 错误 | 添加更具体的错误变体 |
| C-L6 | 潜在未使用指令 | 验证 `cancel_order.rs`, `request_randomness.rs` 是否使用 |
| C-L7 | `create_market.rs` 缺少空字符串验证 | 验证非空字符串 |

### 数据层

| # | 问题 | 建议 |
|---|------|------|
| D-L1 | 冗余同步操作 | `sync-events.ts` 和 `sync-trades.ts` 处理重叠数据 |
| D-L2 | 连接池大小可能不足 | 默认 20，建议高并发下 50+ |
| D-L3 | 可能缺少索引 | `wallet_address`, `solana_market_account`, `transaction_signature` |
| D-L4 | `deposit.lua` 余额初始化竞态 | 分开检查 EXISTS 和 HSET |
| D-L5 | Orderbook 深度查询效率 | 使用 `HMGET` 替代多个 `HGET` |
| D-L6 | 缺少连接池监控 | 添加使用率、等待时间、连接泄漏指标 |
| D-L7 | 同步状态更新非原子 | `sync-events.ts:814` 应与事件处理原子化 |
| D-L8 | 市场同步不处理已删除市场 | 可能保留过时市场数据 |
| D-L9 | 遗留 CLOB 代码仍存在 | `matching.ts`, `orderbook.ts` 有遗留代码 |

---

## ✅ 常量同步状态

| 常量 | Rust | TypeScript | 状态 |
|------|------|------------|------|
| `USDC_DECIMALS` | 6 | 6 | ✅ |
| `OUTCOME_YES` | 0 | 0 | ✅ |
| `OUTCOME_NO` | 1 | 1 | ✅ |
| `PRICE_SCALE` | 1,000,000 | 1,000,000 | ✅ |
| `PRICE_TOLERANCE` | 100 | 100 | ✅ |
| `MAX_QUESTION_LEN` | 200 | 200 | ✅ |
| `MAX_DESCRIPTION_LEN` | 500 | 500 | ✅ |
| `MAX_OUTCOME_DESCRIPTION_LEN` | 200 | 200 | ✅ |
| `INACTIVITY_TIMEOUT_SECONDS` | 604,800 | 604,800 | ✅ |
| `DEFAULT_TERMINATION_PROBABILITY` | 1,000 | 1,000 | ✅ |
| `VRF_FEE_LAMPORTS` | 5,000,000 | 5,000,000 | ✅ |
| `MARKET_CREATION_FEE` | 10,000,000 | 10,000,000 | ✅ |
| `TERMINATION_EXECUTION_REWARD_USDC` | 100,000 | 100,000 | ✅ |

---

## ✅ 正面发现

### 前端
- 代码分割已实现（Admin 页面使用 `next/dynamic`）
- XSS 防护（使用 DOMPurify）
- 钱包签名认证
- ESLint 配置完善

### 后端
- 集中式错误处理（防止生产环境堆栈追踪泄露）
- Helmet 安全头 + CSP
- 一致的钱包签名认证中间件
- 全局速率限制
- XSS 防护工具 (`lib/sanitize.ts`)
- Worker 重试逻辑和优雅关闭
- Redis Lua 脚本保证原子操作
- Supabase 参数化查询防 SQL 注入
- 结构化日志带请求 ID
- 健康检查端点

### 合约
- 广泛使用 `checked_add`, `checked_sub`, `checked_mul`, `checked_div`
- 强 Anchor 账户约束
- 全面的错误枚举
- 正确的状态转换和验证
- 结构良好的费用计算和分配
- Operator 授权检查
- VRF/Switchboard 集成验证

### 数据层
- Redis Stream 消费者组
- Supabase RLS 策略
- 数据库重试工具
- 环境变量验证

---

## 📋 建议的修复优先级

### 立即修复（严重）

1. **合约 C-C1**: `match_orders.rs` 添加 vault 余额验证
2. **数据层 D-C1/D-C2**: 添加唯一约束和分布式锁防止重复
3. **数据层 D-C4**: 修复事件同步失败时跳过事件的问题
4. **前端 F-C2**: 减少 `any` 类型使用，特别是核心业务逻辑

### 短期修复（中等）

5. **后端 B-M1**: 标准化错误响应格式
6. **后端 B-M4**: 实现 Worker 死信队列
7. **前端 F-M2**: 将 `console.*` 替换为 `logger.*`
8. **合约 C-M4**: 标准化 CPI 后账户重载
9. **数据层 D-M1**: 考虑 Saga 模式或两阶段提交

### 长期改进（低优先级）

10. 前端性能优化（memoization）
11. 后端代码重复提取
12. 合约错误消息改进
13. 数据层连接池监控
14. 移除遗留 CLOB 代码

---

## 代码质量评分

| 模块 | 评分 | 说明 |
|------|------|------|
| 前端 | ⭐⭐⭐⭐ | 类型安全需改进，代码重复需整理 |
| 后端 | ⭐⭐⭐⭐ | 输入验证和错误格式需标准化 |
| 合约 | ⭐⭐⭐⭐⭐ | 安全实践良好，常量同步完成 |
| 数据层 | ⭐⭐⭐ | 竞态条件和数据一致性需重点关注 |

**整体评分：⭐⭐⭐⭐**

---

## 与上次审计对比

### 已修复问题（保持修复）
- ✅ 硬编码 USDC mint fallback
- ✅ Admin 页面代码分割
- ✅ 评论输入 sanitization
- ✅ 数据库错误处理
- ✅ 分页限制
- ✅ 常量同步
- ✅ 废弃代码清理（FundWallet, withdraw.lua 等）

### 新发现问题
- 🆕 数据层竞态条件（5 个严重问题）
- 🆕 合约 vault 余额验证缺失
- 🆕 前端 `any` 类型过度使用
- 🆕 事件同步可靠性问题

---

---

## 🛠️ 本次修复汇总

### 2026-01-31 修复记录

| # | 模块 | 修复内容 | 文件 |
|---|------|----------|------|
| 1 | 合约 | 添加 maker 账户约束验证（market, user） | `match_orders.rs` |
| 2 | 合约 | 费用计算改用 checked_sub | `match_orders.rs` |
| 3 | 数据层 | 事件同步失败时停止并只更新成功状态 | `sync-events.ts` |
| 4 | 数据层 | 添加 fills/deposits 幂等性检查 | `persist.ts` |
| 5 | 前端 | 统一 orderbook 过滤使用 useOrderbookFilters | `TradingPanel.tsx`, `OrderbookView.tsx`, `ProbabilityChart.tsx` |
| 6 | 前端 | 合并重复的地址转换函数 | `accounts.ts` → 重导出自 `wallet.ts` |
| 7 | 前端 | 删除未使用的 mock 数据 | `ProfileTabsEnhanced.tsx` |
| 8 | 后端 | 添加标准错误响应格式文档 | `error-handler.ts` |

---

*审计人：Claude AI*
*审计方法：静态代码分析 + 多代理并行审计 + 代码修复*
*审计完成时间：2026-01-31*
*最后更新：2026-01-31（第四次全面审计 + 修复）*
