const Invoice = require('../../models/Invoice');
const Bill = require('../../models/Bill');
const OrderPlan = require('../../models/OrderPlan');
const utils = require('../../controllers/utils');
const { buildTenantQuery, injectTenantId, isPlatformUser } = require('../../utils/tenant');
const { isAdmin: isAdminPrivilege } = require('../../utils/permissions');

const EPSILON = 0.0001;

function areFloatsEqual(a, b) {
  return Math.abs(a - b) < EPSILON;
}

function updateBillStatus(userId, dbBill, state) {
  let updated = false;
  if (state === '已配发') {
    if (dbBill.status !== '已配发' && dbBill.status !== '已结算') {
      dbBill.status = '已配发';
      dbBill.shipping_date = new Date();
      updated = true;
    }
  }
  return updated;
}

function addInvoiceToBill(db_bill, inv, inv_bill) {
  let obj = {
    inv_no: inv.waybill_no,
    veh_ves_name: inv.vehicle_vessel_name,
    num: inv_bill.num,
    weight: inv_bill.weight,
    price: 0,
    veh_ves_price: 0,
    ship_to: inv.ship_to,
    ship_from: inv.ship_from,
    vehicles: inv_bill.vehicles ? inv_bill.vehicles.slice(0) : []
  };

  obj.vehicles.forEach(function (vehs) {
    vehs.veh_price = 0;
  });

  if (db_bill.invoices && db_bill.invoices.length) {
    var found = false;
    for (var i = 0; i < db_bill.invoices.length; ++i) {
      var db_inv = db_bill.invoices[i];
      if (db_inv.inv_no === inv.waybill_no && db_inv.veh_ves_name === inv.vehicle_vessel_name) {
        db_inv.num = inv_bill.num;
        db_inv.weight = utils.toFixedNumber(inv_bill.weight, 3);
        db_inv.ship_to = inv.ship_to;
        db_inv.ship_from = inv.ship_from;
        db_inv.vehicles = inv_bill.vehicles ? inv_bill.vehicles.slice(0) : [];
        found = true;
        break;
      }
    }

    if (!found) {
      db_bill.invoices.push(obj);
    }
  } else {
    db_bill.invoices = [obj];
  }
}

function buildInnerSettleData(invoice) {
  var allInnerNo = utils.getAllList(true, invoice.bills, "vehicles", "inner_waybill_no");
  if (allInnerNo.length) {
    if (!invoice.inner_settle || invoice.inner_settle.length === 0) {
      invoice.inner_settle = [];
      allInnerNo.forEach(function (innerNo) {
        invoice.inner_settle.push({
          inner_waybill_no: innerNo,
          state: '未结算',
          price: 0,
          date: null,
          unship_date: null,
          delay_day: 0,
          charge_cash: 0,
          charge_oil: 0,
          receipt: 0,
          remark: ''
        });
      });
    }
  }
}

