#!/bin/bash
# Setup multiple test accounts for trading (uses transfers instead of airdrops)

set -e

echo "🔧 Setting up multi-account test environment"
echo "================================"

# Test USDC mint address
TEST_USDC_MINT="DmPAkkBZ5hSv7GmioeNSa59jpTybHYRz5nt3NgwdQc4G"

# Ensure devnet is selected
CLUSTER=$(solana config get | grep "RPC URL" | awk '{print $3}')
if [[ ! "$CLUSTER" =~ "devnet" ]]; then
    echo "⚠️  Warning: Not on devnet!"
    echo "Current RPC: $CLUSTER"
    echo "Switch to devnet: solana config set --url https://api.devnet.solana.com"
    exit 1
fi

echo "✓ Confirmed devnet environment"
echo ""

# Account count and initial funding
NUM_ACCOUNTS=${1:-3}
SOL_PER_ACCOUNT=${2:-2}
USDC_PER_ACCOUNT=${3:-1000}

echo "📝 Will create $NUM_ACCOUNTS test accounts"
echo "💰 Each account: $SOL_PER_ACCOUNT SOL + $USDC_PER_ACCOUNT test USDC"
echo ""

# Create account directory
KEYS_DIR="test-accounts"
mkdir -p $KEYS_DIR

# Main account address
MAIN_ACCOUNT=$(solana address)
MAIN_BALANCE=$(solana balance | awk '{print $1}')
echo "🔑 Main account: $MAIN_ACCOUNT"
echo "💰 Main account balance: $MAIN_BALANCE SOL"

# Check main account balance
REQUIRED_SOL=$(echo "$NUM_ACCOUNTS * ($SOL_PER_ACCOUNT + 0.5)" | bc)
if (( $(echo "$MAIN_BALANCE < $REQUIRED_SOL" | bc -l) )); then
    echo "⚠️  Warning: Main account balance may be insufficient"
    echo "   Required ~: $REQUIRED_SOL SOL"
    echo "   Current: $MAIN_BALANCE SOL"
    echo ""
fi

echo ""

# Create test accounts
for i in $(seq 1 $NUM_ACCOUNTS); do
    KEYPAIR_FILE="$KEYS_DIR/test-account-$i.json"
    
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📦 Setting up account $i"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # Skip creation if account exists
    if [ -f "$KEYPAIR_FILE" ]; then
        echo "⏭️  Account already exists"
        ACCOUNT_ADDRESS=$(solana-keygen pubkey $KEYPAIR_FILE)
    else
        echo "🆕 Creating new account..."
        solana-keygen new --no-bip39-passphrase -o $KEYPAIR_FILE --silent
        ACCOUNT_ADDRESS=$(solana-keygen pubkey $KEYPAIR_FILE)
    fi
    
    echo "   Address: $ACCOUNT_ADDRESS"
    
    # Check SOL balance
    BALANCE=$(solana balance $ACCOUNT_ADDRESS 2>/dev/null | awk '{print $1}' || echo "0")
    echo "   💰 Current SOL balance: $BALANCE SOL"
    
    # Transfer SOL if balance is low
    if (( $(echo "$BALANCE < 0.5" | bc -l) )); then
        echo "   📤 Transferring $SOL_PER_ACCOUNT SOL from main account..."
        solana transfer $ACCOUNT_ADDRESS $SOL_PER_ACCOUNT --allow-unfunded-recipient --fee-payer ~/.config/solana/id.json
        sleep 1
        NEW_BALANCE=$(solana balance $ACCOUNT_ADDRESS | awk '{print $1}')
        echo "   ✅ Transfer succeeded! New balance: $NEW_BALANCE SOL"
    fi
    
    # Create test USDC account
    echo "   🏦 Setting up test USDC account..."
    
    # Check if USDC account already exists
    TOKEN_ACCOUNT=$(spl-token accounts $TEST_USDC_MINT --owner $ACCOUNT_ADDRESS 2>/dev/null | grep -A 1 "Token" | grep "Address" | awk '{print $2}' || echo "")
    
    if [ -z "$TOKEN_ACCOUNT" ]; then
        echo "   🆕 Creating test USDC account..."
        # Note: main account pays creation fee
        spl-token create-account $TEST_USDC_MINT --owner $ACCOUNT_ADDRESS --fee-payer ~/.config/solana/id.json || true
        sleep 1
        TOKEN_ACCOUNT=$(spl-token accounts $TEST_USDC_MINT --owner $ACCOUNT_ADDRESS 2>/dev/null | grep -A 1 "Token" | grep "Address" | awk '{print $2}')
    fi
    
    if [ -z "$TOKEN_ACCOUNT" ]; then
        echo "   ⚠️  Failed to create USDC account, skipping"
        echo ""
        continue
    fi
    
    echo "   💵 USDC account: $TOKEN_ACCOUNT"
    
    # Check USDC balance
    USDC_BALANCE=$(spl-token balance $TEST_USDC_MINT --owner $ACCOUNT_ADDRESS 2>/dev/null || echo "0")
    echo "   💰 Current USDC balance: $USDC_BALANCE"
    
    # Transfer USDC if balance is low
    if (( $(echo "$USDC_BALANCE < 100" | bc -l) )); then
        echo "   📤 Transferring $USDC_PER_ACCOUNT test USDC..."
        spl-token transfer $TEST_USDC_MINT $USDC_PER_ACCOUNT $ACCOUNT_ADDRESS --fund-recipient --allow-unfunded-recipient --fee-payer ~/.config/solana/id.json || true
        sleep 1
        NEW_USDC_BALANCE=$(spl-token balance $TEST_USDC_MINT --owner $ACCOUNT_ADDRESS 2>/dev/null || echo "0")
        echo "   ✅ Transfer succeeded! New balance: $NEW_USDC_BALANCE USDC"
    fi
    
    echo ""
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Test account setup complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📋 Account summary:"
echo ""

# Render summary table
printf "%-8s %-44s %-12s %-12s\n" "Acct" "Address" "SOL" "Test USDC"
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
echo "📝 Usage:"
echo ""
echo "1. Load a test account in code:"
echo "   import { Keypair } from '@solana/web3.js';"
echo "   import * as fs from 'fs';"
echo "   const key = JSON.parse(fs.readFileSync('test-accounts/test-account-1.json', 'utf8'));"
echo "   const keypair = Keypair.fromSecretKey(Uint8Array.from(key));"
echo ""
echo "2. Switch CLI to a test account:"
echo "   solana config set --keypair test-accounts/test-account-1.json"
echo ""
echo "3. List all test accounts:"
echo "   ls -la test-accounts/"
echo ""
echo "4. Check a test account balance:"
echo "   solana balance test-accounts/test-account-1.json"
echo "   spl-token balance $TEST_USDC_MINT --owner \$(solana-keygen pubkey test-accounts/test-account-1.json)"
echo ""

