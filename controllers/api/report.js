const mongoose = require('mongoose');
const Bill = require('../../models/Bill');
const Invoice = require('../../models/Invoice');
const Settle = require('../../models/Settle');
const Vehicle = require('../../models/Vehicle');
const utils = require('../../controllers/utils');
const { buildTenantQuery, isPlatformUser } = require('../../utils/tenant');
const { hasPermission, PERMISSIONS } = require('../../utils/permissions');

// Helper to get start/end date
function getStartEndDate(start, end, isDay) {
  if (start === end) {
    const d1 = utils.convertDateToUTC(new Date(start));
    const d2 = utils.convertDateToUTC(new Date(end));
    if (isDay) {
      d2.setDate(d1.getDate() + 1);
    } else {
      d2.setMonth(d1.getMonth() + 1);
    }
    return { s: d1, e: d2 };
  } else {
    return { s: start, e: end };
  }
}

// Helper to copy bill properties
function copyBill(bill, binv, veh, selfOwnedVehs) {
  const obj = {
    _id: bill._id,
    bill_no: bill.bill_no,
    order_no: bill.order_no,
    order_item_no: bill.order_item_no,
    brand_no: bill.brand_no,
    billing_name: bill.billing_name,
    len: bill.len,
    width: bill.width,
    thickness: bill.thickness,
    size_type: bill.size_type,
    weight: bill.weight,
    block_num: bill.block_num,
    total_weight: bill.total_weight,
    left_num: bill.left_num,
    collection_price: bill.collection_price,
    invoices: [],
    warehouse: bill.warehouse,
    ship_warehouse: bill.ship_warehouse,
    contract_no: bill.contract_no,
    sales_dep: bill.sales_dep,
    create_date: bill.create_date,
    shipping_date: bill.shipping_date,
    creater: bill.creater,
    shipper: bill.shipper,
    status: bill.status,
    settle_flag: bill.settle_flag,
    product_type: bill.product_type,
    ship_customer: bill.ship_customer,
    inv_ship_date: bill.inv_ship_date,
    inv_shipper: bill.inv_shipper,
    status_2: bill.status_2,
    inv_settle_flag: bill.inv_settle_flag
  };

  if (veh) {
    obj.inv_no = veh.inner_waybill_no;
    obj.veh_ves_name = veh.veh_name;
    obj.send_num = veh.send_num;
    obj.send_weight = veh.send_weight;
    obj.price = veh.veh_price;
    obj.ship_to = binv.veh_ves_name;
    obj.ship_from = veh.veh_ship_from;
  } else {
    obj.inv_no = binv.inv_no;
    obj.veh_ves_name = binv.veh_ves_name;
    obj.send_num = binv.num;
    obj.send_weight = (bill.block_num > 0 ? bill.weight * binv.num : binv.weight);
    obj.price = binv.price;
    obj.veh_ves_price = binv.veh_ves_price;
    obj.ship_to = binv.ship_to;
    obj.ship_from = binv.ship_from;
  }

  // 标记车船类型
  if (selfOwnedVehs && selfOwnedVehs.length > 0 && obj.veh_ves_name) {
    obj.veh_mode = selfOwnedVehs.indexOf(obj.veh_ves_name) >= 0 ? '自有' : '外挂';
  } else {
    obj.veh_mode = '';
  }

  return obj;
}

