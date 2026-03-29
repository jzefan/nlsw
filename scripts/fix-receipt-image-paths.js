/**
 * 修改 receiptimages 表中 file_path 的前缀路径
 *
 * 用法：
 *   node scripts/fix-receipt-image-paths.js                # dry-run
 *   node scripts/fix-receipt-image-paths.js --apply         # 执行替换
 *
 * 可通过环境变量自定义：
 *   OLD_PREFIX="/Users/jzefan/work/nlsw-saas/"  NEW_PREFIX="/home/juntie/nlsw2/"  node scripts/fix-receipt-image-paths.js
 */

require('dotenv').config();
const { MongoClient } = require('mongoose').mongo;

const DRY_RUN = !process.argv.includes('--apply');
const OLD_PREFIX = process.env.OLD_PREFIX || '/Users/jzefan/work/nlsw-saas/';
const NEW_PREFIX = process.env.NEW_PREFIX || '/home/juntie/nlsw2/';

function buildMongoUri() {
  if (process.env.MONGODB) return process.env.MONGODB;
  const host = process.env.MONGO_HOST || 'localhost';
  const port = process.env.MONGO_PORT || '27027';
  const db = process.env.MONGO_DATABASE || 'nldb';
  const user = process.env.MONGO_USER;
  const pw = process.env.MONGO_PASSWORD;
  const auth = process.env.MONGO_AUTH_SOURCE || 'admin';
  if (user && pw) return `mongodb://${user}:${pw}@${host}:${port}/${db}?authSource=${auth}`;
  return `mongodb://${host}:${port}/${db}`;
}

async function main() {
  const uri = buildMongoUri();
  const dbName = process.env.MONGO_DATABASE || 'nldb';
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db(dbName);
    const col = db.collection('receiptimages');

    const total = await col.countDocuments();
    const matched = await col.countDocuments({ file_path: { $regex: `^${OLD_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` } });

    console.log(`receiptimages 总数: ${total}`);
    console.log(`匹配前缀 "${OLD_PREFIX}" 的记录: ${matched}`);
    console.log(`替换为: "${NEW_PREFIX}"`);
    console.log(`模式: ${DRY_RUN ? 'DRY-RUN（预览）' : 'APPLY（执行）'}`);
    console.log('');

    if (matched === 0) {
      console.log('没有需要替换的记录。');
      return;
    }

    if (DRY_RUN) {
      // 显示前 5 条示例
      const samples = await col.find({ file_path: { $regex: `^${OLD_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` } }).limit(5).toArray();
      console.log('示例（前 5 条）:');
      samples.forEach(doc => {
        const newPath = doc.file_path.replace(OLD_PREFIX, NEW_PREFIX);
        console.log(`  ${doc.file_path}`);
        console.log(`  → ${newPath}`);
        console.log('');
      });
      console.log(`运行 node scripts/fix-receipt-image-paths.js --apply 执行替换`);
    } else {
      // 使用 aggregation pipeline update 批量替换
      const result = await col.updateMany(
        { file_path: { $regex: `^${OLD_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` } },
        [{ $set: { file_path: { $replaceOne: { input: '$file_path', find: OLD_PREFIX, replacement: NEW_PREFIX } } } }]
      );
      console.log(`✓ 已替换 ${result.modifiedCount} 条记录`);
    }
  } finally {
    await client.close();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
