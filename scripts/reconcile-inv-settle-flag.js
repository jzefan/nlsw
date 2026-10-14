/**
 * 按结算单（settles）回填提单里被抹掉的结算标志位。
 *
 * 背景：`inv_settle_flag` / `settle_flag` 是位图
 *   1 = 客户结算(CUSTOMER)、2 = 代收代付结算(COLLECTION)、4 = 车船结算(VESSEL)
 * 历史上有几条写路径把它整值覆盖成前端缓存的旧值（或直接写 0），
 * 于是「已经销账的提单又出现在未结算列表里」。
 *
 * 本脚本以 settles 集合为准（结算单存在 = 这笔结算确实发生过），
 * 把缺失的位补回对应提单的运单子文档，并同步 bill.settle_flag / status。
 * 只做「回填」，不会清除任何已有的位。
 *
 * 默认 DRY-RUN，只打印将要修改的内容；带 `--apply` 才写库，
 * 写库前会把改动前的原值快照写到 scripts/backups/ 便于回滚。
 *
 * 用法：
 *   node scripts/reconcile-inv-settle-flag.js
 *   node scripts/reconcile-inv-settle-flag.js --tenant DEFAULT
 *   node scripts/reconcile-inv-settle-flag.js --since 2026-01-01 --apply
 */

require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const Settle = require('../models/Settle');
const Bill = require('../models/Bill');
const Tenant = require('../models/Tenant');
const secrets = require('../config/secrets');

const CUSTOMER_SETTLE_FLAG = 1;
const COLLECTION_SETTLE_FLAG = 2;
const VESSEL_SETTLE_FLAG = 4;

const DRY_RUN = !process.argv.includes('--apply');

// 这些状态的提单说明还没走到结算，回填后可以安全地升级成「已结算」
const UPGRADABLE_STATUS = new Set(['新建', '待配发', '已配发']);

function getArgValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : '';
}

function settleTypeToBit(settleType) {
  if (settleType === '客户结算') return CUSTOMER_SETTLE_FLAG;
  if (settleType === '代收代付结算') return COLLECTION_SETTLE_FLAG;
  if (settleType === '车船结算') return VESSEL_SETTLE_FLAG;
  return 0;
}

function isUpgradableStatus(status) {
  if (!status) return true;
  if (UPGRADABLE_STATUS.has(status)) return true;
  return status.startsWith('已配发') || status.startsWith('部分配发');
}

/**
 * 汇总结算单对提单的要求：billId -> { bitsByInvNo: Map<inv_no, bit>, sources: [] }
 */
function collectRequirements(settles) {
  const requiredByBill = new Map();

  for (const settle of settles) {
    const bit = settleTypeToBit(settle.settle_type);
    if (!bit) continue;

    for (const settleBill of settle.bills || []) {
      if (!settleBill || !settleBill.bill_id) continue;
      const key = String(settleBill.bill_id);
      if (!requiredByBill.has(key)) {
        requiredByBill.set(key, { bitsByInvNo: new Map(), sources: [] });
      }
      const entry = requiredByBill.get(key);
      const invNo = settleBill.inv_no;
      entry.bitsByInvNo.set(invNo, (entry.bitsByInvNo.get(invNo) || 0) | bit);
      entry.sources.push(`${settle.serial_number}(${settle.settle_type})`);
    }
  }

  return requiredByBill;
}

/**
 * 纯函数：算出一张提单需要怎么补。
 * 返回 null 表示无需修改；否则返回 { before, set, summary }。
 * 只 OR 入缺失的位，绝不清除已有位。
 */
