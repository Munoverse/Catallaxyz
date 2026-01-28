#!/bin/bash

# Script to deploy IDL on-chain

PROGRAM_ID="5pYqj2e28TRpfK8NBAdJA78ZBG9r2XoMT39tqyHnTsRv"
CLUSTER="devnet"
IDL_FILE="target/idl/catallaxyz.json"

echo "🚀 Deploying IDL to $CLUSTER"
echo "Program ID: $PROGRAM_ID"
echo "IDL file: $IDL_FILE"
echo ""

# Check if IDL file exists
if [ ! -f "$IDL_FILE" ]; then
    echo "❌ Error: IDL file not found: $IDL_FILE"
    exit 1
fi

# Check program ID matches (only the top-level address field)
# Use Python to extract address from JSON (more reliable)
IDL_ADDRESS=$(python3 -c "import json; f=open('$IDL_FILE'); data=json.load(f); print(data['address'])" 2>/dev/null)
if [ -z "$IDL_ADDRESS" ]; then
    # If Python is unavailable, fall back to simple grep (first match only)
    IDL_ADDRESS=$(head -10 "$IDL_FILE" | grep -o '"address":\s*"[^"]*"' | head -1 | sed 's/.*"address":\s*"\([^"]*\)".*/\1/')
fi
if [ -z "$IDL_ADDRESS" ]; then
    echo "❌ Error: Failed to extract address from IDL file"
    exit 1
fi
if [ "$IDL_ADDRESS" != "$PROGRAM_ID" ]; then
    echo "⚠️  Warning: IDL address ($IDL_ADDRESS) does not match program ID ($PROGRAM_ID)"
    echo "   Deployment will fail. Update the IDL address first."
    exit 1
fi

echo "✅ IDL file check passed"
echo ""

# Try IDL init (if already exists, fall back to upgrade)
echo "📤 Deploying IDL..."
anchor idl init --filepath "$IDL_FILE" "$PROGRAM_ID" \
    --provider.cluster "$CLUSTER"

if [ $? -ne 0 ]; then
    echo ""
    echo "⚠️  Init failed; IDL may already exist. Trying upgrade..."
    anchor idl upgrade --filepath "$IDL_FILE" "$PROGRAM_ID" \
        --provider.cluster "$CLUSTER"
fi

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ IDL deployed successfully!"
    echo ""
    echo "🔍 Verifying IDL deployment:"
    anchor idl fetch "$PROGRAM_ID" --provider.cluster "$CLUSTER"
else
    echo ""
    echo "❌ IDL deployment failed"
    exit 1
fi

