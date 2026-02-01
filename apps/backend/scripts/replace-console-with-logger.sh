#!/bin/bash
# AUDIT FIX B-31: Replace console.log/error/warn with secure logger
#
# This script helps identify and replace console.* calls with the secure logger.
# Run this script from the apps/backend directory.
#
# Usage:
#   ./scripts/replace-console-with-logger.sh
#
# After running, manually review changes and test the application.

set -e

echo "=== Backend Console.* to Logger Migration ==="
echo ""

# Find all TypeScript files with console.* calls
echo "Files with console.* calls:"
grep -rl "console\.\(log\|error\|warn\)" src/ --include="*.ts" | grep -v node_modules

echo ""
echo "Total occurrences:"
grep -r "console\.\(log\|error\|warn\)" src/ --include="*.ts" | wc -l

echo ""
echo "=== Replacement Patterns ==="
echo ""
echo "1. Import logger at top of file:"
echo "   import { logger } from '../lib/logger.js';"
echo ""
echo "2. Replace patterns:"
echo "   console.log('message', data)  -> logger.info('context', 'message', data)"
echo "   console.error('message', err) -> logger.error('context', 'message', err)"
echo "   console.warn('message', data) -> logger.warn('context', 'message', data)"
echo ""
echo "3. Context should be the file/function name, e.g.:"
echo "   logger.error('routes/orders', 'Failed to fetch orders', error)"
echo ""
echo "=== Automated sed replacements (review carefully!) ==="
echo ""

# Example sed commands (uncomment to run):
# These are aggressive and may need manual review

# sed -i "s/console\.log('\([^']*\)', /logger.info('CONTEXT', '\1', /g" src/**/*.ts
# sed -i "s/console\.error('\([^']*\)', /logger.error('CONTEXT', '\1', /g" src/**/*.ts
# sed -i "s/console\.warn('\([^']*\)', /logger.warn('CONTEXT', '\1', /g" src/**/*.ts

echo "Run the following command to see all console.* calls with context:"
echo "  grep -rn 'console\.\(log\|error\|warn\)' src/ --include='*.ts'"
