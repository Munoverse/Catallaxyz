#!/bin/bash

# 部署 IDL 到链上的脚本

PROGRAM_ID="5pYqj2e28TRpfK8NBAdJA78ZBG9r2XoMT39tqyHnTsRv"
CLUSTER="devnet"
IDL_FILE="target/idl/catallaxyz.json"

echo "🚀 部署 IDL 到 $CLUSTER"
echo "程序 ID: $PROGRAM_ID"
echo "IDL 文件: $IDL_FILE"
echo ""

# 检查 IDL 文件是否存在
if [ ! -f "$IDL_FILE" ]; then
    echo "❌ 错误: IDL 文件不存在: $IDL_FILE"
    exit 1
fi

# 检查程序 ID 是否匹配（只匹配第一个 address 字段，即顶层的程序地址）
# 使用 Python 提取 JSON 中的 address 字段（更可靠）
IDL_ADDRESS=$(python3 -c "import json; f=open('$IDL_FILE'); data=json.load(f); print(data['address'])" 2>/dev/null)
if [ -z "$IDL_ADDRESS" ]; then
    # 如果 Python 不可用，尝试简单的 grep（只匹配第一行）
    IDL_ADDRESS=$(head -10 "$IDL_FILE" | grep -o '"address":\s*"[^"]*"' | head -1 | sed 's/.*"address":\s*"\([^"]*\)".*/\1/')
fi
if [ -z "$IDL_ADDRESS" ]; then
    echo "❌ 错误: 无法从 IDL 文件中提取地址"
    exit 1
fi
if [ "$IDL_ADDRESS" != "$PROGRAM_ID" ]; then
    echo "⚠️  警告: IDL 文件中的地址 ($IDL_ADDRESS) 与程序 ID ($PROGRAM_ID) 不匹配"
    echo "   这会导致部署失败。请先更新 IDL 文件中的地址。"
    exit 1
fi

echo "✅ IDL 文件检查通过"
echo ""

# 尝试初始化 IDL（如果已经存在会失败，可以改用 upgrade）
echo "📤 正在部署 IDL..."
anchor idl init --filepath "$IDL_FILE" "$PROGRAM_ID" \
    --provider.cluster "$CLUSTER"

if [ $? -ne 0 ]; then
    echo ""
    echo "⚠️  初始化失败，可能 IDL 已经存在。尝试升级..."
    anchor idl upgrade --filepath "$IDL_FILE" "$PROGRAM_ID" \
        --provider.cluster "$CLUSTER"
fi

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ IDL 部署成功！"
    echo ""
    echo "🔍 验证 IDL 部署："
    anchor idl fetch "$PROGRAM_ID" --provider.cluster "$CLUSTER"
else
    echo ""
    echo "❌ IDL 部署失败"
    exit 1
fi

