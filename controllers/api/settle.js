const Bill = require('../../models/Bill');
const Invoice = require('../../models/Invoice');
const OrderPlan = require('../../models/OrderPlan');
const Settle = require('../../models/Settle');
const utils = require('../utils');
const { buildTenantQuery, injectTenantId } = require('../../utils/tenant');

const EPSILON = 0.0001;

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

// 更新运单状态
async function updateInvoiceStatus(allInvNo, settle_type, req) {
  try {
    const invQuery = buildTenantQuery(req, { waybill_no: { $in: allInvNo } });
    const invs = await Invoice.find(invQuery).exec();

    for (const invoice of invs) {
      const ids = invoice.bills.map(b => b.bill_id);
      const billQuery = buildTenantQuery(req, { _id: { $in: ids } });
      const billArr = await Bill.find(billQuery).exec();

      // 检查该运单下的所有提单是否都已结算
      let settled = true;
      for (const bill of billArr) {
        for (const binv of bill.invoices) {
          if (!checkFlag(binv.inv_settle_flag, settle_type)) {
            settled = false;
            break;
          }
        }
        if (!settled) break;
      }

      // 更新运单状态
      if (settled) {
        if (!checkFlag(invoice.settle_flag, settle_type)) {
          invoice.state = '已结算';
          invoice.settle_flag = setFlag(invoice.settle_flag, settle_type);
          await invoice.save();
        }
      } else {
        if (checkFlag(invoice.settle_flag, settle_type)) {
          invoice.state = '已配发';
          invoice.settle_flag = clearFlag(invoice.settle_flag, settle_type);
          await invoice.save();
        }
      }
    }
  } catch (error) {
    console.error('updateInvoiceStatus error:', error);
    throw error;
  }
}

/**
 * 获取结算提单列表
 * 根据过滤条件获取已配发但未结算的提单
 */
