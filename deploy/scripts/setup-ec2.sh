#!/bin/bash
# ============================================
# Catallaxyz EC2 Setup Script
# ============================================
# Run this on a fresh Ubuntu 22.04 EC2 instance
# Usage: bash setup-ec2.sh

set -e

echo "=========================================="
echo "Catallaxyz EC2 Setup"
echo "=========================================="

# Update system
echo "Updating system..."
sudo apt update && sudo apt upgrade -y

# Install Node.js 20
echo "Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install pnpm
echo "Installing pnpm..."
sudo npm install -g pnpm@9

# Install Docker
echo "Installing Docker..."
sudo apt install -y docker.io docker-compose-plugin
sudo usermod -aG docker $USER
sudo systemctl enable docker
sudo systemctl start docker

# Install Nginx
echo "Installing Nginx..."
sudo apt install -y nginx

# Install Certbot for SSL
echo "Installing Certbot..."
sudo apt install -y certbot python3-certbot-nginx

# Install PM2
echo "Installing PM2..."
sudo npm install -g pm2

# Create app directory
echo "Creating app directory..."
sudo mkdir -p /opt/catallaxyz
sudo chown $USER:$USER /opt/catallaxyz

# Create log directory
sudo mkdir -p /var/log/catallaxyz
sudo chown $USER:$USER /var/log/catallaxyz

echo "=========================================="
echo "Setup complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Clone your repository to /opt/catallaxyz"
echo "2. Copy .env.production to apps/backend/.env.production"
echo "3. Run: cd /opt/catallaxyz && pnpm install"
echo "4. Run: pnpm build"
echo "5. Copy nginx config: sudo cp deploy/nginx/catallaxyz.conf /etc/nginx/sites-available/"
echo "6. Enable nginx config: sudo ln -s /etc/nginx/sites-available/catallaxyz /etc/nginx/sites-enabled/"
echo "7. Get SSL certificate: sudo certbot --nginx -d api.your-domain.com"
echo "8. Start services: docker compose -f docker-compose.prod.yml up -d"
echo ""
echo "Remember to log out and log back in for docker group to take effect!"
