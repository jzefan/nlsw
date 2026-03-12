const Settle = require('../../models/Settle');
const Bill = require('../../models/Bill');
const Invoice = require('../../models/Invoice');
const utils = require('../utils');
const { buildTenantQuery } = require('../../utils/tenant');

const CUSTOMER_SETTLE_FLAG = 1; // 0001
const COLLECTION_SETTLE_FLAG = 2; // 0010
const VESSEL_SETTLE_FLAG = 4; // 0100

// 辅助函数：检查结算标志
function checkFlag(flag, type) {
  if (type === 'CUSTOMER' || type === '客户结算') {
    return (flag & CUSTOMER_SETTLE_FLAG) === CUSTOMER_SETTLE_FLAG;
  } else if (type === 'COLLECTION' || type === '代收代付结算') {
    return (flag & COLLECTION_SETTLE_FLAG) === COLLECTION_SETTLE_FLAG;
  } else if (type === 'VESSEL_VEH' || type === '车船结算') {
    return (flag & VESSEL_SETTLE_FLAG) === VESSEL_SETTLE_FLAG;
  }
  return false;
}

// 辅助函数：设置结算标志
function setFlag(flag, type) {
  flag = flag || 0;
  if (type === 'CUSTOMER' || type === '客户结算') {
    return flag | CUSTOMER_SETTLE_FLAG;
  } else if (type === 'COLLECTION' || type === '代收代付结算') {
    return flag | COLLECTION_SETTLE_FLAG;
  } else if (type === 'VESSEL_VEH' || type === '车船结算') {
    return flag | VESSEL_SETTLE_FLAG;
  }
  return flag;
}

// 辅助函数：清除结算标志
function clearFlag(flag, type) {
  flag = flag || 0;
  if (type === 'CUSTOMER' || type === '客户结算') {
    return flag & ~CUSTOMER_SETTLE_FLAG;
  } else if (type === 'COLLECTION' || type === '代收代付结算') {
    return flag & ~COLLECTION_SETTLE_FLAG;
  } else if (type === 'VESSEL_VEH' || type === '车船结算') {
    return flag & ~VESSEL_SETTLE_FLAG;
  }
  return flag;
}

// 辅助函数：检查提单的所有运单是否都已结算
function isSameSettleFlag(bill, type) {
  if (!bill.invoices || bill.invoices.length === 0) return false;

  const firstFlag = checkFlag(bill.invoices[0].inv_settle_flag, type);
  for (const inv of bill.invoices) {
    if (checkFlag(inv.inv_settle_flag, type) !== firstFlag) {
      return false;
    }
  }
  return true;
}

/**
 * 获取结算列表（用于开票）
 */