exports.getMaxWaybillNo = async (req, res) => {
  try {
    const user = req.user || { no: 0 };
    if (!req.user) {
      console.warn('getMaxWaybillNo: req.user is missing, using default user.no=0');
    }
    const userNo = user.no;
    const uno = utils.leftPad(userNo, 4);
    const date_no = new Date().yyyymmdd() + uno;
    const reg = new RegExp('^01' + date_no + '.*', 'g');

    const inv_wnos = await Invoice.find(buildTenantQuery(req, { waybill_no: { $regex: reg } }))
      .select('waybill_no')
      .sort({ waybill_no: 'desc' })
      .limit(1)
      .lean()
      .exec();

    let no = utils.leftPad(1, 3);
    if (inv_wnos.length > 0) {
      const lastNoStr = inv_wnos[0].waybill_no.substring(14);
      no = utils.leftPad(parseInt(lastNoStr) + 1, 3);
    }

    const max = '01' + date_no + no;
    res.json({ ok: true, max_no: max });
  } catch (error) {
    console.error('getMaxWaybillNo error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

/**
 * 获取运单列表
 * 支持按车船号、开单名称模糊查询
 */
exports.getInvoiceList = async (req, res) => {
  try {
    const { 
      keyword, 
      limit = 50, 
      page = 1, 
      myOnly,
      waybillNo,
      vehicleName,
      shipName,
      state,
      startDate,
      endDate
    } = req.query;
    const user = req.user || { userid: 'admin', privilege: ['admin'] };
    const userId = user.userid;
    const isAdmin = isAdminPrivilege(user.privilege) || userId === 'admin';

    // 构建查询条件
    const query = {};

    // 如果不是管理员，强制只显示自己的运单
    // 如果是管理员，只有当myOnly参数存在且为true时才过滤
    if (!isAdmin) {
      query.shipper = userId;
    } else if (myOnly === 'true' || myOnly === true) {
      query.shipper = userId;
    }

    if (keyword) {
      const keywordConditions = [
        { vehicle_vessel_name: { $regex: keyword, $options: 'i' } },
        { ship_name: { $regex: keyword, $options: 'i' } },
        { waybill_no: { $regex: keyword, $options: 'i' } }
      ];

      if (query.shipper) {
        // 如果已有shipper条件，需要用$and组合
        query.$and = [
          { shipper: userId },
          { $or: keywordConditions }
        ];
        delete query.shipper;
      } else {
        query.$or = keywordConditions;
      }
    }

    // 高级查询条件
    if (waybillNo) {
      query.waybill_no = { $regex: waybillNo, $options: 'i' };
    }
    if (vehicleName) {
      query.vehicle_vessel_name = { $regex: vehicleName, $options: 'i' };
    }
    if (shipName) {
      query.ship_name = { $regex: shipName, $options: 'i' };
    }
    if (state) {
      query.state = state;
    }
    if (startDate || endDate) {
      query.ship_date = {};
      if (startDate) {
        query.ship_date.$gte = new Date(startDate);
      }
      if (endDate) {
        // 如果是日期字符串，设为当天的结束时间
        const end = new Date(endDate);
        if (endDate.length <= 10) { // YYYY-MM-DD
           end.setHours(23, 59, 59, 999);
        }
        query.ship_date.$lte = end;
      }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const tenantQuery = buildTenantQuery(req, query);

    // 查询运单列表
    const invoices = await Invoice.find(tenantQuery)
      .select('waybill_no vehicle_vessel_name ship_name ship_from ship_to ship_date total_weight state createdAt shipper')
      .sort({ ship_date: -1, createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip)
      .lean()
      .exec();

    // 查询总数
    const total = await Invoice.countDocuments(tenantQuery);

    res.json({
      ok: true,
      data: invoices,
      total,
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (error) {
    console.error('getInvoiceList error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

/**
 * 获取运单详情
 */
exports.getInvoiceDetail = async (req, res) => {
  try {
    const { waybillNo } = req.params;

    const invoice = await Invoice.findOne(buildTenantQuery(req, { waybill_no: waybillNo }))
      .populate({
        path: 'bills.bill_id',
        select: 'bill_no order_no order_item_no spec thickness width len block_num weight total_weight left_num status'
      })
      .lean()
      .exec();

    if (!invoice) {
      return res.json({ ok: false, message: '运单不存在' });
    }

    res.json({ ok: true, data: invoice });
  } catch (error) {
    console.error('getInvoiceDetail error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

/**
 * 计算并设置提单状态
 * @param {Object} dbBill - 数据库中的提单对象
 * @param {string} invoiceState - 运单状态
 */
function calculateBillStatus(dbBill, invoiceState) {
  const originalNum = dbBill.block_num > 0 ? dbBill.block_num : dbBill.total_weight;
  const leftNum = dbBill.left_num;

  if (leftNum <= 0 || Math.abs(leftNum) < EPSILON) {
    // 全部配发完毕
    dbBill.status = '已配发';
    dbBill.shipping_date = new Date();
  } else if (leftNum < originalNum - EPSILON) {
    // 部分配发
    const shipped = originalNum - leftNum;
    if (dbBill.block_num > 0) {
      dbBill.status = `已配发${shipped}块`;
    } else {
      dbBill.status = `已配发${utils.toFixedNumber(shipped, 3)}吨`;
    }
  } else {
    // leftNum >= originalNum，没有配发或全部恢复
    dbBill.status = '新建';
    dbBill.shipping_date = null;
  }
}

/**
 * 船运配发货保存接口
 * 前端发送的是扁平结构: [{bill_no, wagon_no, inner_waybill_no, send_num, send_weight, ...}]
 * 需要转换为Invoice模型的结构: bills: [{bill_id, num, weight, vehicles: [...]}]
 */
exports.buildShipInvoice = async (req, res) => {
  try {
    const data = req.body;
    const flatBills = data.bills || [];
    const userId = req.user ? req.user.userid : 'admin';

    // 1. 查找是否已存在该运单
    let dbInv = await Invoice.findOne(buildTenantQuery(req, { waybill_no: data.waybill_no })).exec();

    // 2. 如果明细为空且运单已存在，清空明细并恢复所有提单
    if (flatBills.length === 0) {
      if (!dbInv) {
        return res.json({ ok: false, message: '没有选择提单明细' });
      }

      // 恢复所有提单的 left_num 和状态
      const orderWeightDeltas = {};
      for (const oldBill of dbInv.bills) {
        const dbBill = await Bill.findOne(buildTenantQuery(req, { _id: oldBill.bill_id })).exec();
        if (dbBill) {
          let restoredWeight = 0;
          if (dbBill.block_num > 0) {
            dbBill.left_num += oldBill.num;
            restoredWeight = oldBill.num * dbBill.weight;
          } else {
            dbBill.left_num += oldBill.weight;
            dbBill.left_num = utils.toFixedNumber(dbBill.left_num, 3);
            restoredWeight = oldBill.weight;
          }

          // 记录订单重量变化
          if (orderWeightDeltas[dbBill.order_no]) {
            orderWeightDeltas[dbBill.order_no] += restoredWeight;
          } else {
            orderWeightDeltas[dbBill.order_no] = restoredWeight;
          }

          // 从提单的 invoices 中移除此运单
          if (dbBill.invoices) {
            dbBill.invoices = dbBill.invoices.filter(
              inv => inv.inv_no !== dbInv.waybill_no
            );
          }

          // 重新计算状态
          calculateBillStatus(dbBill, '新建');
          await dbBill.save();
        }
      }

      // 恢复订单计划的 left_weight
      for (const orderNo in orderWeightDeltas) {
        const plan = await OrderPlan.findOne(buildTenantQuery(req, { order_no: orderNo })).exec();
        if (plan) {
          plan.left_weight += orderWeightDeltas[orderNo];
          plan.status = 0;
          await plan.save();
        }
      }

      // 更新运单：清空明细，保留基本信息
      dbInv.vehicle_vessel_name = data.vehicle_vessel_name;
      dbInv.ship_warehouse = data.ship_warehouse || '';
      dbInv.ship_name = data.ship_name;
      dbInv.ship_customer = data.ship_customer || '';
      dbInv.ship_date = data.ship_date || null;
      dbInv.ship_to = data.ship_to;
      dbInv.ship_from = data.ship_from;
      dbInv.bills = [];
      dbInv.total_weight = 0;
      dbInv.state = data.state || '新建';
      dbInv.inner_settle = [];
      await dbInv.save();
      return res.json({ ok: true });
    }

    // 3. 按 _id 分组，聚合每个提单的所有车辆信息
    const billGroups = {};
    for (const fb of flatBills) {
      if (!fb._id) {
        return res.json({ ok: false, message: `提单缺少_id: ${fb.bill_no}` });
      }
      const key = fb._id;
      if (!billGroups[key]) {
        billGroups[key] = {
          _id: fb._id,
          bill_no: fb.bill_no,
          order_no: fb.order_no,
          totalNum: 0,
          totalWeight: 0,
          vehicles: []
        };
      }
      billGroups[key].totalNum += fb.send_num || 0;
      billGroups[key].totalWeight += fb.send_weight || 0;
      billGroups[key].vehicles.push({
        inner_waybill_no: fb.inner_waybill_no || '',
        veh_name: fb.wagon_no || '',
        veh_ship_from: fb.ship_from || data.ship_from || '',
        send_num: fb.send_num || 0,
        send_weight: fb.send_weight || 0,
        veh_price: 0,
        price_mode: 0,
        price_remark: ''
      });
    }

    // 4. 查找每个 _id 对应的数据库记录
    const billIdList = Object.keys(billGroups);
    const dbBillsForValidation = await Bill.find(buildTenantQuery(req, { _id: { $in: billIdList } })).exec();
    const billIdToDbBill = {};
    for (const db of dbBillsForValidation) {
      billIdToDbBill[db._id.toString()] = db;
    }

    // 5. 如果是更新场景，构建旧提单映射
    const oldBillMapForValidation = {};
    if (dbInv) {
      for (const oldBill of dbInv.bills) {
        oldBillMapForValidation[oldBill.bill_id.toString()] = {
          num: oldBill.num,
          weight: oldBill.weight
        };
      }
    }

    // 6. 验证剩余量是否足够
    for (const billId of billIdList) {
      const group = billGroups[billId];
      const dbBill = billIdToDbBill[billId];
      if (!dbBill) {
        return res.json({ ok: false, message: `未找到提单: ${group.bill_no} (_id: ${billId})` });
      }

      // 计算可用量：当前剩余量 + 之前分配给该运单的量（更新场景）
      let availableNum = dbBill.left_num;
      const oldData = oldBillMapForValidation[billId];
      if (oldData) {
        if (dbBill.block_num > 0) {
          availableNum += oldData.num;
        } else {
          availableNum += oldData.weight;
        }
      }

      // 检查剩余量
      if (dbBill.block_num > 0) {
        // 定尺：按块数计算
        if (group.totalNum > availableNum) {
          return res.json({
            ok: false,
            message: `提单 ${dbBill.bill_no} 剩余块数不足: 剩余${availableNum}块, 需要${group.totalNum}块`
          });
        }
      } else {
        // 乱尺：按重量计算
        if (group.totalWeight > availableNum + EPSILON) {
          return res.json({
            ok: false,
            message: `提单 ${dbBill.bill_no} 剩余重量不足: 剩余${availableNum}吨, 需要${group.totalWeight}吨`
          });
        }
      }
    }

    // 7. 构建 Invoice 的 bills 数组
    const invoiceBills = [];
    for (const billId of billIdList) {
      const group = billGroups[billId];
      const dbBill = billIdToDbBill[billId];
      invoiceBills.push({
        bill_id: dbBill._id,
        num: group.totalNum,
        weight: utils.toFixedNumber(group.totalWeight, 3),
        vehicles: group.vehicles
      });
    }

    // 8. 构建 Invoice 数据
    const invoiceData = {
      waybill_no: data.waybill_no,
      vehicle_vessel_name: data.vehicle_vessel_name,
      ship_warehouse: data.ship_warehouse || '',
      ship_name: data.ship_name,
      ship_customer: data.ship_customer || '',
      ship_date: data.ship_date || null,
      ship_to: data.ship_to,
      ship_from: data.ship_from,
      bills: invoiceBills,
      total_weight: data.total_weight || 0,
      username: data.username || userId,
      shipper: userId,
      state: data.state || '新建',
      selfOwned: data.selfOwned ? 1 : 0
    };

    // 9. 根据是否已存在运单，执行新建或更新
    if (!dbInv) {
      // 新建运单
      const invoice = new Invoice(injectTenantId(req, invoiceData));
      buildInnerSettleData(invoice);

      let totalWeight = 0;
      const orderWeights = {};
      const savedBills = [];

      // 更新每个提单
      for (const invBill of invoice.bills) {
        const dbBill = await Bill.findOne(buildTenantQuery(req, { _id: invBill.bill_id })).exec();
        if (dbBill) {
          let w = 0;
          if (dbBill.block_num > 0) {
            // 定尺：扣减块数
            dbBill.left_num -= invBill.num;
            w = invBill.num * dbBill.weight;
          } else {
            // 乱尺：扣减重量
            dbBill.left_num -= invBill.weight;
            dbBill.left_num = utils.toFixedNumber(dbBill.left_num, 3);
            w = invBill.weight;
          }

          // 确保 left_num >= 0
          if (dbBill.left_num < 0) {
            dbBill.left_num = 0;
          }

          // 累计订单重量
          if (orderWeights[dbBill.order_no]) {
            orderWeights[dbBill.order_no] += w;
          } else {
            orderWeights[dbBill.order_no] = w;
          }

          totalWeight += w;

          // 设置提单状态
          calculateBillStatus(dbBill, invoice.state);
          dbBill.shipper = userId;

          // 添加运单信息到提单的 invoices 数组
          addInvoiceToBill(dbBill, invoice, invBill);
          savedBills.push(dbBill);
        } else {
          console.warn('buildShipInvoice: 未找到提单 bill_id=' + invBill.bill_id);
        }
      }

      // 检查并更新订单计划
      let ok = true;
      const savedPlans = [];
      for (const orderNo in orderWeights) {
        const plan = await OrderPlan.findOne(buildTenantQuery(req, { order_no: orderNo })).exec();
        if (plan) {
          const delta = plan.left_weight - orderWeights[orderNo];
          if (delta < 0 && Math.abs(delta) > EPSILON) {
            ok = false;
            return res.json({ ok: false, message: `订单 ${orderNo} 计划剩余量${plan.left_weight}小于配发重量${orderWeights[orderNo]}` });
          } else {
            plan.left_weight -= orderWeights[orderNo];
            if (plan.left_weight > EPSILON) {
              plan.status = 0;
            } else {
              plan.left_weight = 0;
              plan.status = 1;
            }
            savedPlans.push(plan);
          }
        }
      }

      if (ok) {
        // 保存所有提单
        for (const bill of savedBills) {
          await bill.save();
        }
        // 保存订单计划
        for (const plan of savedPlans) {
          await plan.save();
        }

        // 校正总重量
        if (!areFloatsEqual(totalWeight, invoice.total_weight)) {
          console.warn('buildShipInvoice: 重量不一致', totalWeight, invoice.total_weight);
          invoice.total_weight = utils.toFixedNumber(totalWeight, 3);
        }

        // 保存运单
        await invoice.save();
        res.json({ ok: true });
      }
    } else {
      // 更新已有运单
      // 1. 构建旧提单映射 {bill_id: {num, weight, vehicles}}
      const oldBillMap = {};
      for (const oldBill of dbInv.bills) {
        oldBillMap[oldBill.bill_id.toString()] = {
          num: oldBill.num,
          weight: oldBill.weight,
          vehicles: oldBill.vehicles || []
        };
      }

      // 2. 构建新提单映射
      const newBillMap = {};
      for (const newBill of invoiceBills) {
        newBillMap[newBill.bill_id.toString()] = {
          num: newBill.num,
          weight: newBill.weight,
          vehicles: newBill.vehicles || []
        };
      }

      const savedBills = [];
      const orderWeightDeltas = {}; // 订单重量变化

      // 3. 处理被删除的提单（在旧运单中但不在新运单中）- 恢复 left_num
      for (const oldBillId in oldBillMap) {
        if (!newBillMap[oldBillId]) {
          const dbBill = await Bill.findOne(buildTenantQuery(req, { _id: oldBillId })).exec();
          if (dbBill) {
            const old = oldBillMap[oldBillId];
            let restoredWeight = 0;

            if (dbBill.block_num > 0) {
              dbBill.left_num += old.num;
              restoredWeight = old.num * dbBill.weight;
            } else {
              dbBill.left_num += old.weight;
              dbBill.left_num = utils.toFixedNumber(dbBill.left_num, 3);
              restoredWeight = old.weight;
            }

            // 记录订单重量变化（恢复）
            if (orderWeightDeltas[dbBill.order_no]) {
              orderWeightDeltas[dbBill.order_no] -= restoredWeight;
            } else {
              orderWeightDeltas[dbBill.order_no] = -restoredWeight;
            }

            // 从提单的 invoices 中移除此运单
            if (dbBill.invoices) {
              dbBill.invoices = dbBill.invoices.filter(
                inv => inv.inv_no !== dbInv.waybill_no
              );
            }

            // 重新计算状态
            calculateBillStatus(dbBill, data.state);
            savedBills.push(dbBill);
          }
        }
      }

      // 4. 处理新增和修改的提单
      let totalWeight = 0;
      for (const newBillId in newBillMap) {
        const dbBill = await Bill.findOne(buildTenantQuery(req, { _id: newBillId })).exec();
        if (!dbBill) continue;

        const newData = newBillMap[newBillId];
        const oldData = oldBillMap[newBillId];
        let deltaWeight = 0;

        if (oldData) {
          // 修改：计算差值
          if (dbBill.block_num > 0) {
            const deltaNum = newData.num - oldData.num;
            dbBill.left_num -= deltaNum;
            deltaWeight = deltaNum * dbBill.weight;
          } else {
            const deltaW = newData.weight - oldData.weight;
            dbBill.left_num -= deltaW;
            dbBill.left_num = utils.toFixedNumber(dbBill.left_num, 3);
            deltaWeight = deltaW;
          }
        } else {
          // 新增：扣减
          if (dbBill.block_num > 0) {
            dbBill.left_num -= newData.num;
            deltaWeight = newData.num * dbBill.weight;
          } else {
            dbBill.left_num -= newData.weight;
            dbBill.left_num = utils.toFixedNumber(dbBill.left_num, 3);
            deltaWeight = newData.weight;
          }
        }

        // 确保 left_num >= 0
        if (dbBill.left_num < 0) {
          dbBill.left_num = 0;
        }

        // 记录订单重量变化
        if (orderWeightDeltas[dbBill.order_no]) {
          orderWeightDeltas[dbBill.order_no] += deltaWeight;
        } else {
          orderWeightDeltas[dbBill.order_no] = deltaWeight;
        }

        totalWeight += dbBill.block_num > 0 ? newData.num * dbBill.weight : newData.weight;

        // 设置提单状态
        calculateBillStatus(dbBill, data.state);
        dbBill.shipper = userId;

        // 更新提单的 invoices 数组（船运需要包含 vehicles）
        const invoiceInfo = {
          inv_no: dbInv.waybill_no,
          veh_ves_name: data.vehicle_vessel_name,
          num: newData.num,
          weight: utils.toFixedNumber(newData.weight, 3),
          price: 0,
          veh_ves_price: 0,
          ship_to: data.ship_to,
          ship_from: data.ship_from,
          vehicles: newData.vehicles.map(v => ({
            inner_waybill_no: v.inner_waybill_no || '',
            veh_name: v.veh_name || '',
            veh_ship_from: v.veh_ship_from || '',
            send_num: v.send_num || 0,
            send_weight: v.send_weight || 0,
            veh_price: 0,
            price_mode: 0,
            price_remark: ''
          })),
          inv_settle_flag: 0
        };

        if (dbBill.invoices && dbBill.invoices.length) {
          const existingIdx = dbBill.invoices.findIndex(
            inv => inv.inv_no === dbInv.waybill_no
          );
          if (existingIdx >= 0) {
            dbBill.invoices[existingIdx] = invoiceInfo;
          } else {
            dbBill.invoices.push(invoiceInfo);
          }
        } else {
          dbBill.invoices = [invoiceInfo];
        }

        savedBills.push(dbBill);
      }

      // 5. 更新订单计划
      const savedPlans = [];
      for (const orderNo in orderWeightDeltas) {
        const delta = orderWeightDeltas[orderNo];
        if (Math.abs(delta) < EPSILON) continue;

        const plan = await OrderPlan.findOne(buildTenantQuery(req, { order_no: orderNo })).exec();
        if (plan) {
          plan.left_weight -= delta;
          if (plan.left_weight < 0 && Math.abs(plan.left_weight) > EPSILON) {
            return res.json({ ok: false, message: `订单 ${orderNo} 计划剩余量不足` });
          }
          if (plan.left_weight < EPSILON) {
            plan.left_weight = 0;
            plan.status = 1;
          } else {
            plan.status = 0;
          }
          savedPlans.push(plan);
        }
      }

      // 6. 保存所有更改
      for (const bill of savedBills) {
        await bill.save();
      }
      for (const plan of savedPlans) {
        await plan.save();
      }

      // 7. 更新运单
      dbInv.vehicle_vessel_name = data.vehicle_vessel_name;
      dbInv.ship_warehouse = data.ship_warehouse || '';
      dbInv.ship_name = data.ship_name;
      dbInv.ship_customer = data.ship_customer || '';
      dbInv.ship_date = data.ship_date || null;
      dbInv.ship_to = data.ship_to;
      dbInv.ship_from = data.ship_from;
      dbInv.bills = invoiceBills;
      dbInv.total_weight = utils.toFixedNumber(totalWeight, 3);
      dbInv.state = data.state || '新建';

      // 重新构建内部结算数据
      buildInnerSettleData(dbInv);

      await dbInv.save();
      res.json({ ok: true });
    }
  } catch (error) {
    console.error('buildShipInvoice error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

/**
 * 车运配发货保存接口
 * 前端发送: [{bill_no, order_no, send_num, send_weight, ...}]
 * 转换为Invoice模型: bills: [{bill_id, num, weight}] (无vehicles)
 */
/**
 * 删除运单
 * 删除运单时需要：
 * 1. 恢复所有提单的 left_num
 * 2. 更新提单的 status
 * 3. 从提单的 invoices 数组中删除该运单记录
 * 4. 恢复订单计划的 left_weight 和 status
 * 5. 删除运单记录
 */
exports.deleteInvoice = async (req, res) => {
  try {
    const waybill = req.body;
    const userId = req.user ? req.user.userid : 'admin';

    // 1. 查找运单
    const invoice = await Invoice.findOne(buildTenantQuery(req, { waybill_no: waybill.waybill_no })).exec();
    if (!invoice) {
      return res.json({ ok: false, message: '运单不存在' });
    }

    // 2. 检查是否已结算
    if (invoice.state === '已结算') {
      return res.json({ ok: false, message: '此运单已结算，不能删除' });
    }

    // 3. 记录每个订单的重量变化
    const orderWeightDeltas = {};

    // 4. 处理每个提单
    for (const invBill of invoice.bills) {
      const dbBill = await Bill.findOne(buildTenantQuery(req, { _id: invBill.bill_id })).exec();
      if (!dbBill) {
        console.warn('deleteInvoice: 未找到提单 bill_id=' + invBill.bill_id);
        continue;
      }

      let restoredWeight = 0;

      // 恢复 left_num
      if (dbBill.block_num > 0) {
        // 定尺：恢复块数
        dbBill.left_num += invBill.num;
        restoredWeight = invBill.num * dbBill.weight;
      }
      else {
        // 乱尺：恢复重量
        dbBill.left_num += invBill.weight;
        dbBill.left_num = utils.toFixedNumber(dbBill.left_num, 3);
        restoredWeight = invBill.weight;
      }

      // 记录订单重量变化（用于恢复订单计划）
      if (orderWeightDeltas[dbBill.order_no]) {
        orderWeightDeltas[dbBill.order_no] += restoredWeight;
      }
      else {
        orderWeightDeltas[dbBill.order_no] = restoredWeight;
      }

      // 重新计算提单状态
      calculateBillStatus(dbBill, '新建');

      // 从提单的 invoices 数组中删除该运单记录
      if (dbBill.invoices) {
        dbBill.invoices = dbBill.invoices.filter(
          inv => inv.inv_no !== invoice.waybill_no,
        );
      }

      // 保存提单
      await dbBill.save();
    }

    // 5. 恢复订单计划的 left_weight 和 status
    for (const orderNo in orderWeightDeltas) {
      const plan = await OrderPlan.findOne(buildTenantQuery(req, { order_no: orderNo })).exec();
      if (plan) {
        plan.left_weight += orderWeightDeltas[orderNo];
        plan.left_weight = utils.toFixedNumber(plan.left_weight, 3);

        // 如果之前是结案状态，恢复为生效状态
        if (plan.status === 1 && plan.left_weight > EPSILON) {
          plan.status = 0;
        }

        await plan.save();
      }
    }

    // 6. 删除运单
    await Invoice.deleteOne(buildTenantQuery(req, { waybill_no: waybill.waybill_no })).exec();

    res.json({ ok: true });
  }
  catch (error) {
    console.error('deleteInvoice error:', error);
    res.status(500).json({ ok: false, message: error.message });
  }
};

exports.buildTruckInvoice = async (req, res) => {
  try {
    const data = req.body;
    const flatBills = data.bills || [];
    const userId = req.user ? req.user.userid : 'admin';

    // 1. 查找是否已存在该运单
    let dbInv = await Invoice.findOne(buildTenantQuery(req, { waybill_no: data.waybill_no })).exec();

    // 2. 如果明细为空且运单已存在，清空明细并恢复所有提单
    if (flatBills.length === 0) {
      if (!dbInv) {
        return res.json({ ok: false, message: '没有选择提单明细' });
      }

      // 恢复所有提单的 left_num 和状态
      const orderWeightDeltas = {};
      for (const oldBill of dbInv.bills) {
        const dbBill = await Bill.findOne(buildTenantQuery(req, { _id: oldBill.bill_id })).exec();
        if (dbBill) {
          let restoredWeight = 0;
          if (dbBill.block_num > 0) {
            dbBill.left_num += oldBill.num;
            restoredWeight = oldBill.num * dbBill.weight;
          } else {
            dbBill.left_num += oldBill.weight;
            dbBill.left_num = utils.toFixedNumber(dbBill.left_num, 3);
            restoredWeight = oldBill.weight;
          }

          // 记录订单重量变化
          if (orderWeightDeltas[dbBill.order_no]) {
            orderWeightDeltas[dbBill.order_no] += restoredWeight;
          } else {
            orderWeightDeltas[dbBill.order_no] = restoredWeight;
          }

          // 从提单的 invoices 中移除此运单
          if (dbBill.invoices) {
            dbBill.invoices = dbBill.invoices.filter(
              inv => inv.inv_no !== dbInv.waybill_no
            );
          }

          // 重新计算状态
          calculateBillStatus(dbBill, '新建');
          await dbBill.save();
        }
      }

      // 恢复订单计划的 left_weight
      for (const orderNo in orderWeightDeltas) {
        const plan = await OrderPlan.findOne(buildTenantQuery(req, { order_no: orderNo })).exec();
        if (plan) {
          plan.left_weight += orderWeightDeltas[orderNo];
          plan.status = 0;
          await plan.save();
        }
      }

      // 更新运单：清空明细，保留基本信息
      dbInv.vehicle_vessel_name = data.vehicle_vessel_name;
      dbInv.ship_warehouse = data.ship_warehouse || '';
      dbInv.ship_name = data.ship_name;
      dbInv.ship_customer = data.ship_customer || '';
      dbInv.ship_date = data.ship_date || null;
      dbInv.ship_to = data.ship_to;
      dbInv.ship_from = data.ship_from;
      dbInv.bills = [];
      dbInv.total_weight = 0;
      dbInv.state = data.state || '新建';
      await dbInv.save();
      return res.json({ ok: true });
    }

    // 3. 验证所有提单都有 _id
    for (const fb of flatBills) {
      if (!fb._id) {
        return res.json({ ok: false, message: `提单缺少_id: ${fb.bill_no}` });
      }
    }

    // 4. 查找每个 _id 对应的数据库记录
    const billIdList = flatBills.map(fb => fb._id);
    const dbBillsForValidation = await Bill.find(buildTenantQuery(req, { _id: { $in: billIdList } })).exec();
    const billIdToDbBill = {};
    for (const db of dbBillsForValidation) {
      billIdToDbBill[db._id.toString()] = db;
    }

    // 5. 如果是更新场景，构建旧提单映射
    const oldBillMapForValidation = {};
    if (dbInv) {
      for (const oldBill of dbInv.bills) {
        oldBillMapForValidation[oldBill.bill_id.toString()] = {
          num: oldBill.num,
          weight: oldBill.weight
        };
      }
    }

    // 6. 验证剩余量是否足够
    for (const fb of flatBills) {
      const dbBill = billIdToDbBill[fb._id];
      if (!dbBill) {
        return res.json({ ok: false, message: `未找到提单: ${fb.bill_no} (_id: ${fb._id})` });
      }

      // 计算可用量：当前剩余量 + 之前分配给该运单的量（更新场景）
      let availableNum = dbBill.left_num;
      const oldData = oldBillMapForValidation[fb._id];
      if (oldData) {
        if (dbBill.block_num > 0) {
          availableNum += oldData.num;
        } else {
          availableNum += oldData.weight;
        }
      }

      // 检查剩余量
      if (dbBill.block_num > 0) {
        // 定尺：按块数计算
        if (fb.send_num > availableNum) {
          return res.json({
            ok: false,
            message: `提单 ${dbBill.bill_no} 剩余块数不足: 剩余${availableNum}块, 需要${fb.send_num}块`
          });
        }
      } else {
        // 乱尺：按重量计算
        if (fb.send_weight > availableNum + EPSILON) {
          return res.json({
            ok: false,
            message: `提单 ${dbBill.bill_no} 剩余重量不足: 剩余${availableNum}吨, 需要${fb.send_weight}吨`
          });
        }
      }
    }

    // 7. 构建 Invoice 的 bills 数组
    const invoiceBills = [];
    for (const fb of flatBills) {
      const dbBill = billIdToDbBill[fb._id];
      invoiceBills.push({
        bill_id: dbBill._id,
        num: fb.send_num || 0,
        weight: utils.toFixedNumber(fb.send_weight || 0, 3),
        vehicles: [] // 车运没有vehicles
      });
    }

    // 8. 构建 Invoice 数据
    const invoiceData = {
      waybill_no: data.waybill_no,
      vehicle_vessel_name: data.vehicle_vessel_name,
      ship_warehouse: data.ship_warehouse || '',
      ship_name: data.ship_name,
      ship_customer: data.ship_customer || '',
      ship_date: data.ship_date || null,
      ship_to: data.ship_to,
      ship_from: data.ship_from,
      bills: invoiceBills,
      total_weight: data.total_weight || 0,
      username: data.username || userId,
      shipper: userId,
      state: data.state || '新建',
      selfOwned: data.selfOwned ? 1 : 0
    };

    // 9. 根据是否已存在运单，执行新建或更新
    if (!dbInv) {
      // 新建运单
      const invoice = new Invoice(injectTenantId(req, invoiceData));

      let totalWeight = 0;
      const orderWeights = {};
      const savedBills = [];

      // 更新每个提单
      for (let i = 0; i < invoice.bills.length; i++) {
        const invBill = invoice.bills[i];
        const dbBill = await Bill.findOne(buildTenantQuery(req, { _id: invBill.bill_id })).exec();
        if (dbBill) {
          let w = 0;
          if (dbBill.block_num > 0) {
            // 定尺：扣减块数
            dbBill.left_num -= invBill.num;
            w = invBill.num * dbBill.weight;
          } else {
            // 乱尺：扣减重量
            dbBill.left_num -= invBill.weight;
            dbBill.left_num = utils.toFixedNumber(dbBill.left_num, 3);
            w = invBill.weight;
          }

          // 确保 left_num >= 0
          if (dbBill.left_num < 0) {
            dbBill.left_num = 0;
          }

          // 累计订单重量
          if (orderWeights[dbBill.order_no]) {
            orderWeights[dbBill.order_no] += w;
          } else {
            orderWeights[dbBill.order_no] = w;
          }

          totalWeight += w;

          // 设置提单状态
          calculateBillStatus(dbBill, invoice.state);
          dbBill.shipper = userId;

          // 添加运单信息到提单的 invoices 数组
          const invoiceInfo = {
            inv_no: invoice.waybill_no,
            veh_ves_name: invoice.vehicle_vessel_name,
            num: invBill.num,
            weight: invBill.weight,
            price: 0,
            veh_ves_price: 0,
            ship_to: invoice.ship_to,
            ship_from: invoice.ship_from,
            vehicles: [],
            inv_settle_flag: 0
          };

          if (dbBill.invoices && dbBill.invoices.length) {
            // 检查是否已存在相同运单
            const existingIdx = dbBill.invoices.findIndex(
              inv => inv.inv_no === invoice.waybill_no && inv.veh_ves_name === invoice.vehicle_vessel_name
            );
            if (existingIdx >= 0) {
              dbBill.invoices[existingIdx] = invoiceInfo;
            } else {
              dbBill.invoices.push(invoiceInfo);
            }
          } else {
            dbBill.invoices = [invoiceInfo];
          }

          savedBills.push(dbBill);
        } else {
          console.warn('buildTruckInvoice: 未找到提单 bill_id=' + invBill.bill_id);
        }
      }

      // 检查并更新订单计划
      let ok = true;
      const savedPlans = [];
      for (const orderNo in orderWeights) {
        const plan = await OrderPlan.findOne(buildTenantQuery(req, { order_no: orderNo })).exec();
        if (plan) {
          const delta = plan.left_weight - orderWeights[orderNo];
          if (delta < 0 && Math.abs(delta) > EPSILON) {
            ok = false;
            return res.json({ ok: false, message: `订单 ${orderNo} 计划剩余量${plan.left_weight}小于配发重量${orderWeights[orderNo]}` });
          } else {
            plan.left_weight -= orderWeights[orderNo];
            if (plan.left_weight > EPSILON) {
              plan.status = 0;
            } else {
              plan.left_weight = 0;
              plan.status = 1;
            }
            savedPlans.push(plan);
          }
        }
      }

      if (ok) {
        // 保存所有提单
        for (const bill of savedBills) {
          await bill.save();
        }
        // 保存订单计划
        for (const plan of savedPlans) {
          await plan.save();
        }

        // 校正总重量
        if (!areFloatsEqual(totalWeight, invoice.total_weight)) {
          console.warn('buildTruckInvoice: 重量不一致', totalWeight, invoice.total_weight);
          invoice.total_weight = utils.toFixedNumber(totalWeight, 3);
        }

        // 保存运单
        await invoice.save();
        res.json({ ok: true });
      }
    } else {
      // 更新已有运单
      // 1. 构建旧提单映射 {bill_id: {num, weight}}
      const oldBillMap = {};
      for (const oldBill of dbInv.bills) {
        oldBillMap[oldBill.bill_id.toString()] = {
          num: oldBill.num,
          weight: oldBill.weight
        };
      }

      // 2. 构建新提单映射
      const newBillMap = {};
      for (const newBill of invoiceBills) {
        newBillMap[newBill.bill_id.toString()] = {
          num: newBill.num,
          weight: newBill.weight
        };
      }

      const savedBills = [];
      const orderWeightDeltas = {}; // 订单重量变化

      // 3. 处理被删除的提单（在旧运单中但不在新运单中）- 恢复 left_num
      for (const oldBillId in oldBillMap) {
        if (!newBillMap[oldBillId]) {
          const dbBill = await Bill.findOne(buildTenantQuery(req, { _id: oldBillId })).exec();
          if (dbBill) {
            const old = oldBillMap[oldBillId];
            let restoredWeight = 0;

            if (dbBill.block_num > 0) {
              dbBill.left_num += old.num;
              restoredWeight = old.num * dbBill.weight;
            } else {
              dbBill.left_num += old.weight;
              dbBill.left_num = utils.toFixedNumber(dbBill.left_num, 3);
              restoredWeight = old.weight;
            }

            // 记录订单重量变化（恢复）
            if (orderWeightDeltas[dbBill.order_no]) {
              orderWeightDeltas[dbBill.order_no] -= restoredWeight;
            } else {
              orderWeightDeltas[dbBill.order_no] = -restoredWeight;
            }

            // 从提单的 invoices 中移除此运单
            if (dbBill.invoices) {
              dbBill.invoices = dbBill.invoices.filter(
                inv => inv.inv_no !== dbInv.waybill_no
              );
            }

            // 重新计算状态
            calculateBillStatus(dbBill, data.state);
            savedBills.push(dbBill);
          }
        }
      }

      // 4. 处理新增和修改的提单
      let totalWeight = 0;
      for (const newBillId in newBillMap) {
        const dbBill = await Bill.findOne(buildTenantQuery(req, { _id: newBillId })).exec();
        if (!dbBill) continue;

        const newData = newBillMap[newBillId];
        const oldData = oldBillMap[newBillId];
        let deltaWeight = 0;

        if (oldData) {
          // 修改：计算差值
          if (dbBill.block_num > 0) {
            const deltaNum = newData.num - oldData.num;
            dbBill.left_num -= deltaNum;
            deltaWeight = deltaNum * dbBill.weight;
          } else {
            const deltaW = newData.weight - oldData.weight;
            dbBill.left_num -= deltaW;
            dbBill.left_num = utils.toFixedNumber(dbBill.left_num, 3);
            deltaWeight = deltaW;
          }
        } else {
          // 新增：扣减
          if (dbBill.block_num > 0) {
            dbBill.left_num -= newData.num;
            deltaWeight = newData.num * dbBill.weight;
          } else {
            dbBill.left_num -= newData.weight;
            dbBill.left_num = utils.toFixedNumber(dbBill.left_num, 3);
            deltaWeight = newData.weight;
          }
        }

        // 确保 left_num >= 0
        if (dbBill.left_num < 0) {
          dbBill.left_num = 0;
        }

        // 记录订单重量变化
        if (orderWeightDeltas[dbBill.order_no]) {
          orderWeightDeltas[dbBill.order_no] += deltaWeight;
        } else {
          orderWeightDeltas[dbBill.order_no] = deltaWeight;
        }

        totalWeight += dbBill.block_num > 0 ? newData.num * dbBill.weight : newData.weight;

        // 设置提单状态
        calculateBillStatus(dbBill, data.state);
        dbBill.shipper = userId;

        // 更新提单的 invoices 数组
        const invoiceInfo = {
          inv_no: dbInv.waybill_no,
          veh_ves_name: data.vehicle_vessel_name,
          num: newData.num,
          weight: newData.weight,
          price: 0,
          veh_ves_price: 0,
          ship_to: data.ship_to,
          ship_from: data.ship_from,
          vehicles: [],
          inv_settle_flag: 0
        };

        if (dbBill.invoices && dbBill.invoices.length) {
          const existingIdx = dbBill.invoices.findIndex(
            inv => inv.inv_no === dbInv.waybill_no
          );
          if (existingIdx >= 0) {
            dbBill.invoices[existingIdx] = invoiceInfo;
          } else {
            dbBill.invoices.push(invoiceInfo);
          }
        } else {
          dbBill.invoices = [invoiceInfo];
        }

        savedBills.push(dbBill);
      }

      // 5. 更新订单计划
      const savedPlans = [];
      for (const orderNo in orderWeightDeltas) {
        const delta = orderWeightDeltas[orderNo];
        if (Math.abs(delta) < EPSILON) continue;

        const plan = await OrderPlan.findOne(buildTenantQuery(req, { order_no: orderNo })).exec();
        if (plan) {
          plan.left_weight -= delta;
          if (plan.left_weight < 0 && Math.abs(plan.left_weight) > EPSILON) {
            return res.json({ ok: false, message: `订单 ${orderNo} 计划剩余量不足` });
          }
          if (plan.left_weight < EPSILON) {
            plan.left_weight = 0;
            plan.status = 1;
          } else {
            plan.status = 0;
          }
          savedPlans.push(plan);
        }
      }

      // 6. 保存所有更改
      for (const bill of savedBills) {
        await bill.save();
      }
      for (const plan of savedPlans) {
        await plan.save();
      }

      // 7. 更新运单
      dbInv.vehicle_vessel_name = data.vehicle_vessel_name;
      dbInv.ship_warehouse = data.ship_warehouse || '';
      dbInv.ship_name = data.ship_name;
      dbInv.ship_customer = data.ship_customer || '';
      dbInv.ship_date = data.ship_date || null;
      dbInv.ship_to = data.ship_to;
      dbInv.ship_from = data.ship_from;
      dbInv.bills = invoiceBills;
      dbInv.total_weight = utils.toFixedNumber(totalWeight, 3);
      dbInv.state = data.state || '新建';

      await dbInv.save();
      res.json({ ok: true });
    }
  } catch (error) {
    console.error('buildTruckInvoice error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};