// Helper to apply settle status_2 to page data (post-processing for aggregation result)
async function applySettleStatus(req, rows) {
  if (!rows || rows.length === 0) return;

  // Collect unique bill IDs from page data
  const billIdSet = new Set();
  rows.forEach(r => { if (r._id) billIdSet.add(r._id.toString()); });
  const billIds = Array.from(billIdSet).map(id => new mongoose.Types.ObjectId(id));

  if (billIds.length === 0) return;

  // Only query settles relevant to this page's bills
  const settles = await Settle.find(buildTenantQuery(req, {
    status: { $ne: '已结算' },
    'bills.bill_id': { $in: billIds }
  })).select('bills status').lean().exec();

  // Build lookup: bill_id -> [{inv_no, status}]
  const statObj = {};
  settles.forEach(settle => {
    settle.bills.forEach(sbill => {
      const key = sbill.bill_id.toString();
      if (!statObj[key]) statObj[key] = [];
      statObj[key].push({ no: sbill.inv_no, stat: settle.status });
    });
  });

  // Apply status_2 to each row
  rows.forEach(row => {
    row.status_2 = '';
    const entries = statObj[row._id.toString()];
    if (entries) {
      for (const entry of entries) {
        if (row.inv_no === entry.no) {
          row.status_2 = entry.stat;
          break;
        }
      }
    }
  });
}

// Helper to construct bill array (kept for invoice-first mode)
function getBillArray(bills, invs, settles, vehList, mode, selfOwnedVehs) {
  const statObj = {};
  settles.forEach(function (settle) {
    settle.bills.forEach(function (sbill) {
      if (statObj[sbill.bill_id]) {
        statObj[sbill.bill_id].push({ no: sbill.inv_no, stat: settle.status })
      } else {
        statObj[sbill.bill_id] = [{ no: sbill.inv_no, stat: settle.status }];
      }
    })
  });

  const invObj = {};
  invs.forEach(function (inv) {
    invObj[inv.waybill_no] = { customer: inv.ship_customer, date: inv.ship_date, shipper: inv.shipper }
  });

  const copied = [];
  const b = vehList && vehList.length > 0;

  bills.forEach(function (bill) {
    bill.invoices.forEach(function (binv) {
      let o = invObj[binv.inv_no];
      if (o) {
        bill.ship_customer = o.customer;
        bill.inv_ship_date = o.date;
        bill.inv_shipper = o.shipper;
        bill.status_2 = '';

        if (statObj[bill._id]) {
          for (let k = 0; k < statObj[bill._id].length; ++k) {
            if (binv.inv_no === statObj[bill._id][k].no) {
              bill.status_2 = statObj[bill._id][k].stat;
              break;
            }
          }
        }

        bill.inv_settle_flag = binv.inv_settle_flag;
        if (mode === 0) {
          if (!b || vehList.indexOf(binv.veh_ves_name) >= 0) {
            copied.push(copyBill(bill, binv, null, selfOwnedVehs));
          }
        } else if (mode === 1) {
          binv.vehicles.forEach(function (veh) {
            if (!b || vehList.indexOf(veh.veh_name) >= 0) {
              copied.push(copyBill(bill, binv, veh, selfOwnedVehs));
            }
          })
        } else {
          if (!b || vehList.indexOf(binv.veh_ves_name) >= 0) {
            copied.push(copyBill(bill, binv, null, selfOwnedVehs));
            binv.vehicles.forEach(function (veh) {
              if (!b || vehList.indexOf(veh.veh_name) >= 0) {
                copied.push(copyBill(bill, binv, veh, selfOwnedVehs));
              }
            })
          }
        }
      }
    })
  });

  return copied;
}

