# Catallaxyz 部署配置

本目录包含后端部署相关的配置和脚本。

## 目录结构

```
deploy/
├── README.md                 # 本文件
├── nginx/
│   └── catallaxyz.conf       # Nginx 反向代理配置
└── scripts/
    ├── setup-ec2.sh          # EC2 实例初始化脚本
    └── deploy-backend.sh     # 后端部署/更新脚本
```

## 文件说明

### nginx/catallaxyz.conf

Nginx 反向代理配置，包括:
- 限流配置 (Rate Limiting)
- 多服务上游 (Backend API, Data API, CLOB API, WebSocket)
- SSL/TLS 配置
- 安全头部 (Security Headers)
- WebSocket 代理

**使用方法:**
```bash
# 复制到 Nginx 配置目录
sudo cp deploy/nginx/catallaxyz.conf /etc/nginx/sites-available/

# 修改域名
sudo nano /etc/nginx/sites-available/catallaxyz.conf

# 启用配置
sudo ln -s /etc/nginx/sites-available/catallaxyz /etc/nginx/sites-enabled/

# 测试并重载
sudo nginx -t
sudo systemctl reload nginx
```

### scripts/setup-ec2.sh

EC2 实例首次初始化脚本，安装:
- Node.js 20
- pnpm 9
- Docker
- Nginx
- Certbot (SSL 证书)
- PM2 (进程管理)

**使用方法:**
```bash
ssh -i your-key.pem ubuntu@your-ec2-ip
curl -fsSL https://raw.githubusercontent.com/your-org/catallaxyz/main/deploy/scripts/setup-ec2.sh | bash
```

### scripts/deploy-backend.sh

后端部署/更新脚本，执行:
1. 拉取最新代码
2. 安装依赖
3. 构建后端
4. 构建 Docker 镜像
5. 滚动更新服务
6. 健康检查
7. 清理旧镜像

**使用方法:**
```bash
# 常规更新 (滚动更新)
bash deploy/scripts/deploy-backend.sh

# 完全重启 (停止后重新启动)
bash deploy/scripts/deploy-backend.sh --restart
```

## 相关文件

- **后端源代码**: `apps/backend/`
- **Docker 配置**: `docker-compose.yml` (开发), `docker-compose.prod.yml` (生产)
- **环境变量模板**: `apps/backend/.env.example`

## 相关文档

- [完整部署指南](../docs/DEPLOYMENT.md)
- [后端部署章节](../docs/DEPLOYMENT.md#5-后端部署)