function planBillRepair(bill, requirement) {
  if (!bill || !Array.isArray(bill.invoices) || bill.invoices.length === 0) {
    return null;
  }
  if (!requirement || requirement.bitsByInvNo.size === 0) return null;

  const set = {};
  const before = {};
  const changedInvoices = [];
  let requiredUnion = 0;

  bill.invoices.forEach((invoice, index) => {
    const invNo = invoice.inv_no;
    const needed = requirement.bitsByInvNo.get(invNo) || 0;
    if (!needed) return;
    requiredUnion |= needed;

    const current = invoice.inv_settle_flag || 0;
    const next = current | needed;
    if (next === current) return;

    set[`invoices.${index}.inv_settle_flag`] = next;
    before[`invoices.${index}.inv_settle_flag`] = current;
    changedInvoices.push({ inv_no: invNo, from: current, to: next });
  });

  if (changedInvoices.length === 0) return null;

  const currentBillFlag = bill.settle_flag || 0;
  const nextBillFlag = currentBillFlag | requiredUnion;
  let statusChanged = false;

  if (nextBillFlag !== currentBillFlag) {
    set.settle_flag = nextBillFlag;
    before.settle_flag = currentBillFlag;
  }

  if (nextBillFlag !== 0 && isUpgradableStatus(bill.status)) {
    set.status = '已结算';
    set.status_flag = 3;
    before.status = bill.status;
    before.status_flag = bill.status_flag || 0;
    statusChanged = true;
  }

  return {
    before,
    set,
    summary: {
      billing_name: bill.billing_name || '',
      bill_no: bill.bill_no || '',
      invoices: changedInvoices,
      settle_flag: `${before.settle_flag} -> ${nextBillFlag}`,
      status: statusChanged
        ? `${before.status} -> 已结算`
        : `${bill.status} (不变)`,
      sources: requirement.sources,
    },
  };
}

function buildMongoUri() {
  return process.env.MONGODB || secrets.db;
}

async function resolveTenantId() {
  const tenantIdArg = (getArgValue('--tenant-id') || '').trim();
  const tenantCodeArg = (getArgValue('--tenant') || '').trim().toUpperCase();

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

  const tenant = await Tenant.findOne({ code: tenantCodeArg })
    .select('_id code name')
    .lean();
  if (!tenant) {
    throw new Error(`未找到租户: ${tenantCodeArg}`);
  }

  return {
    tenantId: tenant._id,
    tenantLabel: `${tenant.code}(${tenant.name})`,
  };
}

function chunk(array, size) {
  const out = [];
  for (let i = 0; i < array.length; i += size) {
    out.push(array.slice(i, i + size));
  }
  return out;
}

