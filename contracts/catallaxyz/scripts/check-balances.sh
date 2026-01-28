#!/bin/bash
# Quick account balance check

set -e

TEST_USDC_MINT="DmPAkkBZ5hSv7GmioeNSa59jpTybHYRz5nt3NgwdQc4G"

echo "💰 Account balance check"
echo "================================"
echo ""

# If an address or file path is provided
if [ ! -z "$1" ]; then
    if [ -f "$1" ]; then
        # File path
        ACCOUNT=$(solana-keygen pubkey "$1")
        echo "📁 File: $1"
    else
        # Address
        ACCOUNT="$1"
    fi
    
    echo "🔑 Account: $ACCOUNT"
    echo ""
    
    # SOL balance
    echo -n "💎 SOL balance: "
    solana balance $ACCOUNT
    
    # USDC balance
    echo -n "💵 Test USDC: "
    spl-token balance $TEST_USDC_MINT --owner $ACCOUNT || echo "0"
    
    echo ""
    echo "📊 Token accounts:"
    spl-token accounts --owner $ACCOUNT || echo "No token accounts"
    
else
    # Default to main account
    MAIN_ACCOUNT=$(solana address)
    echo "🔑 Main account: $MAIN_ACCOUNT"
    echo ""
    
    echo -n "💎 SOL balance: "
    solana balance
    
    echo -n "💵 Test USDC: "
    spl-token balance $TEST_USDC_MINT || echo "0"
    
    echo ""
    
    # Query all test accounts
    if [ -d "test-accounts" ] && [ "$(ls -A test-accounts/*.json 2>/dev/null)" ]; then
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "📋 Test account balances"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo ""
        
        printf "%-8s %-44s %-12s %-12s\n" "Acct" "Address" "SOL" "Test USDC"
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
echo "💡 Usage:"
echo "  Main account: bash scripts/check-balances.sh"
echo "  Specific address: bash scripts/check-balances.sh <address>"
echo "  Test account file: bash scripts/check-balances.sh test-accounts/test-account-1.json"
echo ""

