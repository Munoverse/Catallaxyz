#!/bin/bash
# 设置多个测试账户用于交易测试（改进版：使用转账代替空投）

set -e

echo "🔧 设置多账户测试环境"
echo "================================"

# 测试 USDC mint 地址
TEST_USDC_MINT="DmPAkkBZ5hSv7GmioeNSa59jpTybHYRz5nt3NgwdQc4G"

# 检查是否在 devnet
CLUSTER=$(solana config get | grep "RPC URL" | awk '{print $3}')
if [[ ! "$CLUSTER" =~ "devnet" ]]; then
    echo "⚠️  警告: 当前不在 devnet!"
    echo "当前 RPC: $CLUSTER"
    echo "切换到 devnet: solana config set --url https://api.devnet.solana.com"
    exit 1
fi

echo "✓ 确认在 devnet 环境"
echo ""

# 账户数量和初始资金
NUM_ACCOUNTS=${1:-3}
SOL_PER_ACCOUNT=${2:-2}
USDC_PER_ACCOUNT=${3:-1000}

echo "📝 将创建 $NUM_ACCOUNTS 个测试账户"
echo "💰 每个账户: $SOL_PER_ACCOUNT SOL + $USDC_PER_ACCOUNT 测试 USDC"
echo ""

# 创建账户目录
KEYS_DIR="test-accounts"
mkdir -p $KEYS_DIR

# 主账户地址
MAIN_ACCOUNT=$(solana address)
MAIN_BALANCE=$(solana balance | awk '{print $1}')
echo "🔑 主账户: $MAIN_ACCOUNT"
echo "💰 主账户余额: $MAIN_BALANCE SOL"

# 检查主账户余额是否足够
REQUIRED_SOL=$(echo "$NUM_ACCOUNTS * ($SOL_PER_ACCOUNT + 0.5)" | bc)
if (( $(echo "$MAIN_BALANCE < $REQUIRED_SOL" | bc -l) )); then
    echo "⚠️  警告: 主账户余额可能不足"
    echo "   需要约: $REQUIRED_SOL SOL"
    echo "   当前: $MAIN_BALANCE SOL"
    echo ""
fi

echo ""

