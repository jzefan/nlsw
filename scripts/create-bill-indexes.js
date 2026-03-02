/**
 * Create Bill Collection Indexes
 *
 * 基于旧系统索引，为新系统（包含 tenantId）创建优化的索引
 *
 * Usage:
 *   node scripts/create-bill-indexes.js
 */

require('dotenv').config();
const { MongoClient } = require('mongoose').mongo;

// ─── Configuration ──────────────────────────────────────────────────────────

const TARGET_DB = process.env.MONGO_DATABASE || 'nldb_saas';

function buildMongoUri() {
  if (process.env.MONGODB) {
    return process.env.MONGODB;
  }

  const host = process.env.MONGO_HOST || 'localhost';
  const port = process.env.MONGO_PORT || '27027';
  const database = process.env.MONGO_DATABASE || 'nldb_saas';
  const user = process.env.MONGO_USER;
  const password = process.env.MONGO_PASSWORD;
  const authSource = process.env.MONGO_AUTH_SOURCE || 'admin';

  if (user && password) {
    return `mongodb://${user}:${password}@${host}:${port}/${database}?authSource=${authSource}`;
  }
  return `mongodb://${host}:${port}/${database}`;
}

function log(msg) {
  console.log(msg);
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function createIndexes() {
  const uri = buildMongoUri();
  const client = new MongoClient(uri);

  try {
    await client.connect();
    log('✓ Connected to MongoDB');

    const db = client.db(TARGET_DB);
    const billsCol = db.collection('bills');

    log('\n── 当前索引 ──');
    const existingIndexes = await billsCol.indexes();
    existingIndexes.forEach(idx => {
      log(`  ${idx.name}: ${JSON.stringify(idx.key)}`);
    });

    log('\n── 创建新索引 ──');

    // 定义需要创建的索引
    const indexesToCreate = [
      // 1. 租户内唯一索引（订单号+提单号）
      {
        key: { tenantId: 1, order: 1, bill_no: 1 },
        name: 'tenantId_1_order_1_bill_no_1',
        unique: true,
        background: true
      },

      // 2. 开单名称查询索引
      {
        key: { tenantId: 1, billing_name: 1 },
        name: 'tenantId_1_billing_name_1',
        background: true
      },

      // 3. 订单号查询索引
      {
        key: { tenantId: 1, order_no: 1 },
        name: 'tenantId_1_order_no_1',
        background: true
      },

      // 4. 提单号查询索引
      {
        key: { tenantId: 1, bill_no: 1 },
        name: 'tenantId_1_bill_no_1',
        background: true
      },

      // 5. 创建日期排序索引
      {
        key: { tenantId: 1, create_date: -1 },
        name: 'tenantId_1_create_date_-1',
        background: true
      },

      // 6. 状态筛选索引
      {
        key: { tenantId: 1, status: 1 },
        name: 'tenantId_1_status_1',
        background: true
      },

      // 7. 开单名称+日期复合索引
      {
        key: { tenantId: 1, billing_name: 1, create_date: -1 },
        name: 'tenantId_1_billing_name_1_create_date_-1',
        background: true
      },

      // 8. 开单名称+日期+剩余块数（用于配发货查询）
      {
        key: { tenantId: 1, billing_name: 1, create_date: -1, left_num: 1 },
        name: 'tenantId_1_billing_name_1_create_date_-1_left_num_1',
        background: true
      },

      // 9. 开单名称+剩余块数（用于getBillingNames查询优化）
      {
        key: { tenantId: 1, billing_name: 1, left_num: 1 },
        name: 'tenantId_1_billing_name_1_left_num_1',
        background: true
      },

      // 10. 开单名称+日期+剩余块数+状态（完整复合索引）
      {
        key: { tenantId: 1, billing_name: 1, create_date: -1, left_num: 1, status: 1 },
        name: 'tenantId_1_billing_name_1_create_date_-1_left_num_1_status_1',
        background: true
      },

      // 11. 状态标志+创建日期（用于状态筛选+排序）
      {
        key: { tenantId: 1, status_flag: 1, create_date: -1 },
        name: 'tenantId_1_status_flag_1_create_date_-1',
        background: true
      },

      // 12. 运单号嵌套字段索引（用于结算查询中的价格信息查找）
      {
        key: { tenantId: 1, 'invoices.inv_no': 1 },
        name: 'tenantId_1_invoices_inv_no_1',
        background: true
      }
    ];

    let created = 0;
    let skipped = 0;

    for (const indexSpec of indexesToCreate) {
      try {
        // 检查索引是否已存在
        const exists = existingIndexes.some(idx => idx.name === indexSpec.name);

        if (exists) {
          log(`  ⊙ ${indexSpec.name} (已存在)`);
          skipped++;
        } else {
          await billsCol.createIndex(indexSpec.key, {
            name: indexSpec.name,
            unique: indexSpec.unique || false,
            background: indexSpec.background || true
          });
          log(`  ✓ ${indexSpec.name} (已创建)`);
          created++;
        }
      } catch (error) {
        log(`  ✗ ${indexSpec.name} (失败: ${error.message})`);
      }
    }

    log('\n── 索引创建完成 ──');
    log(`  创建: ${created}`);
    log(`  跳过: ${skipped}`);
    log(`  总计: ${indexesToCreate.length}`);

    log('\n── 最终索引列表 ──');
    const finalIndexes = await billsCol.indexes();
    finalIndexes.forEach(idx => {
      const unique = idx.unique ? ' [UNIQUE]' : '';
      log(`  ${idx.name}${unique}`);
      log(`    ${JSON.stringify(idx.key)}`);
    });

    log('\n✓ 索引创建成功');

  } catch (error) {
    console.error('\n✗ 错误:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await client.close();
    log('\n✓ 已断开数据库连接');
  }
}

createIndexes();
