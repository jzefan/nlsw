/**
 * Create All Indexes for Multi-Tenant Collections
 *
 * 一次性为所有业务集合创建优化索引
 *
 * Usage:
 *   node scripts/create-all-indexes.js
 */

require('dotenv').config();
const { execSync } = require('child_process');
const path = require('path');

function log(msg) {
  console.log(msg);
}

function runScript(scriptName) {
  const scriptPath = path.join(__dirname, scriptName);
  log(`\n${'='.repeat(60)}`);
  log(`运行: ${scriptName}`);
  log('='.repeat(60));

  try {
    execSync(`node "${scriptPath}"`, {
      stdio: 'inherit',
      cwd: path.join(__dirname, '..')
    });
    log(`\n✓ ${scriptName} 执行成功`);
    return true;
  } catch (error) {
    log(`\n✗ ${scriptName} 执行失败`);
    return false;
  }
}

async function main() {
  log('='.repeat(60));
  log('创建所有集合的索引');
  log('='.repeat(60));

  const scripts = [
    'create-basic-indexes.js',    // 基础数据集合（vehicles, destinations 等）
    'create-bill-indexes.js',     // 提单索引
    'create-invoice-indexes.js',  // 运单索引
    'create-settle-indexes.js'    // 结算索引
  ];

  const results = {
    success: [],
    failed: []
  };

  for (const script of scripts) {
    if (runScript(script)) {
      results.success.push(script);
    } else {
      results.failed.push(script);
    }
  }

  log('\n' + '='.repeat(60));
  log('执行总结');
  log('='.repeat(60));
  log(`成功: ${results.success.length}/${scripts.length}`);

  if (results.success.length > 0) {
    log('\n✓ 成功的脚本:');
    results.success.forEach(s => log(`  - ${s}`));
  }

  if (results.failed.length > 0) {
    log('\n✗ 失败的脚本:');
    results.failed.forEach(s => log(`  - ${s}`));
    process.exit(1);
  }

  log('\n✓ 所有索引创建完成！');
}

main();