# 创建测试账户
for i in $(seq 1 $NUM_ACCOUNTS); do
    KEYPAIR_FILE="$KEYS_DIR/test-account-$i.json"
    
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📦 设置账户 $i"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # 如果账户已存在，跳过创建
    if [ -f "$KEYPAIR_FILE" ]; then
        echo "⏭️  账户已存在"
        ACCOUNT_ADDRESS=$(solana-keygen pubkey $KEYPAIR_FILE)
    else
        echo "🆕 创建新账户..."
        solana-keygen new --no-bip39-passphrase -o $KEYPAIR_FILE --silent
        ACCOUNT_ADDRESS=$(solana-keygen pubkey $KEYPAIR_FILE)
    fi
    
    echo "   地址: $ACCOUNT_ADDRESS"
    
    # 检查 SOL 余额
    BALANCE=$(solana balance $ACCOUNT_ADDRESS 2>/dev/null | awk '{print $1}' || echo "0")
    echo "   💰 当前 SOL 余额: $BALANCE SOL"
    
    # 如果余额不足，从主账户转账
    if (( $(echo "$BALANCE < 0.5" | bc -l) )); then
        echo "   📤 从主账户转账 $SOL_PER_ACCOUNT SOL..."
        solana transfer $ACCOUNT_ADDRESS $SOL_PER_ACCOUNT --allow-unfunded-recipient --fee-payer ~/.config/solana/id.json
        sleep 1
        NEW_BALANCE=$(solana balance $ACCOUNT_ADDRESS | awk '{print $1}')
        echo "   ✅ 转账成功！新余额: $NEW_BALANCE SOL"
    fi
    
    # 创建测试 USDC 账户
    echo "   🏦 设置测试 USDC 账户..."
    
    # 检查是否已有 USDC 账户
    TOKEN_ACCOUNT=$(spl-token accounts $TEST_USDC_MINT --owner $ACCOUNT_ADDRESS 2>/dev/null | grep -A 1 "Token" | grep "Address" | awk '{print $2}' || echo "")
    
    if [ -z "$TOKEN_ACCOUNT" ]; then
        echo "   🆕 创建测试 USDC 账户..."
        # 注意：使用主账户支付创建费用
        spl-token create-account $TEST_USDC_MINT --owner $ACCOUNT_ADDRESS --fee-payer ~/.config/solana/id.json || true
        sleep 1
        TOKEN_ACCOUNT=$(spl-token accounts $TEST_USDC_MINT --owner $ACCOUNT_ADDRESS 2>/dev/null | grep -A 1 "Token" | grep "Address" | awk '{print $2}')
    fi
    
    if [ -z "$TOKEN_ACCOUNT" ]; then
        echo "   ⚠️  无法创建 USDC 账户，跳过"
        echo ""
        continue
    fi
    
    echo "   💵 USDC 账户: $TOKEN_ACCOUNT"
    
    # 检查 USDC 余额
    USDC_BALANCE=$(spl-token balance $TEST_USDC_MINT --owner $ACCOUNT_ADDRESS 2>/dev/null || echo "0")
    echo "   💰 当前 USDC 余额: $USDC_BALANCE"
    
    # 如果 USDC 余额不足，转账
    if (( $(echo "$USDC_BALANCE < 100" | bc -l) )); then
        echo "   📤 转账 $USDC_PER_ACCOUNT 测试 USDC..."
        spl-token transfer $TEST_USDC_MINT $USDC_PER_ACCOUNT $ACCOUNT_ADDRESS --fund-recipient --allow-unfunded-recipient --fee-payer ~/.config/solana/id.json || true
        sleep 1
        NEW_USDC_BALANCE=$(spl-token balance $TEST_USDC_MINT --owner $ACCOUNT_ADDRESS 2>/dev/null || echo "0")
        echo "   ✅ 转账成功！新余额: $NEW_USDC_BALANCE USDC"
    fi
    
    echo ""
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ 测试账户设置完成！"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📋 账户汇总:"
echo ""

# 创建汇总表格
printf "%-8s %-44s %-12s %-12s\n" "账户" "地址" "SOL" "测试USDC"
printf "%-8s %-44s %-12s %-12s\n" "----" "--------------------------------------------" "-----------" "-----------"

for i in $(seq 1 $NUM_ACCOUNTS); do
    KEYPAIR_FILE="$KEYS_DIR/test-account-$i.json"
    if [ -f "$KEYPAIR_FILE" ]; then
        ACCOUNT_ADDRESS=$(solana-keygen pubkey $KEYPAIR_FILE)
        SOL_BAL=$(solana balance $ACCOUNT_ADDRESS 2>/dev/null | awk '{print $1}' || echo "0")
        USDC_BAL=$(spl-token balance $TEST_USDC_MINT --owner $ACCOUNT_ADDRESS 2>/dev/null || echo "0")
        printf "%-8s %-44s %-12s %-12s\n" "#$i" "$ACCOUNT_ADDRESS" "$SOL_BAL" "$USDC_BAL"
    fi
done

echo ""
echo "📝 使用方法:"
echo ""
echo "1. 在测试代码中加载账户:"
echo "   import { Keypair } from '@solana/web3.js';"
echo "   import * as fs from 'fs';"
echo "   const key = JSON.parse(fs.readFileSync('test-accounts/test-account-1.json', 'utf8'));"
echo "   const keypair = Keypair.fromSecretKey(Uint8Array.from(key));"
echo ""
echo "2. 切换 CLI 到测试账户:"
echo "   solana config set --keypair test-accounts/test-account-1.json"
echo ""
echo "3. 查看所有测试账户:"
echo "   ls -la test-accounts/"
echo ""
echo "4. 查看某个账户的余额:"
echo "   solana balance test-accounts/test-account-1.json"
echo "   spl-token balance $TEST_USDC_MINT --owner \$(solana-keygen pubkey test-accounts/test-account-1.json)"
echo ""

