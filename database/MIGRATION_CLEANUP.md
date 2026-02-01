# 数据库迁移清理指南

## 概述

经过代码审计和迁移统一，所有数据库定义现在集中在 `database/` 目录中。`supabase/migrations/` 已废弃并删除。

## 文件结构 (v1.3.0 统一后)

```
database/
├── schema.sql                    # ✅ 权威完整定义（新数据库使用，~3050行）
├── migrations.sql                # ⚠️ 原始迁移文件（大量冗余，仅保留参考）
├── migrations_optimized.sql      # ✅ 优化后的增量迁移（升级现有数据库）
├── MIGRATION_CLEANUP.md          # 📋 本文档
└── migrations/                   # 增量迁移文件
    ├── 001_create_tables.sql
    ├── 002_create_indexes.sql
    ├── 003_create_functions.sql
    ├── 004_add_performance_indexes.sql
    ├── 006_add_categories_table.sql
    ├── 011_code_audit_fixes.sql
    ├── 012_geo_rules.sql
    ├── 017_rls_security_fixes.sql
    ├── 018_add_missing_indexes.sql
    ├── 019_audit_fixes.sql
    ├── 020_audit_fixes_v106.sql
    ├── 021_medium_priority_fixes.sql
    ├── 022_cleanup_duplicates.sql
    ├── 023_audit_fixes_v112.sql
    ├── 024_cleanup_deprecated_columns.sql
    ├── 025_low_priority_fixes.sql
    ├── 026_audit_fixes_v125.sql
    ├── 027_audit_fixes_v129.sql
    # archived/ 目录已在 v1.3.1 审计中删除

supabase/                         # ❌ migrations/ 已删除
└── README.md                     # 仅保留说明文档
```

## v1.3.0 迁移统一 (2026-01-29)

已合并 `supabase/migrations/` 到 `database/schema.sql`：

| 原文件 | 合并内容 | 状态 |
|--------|----------|------|
| `20260101_add_indexes_and_constraints.sql` | 索引和约束（已存在于 schema.sql） | ✅ 已删除 |
| `20260128_fix_user_balances_rls.sql` | RLS 安全修复 + balance_audit_log 表 | ✅ 已合并 |

**安全修复**: 
- 移除不安全的 `"User balances are updated by owner"` 策略
- 新增 `balance_audit_log` 审计表追踪余额变更

## 部署策略

### 场景 A：全新数据库

直接使用 `schema.sql`：

```bash
psql -d your_database -f schema.sql
```

### 场景 B：从旧版升级

使用优化后的迁移脚本：

```bash
psql -d your_database -f migrations_optimized.sql
```

## 冗余详情

### 1. 完全冗余的迁移文件

以下文件的内容已完全包含在 `schema.sql` 中，可以归档或删除：

| 文件 | 原因 |
|------|------|
| `010_clob_optimization.sql` | 所有函数已在 schema.sql 中定义 |
| `013_add_auth_nonces.sql` | auth_nonces 表已在 schema.sql 中定义 |
| `014_notifications.sql` | notifications 表已在 schema.sql 中定义 |

### 2. 表定义重复（在 migrations.sql 和 schema.sql 中）

| 表名 | schema.sql | migrations.sql | 建议 |
|------|------------|----------------|------|
| `redemptions` | ✅ 行437-461 | 行107-131 | 保留 schema |
| `notifications` | ✅ 行818-837 | 行142-161 | 保留 schema |
| `platform_settings` | ✅ 行248-257 | 行545-551 | 保留 schema |
| `market_tips` | ✅ 行789-801 | 行734-745 | 保留 schema |
| `comment_tips` | ✅ 行804-815 | 行748-759 | 保留 schema |
| `inactive_market_candidates` | ✅ 行543-557 | 行420-434 | 保留 schema |
| `liquidity_snapshots` | ✅ 新增 | 行567-578 | 保留 schema |
| `liquidity_scores` | ✅ 新增 | 行584-594 | 保留 schema |
| `liquidity_score_state` | ✅ 新增 | 行602-613 | 保留 schema |
| `liquidity_rewards` | ✅ 新增 | 行622-637 | 保留 schema |

### 3. 函数定义重复

