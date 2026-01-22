#!/bin/bash

# 重新生成 Program ID 脚本
# 这会：
# 1. 备份并删除旧的 keypair
# 2. 生成新的 keypair
# 3. 更新代码中的 declare_id!
# 4. 更新 Anchor.toml
# 5. 重新构建

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "🔄 重新生成 Program ID"
echo ""

# 步骤 1: 备份旧的 keypair（如果存在）
KEYPAIR_FILE="target/deploy/catallaxyz-keypair.json"
if [ -f "$KEYPAIR_FILE" ]; then
    OLD_ID=$(solana address -k "$KEYPAIR_FILE" 2>/dev/null || echo "unknown")
    BACKUP_FILE="target/deploy/catallaxyz-keypair.json.backup.$(date +%Y%m%d_%H%M%S)"
    echo "📦 备份旧的 keypair..."
    cp "$KEYPAIR_FILE" "$BACKUP_FILE"
    echo "   旧 Program ID: $OLD_ID"
    echo "   备份到: $BACKUP_FILE"
    echo ""
fi

# 步骤 2: 删除旧的 keypair
echo "🗑️  删除旧的 keypair..."
rm -f "$KEYPAIR_FILE"
echo "✅ 旧 keypair 已删除"
echo ""

# 步骤 3: 生成新的 keypair
echo "🆕 生成新的 keypair..."
solana-keygen new --no-bip39-passphrase --outfile "$KEYPAIR_FILE" --force
NEW_ID=$(solana address -k "$KEYPAIR_FILE")
echo "✅ 新 Program ID: $NEW_ID"
echo ""

# 步骤 4: 更新 lib.rs 中的 declare_id!
LIB_RS="programs/catallaxyz/src/lib.rs"
echo "📝 更新 $LIB_RS..."
# 提取当前 declare_id 行
OLD_DECLARE=$(grep -n "declare_id!" "$LIB_RS" | head -1)
if [ -n "$OLD_DECLARE" ]; then
    # 使用 sed 替换 declare_id 中的地址
    sed -i "s/declare_id!(\"[^\"]*\");/declare_id!(\"$NEW_ID\");/" "$LIB_RS"
    echo "✅ 已更新 declare_id!"
else
    echo "⚠️  警告: 未找到 declare_id! 行"
fi
echo ""

# 步骤 5: 更新 Anchor.toml
ANCHOR_TOML="Anchor.toml"
echo "📝 更新 $ANCHOR_TOML..."
# 替换所有 [programs.*] 部分的 catallaxyz 值
sed -i "s|catallaxyz = \".*\"|catallaxyz = \"$NEW_ID\"|g" "$ANCHOR_TOML"
echo "✅ 已更新 Anchor.toml"
echo ""

# 步骤 6: 显示更新结果
echo "📊 更新结果："
echo "   新 Program ID: $NEW_ID"
echo "   Keypair 文件: $KEYPAIR_FILE"
echo ""

# 步骤 7: 询问是否重新构建
read -p "是否现在重新构建程序？(y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    echo "🔨 重新构建程序..."
    anchor build
    
    if [ $? -eq 0 ]; then
        echo ""
        echo "✅ 构建成功！"
        echo ""
        echo "📋 下一步："
        echo "   1. 部署程序: anchor deploy --provider.cluster devnet"
        echo "   2. 或手动部署: solana program deploy --url https://api.devnet.solana.com --use-rpc --program-id $KEYPAIR_FILE target/deploy/catallaxyz.so"
        echo "   3. 部署 IDL: ./scripts/deploy-idl.sh"
    else
        echo ""
        echo "❌ 构建失败"
        exit 1
    fi
else
    echo ""
    echo "📋 下一步："
    echo "   1. 手动构建: anchor build"
    echo "   2. 部署程序: anchor deploy --provider.cluster devnet"
    echo "   3. 部署 IDL: ./scripts/deploy-idl.sh"
fi

echo ""
echo "✅ Program ID 重新生成完成！"

