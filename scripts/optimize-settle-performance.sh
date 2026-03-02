#!/bin/bash

# 优化结算接口性能 - 创建必要的数据库索引
# 运行方式: bash scripts/optimize-settle-performance.sh

echo "=========================================="
echo "  优化结算接口性能 - 创建数据库索引"
echo "=========================================="
echo ""

# 1. 创建 Invoice 索引
echo "1. 创建 Invoice 集合索引..."
node scripts/create-invoice-indexes.js

if [ $? -ne 0 ]; then
  echo "✗ Invoice 索引创建失败"
  exit 1
fi

echo ""

# 2. 创建 Bill 索引
echo "2. 创建 Bill 集合索引..."
node scripts/create-bill-indexes.js

if [ $? -ne 0 ]; then
  echo "✗ Bill 索引创建失败"
  exit 1
fi

echo ""

# 3. 创建 Settle 索引
echo "3. 创建 Settle 集合索引..."
node scripts/create-settle-indexes.js

if [ $? -ne 0 ]; then
  echo "✗ Settle 索引创建失败"
  exit 1
fi

echo ""
echo "=========================================="
echo "  ✓ 所有索引创建完成！"
echo "=========================================="
echo ""
echo "性能优化建议："
echo "  1. 索引已创建，重启应用以应用聚合管道优化"
echo "  2. 预计接口响应时间将从 3+ 秒降低到 < 500ms"
echo "  3. 如需监控性能，可使用: db.currentOp() 查看慢查询"
echo ""