| 函数名 | schema.sql | migrations.sql | 建议 |
|--------|------------|----------------|------|
| `calculate_dynamic_taker_fee` | ✅ | ✅ | 保留 schema |
| `lock_funds_for_order` | ✅ | ✅ | 保留 schema |
| `apply_trade_fill` | ✅ | ✅ | 保留 schema |
| `unlock_cancelled_order` | ✅ | ✅ | 保留 schema |
| `deposit_usdc_balance` | ✅ | ✅ | 保留 schema |
| `update_market_tip_totals` | ✅ | ✅ | 保留 schema |
| `update_comment_tip_totals` | ✅ | ✅ | 保留 schema |
| `update_user_win_rate` | ✅ | ✅ | 保留 schema |
| `check_and_terminate_inactive_market` | ✅ | ✅ | 保留 schema |
| `terminate_all_inactive_markets` | ✅ | ✅ | 保留 schema |
| `refresh_inactive_market_candidates` | ✅ | ✅ | 保留 schema |
| `increment_profile_views` | ✅ | ✅ | 保留 schema |
| `calculate_taker_fee_rate` | ❌ | ✅ | 删除(与 calculate_dynamic_taker_fee 重复) |

### 4. ADD COLUMN IF NOT EXISTS 冗余

migrations.sql 中有大量 `ADD COLUMN IF NOT EXISTS` 语句添加的列已在 schema.sql 的表定义中存在：

**markets 表冗余列**: `switchboard_queue`, `randomness_account`, `random_termination_enabled`, `termination_probability`, `is_randomly_terminated`, `termination_triggered_at`, `termination_trade_id`, `final_yes_price`, `final_no_price`, `can_redeem`, `trade_nonce`, `center_taker_fee_rate`, `extreme_taker_fee_rate`, `maker_rebate_rate`, `market_usdc_vault`, `platform_fee_rate`, `creator_incentive_rate`, `tip_amount`, `tip_count`

**users 表冗余列**: `embedded_wallet_address`, `external_wallet_address`, `magic_user_id`, `auth_provider`, `oauth_provider`, `profile_views`

**comments 表冗余列**: `tip_amount`, `tip_count`

### 5. 索引重复

大量索引在 schema.sql 和 migrations.sql 中重复创建（使用 `IF NOT EXISTS` 不会报错，但冗余）：
- `idx_markets_title_trgm`
- `idx_markets_question_trgm`
- `idx_markets_tags_gin`
- `idx_orders_orderbook_lookup`
- `idx_orders_remaining_open`
- 等等...

## 本次优化内容

### schema.sql 新增内容

1. **流动性奖励系统表** (Section 6.1)
   - `liquidity_snapshots`
   - `liquidity_scores`
   - `liquidity_score_state`
   - `liquidity_rewards`

2. **RLS 策略**
   - 流动性表的 RLS 启用和策略

3. **约束**
   - `markets_category_check` - 市场分类约束

4. **触发器**
   - `update_market_volume_24h_trigger` - 24小时交易量更新

### migrations_optimized.sql 内容

只保留了以下增量内容：
1. `market_category` 枚举类型
2. `markets_category_check` 约束
3. 物化视图 `market_termination_status`
4. VRF 费用字段
5. 用户扩展字段
6. 流动性奖励系统表（如果不存在）
7. 24小时交易量触发器

## 建议操作

1. **备份原始 migrations.sql**
   ```bash
   cp migrations.sql migrations.sql.backup
   ```

2. **新数据库使用 schema.sql**
   ```bash
   psql -d new_db -f schema.sql
   ```

3. **升级现有数据库使用 migrations_optimized.sql**
   ```bash
   psql -d existing_db -f migrations_optimized.sql
   ```

4. **可选：归档冗余迁移文件**
   ```bash
   mkdir -p migrations/archived
   mv migrations/010_clob_optimization.sql migrations/archived/
   mv migrations/013_add_auth_nonces.sql migrations/archived/
   mv migrations/014_notifications.sql migrations/archived/
   ```

## v1.0.5 审计发现

### 新发现的重复定义

经过 v1.0.5 全面审计，确认以下重复定义问题仍然存在：

#### 函数重复定义 (12+)

| 函数名 | 定义位置 |
|--------|----------|
| `calculate_dynamic_taker_fee` | schema.sql, migrations.sql, archived/010_clob_optimization.sql |
| `lock_funds_for_order` | schema.sql, migrations.sql, archived/010_clob_optimization.sql |
| `apply_trade_fill` | schema.sql, migrations.sql, archived/010_clob_optimization.sql |
| `unlock_cancelled_order` | schema.sql, migrations.sql, archived/010_clob_optimization.sql |
| `deposit_usdc_balance` | schema.sql, migrations.sql, 011_code_audit_fixes.sql |
| `update_user_win_rate` | schema.sql, migrations.sql |
| `update_market_tip_totals` | schema.sql, migrations.sql |
| `update_comment_tip_totals` | schema.sql, migrations.sql |
| `increment_profile_views` | schema.sql, migrations.sql |
| `check_and_terminate_inactive_market` | schema.sql, migrations.sql |
| `terminate_all_inactive_markets` | schema.sql, migrations.sql |
| `refresh_inactive_market_candidates` | schema.sql, migrations.sql |

