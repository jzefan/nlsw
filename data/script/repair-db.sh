#!/bin/bash
# MongoDB 修复脚本

WORK_DIR="$HOME/work/nlsw"
# 停止 MongoDB
"$WORK_DIR/data/stopdb.sh"

# 备份数据库
BACKUP_DIR="$WORK_DIR/data/backup/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"
cp -r "$WORK_DIR/data/db" "$BACKUP_DIR/"
echo "数据库已备份到: $BACKUP_DIR"

# 修复数据库
echo "正在修复数据库..."
mongod --repair --dbpath "$WORK_DIR/data/db" --logpath "$WORK_DIR/data/log/repair.log"

if [ $? -eq 0 ]; then
    echo "✅ 数据库修复完成"
    echo "现在可以重新启动: $WORK_DIR/data/startdb.sh"
else
    echo "❌ 数据库修复失败"
    echo "查看修复日志: $WORK_DIR/data/log/repair.log"
fi