exports.getSettleBills = async (req, res) => {
  try {
    const {
      fName,
      fVeh,
      fDest,
      fOrder,
      fBno,
      fDate1,
      fDate2,
      fType,
      selfOwned
    } = req.query;

    // 构建运单查询条件
    const invoiceQuery = {};

    // 只有当selfOwned为'1'或1时，才作为查询条件
    if (selfOwned === '1' || selfOwned === 1 || parseInt(selfOwned) === 1) {
      invoiceQuery.selfOwned = 1;
    }

    // 开单名称过滤
    if (fName && Array.isArray(fName) && fName.length > 0) {
      invoiceQuery.ship_name = { $in: fName };
    } else if (fName && typeof fName === 'string') {
      invoiceQuery.ship_name = fName;
    }

    // 车船号过滤
    if (fVeh && Array.isArray(fVeh) && fVeh.length > 0) {
      invoiceQuery.vehicle_vessel_name = { $in: fVeh };
    }

    // 目的地过滤
    if (fDest && Array.isArray(fDest) && fDest.length > 0) {
      invoiceQuery.ship_to = { $in: fDest };
    }

    // 日期范围过滤
    if (fDate1 && fDate2) {
      invoiceQuery.ship_date = {
        $gte: new Date(fDate1),
        $lte: new Date(fDate2)
      };
    }

    // 只查询已配发的运单
    invoiceQuery.state = { $in: ['已配发', '新建'] };

    // 查询运单 - 应用租户过滤
    const query = buildTenantQuery(req, invoiceQuery);
    const invoices = await Invoice.find(query)
      .populate({
        path: 'bills.bill_id',
        select: 'bill_no order_no order_item_no thickness width len contract_no ship_warehouse'
      })
      .sort({ ship_date: -1, createdAt: -1 })
      .lean()
      .exec();

    // 展开提单数据
    const bills = [];
    for (const invoice of invoices) {
      for (const invBill of invoice.bills) {
        const billInfo = invBill.bill_id;
        if (!billInfo) continue;

        // 订单号过滤
        if (fOrder && Array.isArray(fOrder) && fOrder.length > 0) {
          if (!fOrder.includes(billInfo.order_no)) continue;
        }

        // 提单号过滤
        if (fBno && Array.isArray(fBno) && fBno.length > 0) {
          if (!fBno.includes(billInfo.bill_no)) continue;
        }

        // 处理车辆信息（船运有多个车辆）
        if (invBill.vehicles && invBill.vehicles.length > 0) {
          // 船运：每个车辆生成一条记录
          for (const vehicle of invBill.vehicles) {
            bills.push({
              _id: billInfo._id,
              bill_no: billInfo.bill_no,
              order_no: billInfo.order_no,
              order_item_no: billInfo.order_item_no,
              billing_name: invoice.ship_name,
              ship_customer: invoice.ship_customer,
              veh_ves_name: invoice.vehicle_vessel_name,
              ship_to: invoice.ship_to,
              ship_from: vehicle.veh_ship_from || invoice.ship_from,
              ship_warehouse: billInfo.ship_warehouse,
              inv_no: invoice.waybill_no,
              inv_ship_date: invoice.ship_date,
              inv_shipper: invoice.shipper,
              send_num: vehicle.send_num || 0,
              send_weight: vehicle.send_weight || 0,
              thickness: billInfo.thickness,
              width: billInfo.width,
              len: billInfo.length,
              contract_no: billInfo.contract_no,
              price: vehicle.veh_price || 0,
              collection_price: 0, // 从 Bill 中获取
              incoming_price_remark: '',
              inv_settle_flag: vehicle.inv_settle_flag || 0,
              status: invBill.status
            });
          }
        } else {
          // 车运：只有一条记录
          bills.push({
            _id: billInfo._id,
            bill_no: billInfo.bill_no,
            order_no: billInfo.order_no,
            order_item_no: billInfo.order_item_no,
            billing_name: invoice.ship_name,
            ship_customer: invoice.ship_customer,
            veh_ves_name: invoice.vehicle_vessel_name,
            ship_to: invoice.ship_to,
            ship_from: invoice.ship_from,
            ship_warehouse: billInfo.ship_warehouse,
            inv_no: invoice.waybill_no,
            inv_ship_date: invoice.ship_date,
            inv_shipper: invoice.shipper,
            send_num: invBill.num || 0,
            send_weight: invBill.weight || 0,
            thickness: billInfo.thickness,
            width: billInfo.width,
            len: billInfo.length,
            contract_no: billInfo.contract_no,
            price: 0, // 从运单的 invoices 中获取
            collection_price: 0, // 从 Bill 中获取
            incoming_price_remark: '',
            inv_settle_flag: 0,
            status: invBill.status
          });
        }
      }
    }

    // 获取每个提单的价格和结算信息
    const billIds = [...new Set(bills.map(b => b._id.toString()))];
    const billQuery = buildTenantQuery(req, { _id: { $in: billIds } });
    const dbBills = await Bill.find(billQuery)
      .select('_id bill_no collection_price incoming_price_remark settle_flag invoices')
      .lean()
      .exec();

    const billMap = {};
    dbBills.forEach(b => {
      billMap[b._id.toString()] = b;
    });

    // 填充价格信息
    bills.forEach(bill => {
      const dbBill = billMap[bill._id.toString()];
      if (dbBill) {
        // 代收代付价格
        bill.collection_price = dbBill.collection_price || 0;
        bill.incoming_price_remark = dbBill.incoming_price_remark || '';

        // 从 invoices 中查找客户价格
        if (dbBill.invoices) {
          const invInfo = dbBill.invoices.find(inv => inv.inv_no === bill.inv_no);
          if (invInfo) {
            bill.price = invInfo.price || 0;
            bill.inv_settle_flag = invInfo.inv_settle_flag || 0;

            // 船运：从 vehicles 中查找具体车辆的价格
            if (invInfo.vehicles && invInfo.vehicles.length > 0) {
              const vehInfo = invInfo.vehicles.find(v => v.veh_name === bill.veh_ves_name);
              if (vehInfo) {
                bill.price = vehInfo.veh_price || 0;
              }
            }
          }
        }
      }
    });

    res.json({
      ok: true,
      bills
    });
  } catch (error) {
    console.error('getSettleBills error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

/**
 * 价格输入
 */
exports.inputPrice = async (req, res) => {
  try {
    const { data, act } = req.body;

    if (!data || !Array.isArray(data) || data.length === 0) {
      return res.json({ ok: false, message: '没有要保存的数据' });
    }

    // 按提单分组
    const billGroups = {};
    data.forEach(item => {
      if (!billGroups[item.bid]) {
        billGroups[item.bid] = [];
      }
      billGroups[item.bid].push(item);
    });

    for (const bid in billGroups) {
      const items = billGroups[bid];
      const billQ = buildTenantQuery(req, { _id: bid });
      const dbBill = await Bill.findOne(billQ).exec();

      if (!dbBill) {
        console.warn('inputPrice: 未找到提单或无权限 bid=' + bid);
        continue;
      }

      if (act === 'COLLECTION') {
        // 代收代付价格：直接保存到 Bill
        const price = items[0].price;
        dbBill.collection_price = price;
        if (items[0].remark !== undefined) {
          dbBill.incoming_price_remark = items[0].remark;
        }
      } else {
        // 客户价格：保存到 Bill.invoices 中
        items.forEach(item => {
          if (dbBill.invoices) {
            const invInfo = dbBill.invoices.find(inv => inv.inv_no === item.inv_no);
            if (invInfo) {
              invInfo.price = item.price;
              if (item.remark !== undefined) {
                dbBill.incoming_price_remark = item.remark;
              }

              // 船运：更新 vehicles 中的价格
              if (invInfo.vehicles && invInfo.vehicles.length > 0) {
                invInfo.vehicles.forEach(veh => {
                  veh.veh_price = item.price;
                });
              }
            }
          }
        });
      }

      await dbBill.save();
    }

    res.json({ ok: true });
  } catch (error) {
    console.error('inputPrice error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

/**
 * 结算
 */
exports.settleBills = async (req, res) => {
  try {
    const { settleObj, price, settle_type, billName, shipTo, selfOwned } = req.body;

    if (!settleObj || !Array.isArray(settleObj) || settleObj.length === 0) {
      return res.json({ ok: false, message: '没有要结算的数据' });
    }

    const user = req.user || { userid: 'admin', no: 0 };
    const userId = user.userid;
    const flag = settle_type === 'CUSTOMER' ? CUSTOMER_SETTLE_FLAG : COLLECTION_SETTLE_FLAG;

    // 生成流水号
    const uno = utils.leftPad(user.no, 4);
    const date_no = new Date().yyyymmdd() + uno;
    const reg = new RegExp('^JS' + date_no + '.*', 'g');

    const settleNumQuery = buildTenantQuery(req, { serial_number: { $regex: reg } });
    const settles = await Settle.find(settleNumQuery)
      .sort({ serial_number: 'desc' })
      .exec();

    let no = utils.leftPad(1, 3);
    if (settles.length > 0) {
      const str = settles[0].serial_number.substring(14);
      no = utils.leftPad(parseInt(str) + 1, 3);
    }

    const serialNumber = 'JS' + date_no + no;

    // 统计总数和总重量
    let totalNum = 0;
    let totalWeight = 0;
    const allInvNo = [];
    const billsForSettle = [];

    for (const item of settleObj) {
      totalNum += item.num || 0;
      totalWeight += item.weight || 0;

      if (!allInvNo.includes(item.inv_no)) {
        allInvNo.push(item.inv_no);
      }

      billsForSettle.push({
        bill_id: item.bid,
        num: item.num,
        weight: item.weight,
        inv_no: item.inv_no,
        settle_flag: item.settle_flag
      });
    }

    // 按提单分组
    const billGroups = {};
    settleObj.forEach(item => {
      if (!billGroups[item.bid]) {
        billGroups[item.bid] = [];
      }
      billGroups[item.bid].push(item);
    });

    // 更新每个提单的结算状态
    for (const bid in billGroups) {
      const items = billGroups[bid];
      const billQ = buildTenantQuery(req, { _id: bid });
      const dbBill = await Bill.findOne(billQ).exec();

      if (!dbBill) {
        console.warn('settleBills: 未找到提单或无权限 bid=' + bid);
        continue;
      }

      // 检查提单状态，只有已配发（status_flag === 2）的提单才能结算
      const isShipped = dbBill.status_flag === 2 || dbBill.status === '已配发';

      // 更新提单状态
      if (isShipped && dbBill.status === '已配发') {
        dbBill.status = '已结算';
      }

      items.forEach(item => {
        if (dbBill.invoices) {
          const invInfo = dbBill.invoices.find(inv => inv.inv_no === item.inv_no);
          if (invInfo) {
            invInfo.inv_settle_flag = setFlag(invInfo.inv_settle_flag, settle_type);

            // 船运：更新 vehicles 中的结算状态
            if (invInfo.vehicles && invInfo.vehicles.length > 0) {
              invInfo.vehicles.forEach(veh => {
                veh.inv_settle_flag = setFlag(veh.inv_settle_flag, settle_type);
              });
            }
          }
        }
      });

      // 只有当提单已配发时才更新 Bill.settle_flag
      if (isShipped) {
        if (settle_type === 'COLLECTION') {
          // 代收代付结算：直接设置标志位
          dbBill.settle_flag = (dbBill.settle_flag || 0) | flag;
        } else {
          // 客户结算：根据 invoices 数量决定
          if (dbBill.invoices.length === 1) {
            // 只有一个运单，直接使用其标志
            dbBill.settle_flag = dbBill.invoices[0].inv_settle_flag;
          } else {
            // 多个运单，检查是否所有运单都有相同的结算状态
            if (isSameSettleFlag(dbBill, settle_type)) {
              // 所有运单状态相同，设置 Bill 的标志
              dbBill.settle_flag = setFlag(dbBill.settle_flag, settle_type);
            } else {
              // 运单状态不同，仍然设置此次结算的标志位
              dbBill.settle_flag = setFlag(dbBill.settle_flag, settle_type);
            }
          }
        }
      }

      await dbBill.save();
    }

    // 创建结算记录
    const settleTypeText = settle_type === 'CUSTOMER' ? '客户结算' : '代收代付结算';

    const settleData = injectTenantId(req, {
      serial_number: serialNumber,
      billing_name: billName,
      price: parseFloat(price),
      real_price: parseFloat(price),
      settle_type: settleTypeText,
      ship_number: totalNum,
      ship_weight: totalWeight,
      ship_to: shipTo,
      bills: billsForSettle,
      settle_date: new Date(),
      settler: userId,
      selfOwned: selfOwned || 0,
      status: '已结算'
    });
    const settle = new Settle(settleData);

    await settle.save();

    // 更新运单状态
    await updateInvoiceStatus(allInvNo, settle_type, req);

    res.json({ ok: true });
  } catch (error) {
    console.error('settleBills error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

/**
 * 标记不需要结算
 */
exports.markNotRequireSettle = async (req, res) => {
  try {
    const { nonSettleObj, settle_type } = req.body;

    if (!nonSettleObj || !Array.isArray(nonSettleObj) || nonSettleObj.length === 0) {
      return res.json({ ok: false, message: '没有要标记的数据' });
    }

    const flag = settle_type === 'CUSTOMER' ? CUSTOMER_SETTLE_FLAG : COLLECTION_SETTLE_FLAG;

    // 收集所有运单号
    const allInvNo = [];
    for (const item of nonSettleObj) {
      if (!allInvNo.includes(item.inv_no)) {
        allInvNo.push(item.inv_no);
      }
    }

    // 按提单分组
    const billGroups = {};
    nonSettleObj.forEach(item => {
      if (!billGroups[item.bid]) {
        billGroups[item.bid] = [];
      }
      billGroups[item.bid].push(item);
    });

    // 更新每个提单
    for (const bid in billGroups) {
      const items = billGroups[bid];
      const billQ = buildTenantQuery(req, { _id: bid });
      const dbBill = await Bill.findOne(billQ).exec();

      if (!dbBill) {
        console.warn('markNotRequireSettle: 未找到提单或无权限 bid=' + bid);
        continue;
      }

      if (settle_type === 'COLLECTION') {
        // 代收代付：设置为 -1
        dbBill.collection_price = -1;
        dbBill.settle_flag = (dbBill.settle_flag || 0) & ~flag;

        // 更新 invoices 中的结算状态
        items.forEach(item => {
          if (dbBill.invoices) {
            const invInfo = dbBill.invoices.find(inv => inv.inv_no === item.inv_no);
            if (invInfo) {
              invInfo.inv_settle_flag = item.settle_flag || 0;

              // 船运：更新 vehicles 中的结算状态
              if (invInfo.vehicles && invInfo.vehicles.length > 0) {
                invInfo.vehicles.forEach(veh => {
                  veh.inv_settle_flag = item.settle_flag || 0;
                });
              }
            }
          }
        });
      } else {
        // 客户结算：设置价格为 -1
        items.forEach(item => {
          if (dbBill.invoices) {
            const invInfo = dbBill.invoices.find(inv => inv.inv_no === item.inv_no);
            if (invInfo) {
              invInfo.price = -1;
              invInfo.inv_settle_flag = (invInfo.inv_settle_flag || 0) & ~flag;

              // 船运：更新 vehicles 中的价格和结算状态
              if (invInfo.vehicles && invInfo.vehicles.length > 0) {
                invInfo.vehicles.forEach(veh => {
                  veh.veh_price = -1;
                  veh.inv_settle_flag = (veh.inv_settle_flag || 0) & ~flag;
                });
              }
            }
          }
        });
      }

      await dbBill.save();
    }

    // 更新运单状态
    await updateInvoiceStatus(allInvNo, settle_type, req);

    res.json({ ok: true });
  } catch (error) {
    console.error('markNotRequireSettle error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

/**
 * 获取车辆列表
 */
exports.getVehicleList = async (req, res) => {
  try {
    const vehQuery = buildTenantQuery(req, { state: { $in: ['已配发', '新建'] } });
    const invoices = await Invoice.find(vehQuery)
      .select('vehicle_vessel_name')
      .distinct('vehicle_vessel_name')
      .lean()
      .exec();

    const vehicles = invoices.map(name => ({ name, veh_type: '车船' }));

    res.json({
      ok: true,
      vehicles
    });
  } catch (error) {
    console.error('getVehicleList error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};
