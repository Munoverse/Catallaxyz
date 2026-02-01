# Catallaxyz 数据库 (Supabase)

## ⚠️ 迁移已统一 (v1.3.0)

**所有数据库迁移已统一到 `database/` 目录。**

原 `supabase/migrations/` 目录已删除，其内容已合并到 `database/schema.sql`。

## 部署方式

### 新数据库

使用完整 schema：

```bash
# 通过 Vercel 环境变量中的数据库连接
psql "$DATABASE_URL" -f database/schema.sql
```

### 升级现有数据库

使用优化后的增量迁移：

```bash
psql "$DATABASE_URL" -f database/migrations_optimized.sql
```

### 通过 Supabase SQL Editor

1. 登录 Supabase Dashboard
2. 进入 SQL Editor
3. 复制 `database/schema.sql` 内容并执行

## 连接配置

通过 Vercel + Supabase 集成，数据库连接已自动配置在 Vercel 环境变量中：

- `DATABASE_URL` - PostgreSQL 连接字符串
- `SUPABASE_URL` - Supabase API URL
- `SUPABASE_ANON_KEY` - 公开访问密钥
- `SUPABASE_SERVICE_ROLE_KEY` - 服务端密钥

## 相关文档

- [数据库迁移指南](../database/MIGRATION_CLEANUP.md)
- [部署指南](../docs/DEPLOYMENT.md#4-数据库部署)
- [Supabase 官方文档](https://supabase.com/docs)
