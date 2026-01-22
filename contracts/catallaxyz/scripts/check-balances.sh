#!/bin/bash
# 快速查询账户余额

set -e

TEST_USDC_MINT="DmPAkkBZ5hSv7GmioeNSa59jpTybHYRz5nt3NgwdQc4G"

echo "💰 账户余额查询"
echo "================================"
echo ""

# 如果提供了账户地址或文件路径
if [ ! -z "$1" ]; then
    if [ -f "$1" ]; then
        # 是文件路径
        ACCOUNT=$(solana-keygen pubkey "$1")
        echo "📁 文件: $1"
    else
        # 是账户地址
        ACCOUNT="$1"
    fi
    
    echo "🔑 账户: $ACCOUNT"
    echo ""
    
    # 查询 SOL
    echo -n "💎 SOL 余额: "
    solana balance $ACCOUNT
    
    # 查询 USDC
    echo -n "💵 测试 USDC: "
    spl-token balance $TEST_USDC_MINT --owner $ACCOUNT || echo "0"
    
    echo ""
    echo "📊 详细代币账户:"
    spl-token accounts --owner $ACCOUNT || echo "无代币账户"
    
else
    # 查询主账户
    MAIN_ACCOUNT=$(solana address)
    echo "🔑 主账户: $MAIN_ACCOUNT"
    echo ""
    
    echo -n "💎 SOL 余额: "
    solana balance
    
    echo -n "💵 测试 USDC: "
    spl-token balance $TEST_USDC_MINT || echo "0"
    
    echo ""
    
    # 查询所有测试账户
    if [ -d "test-accounts" ] && [ "$(ls -A test-accounts/*.json 2>/dev/null)" ]; then
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "📋 测试账户余额"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo ""
        
        printf "%-8s %-44s %-12s %-12s\n" "账户" "地址" "SOL" "测试USDC"
        printf "%-8s %-44s %-12s %-12s\n" "----" "--------------------------------------------" "-----------" "-----------"
        
        for keyfile in test-accounts/test-account-*.json; do
            if [ -f "$keyfile" ]; then
                account_num=$(basename "$keyfile" | sed 's/test-account-\([0-9]*\)\.json/\1/')
                addr=$(solana-keygen pubkey "$keyfile")
                sol=$(solana balance $addr 2>/dev/null | awk '{print $1}' || echo "0")
                usdc=$(spl-token balance $TEST_USDC_MINT --owner $addr 2>/dev/null || echo "0")
                printf "%-8s %-44s %-12s %-12s\n" "#$account_num" "$addr" "$sol" "$usdc"
            fi
        done
    fi
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "💡 使用提示:"
echo "  查询主账户: bash scripts/check-balances.sh"
echo "  查询指定地址: bash scripts/check-balances.sh <地址>"
echo "  查询测试账户: bash scripts/check-balances.sh test-accounts/test-account-1.json"
echo ""