#### 触发器重复定义

| 触发器名 | 定义位置 |
|----------|----------|
| `update_market_tip_totals_trigger` | schema.sql, migrations.sql |
| `update_comment_tip_totals_trigger` | schema.sql, migrations.sql |
| `update_market_volume_24h_trigger` | schema.sql, migrations.sql, 015_fee_cleanup.sql, 016_fee_globalization_cleanup.sql |

#### 表重复定义

| 表名 | 定义位置 |
|------|----------|
| `auth_nonces` | schema.sql, archived/013_add_auth_nonces.sql |
| `notifications` | schema.sql, migrations.sql, archived/014_notifications.sql |
| `pending_settlements` | schema.sql, archived/010_clob_optimization.sql |

### 修复建议

1. **立即行动**：
   - 归档 `migrations/archived/` 中的冗余文件已完成
   - 新部署使用 `schema.sql`
   - 现有数据库升级使用 `migrations_optimized.sql`

2. **长期计划**：
   - 清理 `migrations.sql` 中的冗余定义
   - 重构为纯增量迁移模式
   - 使用迁移工具 (如 Prisma Migrate, Flyway) 管理迁移

### 注意事项

- 重复定义使用 `CREATE OR REPLACE` 不会导致运行时错误
- 重复定义会增加部署时间和维护复杂度
- schema.sql 应作为单一权威源

---

## v1.2.1 更新 (2026-01-28)

### 新增迁移

- `024_cleanup_deprecated_columns.sql`: 清理 markets 表中的废弃费率列

### 归档迁移

- `015_fee_cleanup.sql`: 功能已包含在 schema.sql
- `016_fee_globalization_cleanup.sql`: 功能已包含在 schema.sql

### schema.sql 更新

- 移除 markets 表中的废弃列:
  - `platform_fee_rate`
  - `maker_rebate_rate`
  - `center_taker_fee_rate`
  - `extreme_taker_fee_rate`
- 保留 `creator_incentive_rate` (可能因市场而异)
- 新增 CHECK 约束确保数据完整性
- 新增 9 个索引提升查询性能

### 文件结构评估

当前结构 **良好**，无需拆分或合并：

| 文件 | 用途 | 大小 | 建议 |
|------|------|------|------|
| schema.sql | 新数据库完整定义 | ~2985行 | ✅ 保持 |
| migrations.sql | 历史迁移参考 | ~1143行 | 📚 仅参考 |
| migrations_optimized.sql | 增量升级 | 适中 | ✅ 保持 |
| migrations/ | 独立迁移追踪 | 14个文件 | ✅ 保持 |

---

## v1.2.5 更新 (2026-01-28)

### 新增迁移

- `025_low_priority_fixes.sql`: (之前) 低优先级审计修复
- `026_audit_fixes_v125.sql`: (本次) 修复关键约束问题
  - 修复 user_balances 约束字段名不匹配
  - 统一 price 约束 (orders: 允许NULL或(0,1], trades: (0,1])
  - 添加 nonce 唯一性约束防止重放攻击
  - 添加字段用途文档注释

### 根本性改进

本次审计不仅修复了具体问题，还建立了防止问题复发的机制：

1. **CI/CD 流水线** (`/.github/workflows/ci.yml`)
   - TypeScript 严格模式检查
   - ESLint 代码质量检查
   - 数据库 schema 验证
   - 类型一致性检查
   - 安全扫描

2. **类型系统文档** (`/contracts/catallaxyz/shared/TYPES.md`)
   - 明确类型权威来源（Rust → TypeScript → Database）
   - 字段命名约定
   - 同步检查清单

3. **共享工具库** (`/contracts/catallaxyz/app/api/lib/`)
   - `db.ts`: 单例数据库连接池
   - `helpers.ts`: 共享 ensureUser/ensureMarket
   - `validation.ts`: 输入验证函数
   - `errors.ts`: 统一错误处理

### 迁移清理建议

**短期**:
- 运行 `026_audit_fixes_v125.sql` 修复约束问题
- 验证 price 约束统一

**中期**:
- 合并 migrations/ 中的历史迁移到新基线
- 删除 archived/ 目录或移出主迁移路径

**长期**:
- 评估迁移工具 (Prisma, Drizzle, Flyway)
- 建立迁移测试流程

---

*最后更新: 2026-01-28*
*审计版本: v1.2.5*
