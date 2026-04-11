/**
 * 清理 Settle 历史数据里的占位操作者 `current_user`。
 *
 * 默认 DRY-RUN，只统计和打印命中的结算记录。
 * 只有带 `--apply` 才会真正写库。
 *
 * 用法：
 *   node scripts/cleanup-settle-operator-placeholders.js --tenant DEFAULT --replace-with 张三
 *   node scripts/cleanup-settle-operator-placeholders.js --tenant-id 680000000000000000000000 --field return --replace-with 李四 --apply
 *   node scripts/cleanup-settle-operator-placeholders.js --tenant DEFAULT --clear --apply
 */

require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');

const Settle = require('../models/Settle');
const Tenant = require('../models/Tenant');
const secrets = require('../config/secrets');

const PLACEHOLDER_PATTERN = /^current_user$/i;
const DRY_RUN = !process.argv.includes('--apply');

function getArgValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : '';
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isPlaceholderOperator(value) {
  return PLACEHOLDER_PATTERN.test(normalizeText(value));
}

function normalizeField(value) {
  const field = normalizeText(value).toLowerCase();
  if (!field || field === 'both') return 'both';
  if (field === 'ticket' || field === 'ticket_person') return 'ticket';
  if (field === 'return' || field === 'return_person') return 'return';
  throw new Error(`不支持的字段参数: ${value}`);
}

function buildSettleQuery({ tenantId, field }) {
  const normalizedField = normalizeField(field);
  const placeholderExpr = { $regex: PLACEHOLDER_PATTERN };
  const query = {};

  if (tenantId) {
    query.tenantId = tenantId;
  }

  if (normalizedField === 'ticket') {
    query.ticket_person = placeholderExpr;
    return query;
  }

  if (normalizedField === 'return') {
    query.return_person = placeholderExpr;
    return query;
  }

  query.$or = [
    { ticket_person: placeholderExpr },
    { return_person: placeholderExpr },
  ];
  return query;
}

function buildSettleUpdate({ field, replacement }) {
  const normalizedField = normalizeField(field);
  const normalizedReplacement = normalizeText(replacement);
  const set = {};

  if (normalizedField === 'ticket' || normalizedField === 'both') {
    set.ticket_person = normalizedReplacement;
  }

  if (normalizedField === 'return' || normalizedField === 'both') {
    set.return_person = normalizedReplacement;
  }

  return { $set: set };
}

function buildMongoUri() {
  return process.env.MONGODB || secrets.db;
}

async function resolveTenantId() {
  const tenantIdArg = normalizeText(getArgValue('--tenant-id'));
  const tenantCodeArg = normalizeText(getArgValue('--tenant')).toUpperCase();

  if (tenantIdArg && tenantCodeArg) {
    throw new Error('`--tenant` 和 `--tenant-id` 只能二选一');
  }

  if (tenantIdArg) {
    if (!mongoose.Types.ObjectId.isValid(tenantIdArg)) {
      throw new Error(`无效的 tenantId: ${tenantIdArg}`);
    }
    return {
      tenantId: new mongoose.Types.ObjectId(tenantIdArg),
      tenantLabel: tenantIdArg,
    };
  }

  if (!tenantCodeArg) {
    return { tenantId: null, tenantLabel: 'ALL_TENANTS' };
  }

  const tenant = await Tenant.findOne({ code: tenantCodeArg }).select('_id code name').lean();
  if (!tenant) {
    throw new Error(`未找到租户: ${tenantCodeArg}`);
  }

  return {
    tenantId: tenant._id,
    tenantLabel: `${tenant.code}(${tenant.name})`,
  };
}

function printUsage() {
  console.log('用法:');
  console.log('  node scripts/cleanup-settle-operator-placeholders.js --tenant DEFAULT --replace-with 张三');
  console.log('  node scripts/cleanup-settle-operator-placeholders.js --tenant-id <tenantId> --field return --replace-with 李四 --apply');
  console.log('  node scripts/cleanup-settle-operator-placeholders.js --tenant DEFAULT --clear --apply');
  console.log('');
  console.log('参数:');
  console.log('  --tenant <code>        按租户 code 过滤');
  console.log('  --tenant-id <id>       按租户 ObjectId 过滤');
  console.log('  --field <both|ticket|return>  仅清理指定字段，默认 both');
  console.log('  --replace-with <name>  将占位值替换成指定名字');
  console.log('  --clear                将占位值清空为 ""');
  console.log('  --apply                真正写库；默认 dry-run');
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printUsage();
    return;
  }

  const field = normalizeField(getArgValue('--field') || 'both');
  const replacement = getArgValue('--replace-with');
  const clear = process.argv.includes('--clear');

  if (clear && normalizeText(replacement)) {
    throw new Error('`--clear` 和 `--replace-with` 只能二选一');
  }

  if (!DRY_RUN && !clear && !normalizeText(replacement)) {
    throw new Error('执行写库前必须指定 `--replace-with <name>` 或 `--clear`');
  }

  await mongoose.connect(buildMongoUri());

  try {
    const { tenantId, tenantLabel } = await resolveTenantId();
    const query = buildSettleQuery({ tenantId, field });
    const matchedSettles = await Settle.find(query)
      .select('serial_number billing_name ticket_person return_person tenantId')
      .sort({ settle_date: -1 })
      .lean();

    console.log(`模式: ${DRY_RUN ? 'DRY-RUN' : 'APPLY'}`);
    console.log(`租户: ${tenantLabel}`);
    console.log(`字段: ${field}`);
    console.log(`命中记录数: ${matchedSettles.length}`);

    if (matchedSettles.length === 0) {
      return;
    }

    const sampleRows = matchedSettles.slice(0, 20).map((settle) => ({
      id: String(settle._id),
      serial_number: settle.serial_number || '',
      billing_name: settle.billing_name || '',
      ticket_person: settle.ticket_person || '',
      return_person: settle.return_person || '',
      tenantId: String(settle.tenantId || ''),
    }));
    console.table(sampleRows);

    if (DRY_RUN) {
      console.log('未写库。带 `--apply` 后会执行真正更新。');
      return;
    }

    const update = buildSettleUpdate({
      field,
      replacement: clear ? '' : replacement,
    });
    const result = await Settle.updateMany(query, update);

    console.log(`matchedCount: ${result.matchedCount}`);
    console.log(`modifiedCount: ${result.modifiedCount}`);
    console.log(`replacement: ${clear ? '<cleared>' : normalizeText(replacement)}`);
  } finally {
    await mongoose.disconnect();
  }
}

module.exports = {
  __testables: {
    isPlaceholderOperator,
    normalizeField,
    buildSettleQuery,
    buildSettleUpdate,
  },
};

if (require.main === module) {
  main().catch(async (error) => {
    console.error(error.message || error);
    try {
      await mongoose.disconnect();
    } catch (disconnectError) {
      console.error(disconnectError.message || disconnectError);
    }
    process.exit(1);
  });
}
