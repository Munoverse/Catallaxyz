#!/bin/bash

# Script to regenerate Program ID
# This will:
# 1. Backup and remove the old keypair
# 2. Generate a new keypair
# 3. Update declare_id! in code
# 4. Update Anchor.toml
# 5. Rebuild

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "🔄 Regenerating Program ID"
echo ""

# Step 1: Backup old keypair (if exists)
KEYPAIR_FILE="target/deploy/catallaxyz-keypair.json"
if [ -f "$KEYPAIR_FILE" ]; then
    OLD_ID=$(solana address -k "$KEYPAIR_FILE" 2>/dev/null || echo "unknown")
    BACKUP_FILE="target/deploy/catallaxyz-keypair.json.backup.$(date +%Y%m%d_%H%M%S)"
    echo "📦 Backing up old keypair..."
    cp "$KEYPAIR_FILE" "$BACKUP_FILE"
    echo "   Old Program ID: $OLD_ID"
    echo "   Backup: $BACKUP_FILE"
    echo ""
fi

# Step 2: Delete old keypair
echo "🗑️  Deleting old keypair..."
rm -f "$KEYPAIR_FILE"
echo "✅ Old keypair deleted"
echo ""

# Step 3: Generate new keypair
echo "🆕 Generating new keypair..."
solana-keygen new --no-bip39-passphrase --outfile "$KEYPAIR_FILE" --force
NEW_ID=$(solana address -k "$KEYPAIR_FILE")
echo "✅ New Program ID: $NEW_ID"
echo ""

# Step 4: Update declare_id! in lib.rs
LIB_RS="programs/catallaxyz/src/lib.rs"
echo "📝 Updating $LIB_RS..."
# Extract current declare_id line
OLD_DECLARE=$(grep -n "declare_id!" "$LIB_RS" | head -1)
if [ -n "$OLD_DECLARE" ]; then
    # Replace declare_id address with sed
    sed -i "s/declare_id!(\"[^\"]*\");/declare_id!(\"$NEW_ID\");/" "$LIB_RS"
    echo "✅ Updated declare_id!"
else
    echo "⚠️  Warning: declare_id! line not found"
fi
echo ""

# Step 5: Update Anchor.toml
ANCHOR_TOML="Anchor.toml"
echo "📝 Updating $ANCHOR_TOML..."
# Replace all [programs.*] catallaxyz values
sed -i "s|catallaxyz = \".*\"|catallaxyz = \"$NEW_ID\"|g" "$ANCHOR_TOML"
echo "✅ Updated Anchor.toml"
echo ""

# Step 6: Show results
echo "📊 Results:"
echo "   New Program ID: $NEW_ID"
echo "   Keypair file: $KEYPAIR_FILE"
echo ""

# Step 7: Prompt for rebuild
read -p "Rebuild program now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    echo "🔨 Rebuilding program..."
    anchor build
    
    if [ $? -eq 0 ]; then
        echo ""
        echo "✅ Build succeeded!"
        echo ""
        echo "📋 Next steps:"
        echo "   1. Deploy program: anchor deploy --provider.cluster devnet"
        echo "   2. Or deploy manually: solana program deploy --url https://api.devnet.solana.com --use-rpc --program-id $KEYPAIR_FILE target/deploy/catallaxyz.so"
        echo "   3. Deploy IDL: ./scripts/deploy-idl.sh"
    else
        echo ""
        echo "❌ Build failed"
        exit 1
    fi
else
    echo ""
    echo "📋 Next steps:"
    echo "   1. Build manually: anchor build"
    echo "   2. Deploy program: anchor deploy --provider.cluster devnet"
    echo "   3. Deploy IDL: ./scripts/deploy-idl.sh"
fi

echo ""
echo "✅ Program ID regeneration complete!"