function combineBill(bills, invs) {
  let invObj = {};
  invs.forEach(function (inv) {
    invObj[inv.waybill_no] = { customer: inv.ship_customer, date: inv.ship_date, shipper: inv.shipper, remark: inv.incoming_price_remark }
  });

  let copied = [];

  bills.forEach(function (bill) {
    bill.invoices.forEach(function (binv) {
      let o = invObj[binv.inv_no];
      if (o) {
        copied.push({
          _id: bill._id,
          bill_no: bill.bill_no,
          order_no: bill.order_no,
          order_item_no: bill.order_item_no,
          order: bill.order_no + '-' + utils.leftPad(bill.order_item_no, 3),
          brand_no: bill.brand_no,
          billing_name: bill.billing_name,
          len: bill.len,
          width: bill.width,
          thickness: bill.thickness,
          size_type: bill.size_type,
          weight: bill.weight,
          block_num: bill.block_num,
          total_weight: bill.total_weight,
          left_num: bill.left_num,
          collection_price: bill.collection_price,
          invoices: [],
          warehouse: bill.warehouse,
          ship_warehouse: bill.ship_warehouse,
          contract_no: bill.contract_no,
          sales_dep: bill.sales_dep,
          create_date: bill.create_date,
          shipping_date: bill.shipping_date,
          creater: bill.creater,
          shipper: bill.shipper,
          status: bill.status,
          settle_flag: bill.settle_flag,
          product_type: bill.product_type,
          inv_no: binv.inv_no,
          veh_ves_name: binv.veh_ves_name,
          send_num: binv.num,
          send_weight: bill.block_num > 0 ? bill.weight * binv.num : binv.weight,
          price: binv.price,
          ship_to: binv.ship_to,
          ship_from: binv.ship_from,
          ship_customer: o.customer,
          inv_ship_date: o.date,
          inv_shipper: o.shipper,
          inv_settle_flag: binv.inv_settle_flag,
          incoming_price_remark: o.remark
        });
      }
    })
  });

  return copied;
}

