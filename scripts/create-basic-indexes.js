/**
 * Create Basic Indexes for Supporting Collections
 *
 * 为基础数据集合（vehicles, destinations, brands, companies 等）创建索引
 *
 * Usage:
 *   node scripts/create-basic-indexes.js
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

    // 定义需要创建索引的集合
    const collections = [
      {
        name: 'vehicles',
        indexes: [
          {
            key: { tenantId: 1 },
            name: 'tenantId_1',
            background: true
          },
          {
            key: { tenantId: 1, name: 1 },
            name: 'tenantId_1_name_1',
            unique: true,
            background: true
          },
          {
            key: { tenantId: 1, veh_type: 1 },
            name: 'tenantId_1_veh_type_1',
            background: true
          },
          {
            key: { tenantId: 1, veh_category: 1 },
            name: 'tenantId_1_veh_category_1',
            background: true
          }
        ]
      },
      {
        name: 'destinations',
        indexes: [
          {
            key: { tenantId: 1 },
            name: 'tenantId_1',
            background: true
          },
          {
            key: { tenantId: 1, name: 1 },
            name: 'tenantId_1_name_1',
            unique: true,
            background: true
          }
        ]
      },
      {
        name: 'brands',
        indexes: [
          {
            key: { tenantId: 1 },
            name: 'tenantId_1',
            background: true
          },
          {
            key: { tenantId: 1, name: 1 },
            name: 'tenantId_1_name_1',
            unique: true,
            background: true
          }
        ]
      },
      {
        name: 'companies',
        indexes: [
          {
            key: { tenantId: 1 },
            name: 'tenantId_1',
            background: true
          },
          {
            key: { tenantId: 1, name: 1 },
            name: 'tenantId_1_name_1',
            unique: true,
            background: true
          }
        ]
      },
      {
        name: 'saledeps',
        indexes: [
          {
            key: { tenantId: 1 },
            name: 'tenantId_1',
            background: true
          },
          {
            key: { tenantId: 1, name: 1 },
            name: 'tenantId_1_name_1',
            unique: true,
            background: true
          }
        ]
      },
      {
        name: 'warehouses',
        indexes: [
          {
            key: { tenantId: 1 },
            name: 'tenantId_1',
            background: true
          },
          {
            key: { tenantId: 1, name: 1 },
            name: 'tenantId_1_name_1',
            unique: true,
            background: true
          }
        ]
      }
    ];

    let totalCreated = 0;
    let totalSkipped = 0;

    for (const collectionSpec of collections) {
      log(`\n── ${collectionSpec.name} 集合 ──`);

      const col = db.collection(collectionSpec.name);

      // 检查集合是否存在
      const colExists = await db.listCollections({ name: collectionSpec.name }).hasNext();
      if (!colExists) {
        log(`  ⊙ 集合不存在，跳过`);
        continue;
      }

      const existingIndexes = await col.indexes();

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
    }

    log('\n' + '='.repeat(60));
    log('索引创建总结');
    log('='.repeat(60));
    log(`  创建: ${totalCreated}`);
    log(`  跳过: ${totalSkipped}`);
    log(`  总计: ${totalCreated + totalSkipped}`);
    log('\n✓ 基础集合索引创建完成');

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