function writeSnapshot(plans) {
  const dir = path.join(__dirname, 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .slice(0, 19);
  const file = path.join(dir, `reconcile-inv-settle-flag-${stamp}.json`);
  const payload = plans.map((plan) => ({
    bill_id: plan.billId,
    before: plan.before,
    applied: plan.set,
  }));
  fs.writeFileSync(file, JSON.stringify(payload, null, 2), 'utf8');
  return file;
}

/** 只读：反向异常 —— 提单上有结算位，但没有任何结算单引用它 */
async function reportOrphans(requiredByBill, tenantId) {
  const query = { $or: [{ settle_flag: { $ne: 0 } }, { 'invoices.inv_settle_flag': { $ne: 0 } }] };
  if (tenantId) query.tenantId = tenantId;

  const orphans = [];
  const cursor = Bill.find(query)
    .select('bill_no billing_name status settle_flag invoices.inv_no invoices.inv_settle_flag')
    .lean()
    .cursor();

  for await (const bill of cursor) {
    if (requiredByBill.has(String(bill._id))) continue;

    const flagged = (bill.invoices || []).filter((inv) => (inv.inv_settle_flag || 0) !== 0);
    if (flagged.length === 0 && (bill.settle_flag || 0) === 0) continue;

    orphans.push({
      bill_no: bill.bill_no,
      billing_name: bill.billing_name,
      status: bill.status,
      settle_flag: bill.settle_flag,
      detail: flagged.map((inv) => `${inv.inv_no}:${inv.inv_settle_flag}`).join(','),
    });
  }

  return orphans;
}

function printUsage() {
  console.log('用法:');
  console.log('  node scripts/reconcile-inv-settle-flag.js [--tenant <code>] [--since YYYY-MM-DD] [--apply]');
  console.log('');
  console.log('参数:');
  console.log('  --tenant <code>        按租户 code 过滤');
  console.log('  --tenant-id <id>       按租户 ObjectId 过滤');
  console.log('  --since <YYYY-MM-DD>   只看该日期之后创建的结算单');
  console.log('  --skip-orphans         跳过「有标志位但无结算单」的反向检查');
  console.log('  --limit <n>            最多处理 n 张结算单');
  console.log('  --apply                真正写库；默认 dry-run');
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printUsage();
    return;
  }

  await mongoose.connect(buildMongoUri());

  try {
    const { tenantId, tenantLabel } = await resolveTenantId();
    const since = (getArgValue('--since') || '').trim();
    const limit = parseInt(getArgValue('--limit') || '0', 10) || 0;
    const skipOrphans = process.argv.includes('--skip-orphans');

    const settleQuery = {};
    if (tenantId) settleQuery.tenantId = tenantId;
    if (since) settleQuery.settle_date = { $gte: new Date(`${since}T00:00:00+08:00`) };

    let settleCursor = Settle.find(settleQuery)
      .select('serial_number settle_type settle_date status bills')
      .sort({ settle_date: 1 })
      .lean();
    if (limit > 0) settleCursor = settleCursor.limit(limit);
    const settles = await settleCursor;

    const requiredByBill = collectRequirements(settles);
    const billIds = [...requiredByBill.keys()].map((id) => new mongoose.Types.ObjectId(id));

    const plans = [];
    let scanned = 0;
    let missingBills = 0;

    for (const ids of chunk(billIds, 1000)) {
      const bills = await Bill.find({ _id: { $in: ids } })
        .select('tenantId bill_no billing_name status status_flag settle_flag invoices')
        .lean();
      const found = new Set(bills.map((b) => String(b._id)));
      missingBills += ids.length - found.size;
      scanned += bills.length;

      for (const bill of bills) {
        const plan = planBillRepair(bill, requiredByBill.get(String(bill._id)));
        if (plan) {
          plans.push({ billId: String(bill._id), tenantId: bill.tenantId, ...plan });
        }
      }
    }

    console.log(`模式: ${DRY_RUN ? 'DRY-RUN' : 'APPLY'}`);
    console.log(`租户: ${tenantLabel}`);
    console.log(`结算单: ${settles.length} 张，涉及提单: ${billIds.length} 张（查到 ${scanned}，缺失 ${missingBills}）`);
    console.log(`需要回填的提单: ${plans.length} 张`);

    if (plans.length > 0) {
      console.table(
        plans.slice(0, 50).map((plan) => ({
          bill_id: plan.billId,
          开单名称: plan.summary.billing_name,
          提单号: plan.summary.bill_no,
          运单: plan.summary.invoices
            .map((x) => `${x.inv_no} ${x.from}->${x.to}`)
            .join(' '),
          settle_flag: plan.summary.settle_flag,
          状态: plan.summary.status,
          依据: plan.summary.sources.slice(0, 2).join(' '),
        })),
      );
      if (plans.length > 50) {
        console.log(`（仅展示前 50 行，共 ${plans.length} 行）`);
      }
    }

    if (plans.length === 0 && DRY_RUN) {
      console.log('数据一致，无需回填。');
    }

    if (DRY_RUN) {
      console.log('未写库。带 `--apply` 后会执行真正的回填。');
    } else if (plans.length > 0) {
      const snapshot = writeSnapshot(plans);
      console.log(`已写出回滚快照: ${snapshot}`);

      let modified = 0;
      for (const plan of plans) {
        const filter = { _id: new mongoose.Types.ObjectId(plan.billId) };
        if (plan.tenantId) filter.tenantId = plan.tenantId;
        const result = await Bill.updateOne(filter, { $set: plan.set });
        modified += result.modifiedCount;
      }
      console.log(`已回填提单: ${modified} 张`);
    }

    if (!skipOrphans) {
      console.log('');
      console.log('=== 反向检查：提单有结算位但没有结算单引用（只报不改）===');
      const orphans = await reportOrphans(requiredByBill, tenantId);
      console.log(`命中: ${orphans.length} 张`);
      console.table(orphans.slice(0, 30));
      if (orphans.length > 30) {
        console.log(`（仅展示前 30 行，共 ${orphans.length} 行）`);
      }
    }
  } finally {
    await mongoose.disconnect();
  }
}

module.exports = {
  __testables: {
    settleTypeToBit,
    collectRequirements,
    planBillRepair,
    isUpgradableStatus,
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
