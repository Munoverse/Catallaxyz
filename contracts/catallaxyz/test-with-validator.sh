#!/bin/bash
# Test script: use an already running validator

cd "$(dirname "$0")"

# Check if validator is running
if ! pgrep -f "solana-test-validator" > /dev/null && ! pgrep -f "surfpool" > /dev/null; then
    echo "Error: validator not running"
    echo "Start the validator first:"
    echo "  solana-test-validator --reset"
    echo "  or"
    echo "  surfpool start"
    exit 1
fi

echo "✓ Detected running validator"
echo "Running tests using the existing validator..."
echo ""

# Run tests using the existing validator
anchor test --skip-local-validator