exports.getSettleList = async (req, res) => {
  try {
    const { settle_type, display_mode, selfOwned } = req.query;

    // 构建查询条件
    const baseQuery = {};

    // 只有当selfOwned为'1'或1时，才作为查询条件
    if (selfOwned === '1' || selfOwned === 1) {
      baseQuery.selfOwned = 1;
    }

    // 根据结算类型过滤
    if (settle_type === 'CUSTOMER') {
      baseQuery.settle_type = '客户结算';
    } else if (settle_type === 'COLLECTION') {
      baseQuery.settle_type = '代收代付结算';
    }

    // 根据显示模式过滤状态
    if (display_mode === 'settle') {
      baseQuery.status = '已结算';
    } else if (display_mode === 'ticket') {
      baseQuery.status = '已开票';
    } else {
      // 默认显示已结算和已开票
      baseQuery.status = { $in: ['已结算', '已开票'] };
    }

    const query = buildTenantQuery(req, baseQuery);
    const settles = await Settle.find(query)
      .sort({ settle_date: -1, createdAt: -1 })
      .lean()
      .exec();

    res.json({ ok: true, settles });
  } catch (error) {
    console.error('getSettleList error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

/**
 * 开票/开票取消
 */
exports.updateTicket = async (req, res) => {
  try {
    const settles = req.body;

    if (!Array.isArray(settles) || settles.length === 0) {
      return res.json({ ok: false, message: '没有要更新的数据' });
    }

    for (const settle of settles) {
      const query = buildTenantQuery(req, { _id: settle._id });
      const dbSettle = await Settle.findOne(query).exec();

      if (!dbSettle) {
        console.warn('updateTicket: 未找到结算记录或无权限 _id=' + settle._id);
        continue;
      }

      // 更新开票信息
      dbSettle.ticket_no = settle.ticket_no || '';
      dbSettle.ticket_date = settle.ticket_date || null;
      dbSettle.ticket_person = settle.ticket_person || '';
      dbSettle.status = settle.status;

      await dbSettle.save();
    }

    res.json({ ok: true });
  } catch (error) {
    console.error('updateTicket error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

/**
 * 删除结算
 */
exports.deleteSettle = async (req, res) => {
  try {
    const { settle_ids, settle_type } = req.body;

    if (!Array.isArray(settle_ids) || settle_ids.length === 0) {
      return res.json({ ok: false, message: '没有要删除的数据' });
    }

    for (const settleId of settle_ids) {
      const settleQuery = buildTenantQuery(req, { _id: settleId });
      const dbSettle = await Settle.findOne(settleQuery).exec();

      if (!dbSettle) {
        console.warn('deleteSettle: 未找到结算记录或无权限 _id=' + settleId);
        continue;
      }

      // 检查状态是否允许删除
      if (dbSettle.status !== '已结算') {
        return res.json({
          ok: false,
          message: `结算记录 ${dbSettle.serial_number} 状态为 ${dbSettle.status}，不能删除`
        });
      }

      const settleType = dbSettle.settle_type;
      const billIds = [];
      const allInvNo = [];

      dbSettle.bills.forEach((b) => {
        billIds.push(b.bill_id);
        if (!allInvNo.includes(b.inv_no)) {
          allInvNo.push(b.inv_no);
        }
      });

      // 更新Bill的结算状态
      const billQuery = buildTenantQuery(req, { _id: { $in: billIds } });
      const dbBills = await Bill.find(billQuery).exec();

      for (const bill of dbBills) {
        dbSettle.bills.forEach((sb) => {
          if (String(bill._id) === String(sb.bill_id)) {
            bill.invoices.forEach((inv) => {
              if (inv.inv_no === sb.inv_no) {
                inv.inv_settle_flag = clearFlag(inv.inv_settle_flag, settleType);
              }
            });
          }
        });

        // 更新Bill的settle_flag
        if (bill.invoices.length === 1) {
          bill.settle_flag = bill.invoices[0].inv_settle_flag;
        } else {
          if (isSameSettleFlag(bill, 'CUSTOMER')) {
            bill.settle_flag = setFlag(bill.settle_flag, 'CUSTOMER');
          } else {
            bill.settle_flag = clearFlag(bill.settle_flag, 'CUSTOMER');
          }

          if (isSameSettleFlag(bill, 'COLLECTION')) {
            bill.settle_flag = setFlag(bill.settle_flag, 'COLLECTION');
          } else {
            bill.settle_flag = clearFlag(bill.settle_flag, 'COLLECTION');
          }
        }

        // 根据settle_flag恢复Bill的真实状态
        if (bill.settle_flag === 0) {
          // 没有任何结算，恢复为已配发
          bill.status = '已配发';
          bill.status_flag = 2;
          if (bill.left_num < 0.0001) {
            bill.left_num = 0;
          }
        } else {
          // 仍有其他类型的结算，保持已结算状态
          bill.status = '已结算';
          bill.status_flag = 3;
        }

        await bill.save();
      }

      // 更新Invoice的结算状态
      const invQuery = buildTenantQuery(req, { waybill_no: { $in: allInvNo } });
      const dbInvs = await Invoice.find(invQuery).exec();

      for (const invoice of dbInvs) {
        const ids = invoice.bills.map((b) => b.bill_id);
        const billArrQuery = buildTenantQuery(req, { _id: { $in: ids } });
        const billArr = await Bill.find(billArrQuery).lean().exec();

        // 检查该运单下的所有提单是否都已结算
        let settled = true;
        for (const bill of billArr) {
          for (const binv of bill.invoices) {
            if (!checkFlag(binv.inv_settle_flag, settleType)) {
              settled = false;
              break;
            }
          }
          if (!settled) break;
        }

        // 更新运单状态
        if (settled) {
          if (!checkFlag(invoice.settle_flag, settleType)) {
            invoice.state = '已结算';
            invoice.settle_flag = setFlag(invoice.settle_flag, settleType);
            await invoice.save();
          }
        } else {
          if (checkFlag(invoice.settle_flag, settleType)) {
            invoice.state = '已配发';
            invoice.settle_flag = clearFlag(invoice.settle_flag, settleType);
            await invoice.save();
          }
        }
      }

      // 删除结算记录
      const deleteQuery = buildTenantQuery(req, { _id: settleId });
      await Settle.deleteOne(deleteQuery);
    }

    res.json({ ok: true });
  } catch (error) {
    console.error('deleteSettle error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

/**
 * 获取结算明细（根据serial_number）
 */
exports.getSettleDetail = async (req, res) => {
  try {
    const { serial_number } = req.query;

    if (!serial_number) {
      return res.status(400).json({ ok: false, message: '缺少结算流水号' });
    }

    // 查找结算记录
    const settleQuery = buildTenantQuery(req, { serial_number });
    const settle = await Settle.findOne(settleQuery).lean().exec();

    if (!settle) {
      return res.status(404).json({ ok: false, message: '结算记录不存在或无权限' });
    }

    // 获取所有提单ID和运单号
    const billIds = settle.bills.map(b => b.bill_id);
    const invNos = [...new Set(settle.bills.map(b => b.inv_no).filter(Boolean))];

    // 并行查询提单详情和运单发货日期
    const [bills, invoices] = await Promise.all([
      Bill.find(buildTenantQuery(req, { _id: { $in: billIds } })).lean().exec(),
      invNos.length > 0
        ? Invoice.find(buildTenantQuery(req, { waybill_no: { $in: invNos } }))
            .select('waybill_no ship_date')
            .lean()
            .exec()
        : [],
    ]);

    // 构建运单号→发��日期映射
    const shipDateMap = {};
    invoices.forEach(inv => {
      shipDateMap[inv.waybill_no] = inv.ship_date;
    });

    // 返回结算记录、提单详情和结算中的提单信息
    res.json({
      ok: true,
      settle,
      bills,
      settle_bills: settle.bills,
      shipDateMap,
    });
  } catch (error) {
    console.error('getSettleDetail error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};
