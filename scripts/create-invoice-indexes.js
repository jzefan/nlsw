/**
 * Create Invoice Collection Indexes
 *
 * 基于旧系统索引，为新系统（包含 tenantId）创建优化的索引
 *
 * Usage:
 *   node scripts/create-invoice-indexes.js
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
    const invoicesCol = db.collection('invoices');

    log('\n── 当前索引 ──');
    const existingIndexes = await invoicesCol.indexes();
    existingIndexes.forEach(idx => {
      log(`  ${idx.name}: ${JSON.stringify(idx.key)}`);
    });

    log('\n── 创建新索引 ──');

    // 定义需要创建的索引
    const indexesToCreate = [
      // 1. 租户内运单号唯一索引
      {
        key: { tenantId: 1, waybill_no: 1 },
        name: 'tenantId_1_waybill_no_1',
        unique: true,
        background: true
      },

      // 2. 状态索引（用于按状态筛选）
      {
        key: { tenantId: 1, state: 1 },
        name: 'tenantId_1_state_1',
        background: true
      },

      // 3. 发货名称索引
      {
        key: { tenantId: 1, ship_name: 1 },
        name: 'tenantId_1_ship_name_1',
        background: true
      },

      // 4. 发货日期索引（用于日期排序）
      {
        key: { tenantId: 1, ship_date: -1 },
        name: 'tenantId_1_ship_date_-1',
        background: true
      },

      // 5. 发货名称+日期复合索引
      {
        key: { tenantId: 1, ship_name: 1, ship_date: -1 },
        name: 'tenantId_1_ship_name_1_ship_date_-1',
        background: true
      },

      // 6. 车船结算查询复合索引
      // 用于车船结算页面的复杂查询（状态+车船名称等）
      {
        key: {
          tenantId: 1,
          vessel_settle_state: 1,
          state: 1,
          vehicle_vessel_name: 1
        },
        name: 'tenantId_1_vessel_settle_state_1_state_1_vehicle_vessel_name_1',
        background: true
      },

      // 7. 车船结算+车辆名称查询索引
      // 注意：bills.vehicles.veh_name 是嵌套数组字段
      {
        key: {
          tenantId: 1,
          vessel_settle_state: 1,
          state: 1,
          'bills.vehicles.veh_name': 1
        },
        name: 'tenantId_1_vessel_settle_state_1_state_1_bills_vehicles_veh_name_1',
        background: true
      },

      // 8. 车船名称单独索引（用于车船筛选）
      {
        key: { tenantId: 1, vehicle_vessel_name: 1 },
        name: 'tenantId_1_vehicle_vessel_name_1',
        background: true
      },

      // 9. 自有车标志索引（如果启用了自有车功能）
      {
        key: { tenantId: 1, selfOwned: 1 },
        name: 'tenantId_1_selfOwned_1',
        background: true
      },

      // 10. 车船结算状态+发货日期（用于车船结算列表）
      {
        key: { tenantId: 1, vessel_settle_state: 1, ship_date: -1 },
        name: 'tenantId_1_vessel_settle_state_1_ship_date_-1',
        background: true
      },

      // 11. 发货单位+发货日期（用于发货单位筛选）
      {
        key: { tenantId: 1, ship_customer: 1, ship_date: -1 },
        name: 'tenantId_1_ship_customer_1_ship_date_-1',
        background: true
      },

      // 12. 目的地索引（用于结算页面过滤）
      {
        key: { tenantId: 1, ship_to: 1 },
        name: 'tenantId_1_ship_to_1',
        background: true
      },

      // 13. 状态+日期复合索引（用于结算提单列表查询）
      // 这是 getSettleBills 的核心查询条件
      {
        key: { tenantId: 1, state: 1, ship_date: -1 },
        name: 'tenantId_1_state_1_ship_date_-1',
        background: true
      },

      // 14. 结算查询复合索引（状态+开单名称+日期）
      {
        key: { tenantId: 1, state: 1, ship_name: 1, ship_date: -1 },
        name: 'tenantId_1_state_1_ship_name_1_ship_date_-1',
        background: true
      },

      // 15. 结算查询复合索引（状态+自有车+日期）
      {
        key: { tenantId: 1, state: 1, selfOwned: 1, ship_date: -1 },
        name: 'tenantId_1_state_1_selfOwned_1_ship_date_-1',
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
          await invoicesCol.createIndex(indexSpec.key, {
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
    const finalIndexes = await invoicesCol.indexes();
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
