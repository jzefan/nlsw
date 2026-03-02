/**
 * Create Indexes for Settles Collection
 *
 * 为结算集合（settles）创建索引
 * 基于旧数据库的索引 + tenantId 前缀（多租户优化）
 *
 * 旧索引:
 *   - status_1_settle_date_1
 *   - status_1
 *
 * Usage:
 *   node scripts/create-settle-indexes.js
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

    const collectionSpec = {
      name: 'settles',
      indexes: [
        {
          key: { tenantId: 1 },
          name: 'tenantId_1',
          background: true
        },
        {
          key: { tenantId: 1, status: 1, settle_date: 1 },
          name: 'tenantId_1_status_1_settle_date_1',
          background: true
        },
        {
          key: { tenantId: 1, status: 1 },
          name: 'tenantId_1_status_1',
          background: true
        },
        // 结算号查询索引（用于生成流水号时的查询）
        {
          key: { tenantId: 1, serial_number: -1 },
          name: 'tenantId_1_serial_number_-1',
          background: true
        },
        // 结算类型+自有车索引（用于结算列表查询）
        {
          key: { tenantId: 1, settle_type: 1, selfOwned: 1 },
          name: 'tenantId_1_settle_type_1_selfOwned_1',
          background: true
        }
      ]
    };

    log(`\n── ${collectionSpec.name} 集合 ──`);

    const col = db.collection(collectionSpec.name);

    // 检查集合是否存在
    const colExists = await db.listCollections({ name: collectionSpec.name }).hasNext();
    if (!colExists) {
      log('  ⊙ 集合不存在，跳过');
      return;
    }

    const existingIndexes = await col.indexes();
    let totalCreated = 0;
    let totalSkipped = 0;

    for (const indexSpec of collectionSpec.indexes) {
      try {
        const exists = existingIndexes.some(idx => idx.name === indexSpec.name);

        if (exists) {
          log(`  ⊙ ${indexSpec.name} (已存在)`);
          totalSkipped++;
        } else {
          await col.createIndex(indexSpec.key, {
            name: indexSpec.name,
            unique: indexSpec.unique || false,
            background: indexSpec.background || true
          });
          log(`  ✓ ${indexSpec.name} (已创建)`);
          totalCreated++;
        }
      } catch (error) {
        log(`  ✗ ${indexSpec.name} (失败: ${error.message})`);
      }
    }

    log('\n' + '='.repeat(60));
    log('索引创建总结');
    log('='.repeat(60));
    log(`  创建: ${totalCreated}`);
    log(`  跳过: ${totalSkipped}`);
    log(`  总计: ${totalCreated + totalSkipped}`);
    log('\n✓ settles 集合索引创建完成');

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
