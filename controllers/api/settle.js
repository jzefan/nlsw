const Bill = require("../../models/Bill");
const Invoice = require("../../models/Invoice");
const OrderPlan = require("../../models/OrderPlan");
const Settle = require("../../models/Settle");
const utils = require("../utils");
const { buildTenantQuery, injectTenantId } = require("../../utils/tenant");

const EPSILON = 0.0001;

const CUSTOMER_SETTLE_FLAG = 1; // 0001
const COLLECTION_SETTLE_FLAG = 2; // 0010
const VESSEL_SETTLE_FLAG = 4; // 0100

// 辅助函数：检查结算标志
function checkFlag(flag, type) {
  if (type === "CUSTOMER" || type === "客户结算") {
    return (flag & CUSTOMER_SETTLE_FLAG) === CUSTOMER_SETTLE_FLAG;
  } else if (type === "COLLECTION" || type === "代收代付结算") {
    return (flag & COLLECTION_SETTLE_FLAG) === COLLECTION_SETTLE_FLAG;
  } else if (type === "VESSEL_VEH" || type === "车船结算") {
    return (flag & VESSEL_SETTLE_FLAG) === VESSEL_SETTLE_FLAG;
  }
  return false;
}

// 辅助函数：设置结算标志
function setFlag(flag, type) {
  flag = flag || 0;
  if (type === "CUSTOMER" || type === "客户结算") {
    return flag | CUSTOMER_SETTLE_FLAG;
  } else if (type === "COLLECTION" || type === "代收代付结算") {
    return flag | COLLECTION_SETTLE_FLAG;
  } else if (type === "VESSEL_VEH" || type === "车船结算") {
    return flag | VESSEL_SETTLE_FLAG;
  }
  return flag;
}

// 辅助函数：清除结算标志
function clearFlag(flag, type) {
  flag = flag || 0;
  if (type === "CUSTOMER" || type === "客户结算") {
    return flag & ~CUSTOMER_SETTLE_FLAG;
  } else if (type === "COLLECTION" || type === "代收代付结算") {
    return flag & ~COLLECTION_SETTLE_FLAG;
  } else if (type === "VESSEL_VEH" || type === "车船结算") {
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
      const ids = invoice.bills.map((b) => b.bill_id);
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
          invoice.state = "已结算";
          invoice.settle_flag = setFlag(invoice.settle_flag, settle_type);
          await invoice.save();
        }
      } else {
        if (checkFlag(invoice.settle_flag, settle_type)) {
          invoice.state = "已配发";
          invoice.settle_flag = clearFlag(invoice.settle_flag, settle_type);
          await invoice.save();
        }
      }
    }
  } catch (error) {
    console.error("updateInvoiceStatus error:", error);
    throw error;
  }
}

/**
 * 获取结算提单列表
 * 根据过滤条件获取已配发但未结算的提单
 * 优化：使用聚合管道减少查询次数和数据处理
 */
