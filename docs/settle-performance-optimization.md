# 结算接口性能优化

## 问题描述

`GET /settle/bills` 接口响应时间过长（3+ 秒），影响用户体验。

## 性能瓶颈分析

### 原实现问题

1. **populate() 性能差**
   - `populate()` 在大量数据时效率很低
   - 需要先查询主表，再逐个查询关联表
   - 对于 1000+ 条数据，会产生大量数据库往返

2. **两次数据库查询**
   - 第一次：查询 Invoice 并 populate bills
   - 第二次：查询所有 Bill 的价格信息
   - 每次查询都需要网络往返和数据传输

3. **缺少关键索引**
   - 查询条件未覆盖索引
   - 排序字段未建立索引
   - 嵌套字段查询无索引支持

## 优化方案

### 1. 使用聚合管道（Aggregation Pipeline）

**优势：**
- 一次查询获取所有数据
- MongoDB 原生优化，性能更好
- 减少数据传输和网络往返

**关键改进：**
```javascript
// 旧方法：populate + 第二次查询
const invoices = await Invoice.find(query).populate('bills.bill_id')
const bills = await Bill.find({ _id: { $in: billIds } })

// 新方法：聚合管道
const pipeline = [
  { $match: conditions },
  { $unwind: '$bills' },
  { $lookup: { from: 'bills', ... } },
  { $sort: { ship_date: -1 } }
]
const results = await Invoice.aggregate(pipeline)
```

### 2. 创建关键索引

#### Invoice 集合索引

```javascript
// 核心查询索引（支持状态过滤 + 日期排序）
{ tenantId: 1, state: 1, ship_date: -1 }

// 过滤条件索引
{ tenantId: 1, ship_name: 1 }
{ tenantId: 1, vehicle_vessel_name: 1 }
{ tenantId: 1, ship_to: 1 }
{ tenantId: 1, selfOwned: 1 }

// 复合索引（支持多条件查询）
{ tenantId: 1, state: 1, ship_name: 1, ship_date: -1 }
{ tenantId: 1, state: 1, selfOwned: 1, ship_date: -1 }
```

#### Bill 集合索引

```javascript
// $lookup 查询优化
{ tenantId: 1, _id: 1 }

// 嵌套字段索引
{ tenantId: 1, 'invoices.inv_no': 1 }
```

#### Settle 集合索引

```javascript
// 流水号生成查询
{ tenantId: 1, serial_number: -1 }

// 结算列表查询
{ tenantId: 1, settle_type: 1, selfOwned: 1 }
```

## 性能提升

### 预期效果

| 指标 | 优化前 | 优化后 | 提升 |
|------|--------|--------|------|
| 响应时间 | 3+ 秒 | < 500ms | **6x+** |
| 数据库查询次数 | 2+ 次 | 1 次 | **50%** |
| 网络往返 | 多次 | 1 次 | **显著减少** |
| 内存占用 | 高 | 中 | **降低** |

### 实际测试

```bash
# 优化前
GET /settle/bills?fDate1=2025-11-30&fDate2=2026-03-01
响应时间: 3226ms

# 优化后（预期）
GET /settle/bills?fDate1=2025-11-30&fDate2=2026-03-01
响应时间: < 500ms
```

## 部署步骤

### 1. 创建数据库索引

```bash
# 方式一：一键运行所有索引创建
bash scripts/optimize-settle-performance.sh

# 方式二：分别运行
node scripts/create-invoice-indexes.js
node scripts/create-bill-indexes.js
node scripts/create-settle-indexes.js
```

### 2. 重启应用

```bash
# 重启 Node.js 应用以应用代码优化
pm2 restart nlsw-saas
# 或
npm run dev
```

### 3. 验证性能

```bash
# 查看接口响应时间
curl -w "@curl-format.txt" "http://localhost:1080/settle/bills?fDate1=2025-11-30&fDate2=2026-03-01"

# 查看 MongoDB 慢查询
mongo --eval "db.currentOp({'secs_running': {$gte: 1}})"
```

## 注意事项

### 索引维护

1. **后台创建**：所有索引使用 `background: true` 避免阻塞数据库
2. **索引大小**：定期监控索引大小，避免过度膨胀
3. **索引使用率**：使用 `explain()` 确认索引被正确使用

```javascript
// 检查查询是否使用索引
db.invoices.find({ tenantId: "xxx", state: "已配发" })
  .sort({ ship_date: -1 })
  .explain("executionStats")
```

### 兼容性

- MongoDB 版本要求：≥ 3.6（支持 $lookup）
- Node.js 版本要求：≥ 14
- Mongoose 版本要求：≥ 5.0

## 监控和调优

### 性能监控

```javascript
// 在代码中添加性能监控
console.time('getSettleBills')
const results = await Invoice.aggregate(pipeline)
console.timeEnd('getSettleBills')
```

### 进一步优化建议

1. **分页加载**：前端实现虚拟滚动，按需加载数据
2. **缓存策略**：对不常变化的数据使用 Redis 缓存
3. **查询优化**：限制返回字段，减少数据传输量

```javascript
// 只返回必要字段
{ $project: { _id: 1, bill_no: 1, ... } }
```

## 参考文档

- [MongoDB Aggregation Pipeline](https://docs.mongodb.com/manual/core/aggregation-pipeline/)
- [MongoDB Index Optimization](https://docs.mongodb.com/manual/core/index-optimization/)
- [Mongoose Populate Performance](https://mongoosejs.com/docs/populate.html#populate-performance)

## 更新日志

- **2026-03-01**: 初始优化完成
  - 实现聚合管道替代 populate
  - 创建 15+ 个关键索引
  - 预计性能提升 6x+