exports.getIntegratedQuery = async function (req, res) {
  var query = req.query;
  var obj = {};

  // 确保数组参数始终为数组（单值时 Express 解析为字符串）
  if (query.fVeh && !Array.isArray(query.fVeh)) query.fVeh = [query.fVeh];
  if (query.fName && !Array.isArray(query.fName)) query.fName = [query.fName];
  if (query.fDest && !Array.isArray(query.fDest)) query.fDest = [query.fDest];
  if (query.fFrom && !Array.isArray(query.fFrom)) query.fFrom = [query.fFrom];

  var bVeh = !utils.isEmpty(query.fVeh);
  var bDest = !utils.isEmpty(query.fDest);
  var bFrom = !utils.isEmpty(query.fFrom);
  var bDate = !utils.isEmpty(query.fDate1) && !utils.isEmpty(query.fDate2);
  var bName = !utils.isEmpty(query.fName);
  var bBNo = !utils.isEmpty(query.fBno);
  var bOrder = !utils.isEmpty(query.fOrder);
  var bVehMode = !utils.isEmpty(query.fVehMode);
  var qDate;

  // Pagination parameters
  const page = parseInt(query.page) || 1;
  const limit = parseInt(query.limit) || 20;
  const skip = (page - 1) * limit;
  const isExport = query.isExport === 'true'; // Flag to skip pagination for export

  if (bDate) {
    qDate = getStartEndDate(query.fDate1, query.fDate2, true);
  }

  const user = req.user || {};
  const canSeePrice = hasPermission(user.privilege, PERMISSIONS.SEE_PRICE);

  // 无查看价格权限时，从结果中移除价格字段
  function stripPriceFields(rows) {
    if (canSeePrice) return rows;
    return rows.map(row => {
      const { price, collection_price, veh_ves_price, ...rest } = row;
      return rest;
    });
  }

  try {
    if (query.fType === 'invoice-first') {
      obj = { $and: [{ state: { $ne: '新建' } }] };
      if (bVeh) obj["$and"].push({ vehicle_vessel_name: { $in: query.fVeh } });
      if (bDest) obj["$and"].push({ ship_to: { $in: query.fDest } });
      if (bDate) obj["$and"].push({ ship_date: { $gte: qDate.s, $lte: qDate.e } });
      if (bName) obj["$and"].push({ ship_name: { $in: query.fName } });

      // 只有当selfOwned为1或'1'时，才作为查询条件
      if (query.selfOwned === 1 || query.selfOwned === '1') {
        obj["$and"].push({ selfOwned: 1 })
      }

      // Invoice First: Pagination on Invoices first? No, we merge with Bills.
      // Logic: Fetch Invoices -> Get Bill IDs -> Fetch Bills -> Combine
      // Pagination is tricky here because it's a join.
      // Simple approach: Fetch all matching invoices first (might be large), then paginate the combined result?
      // Or paginate invoices? If we paginate invoices, we get a subset of bills.
      
      const db_invs = await Invoice.find(buildTenantQuery(req, obj))
        .select('waybill_no ship_customer ship_date shipper bills incoming_price_remark')
        .lean()
        .exec();

      if (db_invs && db_invs.length) {
        let ids = utils.getAllList(true, db_invs, "bills", "bill_id");
        let billQueryObj = { $and: [{ _id: { $in: ids } }] };
        if (bBNo) billQueryObj["$and"].push({ bill_no: { $regex: new RegExp(query.fBno, 'gi') } });
        if (bOrder) billQueryObj["$and"].push({ order_no: { $regex: new RegExp(query.fOrder, 'gi') } });

        const bills = await Bill.find(buildTenantQuery(req, billQueryObj)).lean().exec();
        if (bills && bills.length) {
          const combined = combineBill(bills, db_invs);
          const total = combined.length;
          const totalSendNum = combined.reduce((sum, b) => sum + (b.send_num || 0), 0);
          const totalSendWeight = combined.reduce((sum, b) => {
            const w = (!b.send_weight && b.block_num > 0) ? (b.send_num || 0) * (b.weight || 0) : (b.send_weight || 0);
            return sum + w;
          }, 0);
          const pagedData = isExport ? combined : combined.slice(skip, skip + limit);
          res.json({ bills: stripPriceFields(pagedData), ok: true, total, page, limit, totalSendNum, totalSendWeight });
        } else {
          res.json({ ok: false, bills: [], total: 0 });
        }
      } else {
        res.json({ ok: false, bills: [], total: 0 });
      }
    } else {  // bill first
      var showVehicles = (utils.isExist(query.fShowDestForVessel) && (query.fShowDestForVessel == 1)) ? 1 : 0;
      var showUnsend = (utils.isExist(query.fShowUnsend) && (query.fShowUnsend == 1)) ? true : false;
      var bc = !utils.isEmpty(query.fCustomerName);

      const vehList = await Vehicle.find(buildTenantQuery(req, { veh_category: '自有' })).select('name').lean().exec();
      var vehs = utils.getAllList(false, vehList, "name", "");

      if (showUnsend) {
        // ── 未配发模式：简单 Bill 查询，无需 Invoice join ──
        obj = { $and: [] };
        if (bName) obj["$and"].push({ billing_name: { $in: query.fName } });
        if (bBNo) obj["$and"].push({ bill_no: { $regex: new RegExp(query.fBno, 'gi') } });
        if (bOrder) obj["$and"].push({ order_no: { $regex: new RegExp(query.fOrder, 'gi') } });
        obj["$and"].push({ status: { $ne: '已配发' } });
        obj["$and"].push({ status: { $ne: '已结算' } });
        obj["$and"].push({ status: { $ne: '待配发' } });

        const bills = await Bill.find(buildTenantQuery(req, obj)).lean().exec();
        const total = bills.length;
        const totalUnsendWeight = bills.reduce((sum, b) => {
          const w = b.block_num > 0 ? (b.left_num || 0) * (b.weight || 0) : (b.left_num || 0);
          return sum + w;
        }, 0);
        const pagedData = isExport ? bills : bills.slice(skip, skip + limit);
        res.json({ ok: true, bills: stripPriceFields(pagedData), total, page, limit, totalSendNum: 0, totalSendWeight: 0, totalUnsendWeight });

      } else {
        // ── 聚合管道优化：从 Invoice 出发（利用 ship_date 索引），再 $lookup Bill ──
        const pipeline = [];

        // 1) 运单级过滤（从 Invoice 开始，利用 {tenantId, ship_date} 索引大幅缩小数据集）
        const invMatch = {};
        if (bDate) invMatch.ship_date = { $gte: new Date(qDate.s), $lte: new Date(qDate.e) };
        if (bDest) invMatch.ship_to = { $in: query.fDest };
        if (bFrom) invMatch.ship_from = { $in: query.fFrom };
        if (bc) invMatch.ship_customer = query.fCustomerName;
        if (bVeh) invMatch.$or = [
          { vehicle_vessel_name: { $in: query.fVeh } },
          { 'bills.vehicles.veh_name': { $in: query.fVeh } }
        ];
        if (bVehMode) {
          if (query.fVehMode === '自有') {
            const vehFilter = { $or: [
              { vehicle_vessel_name: { $in: vehs } },
              { 'bills.vehicles.veh_name': { $in: vehs } }
            ]};
            if (invMatch.$or) {
              // 已有 $or，需要用 $and 组合
              invMatch.$and = [{ $or: invMatch.$or }, vehFilter];
              delete invMatch.$or;
            } else {
              Object.assign(invMatch, vehFilter);
            }
          } else {
            invMatch.vehicle_vessel_name = { ...(invMatch.vehicle_vessel_name || {}), $nin: vehs };
            invMatch['bills.vehicles.veh_name'] = { $nin: vehs };
          }
        }
        pipeline.push({ $match: buildTenantQuery(req, invMatch) });

        // 2) 展开 Invoice.bills 数组（每个运单-提单关联变为一行）
        pipeline.push({ $unwind: '$bills' });

        // 3) $lookup 关联 Bill 集合（简单 localField/foreignField 走 _id 索引，极快）
        pipeline.push({
          $lookup: {
            from: 'bills',
            localField: 'bills.bill_id',
            foreignField: '_id',
            as: 'billDoc'
          }
        });
        pipeline.push({ $unwind: { path: '$billDoc', preserveNullAndEmptyArrays: false } });

        // 4) 提单级过滤（billing_name, bill_no, order_no）
        if (bName) pipeline.push({ $match: { 'billDoc.billing_name': { $in: query.fName } } });
        if (bBNo) pipeline.push({ $match: { 'billDoc.bill_no': { $regex: new RegExp(query.fBno, 'gi') } } });
        if (bOrder) pipeline.push({ $match: { 'billDoc.order_no': { $regex: new RegExp(query.fOrder, 'gi') } } });

        // 5) 从 Bill.invoices[] 中提取匹配当前运单的条目（binv）
        pipeline.push({ $addFields: {
          binv: { $arrayElemAt: [
            { $filter: {
              input: '$billDoc.invoices',
              as: 'inv',
              cond: { $eq: ['$$inv.inv_no', '$waybill_no'] }
            }},
            0
          ]}
        }});
        pipeline.push({ $match: { binv: { $ne: null } } });

        // 6) 车船号过滤（在 binv 级别精确匹配）
        if (bVeh) {
          pipeline.push({ $match: { 'binv.veh_ves_name': { $in: query.fVeh } } });
        }

        // 7) 车船类型过滤（自有/外挂）
        if (bVehMode) {
          if (query.fVehMode === '自有') {
            pipeline.push({ $match: { 'binv.veh_ves_name': { $in: vehs } } });
          } else {
            pipeline.push({ $match: { 'binv.veh_ves_name': { $nin: vehs } } });
          }
        }

        // 8) 目的地为船模式：展开 binv.vehicles
        if (showVehicles === 1) {
          pipeline.push({ $unwind: { path: '$binv.vehicles', preserveNullAndEmptyArrays: false } });
          if (bVeh) {
            pipeline.push({ $match: { 'binv.vehicles.veh_name': { $in: query.fVeh } } });
          }
        }

        // 9) 投影为输出格式（复现 copyBill 逻辑）
        const vehModeField = showVehicles === 1 ? '$binv.vehicles.veh_name' : '$binv.veh_ves_name';
        const vehModeExpr = vehs.length > 0
          ? {
              $cond: {
                if: { $and: [{ $ne: [vehModeField, ''] }, { $ne: [vehModeField, null] }] },
                then: { $cond: { if: { $in: [vehModeField, { $literal: vehs }] }, then: '自有', else: '外挂' } },
                else: ''
              }
            }
          : '';

        const billFields = {
          _id: '$billDoc._id',
          bill_no: '$billDoc.bill_no',
          order_no: '$billDoc.order_no',
          order_item_no: '$billDoc.order_item_no',
          brand_no: '$billDoc.brand_no',
          billing_name: '$billDoc.billing_name',
          len: '$billDoc.len',
          width: '$billDoc.width',
          thickness: '$billDoc.thickness',
          size_type: '$billDoc.size_type',
          weight: '$billDoc.weight',
          block_num: '$billDoc.block_num',
          total_weight: '$billDoc.total_weight',
          left_num: '$billDoc.left_num',
          collection_price: '$billDoc.collection_price',
          contract_no: '$billDoc.contract_no',
          sales_dep: '$billDoc.sales_dep',
          create_date: '$billDoc.create_date',
          shipping_date: '$billDoc.shipping_date',
          creater: '$billDoc.creater',
          status: '$billDoc.status',
          settle_flag: '$billDoc.settle_flag',
          product_type: '$billDoc.product_type',
          ship_warehouse: '$billDoc.ship_warehouse',
          warehouse: '$billDoc.warehouse',
          ship_customer: '$ship_customer',
          inv_ship_date: '$ship_date',
          inv_shipper: '$shipper',
          inv_settle_flag: '$binv.inv_settle_flag',
          veh_mode: vehModeExpr
        };

        if (showVehicles === 1) {
          pipeline.push({ $project: {
            ...billFields,
            inv_no: '$binv.vehicles.inner_waybill_no',
            veh_ves_name: '$binv.vehicles.veh_name',
            send_num: { $ifNull: ['$binv.vehicles.send_num', 0] },
            send_weight: { $ifNull: ['$binv.vehicles.send_weight', 0] },
            price: '$binv.vehicles.veh_price',
            ship_to: '$binv.veh_ves_name',
            ship_from: '$binv.vehicles.veh_ship_from',
          }});
        } else {
          pipeline.push({ $project: {
            ...billFields,
            inv_no: '$binv.inv_no',
            veh_ves_name: '$binv.veh_ves_name',
            send_num: { $ifNull: ['$binv.num', 0] },
            send_weight: {
              $cond: {
                if: { $gt: [{ $ifNull: ['$billDoc.block_num', 0] }, 0] },
                then: { $multiply: [{ $ifNull: ['$billDoc.weight', 0] }, { $ifNull: ['$binv.num', 0] }] },
                else: { $ifNull: ['$binv.weight', 0] }
              }
            },
            price: '$binv.price',
            veh_ves_price: '$binv.veh_ves_price',
            ship_to: '$binv.ship_to',
            ship_from: '$binv.ship_from',
          }});
        }

        // 10) $facet：并行计算汇总和分页数据
        if (isExport) {
          const countPipeline = [...pipeline, { $group: {
            _id: null,
            total: { $sum: 1 },
            totalSendNum: { $sum: { $ifNull: ['$send_num', 0] } },
            totalSendWeight: { $sum: { $ifNull: ['$send_weight', 0] } }
          }}];
          const [countResult] = await Invoice.aggregate(countPipeline).allowDiskUse(true).exec();
          const allData = await Invoice.aggregate(pipeline).allowDiskUse(true).exec();

          await applySettleStatus(req, allData);

          const meta = countResult || { total: 0, totalSendNum: 0, totalSendWeight: 0 };
          res.json({ ok: true, bills: stripPriceFields(allData), total: meta.total, page, limit, totalSendNum: meta.totalSendNum, totalSendWeight: meta.totalSendWeight, totalUnsendWeight: 0 });
        } else {
          pipeline.push({
            $facet: {
              metadata: [{ $group: {
                _id: null,
                total: { $sum: 1 },
                totalSendNum: { $sum: { $ifNull: ['$send_num', 0] } },
                totalSendWeight: { $sum: { $ifNull: ['$send_weight', 0] } }
              }}],
              data: [{ $skip: skip }, { $limit: limit }]
            }
          });

          const [result] = await Invoice.aggregate(pipeline).allowDiskUse(true).exec();
          const meta = (result.metadata && result.metadata[0]) || { total: 0, totalSendNum: 0, totalSendWeight: 0 };
          const pagedData = result.data || [];

          await applySettleStatus(req, pagedData);

          res.json({ ok: true, bills: stripPriceFields(pagedData), total: meta.total, page, limit, totalSendNum: meta.totalSendNum, totalSendWeight: meta.totalSendWeight, totalUnsendWeight: 0 });
        }
      }
    }
  } catch (err) {
    console.error("getIntegratedQuery error:", err);
    res.json({ ok: false, error: err.message });
  }
};

