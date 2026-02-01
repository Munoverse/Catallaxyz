#!/bin/bash
# ============================================
# Catallaxyz Backend Deployment Script
# ============================================
# Run this on EC2 to deploy/update the backend
# Usage: bash deploy-backend.sh [--restart]

set -e

APP_DIR="/opt/catallaxyz"
COMPOSE_FILE="docker-compose.prod.yml"

echo "=========================================="
echo "Catallaxyz Backend Deployment"
echo "=========================================="

cd $APP_DIR

# Pull latest code
echo "Pulling latest code..."
git pull origin main

# Install dependencies
echo "Installing dependencies..."
pnpm install --frozen-lockfile

# Build backend
echo "Building backend..."
pnpm build

# Build Docker images
echo "Building Docker images..."
docker compose -f $COMPOSE_FILE build

# Handle restart flag
if [[ "$1" == "--restart" ]]; then
    echo "Restarting services..."
    docker compose -f $COMPOSE_FILE down
    docker compose -f $COMPOSE_FILE up -d
else
    echo "Updating services (rolling update)..."
    docker compose -f $COMPOSE_FILE up -d --no-deps backend
    docker compose -f $COMPOSE_FILE up -d --no-deps data-api
    docker compose -f $COMPOSE_FILE up -d --no-deps clob-api
    docker compose -f $COMPOSE_FILE up -d --no-deps ws-server
fi

# Wait for services to be healthy
echo "Waiting for services to be healthy..."
sleep 10

# Health check
echo "Checking health..."
if curl -s http://localhost:4000/health | grep -q "ok"; then
    echo "✅ Backend API is healthy"
else
    echo "❌ Backend API health check failed"
    docker compose -f $COMPOSE_FILE logs backend --tail=50
    exit 1
fi

# Clean up old images
echo "Cleaning up old Docker images..."
docker image prune -f

echo "=========================================="
echo "Deployment complete!"
echo "=========================================="
