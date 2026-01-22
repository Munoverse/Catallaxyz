#!/bin/bash
# 测试脚本：使用已运行的验证器

cd "$(dirname "$0")"

# 检查验证器是否运行
if ! pgrep -f "solana-test-validator" > /dev/null && ! pgrep -f "surfpool" > /dev/null; then
    echo "错误: 验证器未运行"
    echo "请先启动验证器:"
    echo "  solana-test-validator --reset"
    echo "  或"
    echo "  surfpool start"
    exit 1
fi

echo "✓ 检测到验证器正在运行"
echo "使用已运行的验证器运行测试..."
echo ""

# 使用已运行的验证器运行测试
anchor test --skip-local-validator

