# Catallaxyz 部署测试指南

**版本:** v1.1.0  
**最后更新:** 2026年2月1日

---

## 阅读导览

本指南按“准备 → 部署 → 配置 → 启动 → 验证”的顺序整理，避免流程断裂。

- 阶段一: Devnet + 本地开发（功能联调/本地验证）
- 阶段二: Devnet + Vercel + Supabase + AWS EC2（社区测试/预发布）
- 阶段三: 主网 + Vercel + Supabase + AWS EC2（生产环境）

关键文件约定:

- 后端环境变量: `apps/backend/.env`（开发）或 `.env.production`（生产）
- 前端环境变量: `apps/frontend/.env.local`（开发）或 Vercel 环境变量（生产）
- 完整变量示例: `apps/backend/.env.example`

---

## 目录

1. [快速开始 (Devnet 本地)](#快速开始-devnet-本地)
2. [环境准备](#环境准备)
3. [依赖安装与构建](#依赖安装与构建)
4. [阶段一: Devnet + 本地开发](#阶段一-devnet--本地开发)
5. [阶段二: Devnet + Vercel + Supabase + AWS EC2](#阶段二-devnet--vercel--supabase--aws-ec2)
6. [阶段三: 主网 + Vercel + Supabase + AWS EC2](#阶段三-主网--vercel--supabase--aws-ec2)
7. [测试指南](#测试指南)
8. [故障排除](#故障排除)
9. [附录](#附录)

---

## 快速开始 (Devnet 本地)

1. 安装依赖与工具（见 [环境准备](#环境准备)）
2. 生成密钥（authority / operator / keeper）
3. 部署合约到 Devnet（见 [阶段一](#阶段一-devnet--本地开发)）
4. 配置 `apps/backend/.env` 与 `apps/frontend/.env.local`
5. 启动服务并验证健康检查

---

## 环境准备

### 系统要求

| 组件 | 最低版本 | 推荐版本 |
|------|----------|----------|
| Node.js | 18.0 | 20.x LTS |
| Rust | 1.75 | 1.78+ |
| Solana CLI | 1.18 | 1.18.17 |
| Anchor | 0.32.1 | 0.32.1 |
| Redis | 7.0 | 7.2+ |
| PostgreSQL | 14 | 15+ |

### 开发工具

```bash
# 安装 Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 安装 Solana CLI
sh -c "$(curl -sSfL https://release.solana.com/v1.18.17/install)"

# 安装 Anchor
cargo install --git https://github.com/coral-xyz/anchor avm --locked
avm install 0.32.1
avm use 0.32.1

# 验证安装
solana --version
anchor --version
```

### 密钥准备

```bash
# 创建管理员钱包 (authority)
solana-keygen new -o ~/.config/solana/authority.json

# 创建 Operator（用于执行订单撮合和交易）
solana-keygen new -o ~/.config/solana/operator.json

# 创建 Keeper（用于市场终止等定时任务）
solana-keygen new -o ~/.config/solana/keeper.json

# 获取公钥
solana-keygen pubkey ~/.config/solana/authority.json
solana-keygen pubkey ~/.config/solana/operator.json
solana-keygen pubkey ~/.config/solana/keeper.json
```

说明:

- **Authority**: 管理员钱包，拥有合约的最高权限，默认也是 operator
- **Operator**: 执行 `fill_order` 和 `match_orders` 指令（Polymarket 风格订单撮合）。合约支持最多 10 个 operators，authority 默认也是 operator
- **Keeper**: 执行定时任务如市场终止（VRF 触发）
- `OPERATOR_SECRET_KEY` 使用的是 **Operator 私钥数组**（keypair 文件的 64 字节 JSON 数组）

> **提示**: 如果 authority 和 operator 使用同一个钱包，可以跳过创建单独的 operator.json

---

## 依赖安装与构建

### Monorepo 依赖（推荐）

项目使用 pnpm monorepo 管理，在根目录一次性安装所有依赖：

```bash
cd /path/to/Catallaxyz

# 安装所有 workspace 依赖
pnpm install

# 构建共享包
pnpm build:shared

# 构建后端
pnpm build:backend

# 构建前端
pnpm build:frontend

# 或一次性构建所有
pnpm build
```

### 合约依赖（独立）

合约目录有独立的依赖管理：

```bash
cd contracts/catallaxyz

# 安装 Node 依赖（用于脚本）
npm install

# 构建合约
anchor build
```

### 开发模式

```bash
# 根目录启动所有服务
pnpm dev:all

# 或分别启动
pnpm dev:backend   # 启动后端
pnpm dev:frontend  # 启动前端
```

---

## 阶段一: Devnet + 本地开发

### 概述

```
┌─────────────────────────────────────────────────────┐
│                    本地开发环境                      │
├─────────────────────────────────────────────────────┤
│  前端: localhost:3000 (Next.js dev server)         │
│  后端: localhost:4000 (Fastify)                    │
│  Redis: localhost:6379                             │
│  数据库: Supabase (云端/本地)                       │
│  区块链: Solana Devnet                             │
└─────────────────────────────────────────────────────┘
```

### 1. 启动本地服务

#### 1.1 启动 Redis

```bash
# 使用 Docker
docker run -d --name redis -p 6379:6379 redis:7.2

# 或直接安装
brew install redis  # macOS
sudo apt install redis-server  # Ubuntu
redis-server
```

#### 1.2 配置 Supabase

**选项A: 使用 Supabase 云服务 (推荐开发)**

1. 访问 https://supabase.com 创建项目
2. 获取项目 URL 和密钥
3. 运行数据库迁移

```bash
# 设置环境变量
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"

# 运行迁移
cd contracts/catallaxyz/migrations
npx ts-node deploy.ts
```

**选项B: 本地 Supabase**

```bash
# 安装 Supabase CLI
npm install -g supabase

# 初始化
supabase init
supabase start

# 运行迁移
supabase db push
```

### 2. 部署合约到 Devnet

#### 2.1 配置 Solana CLI

```bash
# 切换到 devnet
solana config set --url devnet

# 设置钱包
solana config set --keypair ~/.config/solana/authority.json

# 获取测试 SOL
solana airdrop 5
```

#### 2.2 部署合约

```bash
cd contracts/catallaxyz

# 构建
anchor build

# 部署
anchor deploy --provider.cluster devnet

# 记录 Program ID
# 输出类似: Deployed at: CatXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

#### 2.3 更新配置与 IDL

```bash
# 同步常量到代码
npx ts-node scripts/sync-constants.ts

# 部署 IDL
./scripts/deploy-idl.sh
```

#### 2.4 初始化程序

程序初始化包括 Global 账户和 4 个金库：

| 金库 | 用途 |
|------|------|
| Platform Treasury | 平台手续费收入 |
| Reward Treasury | 奖励活动（预留） |
| Creator Treasury | 市场创建者收益 |
| VRF Treasury | VRF 随机数服务费用 |

**方法一：手动创建测试 USDC + 完整初始化（推荐）**

```bash
cd contracts/catallaxyz

# 1. 创建测试 USDC（6 位小数，模拟真实 USDC）
spl-token create-token --decimals 6
# 记录输出的 Mint 地址，例如：5xER7fdAGEywi3BDSEniDUC1sXwKWAaL8K9C29N6WqXQ

# 2. 创建 Token Account
spl-token create-account <MINT_ADDRESS>

# 3. Mint 测试代币（例如 500 万）
spl-token mint <MINT_ADDRESS> 5000000

# 4. 完整初始化（Global + 所有金库）
# 可选：指定 keeper（默认使用 authority）
export KEEPER_PUBLIC_KEY=$(solana-keygen pubkey ~/.config/solana/keeper.json)
TEST_USDC_MINT=<MINT_ADDRESS> npx tsx scripts/initialize-devnet.ts

# 5. 添加 Operator（如果使用独立的 operator 账户）
export OPERATOR_PUBLIC_KEY=$(solana-keygen pubkey ~/.config/solana/operator.json)
npx tsx scripts/add-operator.ts
```

> **注意**: authority 默认就是 operator 和 keeper，如果三者使用同一个密钥，可以跳过步骤 5

**方法二：使用脚本创建测试 USDC**

```bash
cd contracts/catallaxyz

# 1. 创建测试 USDC（会生成 test-usdc-config.json）
npx tsx scripts/create-test-usdc.ts

# 2. 完整初始化（可选：指定 keeper）
export KEEPER_PUBLIC_KEY=$(solana-keygen pubkey ~/.config/solana/keeper.json)
TEST_USDC_MINT=$(cat test-usdc-config.json | jq -r '.testUsdcMint') npx tsx scripts/initialize-devnet.ts

# 3. 添加 Operator（如果使用独立的 operator 账户）
export OPERATOR_PUBLIC_KEY=$(solana-keygen pubkey ~/.config/solana/operator.json)
npx tsx scripts/add-operator.ts
```

> **注意**: 使用 `tsx` 代替 `ts-node`，因为项目使用 ESM 模块，`tsx` 兼容性更好。
> 如果遇到 devnet RPC 超时，可以使用 Helius 等更稳定的 RPC 服务。

### 3. 配置后端

从模板创建 `apps/backend/.env`:

```bash
cp apps/backend/.env.example apps/backend/.env
```

最少需要确认以下字段（完整列表见 `apps/backend/.env.example`）:

```env
PORT=4000
NODE_ENV=development

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Solana
SOLANA_RPC_URL=https://api.devnet.solana.com
PROGRAM_ID=你的ProgramID
USDC_MINT_ADDRESS=你的测试USDC地址

# Keys (从 keypair 文件复制 64 字节 JSON 数组)
OPERATOR_SECRET_KEY=[64字节数组]           # 用于订单撮合
KEEPER_SECRET_KEY=[64字节数组]             # 用于市场终止
PLATFORM_AUTHORITY_SECRET_KEY=[64字节数组] # 管理员权限

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=你的service-role-key
SUPABASE_JWT_SECRET=你的jwt-secret

# Admin
ADMIN_WALLET_ADDRESS=你的管理员钱包地址
```

### 4. 配置前端

创建 `apps/frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_WS_URL=ws://localhost:3003
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_PROGRAM_ID=你的ProgramID
NEXT_PUBLIC_USDC_MINT=你的测试USDC地址
NEXT_PUBLIC_MAGIC_PUBLISHABLE_KEY=你的Magic公钥
```

### 5. 启动服务

```bash
# 终端1: 后端
cd apps/backend
npm run dev

# 终端2: 前端
cd apps/frontend
npm run dev

# 终端3: Workers (可选)
cd apps/backend
npm run worker:persist &
npm run worker:settle &
```

### 6. 本地测试

```bash
# 访问前端
open http://localhost:3000

# 测试API
curl http://localhost:4000/health
curl http://localhost:3001/health
```

---

## 阶段二: Devnet + Vercel + Supabase + AWS EC2

### 概述

```
┌─────────────────────────────────────────────────────────────────────┐
│                         社区测试环境                                 │
├─────────────────────────────────────────────────────────────────────┤
│  前端: Vercel (catallaxyz-dev.vercel.app)                          │
│  后端: AWS EC2 (api-dev.catallaxyz.app)                            │
│  Redis: AWS ElastiCache 或 EC2 本地                                 │
│  数据库: Supabase 云端                                              │
│  区块链: Solana Devnet                                              │
└─────────────────────────────────────────────────────────────────────┘
```

### 1. AWS EC2 设置

#### 1.1 创建 EC2 实例

```
AMI: Ubuntu 22.04 LTS
实例类型: t3.medium (最低)
存储: 30GB SSD
安全组:
  - SSH (22): 你的IP
  - HTTP (80): 0.0.0.0/0
  - HTTPS (443): 0.0.0.0/0
  - API (4000): 0.0.0.0/0
  - WS (3003): 0.0.0.0/0
  - Redis (6379): VPC内部
```

#### 1.2 初始化服务器

```bash
# SSH连接
ssh -i your-key.pem ubuntu@your-ec2-ip

# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装 Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 安装 Redis
sudo apt install -y redis-server
sudo systemctl enable redis-server
sudo systemctl start redis-server

# 安装 PM2
sudo npm install -g pm2

# 安装 Nginx
sudo apt install -y nginx

# 安装 Certbot
sudo apt install -y certbot python3-certbot-nginx
```

#### 1.3 部署后端代码

```bash
# 克隆代码
git clone https://github.com/your-repo/catallaxyz.git
cd catallaxyz/apps/backend

# 安装依赖
npm install

# 构建
npm run build

# 创建环境文件
nano .env.production
```

`.env.production` 参考 `apps/backend/.env.production.example`，核心字段示例:

```env
NODE_ENV=production
SOLANA_RPC_URL=https://api.devnet.solana.com
PROGRAM_ID=你的ProgramID
USDC_MINT_ADDRESS=你的测试USDC地址
OPERATOR_SECRET_KEY=[64字节数组]
KEEPER_SECRET_KEY=[64字节数组]
PLATFORM_AUTHORITY_SECRET_KEY=[64字节数组]
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxx
ADMIN_WALLET_ADDRESS=xxx
CRON_SECRET=strong-random-secret
```

#### 1.4 配置 PM2

创建 `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [
    {
      name: 'api',
      script: 'dist/server.js',
      instances: 2,
      exec_mode: 'cluster',
      env_production: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'worker-persist',
      script: 'dist/workers/persist.js',
      instances: 1
    },
    {
      name: 'worker-settle',
      script: 'dist/workers/settle.js',
      instances: 1
    }
  ]
};
```

启动服务:

```bash
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup
```

#### 1.5 配置 Nginx

创建 `/etc/nginx/sites-available/catallaxyz`:

```nginx
server {
    listen 80;
    server_name api-dev.catallaxyz.app;

    location / {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }

    location /ws {
        proxy_pass http://localhost:3003;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }
}
```

启用配置:

```bash
sudo ln -s /etc/nginx/sites-available/catallaxyz /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# 配置SSL
sudo certbot --nginx -d api-dev.catallaxyz.app
```

### 2. Vercel 前端部署

#### 2.1 连接仓库

1. 访问 https://vercel.com
2. Import Git Repository
3. 选择 `apps/frontend` 作为根目录

#### 2.2 配置环境变量

在 Vercel 项目设置中添加:

```
NEXT_PUBLIC_API_URL=https://api-dev.catallaxyz.app
NEXT_PUBLIC_WS_URL=wss://api-dev.catallaxyz.app/ws
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_PROGRAM_ID=你的ProgramID
NEXT_PUBLIC_USDC_MINT=你的测试USDC地址
NEXT_PUBLIC_MAGIC_PUBLISHABLE_KEY=你的Magic公钥
```

#### 2.3 部署

```bash
# 方法1: Git push 自动部署
git push origin main

# 方法2: Vercel CLI
npm i -g vercel
cd apps/frontend
vercel --prod
```

### 3. 配置定时任务

在 EC2 上配置 cron:

```bash
crontab -e
```

添加:

```cron
# 每小时检查不活跃市场
0 * * * * curl -X POST https://api-dev.catallaxyz.app/cron/check-inactive -H "Authorization: Bearer $CRON_SECRET"

# 每天UTC 0:00分发做市商奖励
0 0 * * * curl -X POST https://api-dev.catallaxyz.app/cron/distribute-rewards -H "Authorization: Bearer $CRON_SECRET"

# 每5分钟同步链上数据
*/5 * * * * curl -X POST https://api-dev.catallaxyz.app/cron/sync-markets -H "Authorization: Bearer $CRON_SECRET"
```

### 4. 监控设置

```bash
# 安装 PM2 监控
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7

# 查看日志
pm2 logs

# 查看状态
pm2 status
```

---

## 阶段三: 主网 + Vercel + Supabase + AWS EC2

### 概述

```
┌─────────────────────────────────────────────────────────────────────┐
│                         生产环境                                     │
├─────────────────────────────────────────────────────────────────────┤
│  前端: Vercel (catallaxyz.app)                                      │
│  后端: AWS EC2 (api.catallaxyz.app)                                 │
│  Redis: AWS ElastiCache (推荐)                                       │
│  数据库: Supabase Pro Plan                                          │
│  区块链: Solana Mainnet (付费RPC)                                    │
│  监控: Sentry + Datadog                                             │
└─────────────────────────────────────────────────────────────────────┘
```

### ⚠️ 主网部署检查清单

在部署到主网之前，确保完成以下检查:

- [ ] 所有审计问题已修复
- [ ] 合约经过专业安全审计
- [ ] 测试覆盖率 > 80%
- [ ] 压力测试通过
- [ ] 备份策略就绪
- [ ] 灾难恢复计划就绪
- [ ] 法律合规检查
- [ ] KYC/AML流程 (如需)

### 1. 主网 RPC 配置

**推荐 RPC 提供商:**

| 提供商 | 特点 | 价格 |
|--------|------|------|
| Helius | 高性能，优先区块 | $49+/月 |
| QuickNode | 稳定，全球节点 | $49+/月 |
| Triton | 专业级，低延迟 | 联系销售 |

```env
# 使用付费RPC
SOLANA_RPC_URL=https://rpc.helius.xyz/?api-key=YOUR_API_KEY
```

### 2. 部署合约到主网

#### 2.1 准备工作

```bash
# 切换到主网
solana config set --url mainnet-beta

# 确保钱包有足够SOL (约 5-10 SOL)
solana balance

# 备份所有密钥
cp ~/.config/solana/*.json ~/backup/
```

#### 2.2 部署

```bash
cd contracts/catallaxyz

# 最终构建
anchor build --verifiable

# 部署 (确认Program ID)
anchor deploy --provider.cluster mainnet

# 部署IDL
./scripts/deploy-idl.sh mainnet
```

#### 2.3 初始化

```bash
# 使用主网USDC: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
export USDC_MINT=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v

# 初始化
npx ts-node scripts/initialize-mainnet.ts

# 验证配置
npx ts-node scripts/check-program-config.ts
```

### 3. 生产环境配置

#### 3.1 AWS EC2 (生产级)

```
实例类型: t3.large 或 c5.xlarge
存储: 50GB GP3 SSD
多可用区部署
负载均衡: ALB
自动扩展组
```

#### 3.2 Redis (ElastiCache)

```
节点类型: cache.r6g.large
副本: 2个
多可用区: 启用
自动故障转移: 启用
```

#### 3.3 后端环境变量

```env
# Server
PORT=4000
HOST=0.0.0.0
NODE_ENV=production

# Redis (ElastiCache)
REDIS_URL=redis://your-elasticache-endpoint:6379

# Solana (Mainnet)
SOLANA_RPC_URL=https://rpc.helius.xyz/?api-key=YOUR_KEY
PROGRAM_ID=主网ProgramID
USDC_MINT_ADDRESS=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v

# Keys (使用AWS Secrets Manager更安全)
OPERATOR_SECRET_KEY=xxx
KEEPER_SECRET_KEY=xxx
PLATFORM_AUTHORITY_SECRET_KEY=xxx

# Supabase (Pro Plan)
SUPABASE_URL=https://your-prod-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxx

# Security
CORS_ALLOWED_ORIGINS=https://catallaxyz.app,https://www.catallaxyz.app
RATE_LIMIT_MAX=60
GEO_CHECK_ENABLED=true
GEO_BLOCKED_COUNTRIES=US,CN  # 根据合规要求

# Monitoring
SENTRY_DSN=https://xxx@sentry.io/xxx
SENTRY_ENVIRONMENT=production
LOG_LEVEL=warn
```

#### 3.4 前端环境变量 (Vercel Production)

```
NEXT_PUBLIC_API_URL=https://api.catallaxyz.app
NEXT_PUBLIC_WS_URL=wss://api.catallaxyz.app/ws
NEXT_PUBLIC_SOLANA_RPC_URL=https://rpc.helius.xyz/?api-key=PUBLIC_KEY
NEXT_PUBLIC_PROGRAM_ID=主网ProgramID
NEXT_PUBLIC_USDC_MINT=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
NEXT_PUBLIC_MAGIC_PUBLISHABLE_KEY=你的Magic生产公钥
```

### 4. 监控与告警

#### 4.1 Sentry 配置

```typescript
// 前端
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: 'production',
  tracesSampleRate: 0.1,
});

// 后端 (已配置在 src/lib/sentry.ts)
```

#### 4.2 健康检查

```bash
# 创建健康检查脚本
cat > /home/ubuntu/health-check.sh << 'EOF'
#!/bin/bash
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" https://api.catallaxyz.app/health)
if [ "$RESPONSE" != "200" ]; then
  # 发送告警 (使用 PagerDuty, Slack, 等)
  curl -X POST https://hooks.slack.com/xxx -d '{"text":"API Health Check Failed!"}'
fi
EOF
chmod +x /home/ubuntu/health-check.sh

# 添加到cron (每分钟检查)
* * * * * /home/ubuntu/health-check.sh
```

#### 4.3 日志聚合

推荐使用:

- AWS CloudWatch Logs
- Datadog
- Grafana Loki

### 5. 备份策略

```bash
# Supabase 自动备份 (Pro Plan 包含)
# 每日备份，保留30天

# Redis RDB 备份
redis-cli BGSAVE
aws s3 cp /var/lib/redis/dump.rdb s3://your-backup-bucket/redis/

# 密钥备份 (使用AWS Secrets Manager)
aws secretsmanager create-secret \
  --name catallaxyz/production/keys \
  --secret-string file://keys.json
```

### 6. 灾难恢复

```
1. 数据库恢复:
   - Supabase 控制台 > Backups > Restore

2. Redis恢复:
   - aws s3 cp s3://backup-bucket/redis/dump.rdb /var/lib/redis/
   - sudo systemctl restart redis

3. 服务恢复:
   - pm2 resurrect

4. 合约状态:
   - 链上状态不可变，无需恢复
   - 重新同步链下数据: npm run sync-onchain
```

---

## 测试指南

### 单元测试

```bash
# 合约测试
cd contracts/catallaxyz
anchor test

# 后端测试
cd apps/backend
npm test

# 前端测试
cd apps/frontend
npm test
```

### 集成测试

```bash
# 使用本地验证器测试
./test-with-validator.sh

# E2E测试
cd apps/frontend
npm run test:e2e
```

### 压力测试

```bash
# 安装k6
brew install k6

# 运行负载测试
k6 run tests/load/orderbook.js
```

### 测试场景

| 场景 | 测试内容 | 命令 |
|------|----------|------|
| 市场创建 | 创建市场成功，费用扣除 | `npm run test:create-market` |
| 订单流程 | 下单-撮合-结算 | `npm run test:order-flow` |
| 随机终止 | VRF触发终止 | `npm run test:termination` |
| 赎回 | 市场结束后赎回 | `npm run test:redeem` |
| 高并发 | 100+ 并发订单 | `k6 run tests/load/orders.js` |

---

## 故障排除

### 常见问题

#### 1. 合约部署失败

```
Error: Insufficient funds
```

**解决:** 确保钱包有足够SOL (主网约需5-10 SOL)

#### 2. 交易确认超时

```
Error: Transaction confirmation timeout
```

**解决:**

- 检查RPC节点状态
- 增加确认超时时间
- 考虑使用优先费用

#### 3. Redis连接失败

```
Error: Redis connection refused
```

**解决:**

- 检查Redis服务状态: `sudo systemctl status redis`
- 检查防火墙规则
- 验证连接配置

#### 4. Supabase 连接错误

```
Error: Invalid API key
```

**解决:**

- 验证环境变量正确
- 检查Service Role Key权限
- 确认项目URL正确

#### 5. WebSocket 断连

```
Error: WebSocket connection closed
```

**解决:**

- 检查Nginx代理配置
- 增加超时时间
- 检查SSL证书

### 日志位置

| 服务 | 日志位置 |
|------|----------|
| PM2 | `~/.pm2/logs/` |
| Nginx | `/var/log/nginx/` |
| Redis | `/var/log/redis/` |
| System | `journalctl -u service-name` |

### 支持渠道

- GitHub Issues
- Discord 社区
- 技术文档: https://docs.catallaxyz.app

---

## 附录

### A. 环境变量完整列表（节选）

完整变量请以 `apps/backend/.env.example` 为准，以下列出常用项:

| 变量 | 必需 | 描述 |
|------|------|------|
| `PORT` | 是 | API端口 |
| `NODE_ENV` | 是 | 环境 (development/production) |
| `REDIS_URL` | 否 | Redis连接URL（可替代 HOST/PORT） |
| `SOLANA_RPC_URL` | 是 | Solana RPC端点 |
| `PROGRAM_ID` | 是 | 合约Program ID |
| `USDC_MINT_ADDRESS` | 是 | USDC Mint地址 |
| `SUPABASE_URL` | 是 | Supabase项目URL |
| `SUPABASE_SERVICE_ROLE_KEY` | 是 | Supabase服务密钥 |
| `OPERATOR_SECRET_KEY` | 是 | Operator私钥（用于订单撮合） |
| `KEEPER_SECRET_KEY` | 是 | Keeper私钥（用于市场终止） |
| `ADMIN_WALLET_ADDRESS` | 是 | 管理员钱包地址 |
| `CRON_SECRET` | 是 | Cron任务密钥 |
| `MAGIC_SECRET_KEY` | 否 | Magic Link密钥 |
| `SENTRY_DSN` | 否 | Sentry DSN |
| `GEO_CHECK_ENABLED` | 否 | 地理限制开关 |

### B. 有用命令

```bash
# 查看程序配置
npx ts-node scripts/check-program-config.ts

# 验证安全设置
npx ts-node scripts/verify-security.ts

# 手动同步链上数据
curl -X POST https://api.catallaxyz.app/cron/sync-markets \
  -H "Authorization: Bearer $CRON_SECRET"

# 检查余额
./scripts/check-balances.sh

# 重启所有服务
pm2 restart all
```

---

**文档版本:** v1.1.0  
**最后更新:** 2026年2月1日