exports.getSettleBills = async (req, res) => {
  try {
    const {
      fName,
      fVeh,
      fShipFrom,
      fDest,
      fOrder,
      fBno,
      fInvNo,
      fDate1,
      fDate2,
      fType,
      selfOwned,
    } = req.query;

    // 构建匹配条件数组
    const matchConditions = [];

    // 租户过滤
    const tenantFilter = buildTenantQuery(req, {});
    if (tenantFilter.tenantId) {
      matchConditions.push({ tenantId: tenantFilter.tenantId });
    }

    // 自有车过滤
    if (selfOwned === "1" || selfOwned === 1) {
      matchConditions.push({ selfOwned: 1 });
    } else if (selfOwned === "0" || selfOwned === 0) {
      matchConditions.push({ selfOwned: { $ne: 1 } });
    }

    // 开单名称过滤
    if (fName && Array.isArray(fName) && fName.length > 0) {
      matchConditions.push({ ship_name: { $in: fName } });
    } else if (fName && typeof fName === "string") {
      matchConditions.push({ ship_name: fName });
    }

    // 车船号过滤
    if (fVeh && Array.isArray(fVeh) && fVeh.length > 0) {
      matchConditions.push({ vehicle_vessel_name: { $in: fVeh } });
    }

    // 起始地过滤
    if (fShipFrom && Array.isArray(fShipFrom) && fShipFrom.length > 0) {
      matchConditions.push({ ship_from: { $in: fShipFrom } });
    }

    // 目的地过滤
    if (fDest && Array.isArray(fDest) && fDest.length > 0) {
      matchConditions.push({ ship_to: { $in: fDest } });
    }

    // 日期范围过滤
    if (fDate1 && fDate2) {
      matchConditions.push({
        ship_date: {
          $gte: utils.parseLocalDate(fDate1),
          $lte: utils.parseLocalDateEnd(fDate2),
        },
      });
    }

    // 查询已配发、新建和已结算的运单（已结算的运单可能只完成了一种结算模式）
    matchConditions.push({ state: { $in: ["已配发", "新建", "已结算"] } });

    // 使用聚合管道优化查询
    const pipeline = [
      // 第一步：匹配运单
      {
        $match: matchConditions.length > 0 ? { $and: matchConditions } : {},
      },

      // 第二步：只保留后续需要的运单字段，减少内存占用
      {
        $project: {
          waybill_no: 1,
          ship_name: 1,
          ship_customer: 1,
          vehicle_vessel_name: 1,
          ship_to: 1,
          ship_from: 1,
          ship_date: 1,
          shipper: 1,
          bills: 1,
          createdAt: 1,
        },
      },

      // 第三步：展开 bills 数组
      { $unwind: { path: "$bills", preserveNullAndEmptyArrays: false } },

      // 第四步：lookup 提单（unwind 后 bills.bill_id 是单值，用 localField/foreignField 走 _id 索引）
      {
        $lookup: {
          from: "bills",
          localField: "bills.bill_id",
          foreignField: "_id",
          as: "billInfo",
        },
      },

      // 第五步：展开 billInfo（只有一个匹配）
      { $unwind: { path: "$billInfo", preserveNullAndEmptyArrays: false } },

      // 第六步：在管道内提取 price 和 inv_settle_flag
      {
        $addFields: {
          _invInfo: {
            $let: {
              vars: {
                matched: {
                  $filter: {
                    input: { $ifNull: ["$billInfo.invoices", []] },
                    as: "inv",
                    cond: { $eq: ["$$inv.inv_no", "$waybill_no"] },
                  },
                },
              },
              in: { $arrayElemAt: ["$$matched", 0] },
            },
          },
        },
      },
      {
        $addFields: {
          _price: {
            $let: {
              vars: {
                vehMatched: {
                  $filter: {
                    input: { $ifNull: ["$_invInfo.vehicles", []] },
                    as: "v",
                    cond: { $eq: ["$$v.veh_name", "$vehicle_vessel_name"] },
                  },
                },
              },
              in: {
                $cond: {
                  if: { $gt: [{ $size: "$$vehMatched" }, 0] },
                  then: {
                    $ifNull: [
                      { $arrayElemAt: ["$$vehMatched.veh_price", 0] },
                      0,
                    ],
                  },
                  else: { $ifNull: ["$_invInfo.price", 0] },
                },
              },
            },
          },
          _inv_settle_flag: { $ifNull: ["$_invInfo.inv_settle_flag", 0] },
        },
      },

      // 第七步：按发货日期降序排序
      { $sort: { ship_date: -1, createdAt: -1 } },

      // 第八步：构造输出格式
      {
        $project: {
          _id: "$billInfo._id",
          bill_no: "$billInfo.bill_no",
          order_no: "$billInfo.order_no",
          order_item_no: "$billInfo.order_item_no",
          billing_name: "$ship_name",
          ship_customer: "$ship_customer",
          veh_ves_name: "$vehicle_vessel_name",
          ship_to: "$ship_to",
          ship_from: "$ship_from",
          ship_warehouse: "$billInfo.ship_warehouse",
          inv_no: "$waybill_no",
          inv_ship_date: "$ship_date",
          inv_shipper: "$shipper",
          send_num: "$bills.num",
          send_weight: "$bills.weight",
          thickness: "$billInfo.thickness",
          width: "$billInfo.width",
          len: "$billInfo.len",
          contract_no: "$billInfo.contract_no",
          price: "$_price",
          collection_price: { $ifNull: ["$billInfo.collection_price", 0] },
          incoming_price_remark: {
            $ifNull: ["$billInfo.incoming_price_remark", ""],
          },
          inv_settle_flag: "$_inv_settle_flag",
          settle_flag: "$billInfo.settle_flag",
          status: "$bills.status",
          bill_weight: "$billInfo.weight",
        },
      },
    ];

    const results = await Invoice.aggregate(pipeline)
      .allowDiskUse(true)
      .exec();

    // 过滤集合（用 Set 加速）
    const fOrderSet =
      fOrder && Array.isArray(fOrder) && fOrder.length > 0
        ? new Set(fOrder)
        : null;
    const fBnoSet =
      fBno && Array.isArray(fBno) && fBno.length > 0 ? new Set(fBno) : null;
    const fInvNoSet =
      fInvNo && Array.isArray(fInvNo) && fInvNo.length > 0 ? new Set(fInvNo) : null;

    // 处理结果（price 和 inv_settle_flag 已在管道内计算）
    const bills = [];

    for (const item of results) {
      // 订单号过滤
      if (fOrderSet && !fOrderSet.has(item.order_no)) continue;
      // 提单号过滤
      if (fBnoSet && !fBnoSet.has(item.bill_no)) continue;
      // 运单号过滤
      if (fInvNoSet && !fInvNoSet.has(item.inv_no)) continue;

      // 单块重（用于定尺提单：重量为0时按 块数*单重 计算）
      const unitWeight = item.bill_weight || 0;
      const sendNum = item.send_num || 0;
      const sendWeight = item.send_weight || sendNum * unitWeight;

      bills.push({
        _id: item._id,
        bill_no: item.bill_no,
        order_no: item.order_no,
        order_item_no: item.order_item_no,
        billing_name: item.billing_name,
        ship_customer: item.ship_customer,
        veh_ves_name: item.veh_ves_name,
        ship_to: item.ship_to,
        ship_from: item.ship_from,
        ship_warehouse: item.ship_warehouse,
        inv_no: item.inv_no,
        inv_ship_date: item.inv_ship_date,
        inv_shipper: item.inv_shipper,
        send_num: sendNum,
        send_weight: sendWeight,
        thickness: item.thickness,
        width: item.width,
        len: item.len,
        contract_no: item.contract_no,
        price: item.price,
        collection_price: item.collection_price,
        incoming_price_remark: item.incoming_price_remark,
        inv_settle_flag: item.inv_settle_flag,
        status: item.status,
      });
    }

    res.json({ ok: true, bills });
  } catch (error) {
    console.error("getSettleBills error:", error);
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
      return res.json({ ok: false, message: "没有要保存的数据" });
    }

    // 按提单分组
    const billGroups = {};
    data.forEach((item) => {
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
        console.warn("inputPrice: 未找到提单或无权限 bid=" + bid);
        continue;
      }

      if (act === "COLLECTION") {
        // 代收代付价格：直接保存到 Bill
        const price = items[0].price;
        dbBill.collection_price = price;
        if (items[0].remark !== undefined) {
          dbBill.incoming_price_remark = items[0].remark;
        }
      } else {
        // 客户价格：保存到 Bill.invoices 中
        items.forEach((item) => {
          if (dbBill.invoices) {
            const invInfo = dbBill.invoices.find(
              (inv) => inv.inv_no === item.inv_no,
            );
            if (invInfo) {
              invInfo.price = item.price;
              if (item.remark !== undefined) {
                dbBill.incoming_price_remark = item.remark;
              }
            }
          }
        });
      }

      await dbBill.save();
    }

    res.json({ ok: true });
  } catch (error) {
    console.error("inputPrice error:", error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

/**
 * 结算
 */
exports.settleBills = async (req, res) => {
  try {
    const { settleObj, price, settle_type, billName, shipTo, selfOwned } =
      req.body;

    if (!settleObj || !Array.isArray(settleObj) || settleObj.length === 0) {
      return res.json({ ok: false, message: "没有要结算的数据" });
    }

    const user = req.user || { userid: "admin", no: 0 };
    const userId = user.userid;
    const flag =
      settle_type === "CUSTOMER"
        ? CUSTOMER_SETTLE_FLAG
        : COLLECTION_SETTLE_FLAG;

    // 生成流水号
    const uno = utils.leftPad(user.no, 4);
    const date_no = new Date().yyyymmdd() + uno;
    const reg = new RegExp("^JS" + date_no + ".*", "g");

    const settleNumQuery = buildTenantQuery(req, {
      serial_number: { $regex: reg },
    });
    const settles = await Settle.find(settleNumQuery)
      .sort({ serial_number: "desc" })
      .exec();

    let no = utils.leftPad(1, 3);
    if (settles.length > 0) {
      const str = settles[0].serial_number.substring(14);
      no = utils.leftPad(parseInt(str) + 1, 3);
    }

    const serialNumber = "JS" + date_no + no;

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
        settle_flag: item.settle_flag,
      });
    }

    // 按提单分组
    const billGroups = {};
    settleObj.forEach((item) => {
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
        console.warn("settleBills: 未找到提单或无权限 bid=" + bid);
        continue;
      }

      // 检查提单状态，只有已配发（status_flag === 2）的提单才能结算
      const isShipped = dbBill.status_flag === 2 || dbBill.status === "已配发";

      // 更新提单状态
      if (isShipped && dbBill.status === "已配发") {
        dbBill.status = "已结算";
      }

      items.forEach((item) => {
        if (dbBill.invoices) {
          const invInfo = dbBill.invoices.find(
            (inv) => inv.inv_no === item.inv_no,
          );
          if (invInfo) {
            invInfo.inv_settle_flag = setFlag(
              invInfo.inv_settle_flag,
              settle_type,
            );

            // 船运：更新 vehicles 中的结算状态
            if (invInfo.vehicles && invInfo.vehicles.length > 0) {
              invInfo.vehicles.forEach((veh) => {
                veh.inv_settle_flag = setFlag(veh.inv_settle_flag, settle_type);
              });
            }
          }
        }
      });

      // 只有当提单已配发时才更新 Bill.settle_flag
      if (isShipped) {
        if (settle_type === "COLLECTION") {
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
    const settleTypeText =
      settle_type === "CUSTOMER" ? "客户结算" : "代收代付结算";

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
      status: "已结算",
    });
    const settle = new Settle(settleData);

    await settle.save();

    // 更新运单状态
    await updateInvoiceStatus(allInvNo, settle_type, req);

    res.json({ ok: true });
  } catch (error) {
    console.error("settleBills error:", error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

/**
 * 标记不需要结算
 */
exports.markNotRequireSettle = async (req, res) => {
  try {
    const { nonSettleObj, settle_type } = req.body;

    if (
      !nonSettleObj ||
      !Array.isArray(nonSettleObj) ||
      nonSettleObj.length === 0
    ) {
      return res.json({ ok: false, message: "没有要标记的数据" });
    }

    const flag =
      settle_type === "CUSTOMER"
        ? CUSTOMER_SETTLE_FLAG
        : COLLECTION_SETTLE_FLAG;

    // 收集所有运单号
    const allInvNo = [];
    for (const item of nonSettleObj) {
      if (!allInvNo.includes(item.inv_no)) {
        allInvNo.push(item.inv_no);
      }
    }

    // 按提单分组
    const billGroups = {};
    nonSettleObj.forEach((item) => {
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
        console.warn("markNotRequireSettle: 未找到提单或无权限 bid=" + bid);
        continue;
      }

      if (settle_type === "COLLECTION") {
        // 代收代付：设置为 -1
        dbBill.collection_price = -1;
        dbBill.settle_flag = (dbBill.settle_flag || 0) & ~flag;

        // 更新 invoices 中的结算状态
        items.forEach((item) => {
          if (dbBill.invoices) {
            const invInfo = dbBill.invoices.find(
              (inv) => inv.inv_no === item.inv_no,
            );
            if (invInfo) {
              invInfo.inv_settle_flag = item.settle_flag || 0;

              // 船运：更新 vehicles 中的结算状态
              if (invInfo.vehicles && invInfo.vehicles.length > 0) {
                invInfo.vehicles.forEach((veh) => {
                  veh.inv_settle_flag = item.settle_flag || 0;
                });
              }
            }
          }
        });
      } else {
        // 客户结算：设置价格为 -1
        items.forEach((item) => {
          if (dbBill.invoices) {
            const invInfo = dbBill.invoices.find(
              (inv) => inv.inv_no === item.inv_no,
            );
            if (invInfo) {
              invInfo.price = -1;
              invInfo.inv_settle_flag = (invInfo.inv_settle_flag || 0) & ~flag;
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
    console.error("markNotRequireSettle error:", error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

/**
 * 取消"不需要结算"标记，将价格从 -1 恢复为 0
 */
exports.cancelNotRequireSettle = async (req, res) => {
  try {
    const { nonSettleObj, settle_type } = req.body;

    if (
      !nonSettleObj ||
      !Array.isArray(nonSettleObj) ||
      nonSettleObj.length === 0
    ) {
      return res.json({ ok: false, message: "没有要取消的数据" });
    }

    // 收集所有运单号
    const allInvNo = [];
    for (const item of nonSettleObj) {
      if (!allInvNo.includes(item.inv_no)) {
        allInvNo.push(item.inv_no);
      }
    }

    // 按提单分组
    const billGroups = {};
    nonSettleObj.forEach((item) => {
      if (!billGroups[item.bid]) {
        billGroups[item.bid] = [];
      }
      billGroups[item.bid].push(item);
    });

    // 更新每个提单：将 -1 恢复为 0
    for (const bid in billGroups) {
      const items = billGroups[bid];
      const billQ = buildTenantQuery(req, { _id: bid });
      const dbBill = await Bill.findOne(billQ).exec();

      if (!dbBill) {
        console.warn("cancelNotRequireSettle: 未找到提单或无权限 bid=" + bid);
        continue;
      }

      if (settle_type === "COLLECTION") {
        dbBill.collection_price = 0;
        items.forEach((item) => {
          if (dbBill.invoices) {
            const invInfo = dbBill.invoices.find(
              (inv) => inv.inv_no === item.inv_no,
            );
            if (invInfo) {
              invInfo.inv_settle_flag = item.settle_flag || 0;
              if (invInfo.vehicles && invInfo.vehicles.length > 0) {
                invInfo.vehicles.forEach((veh) => {
                  veh.inv_settle_flag = item.settle_flag || 0;
                });
              }
            }
          }
        });
      } else {
        items.forEach((item) => {
          if (dbBill.invoices) {
            const invInfo = dbBill.invoices.find(
              (inv) => inv.inv_no === item.inv_no,
            );
            if (invInfo) {
              invInfo.price = 0;
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
    console.error("cancelNotRequireSettle error:", error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

/**
 * 获取车辆列表
 */
exports.getVehicleList = async (req, res) => {
  try {
    const vehQuery = buildTenantQuery(req, {
      state: { $in: ["已配发", "新建"] },
    });
    const invoices = await Invoice.find(vehQuery)
      .select("vehicle_vessel_name")
      .distinct("vehicle_vessel_name")
      .lean()
      .exec();

    const vehicles = utils.pinyin_sort_2(invoices.map((name) => ({ name, veh_type: "车船" })));

    res.json({
      ok: true,
      vehicles,
    });
  } catch (error) {
    console.error("getVehicleList error:", error);
    res.status(500).json({ ok: false, error: error.message });
  }
};