exports.getInvoiceReport = async function (req, res) {
  const query = req.query;
  const obj = { $and: [] };

  if (query.fDest) {
    obj.$and.push({ ship_to: query.fDest });
  }

  if (!utils.isEmpty(query.fDate1) && !utils.isEmpty(query.fDate2)) {
    const qDate = getStartEndDate(query.fDate1, query.fDate2, true);
    obj.$and.push({ ship_date: { $gte: qDate.s, $lte: qDate.e } });
  }

  if (query.fName) {
    obj.$and.push({ ship_name: query.fName });
  }

  if (query.fVeh) {
    obj.$and.push({ vehicle_vessel_name: query.fVeh });
  }

  if (query.fShipper) {
    obj.$and.push({ shipper: query.fShipper });
  }

  if (obj.$and.length === 0) {
    delete obj.$and;
  }

  try {
    const db_invs = await Invoice.find(buildTenantQuery(req, obj)).sort({ ship_date: 'desc' }).lean().exec();
    if (db_invs && db_invs.length > 0) {
      if (db_invs.length > 150) {
        return res.json({ ok: true, hint: true, num: db_invs.length, invs: db_invs });
      }

      const ids = utils.getAllList(true, db_invs, "bills", "bill_id");
      const bills = await Bill.find(buildTenantQuery(req, { _id: { $in: ids } })).lean().exec();
      
      if (!bills || bills.length === 0) {
        return res.json({ ok: false, message: '未找到相关提单' });
      }

      const prices = {};
      db_invs.forEach(function (inv) {
        let customer_price = 0;
        let veh_price = inv.vessel_price > 0 ? inv.vessel_price * inv.total_weight : 0;

        inv.bills.forEach(function (b) {
          const bill = bills.find(item => String(item._id) === String(b.bill_id));
          if (bill) {
            const invRecord = bill.invoices.find(ir => ir.inv_no === inv.waybill_no);
            if (invRecord) {
              let w = invRecord.weight;
              if ((!w || w === 0) && bill.block_num > 0) {
                w = invRecord.num * bill.weight;
              }

              let p = invRecord.price > 0 ? invRecord.price : 0;
              p += bill.collection_price > 0 ? bill.collection_price : 0;
              customer_price += p * w;
            }
          }
        });

        const c = customer_price / inv.total_weight;
        const v = veh_price / inv.total_weight;
        prices[inv.waybill_no] = {
          cust_price: utils.toFixedNumber(c, 3),
          veh_price: utils.toFixedNumber(v, 3),
          net_income: utils.toFixedNumber(c - v, 3)
        };
      });

      res.json({ ok: true, hint: false, invs: db_invs, prices: prices });
    } else {
      res.json({ ok: false, message: '未找到符合条件的运单' });
    }
  } catch (err) {
    console.error("getInvoiceReport error:", err);
    res.json({ ok: false, error: err.message });
  }
};
