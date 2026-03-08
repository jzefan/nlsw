const Invoice = require('../../models/Invoice');
const Bill = require('../../models/Bill');
const Settle = require('../../models/Settle');
const Vehicle = require('../../models/Vehicle');
const utils = require('../../controllers/utils');
const { buildTenantQuery, isPlatformUser } = require('../../utils/tenant');
const { isAdmin: isAdminPrivilege } = require('../../utils/permissions');

// 财务月日期解析：YYYY-MM → 上月26日 00:00:00 ~ 本月25日 23:59:59
function parseFiscalDateRange(startYM, endYM) {
  const [startY, startM] = startYM.split('-').map(Number);
  const [endY, endM] = endYM.split('-').map(Number);

  // 财务月开始：上月26日
  const startDate = startM === 1
    ? new Date(startY - 1, 11, 26, 0, 0, 0)
    : new Date(startY, startM - 2, 26, 0, 0, 0);

  // 财务月结束：当月25日
  const endDate = new Date(endY, endM - 1, 25, 23, 59, 59, 999);

  return { startDate, endDate };
}

function parseFiscalYearRange(year) {
  // 财务年：上年12月26日 ~ 本年12月25日
  return {
    startDate: new Date(year - 1, 11, 26, 0, 0, 0),
    endDate: new Date(year, 11, 25, 23, 59, 59, 999)
  };
}

// Helper function: Search DB Data
async function searchDbData(req, res, query, inv_f_selected, bill_f_selected) {
  var obj = { $and: [{ state: { $ne: '新建' } }] };

  if (query.fDate1 && query.fDate2) {
    var qDate = getStartEndDate(query.fDate1, query.fDate2, false);
    obj["$and"].push({ ship_date: { $gte: qDate.s, $lte: qDate.e } });
  }

  if (query.fName && query.fName.length) {
    // If fName is a string (single value), convert to array
    const names = Array.isArray(query.fName) ? query.fName : [query.fName];
    obj["$and"].push({ ship_name: { $in: names } });
  }

  try {
    let invQuery = Invoice.find(buildTenantQuery(req, obj));
    if (inv_f_selected) {
      invQuery.select(inv_f_selected);
    }
    const db_invs = await invQuery.lean().exec();

    if (!db_invs || db_invs.length === 0) {
      return { ok: true, db_invs: [], bills: [] };
    }

    const ids = utils.getAllList(true, db_invs, "bills", "bill_id");
    let billQuery = Bill.find(buildTenantQuery(req, { _id: { $in: ids } }));
    if (bill_f_selected) {
      billQuery.select(bill_f_selected);
    }
    const bills = await billQuery.lean().exec();

    if (!bills || bills.length === 0) {
      return { ok: true, db_invs, bills: [] };
    }

    return { ok: true, db_invs, bills };
  } catch (err) {
    console.error("searchDbData error:", err);
    return { ok: false, error: err.message };
  }
}

function getStartEndDate(start, end, isDay) {
  if (start === end) {
    var d1 = utils.convertDateToUTC(new Date(start));
    var d2 = utils.convertDateToUTC(new Date(end));
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

/**
 * Get Customer Statistics Data
 */
exports.getStatisticsDataByCondition = async function (req, res) {
  try {
    // Ensure fName is handled correctly if it's "undefined" or empty string
    if (req.query.fName === 'undefined' || req.query.fName === '') {
      delete req.query.fName;
    }

    const searchResult = await searchDbData(req, res, req.query, 'waybill_no ship_name ship_date bills', 'billing_name block_num weight collection_price invoices');
    if (!searchResult.ok) {
      return res.json({ ok: false, error: searchResult.error });
    }
    const { db_invs, bills } = searchResult;

    var allNames = [];
    var invNoObj = {};
    var inv;

    for (var i = 0, len = db_invs.length; i < len; ++i) {
      inv = db_invs[i];
      if (inv.ship_name && allNames.indexOf(inv.ship_name) < 0) {
        allNames.push(inv.ship_name);
      }
      invNoObj[inv.waybill_no] = i;
    }

    allNames.sort(function (a, b) { return a.localeCompare(b); });

    var resultData = [];
    var nameIndexObj = {};
    for (i = 0, len = allNames.length; i < len; ++i) {
      resultData.push({
        name: allNames[i],
        settledWDS: 0, notSettledWDS: 0, notNeedWDS: 0,
        settledWZT: 0, notSettledWZT: 0, notNeedWZT: 0, totalWeight: 0, totalPrice: 0,
        settledPDS: 0, notSettledPDS: 0,
        settledPZT: 0, notSettledPZT: 0 // 金额
      });
      nameIndexObj[allNames[i]] = i;
    }

    for (i = 0, len = bills.length; i < len; ++i) {
      var b = bills[i];
      var nameIdx = nameIndexObj[b.billing_name];
      if (nameIdx >= 0) {
        var tmp = resultData[nameIdx];
        for (var k = 0, klen = b.invoices.length; k < klen; ++k) {
          inv = b.invoices[k];
          if (invNoObj[inv.inv_no] >= 0) {
            var weight = (b.block_num > 0) ? inv.num * b.weight : inv.weight;
            var ds_price = (b.collection_price > 0) ? b.collection_price * weight : 0;
            var zt_price = (inv.price > 0) ? inv.price * weight : 0;

            tmp.totalWeight += weight;
            tmp.totalPrice += ds_price + zt_price;

            if (inv.inv_settle_flag === 0) {
              if (b.collection_price < 0) {
                tmp.notNeedWDS += weight;
              } else if (b.collection_price > 0) { // DS 未结算，但是有价格
                tmp.notSettledWDS += weight;
                tmp.notSettledPDS += ds_price;
              } else {
                tmp.notSettledWDS += weight;
              }

              if (inv.price < 0) {
                tmp.notNeedWZT += weight;
              } else if (inv.price > 0) {
                tmp.notSettledWZT += weight;
                tmp.notSettledPZT += zt_price;
              } else {
                tmp.notSettledWZT += weight;
              }
            }
            else if (inv.inv_settle_flag === 1) { // 客户结算, 代收未结算或不需要结算
              if (b.collection_price < 0) {
                tmp.notNeedWDS += weight;
              } else if (b.collection_price > 0) {
                tmp.notSettledWDS += weight;
                tmp.notSettledPDS += ds_price;
              } else {
                tmp.notSettledWDS += weight;
              }

              tmp.settledWZT += weight;
              tmp.settledPZT += zt_price;
            }
            else if (inv.inv_settle_flag === 2) { // 代收结算, 客户未结算或不需要结算
              if (inv.price < 0) {
                tmp.notNeedWZT += weight;
              } else if (inv.price > 0) {
                tmp.notSettledWZT += weight;
                tmp.notSettledPZT += zt_price;
              } else {
                tmp.notSettledWZT += weight;
              }

              tmp.settledWDS += weight;
              tmp.settledPDS += ds_price;
            }
            else if (inv.inv_settle_flag === 3) {
              tmp.settledWZT += weight;
              tmp.settledPZT += zt_price;
              tmp.settledWDS += weight;
              tmp.settledPDS += ds_price;
            }
          }
        }
      }
    }

    for (i = 0, len = resultData.length; i < len; ++i) {
      var item = resultData[i];
      item.settledWDS = utils.toFixedNumber(item.settledWDS, 3);
      item.settledWZT = utils.toFixedNumber(item.settledWZT, 3);
      item.notSettledWDS = utils.toFixedNumber(item.notSettledWDS, 3);
      item.notSettledWZT = utils.toFixedNumber(item.notSettledWZT, 3);
      item.notNeedWDS = utils.toFixedNumber(item.notNeedWDS, 3);
      item.notNeedWZT = utils.toFixedNumber(item.notNeedWZT, 3);
      item.totalWeight = utils.toFixedNumber(item.totalWeight, 3);
      item.totalPrice = utils.toFixedNumber(item.totalPrice, 3);
      item.settledPDS = utils.toFixedNumber(item.settledPDS, 3);
      item.settledPZT = utils.toFixedNumber(item.settledPZT, 3);
      item.notSettledPDS = utils.toFixedNumber(item.notSettledPDS, 3);
      item.notSettledPZT = utils.toFixedNumber(item.notSettledPZT, 3);
    }

    res.json({ ok: true, names: allNames, stat_data: resultData });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
};

/**
 * Get Customer Detail Data
 */
exports.getCustomerDetail = async function (req, res) {
  try {
     // Ensure fName is handled correctly if it's "undefined" or empty string
     if (req.query.fName === 'undefined' || req.query.fName === '') {
      delete req.query.fName;
    }
    
    const searchResult = await searchDbData(req, res, req.query, 'waybill_no ship_name ship_customer ship_date bills', null);
    if (!searchResult.ok) {
      return res.json({ ok: false, error: searchResult.error });
    }
    const { db_invs: invs, bills } = searchResult;
    
    var invNoObj = {};
    for (var i = 0, len = invs.length; i < len; ++i) {
      invNoObj[invs[i].waybill_no] = i;
    }

    var resultData = [];
    for (i = 0, len = bills.length; i < len; ++i) {
      var bill = bills[i];
      bill.invoices.forEach(function (inv) {
        var idx = invNoObj[inv.inv_no];
        if (idx >= 0) {
          var weight = (bill.block_num > 0) ? inv.num * bill.weight : inv.weight;
          var price = 0;
          if (bill.collection_price > 0) {
            price += bill.collection_price * weight;
          }
          if (inv.price > 0) {
            price += inv.price * weight;
          }

          resultData.push({
            order: bill.order_no + '-' + utils.leftPad(bill.order_item_no, 3), // Format order number
            bill_no: bill.bill_no,
            name: (invs[idx].ship_customer ? (invs[idx].ship_name + "/" + invs[idx].ship_customer) : invs[idx].ship_name),
            veh_ves_name: inv.veh_ves_name,
            ship_to: inv.ship_to,
            coll_price: bill.collection_price.toFixed(3),
            price: inv.price.toFixed(3),
            tot_price: price.toFixed(3),
            send_num: inv.num,
            send_weight: weight.toFixed(3),
            ship_date: invs[idx].ship_date,
            inv_no: inv.inv_no,
            warehouse: (bill.ship_warehouse ? bill.ship_warehouse : ''),
            spec: bill.len + "*" + (bill.width > 0 ? bill.width.toFixed(3) : 0) + "*" + (bill.thickness > 0 ? bill.thickness.toFixed(3) : 0),
            brand_no: bill.brand_no,
            contract_no: (bill.contract_no ? bill.contract_no : '')
          });
        }
      });
    }

    res.json({ ok: true, detail_data: resultData });
  } catch(err) {
    res.json({ ok: false, error: err.message });
  }
};

/**
 * Get Customer Chart Data - 按月份返回代收金额和自提金额
 */
exports.getCustomerChartData = async function (req, res) {
  var query = req.query;
  var months = query.fMonths || [];

  try {
    // Ensure fName is handled correctly if it's "undefined" or empty string
    if (req.query.fName === 'undefined' || req.query.fName === '') {
      delete req.query.fName;
    }

    const searchResult = await searchDbData(req, res, query, 'waybill_no ship_name ship_date bills', 'billing_name block_num weight collection_price invoices');
    if (!searchResult.ok) {
      return res.json({ ok: false, error: searchResult.error });
    }
    const { db_invs, bills } = searchResult;

    var invNoObj = {};
    var chartData = [];

    // 初始化每个月的数据结构
    for (var idx = 0; idx < months.length; ++idx) {
      chartData.push({
        month: months[idx],
        daishouPrice: 0,  // 代收金额
        zitiPrice: 0      // 自提金额
      });
    }

    // 建立运单号到月份索引的映射
    for (var i = 0, len = db_invs.length; i < len; ++i) {
      var inv = db_invs[i];
      var shipDate = new Date(inv.ship_date);
      var year = shipDate.getFullYear();
      var month = (shipDate.getMonth() + 1).toString().padStart(2, '0');
      var dateStr = year + '-' + month;

      var monthIdx = months.indexOf(dateStr);
      invNoObj[inv.waybill_no] = { index: monthIdx };
    }

    // 计算每个月的代收和自提金额
    for (i = 0, len = bills.length; i < len; ++i) {
      var b = bills[i];
      b.invoices.forEach(function (inv) {
        var shipInfo = invNoObj[inv.inv_no];
        if (shipInfo && shipInfo.index >= 0) {
          var weight = (b.block_num > 0) ? inv.num * b.weight : inv.weight;

          // 代收金额
          if (b.collection_price > 0) {
            chartData[shipInfo.index].daishouPrice += b.collection_price * weight;
          }

          // 自提金额
          if (inv.price > 0) {
            chartData[shipInfo.index].zitiPrice += inv.price * weight;
          }
        }
      });
    }

    // 格式化数字
    for (idx = 0; idx < chartData.length; ++idx) {
      chartData[idx].daishouPrice = utils.toFixedNumber(chartData[idx].daishouPrice, 3);
      chartData[idx].zitiPrice = utils.toFixedNumber(chartData[idx].zitiPrice, 3);
    }

    res.json({ ok: true, chart_data: chartData });
  } catch(err) {
    res.json({ ok: false, error: err.message });
  }
};

/**
 * Get Dashboard Statistics
 * 1. Admin views all, Salesman views self (based on shipper field)
 * 2. Total Tonnage, Monthly Trend, Billing Name Count, Top 5 Lists
 */
exports.getDashboardStatistics = async function (req, res) {
  try {
    const user = req.user || { userid: 'admin', privilege: ['admin'] };
    const isAdmin = isAdminPrivilege(user.privilege);

    let startDate, endDate;
    if (req.query.startDate && req.query.endDate) {
      ({ startDate, endDate } = parseFiscalDateRange(req.query.startDate, req.query.endDate));
    } else {
      const year = parseInt(req.query.year) || new Date().getFullYear();
      ({ startDate, endDate } = parseFiscalYearRange(year));
    }

    const matchStage = {
      ship_date: { $gte: startDate, $lte: endDate },
      state: { $ne: '新建' }
    };

    if (!isAdmin) {
      matchStage.shipper = user.userid;
    }

    const facetPipeline = [];
    if (!isPlatformUser(req)) {
      facetPipeline.push({ $match: { tenantId: req.tenantId } });
    }
    facetPipeline.push(
      { $match: matchStage },
      {
        $facet: {
          totalStats: [
            {
              $group: {
                _id: null,
                totalTonnage: { $sum: '$total_weight' },
                billingNames: { $addToSet: '$ship_name' }
              }
            }
          ],
          monthlyTrend: [
            {
              $group: {
                _id: {
                  year: { $year: '$ship_date' },
                  month: { $month: '$ship_date' }
                },
                weight: { $sum: '$total_weight' }
              }
            },
            { $sort: { '_id.year': 1, '_id.month': 1 } }
          ],
          byBillingName: [
            {
              $group: {
                _id: '$ship_name',
                weight: { $sum: '$total_weight' }
              }
            },
            { $sort: { weight: -1 } }
          ],
          byVehicle: [
            {
              $group: {
                _id: '$vehicle_vessel_name',
                weight: { $sum: '$total_weight' },
                total_price: {
                  $sum: {
                    $cond: {
                      if: { $eq: [{ $ifNull: ['$price_mode', 0] }, 1] },
                      then: { $ifNull: ['$vessel_price', 0] }, // 打包价：直接取价格
                      else: { $multiply: [{ $ifNull: ['$vessel_price', 0] }, { $ifNull: ['$total_weight', 0] }] } // 每吨价：单价×重量
                    }
                  }
                }
              }
            },
            { $sort: { weight: -1 } }
          ],
          // 内部车辆（装船的车）：从船运单的 bills.vehicles 中提取
          byInnerVehicle: [
            { $unwind: '$bills' },
            { $unwind: '$bills.vehicles' },
            {
              $group: {
                _id: '$bills.vehicles.veh_name',
                weight: { $sum: '$bills.vehicles.send_weight' },
                total_price: {
                  $sum: {
                    $cond: {
                      if: { $eq: [{ $ifNull: ['$bills.vehicles.price_mode', 0] }, 1] },
                      then: { $ifNull: ['$bills.vehicles.veh_price', 0] },
                      else: { $multiply: [{ $ifNull: ['$bills.vehicles.veh_price', 0] }, { $ifNull: ['$bills.vehicles.send_weight', 0] }] }
                    }
                  }
                }
              }
            },
            { $sort: { weight: -1 } }
          ],
          // 按车辆+月份分组（主运单级别）
          byVehicleMonthly: [
            {
              $group: {
                _id: {
                  vehicle: '$vehicle_vessel_name',
                  year: { $year: '$ship_date' },
                  month: { $month: '$ship_date' }
                },
                weight: { $sum: '$total_weight' }
              }
            }
          ],
          // 按内部车辆+月份分组
          byInnerVehicleMonthly: [
            { $unwind: '$bills' },
            { $unwind: '$bills.vehicles' },
            {
              $group: {
                _id: {
                  vehicle: '$bills.vehicles.veh_name',
                  year: { $year: '$ship_date' },
                  month: { $month: '$ship_date' }
                },
                weight: { $sum: '$bills.vehicles.send_weight' }
              }
            }
          ]
        }
      }
    );

    const results = await Invoice.aggregate(facetPipeline).exec();
    const data = results[0];

    const totalTonnage = data.totalStats[0] ? data.totalStats[0].totalTonnage : 0;
    const billingNameCount = data.totalStats[0] ? data.totalStats[0].billingNames.length : 0;

    // Format monthly trend with YYYY-MM
    const monthlyTrend = data.monthlyTrend.map(item => ({
      date: `${item._id.year}-${String(item._id.month).padStart(2, '0')}`,
      weight: parseFloat(item.weight.toFixed(3))
    }));

    // Helper to format list
    const formatList = (list) => list.map(i => ({ name: i._id || '未命名', value: parseFloat(i.weight.toFixed(3)) }));

    const top10BillingNames = formatList(data.byBillingName.slice(0, 10));
    const top5Vehicles = formatList(data.byVehicle.slice(0, 5));

    // 已开票吨数: 从Settle获取，status = '已开票' OR status = '已回款' (两种状态之和)
    // 已回款吨数: 从Settle获取，status = '已回款'
    const settleMatchStage = {
      settle_date: { $gte: startDate, $lte: endDate }
    };

    if (!isAdmin) {
      settleMatchStage.settler = user.userid;
    }

    const settlePipeline = [];
    if (!isPlatformUser(req)) {
      settlePipeline.push({ $match: { tenantId: req.tenantId } });
    }
    settlePipeline.push(
      { $match: settleMatchStage },
      {
        $group: {
          _id: null,
          settledTonnage: { $sum: '$ship_weight' },
          invoiceTonnage: {
            $sum: {
              $cond: [
                { $in: ['$status', ['已开票', '已回款']] },
                '$ship_weight',
                0
              ]
            }
          },
          paymentTonnage: {
            $sum: {
              $cond: [
                { $eq: ['$status', '已回款'] },
                '$ship_weight',
                0
              ]
            }
          }
        }
      }
    );
    const settleTonnageResult = await Settle.aggregate(settlePipeline).exec();

    const totalSettledTonnage = settleTonnageResult[0] ? settleTonnageResult[0].settledTonnage : 0;
    const totalInvoiceTonnage = settleTonnageResult[0] ? settleTonnageResult[0].invoiceTonnage : 0;
    const totalPaymentTonnage = settleTonnageResult[0] ? settleTonnageResult[0].paymentTonnage : 0;

    // 计算车辆分类统计
    // 从 byVehicle + byInnerVehicle 获取所有车船名称
    const vehicleNames = data.byVehicle.map(v => v._id).filter(name => name);
    const innerVehicleNames = data.byInnerVehicle.map(v => v._id).filter(name => name);
    const allVehicleNames = [...new Set([...vehicleNames, ...innerVehicleNames])];

    // 查询Vehicle表获取车辆信息
    const vehicles = await Vehicle.find(buildTenantQuery(req, { name: { $in: allVehicleNames } }))
      .select('name veh_type veh_category')
      .lean()
      .exec();

    // 创建车辆信息映射
    const vehicleInfoMap = {};
    vehicles.forEach(v => {
      vehicleInfoMap[v.name] = {
        veh_type: v.veh_type,
        veh_category: v.veh_category
      };
    });

    // === 未结算统计 ===
    const shipVehicleNames = Object.entries(vehicleInfoMap)
      .filter(([, info]) => info && info.veh_type === '船')
      .map(([name]) => name);

    const unsettledDateQuery = { ship_date: matchStage.ship_date };
    if (!isAdmin) unsettledDateQuery.shipper = user.userid;

    // 1. 车运到船未结算：船运单中 bills.vehicles.send_weight 之和
    //    定尺提单 send_weight=0 时用 send_num * 单块重
    let truckToShipUnsettledTonnage = 0;
    if (shipVehicleNames.length > 0) {
      const shipInvoices = await Invoice.find(
        buildTenantQuery(req, { ...unsettledDateQuery, state: { $ne: '新建' }, vehicle_vessel_name: { $in: shipVehicleNames } })
      ).select('bills').lean();

      const shipBillIds = [];
      shipInvoices.forEach(inv => {
        inv.bills?.forEach(b => { if (b.bill_id) shipBillIds.push(b.bill_id); });
      });

      const shipBillDocs = await Bill.find(
        buildTenantQuery(req, { _id: { $in: shipBillIds } })
      ).select('weight size_type').lean();

      const billInfoMap = {};
      shipBillDocs.forEach(b => {
        billInfoMap[b._id.toString()] = { weight: b.weight, size_type: b.size_type };
      });

      shipInvoices.forEach(inv => {
        inv.bills?.forEach(b => {
          const billInfo = billInfoMap[b.bill_id?.toString()];
          b.vehicles?.forEach(v => {
            let w = v.send_weight || 0;
            if (w === 0 && billInfo && billInfo.size_type === '定尺' && billInfo.weight && v.send_num) {
              w = v.send_num * billInfo.weight;
            }
            truckToShipUnsettledTonnage += w;
          });
        });
      });
    }

    // 2. 客户/代收代付 未结算：参考 settle/bills 接口逻辑
    //    state='已配发'或'新建'，$lookup Bill，按 collection_price 区分类型
    const clientPipeline = [];
    if (!isPlatformUser(req)) {
      clientPipeline.push({ $match: { tenantId: req.tenantId } });
    }
    const clientMatchConds = [
      { ship_date: { $gte: startDate, $lte: endDate } },
      { state: { $in: ['已配发', '新建'] } }
    ];
    if (!isAdmin) clientMatchConds.push({ shipper: user.userid });

    clientPipeline.push(
      { $match: { $and: clientMatchConds } },
      { $unwind: { path: '$bills', preserveNullAndEmptyArrays: false } },
      {
        $lookup: {
          from: 'bills',
          let: { billId: '$bills.bill_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$_id', '$$billId'] } } },
            { $project: { weight: 1, collection_price: 1 } }
          ],
          as: 'billInfo'
        }
      },
      { $unwind: { path: '$billInfo', preserveNullAndEmptyArrays: false } },
      // send_weight: bills.weight，为0时回退 bills.num * 单块重
      {
        $addFields: {
          send_weight: {
            $cond: {
              if: { $gt: [{ $ifNull: ['$bills.weight', 0] }, 0] },
              then: '$bills.weight',
              else: { $multiply: [{ $ifNull: ['$bills.num', 0] }, { $ifNull: ['$billInfo.weight', 0] }] }
            }
          }
        }
      },
      {
        $group: {
          _id: null,
          // collection_price = -1 或 null → 客户结算
          customerUnsettled: {
            $sum: {
              $cond: [
                { $or: [
                  { $eq: ['$billInfo.collection_price', -1] },
                  { $eq: ['$billInfo.collection_price', null] }
                ]},
                '$send_weight',
                0
              ]
            }
          },
          // collection_price != -1 且非 null → 代收代付（南钢）
          collectionUnsettled: {
            $sum: {
              $cond: [
                { $and: [
                  { $ne: ['$billInfo.collection_price', -1] },
                  { $ne: ['$billInfo.collection_price', null] }
                ]},
                '$send_weight',
                0
              ]
            }
          }
        }
      }
    );

    const clientResult = await Invoice.aggregate(clientPipeline).exec();
    const customerUnsettledTonnage = clientResult[0]?.customerUnsettled || 0;
    const collectionUnsettledTonnage = clientResult[0]?.collectionUnsettled || 0;

    // 统计各分类的数量和吨数，同时构建包含车辆信息的allVehicles
    let ownVehicleCount = 0;
    let ownVehicleTonnage = 0;
    let outsourcedVehicleCount = 0;
    let outsourcedVehicleTonnage = 0;
    let truckTonnage = 0;
    let vesselTonnage = 0;

    // 用 Map 按车船名称合并数据
    const vehicleMap = new Map();

    // 主运单级别车辆（vehicle_vessel_name）
    data.byVehicle.forEach(v => {
      const vehicleName = v._id || '未命名';
      const tonnage = v.weight;
      const price = v.total_price || 0;
      const info = vehicleInfoMap[vehicleName];

      if (info) {
        if (info.veh_category === '自有') {
          ownVehicleCount++;
          ownVehicleTonnage += tonnage;
        } else if (info.veh_category === '外挂') {
          outsourcedVehicleCount++;
          outsourcedVehicleTonnage += tonnage;
        }
        if (info.veh_type === '车') {
          truckTonnage += tonnage;
        } else if (info.veh_type === '船') {
          vesselTonnage += tonnage;
        }
      }

      vehicleMap.set(vehicleName, {
        name: vehicleName,
        value: tonnage,
        to_customer: (info && info.veh_type === '车') ? tonnage : 0,
        to_ship: 0,
        total_price: price,
        veh_type: info ? info.veh_type : '',
        veh_category: info ? info.veh_category : ''
      });
    });

    // 内部车辆（装船的车）— 合并到船吨数
    data.byInnerVehicle.forEach(v => {
      const vehicleName = v._id;
      if (!vehicleName) return;
      const tonnage = v.weight;
      const price = v.total_price || 0;
      const info = vehicleInfoMap[vehicleName];

      const existing = vehicleMap.get(vehicleName);
      if (existing) {
        // 同一辆车既有到客户又有到船
        existing.to_ship += tonnage;
        existing.value += tonnage;
        existing.total_price += price;
      } else {
        // 仅作为内部车辆出现（只到船）
        vehicleMap.set(vehicleName, {
          name: vehicleName,
          value: tonnage,
          to_customer: 0,
          to_ship: tonnage,
          total_price: price,
          veh_type: '车',
          veh_category: info ? info.veh_category : ''
        });
      }
    });

    // 构建每个车辆的月度趋势
    const vehicleMonthlyMap = new Map(); // vehicleName -> Map(YYYY-MM -> weight)

    const addMonthlyWeight = (vehicleName, year, month, weight) => {
      if (!vehicleName) return;
      if (!vehicleMonthlyMap.has(vehicleName)) {
        vehicleMonthlyMap.set(vehicleName, new Map());
      }
      const dateKey = `${year}-${String(month).padStart(2, '0')}`;
      const monthMap = vehicleMonthlyMap.get(vehicleName);
      monthMap.set(dateKey, (monthMap.get(dateKey) || 0) + weight);
    };

    data.byVehicleMonthly.forEach(item => {
      addMonthlyWeight(item._id.vehicle, item._id.year, item._id.month, item.weight);
    });

    data.byInnerVehicleMonthly.forEach(item => {
      addMonthlyWeight(item._id.vehicle, item._id.year, item._id.month, item.weight);
    });

    const allVehicles = Array.from(vehicleMap.values()).map(v => {
      const monthMap = vehicleMonthlyMap.get(v.name);
      const monthlyTrend = monthMap
        ? Array.from(monthMap.entries())
            .map(([date, weight]) => ({ date, weight: parseFloat(weight.toFixed(3)) }))
            .sort((a, b) => a.date.localeCompare(b.date))
        : [];

      return {
        name: v.name,
        value: parseFloat(v.value.toFixed(3)),
        to_customer: parseFloat(v.to_customer.toFixed(3)),
        to_ship: parseFloat(v.to_ship.toFixed(3)),
        total_price: parseFloat(v.total_price.toFixed(2)),
        veh_type: v.veh_type,
        veh_category: v.veh_category,
        monthlyTrend
      };
    }).sort((a, b) => b.value - a.value);

    res.json({
      ok: true,
      data: {
        totalTonnage: parseFloat(totalTonnage.toFixed(3)),
        truckToShipUnsettledTonnage: parseFloat(truckToShipUnsettledTonnage.toFixed(3)),
        customerUnsettledTonnage: parseFloat(customerUnsettledTonnage.toFixed(3)),
        collectionUnsettledTonnage: parseFloat(collectionUnsettledTonnage.toFixed(3)),
        totalSettledTonnage: parseFloat(totalSettledTonnage.toFixed(3)),
        totalInvoiceTonnage: parseFloat(totalInvoiceTonnage.toFixed(3)),
        totalPaymentTonnage: parseFloat(totalPaymentTonnage.toFixed(3)),
        billingNameCount,
        monthlyTrend,
        top10BillingNames,
        top5Vehicles,
        allVehicles,
        // 车辆分类统计
        ownVehicleCount,
        ownVehicleTonnage: parseFloat(ownVehicleTonnage.toFixed(3)),
        outsourcedVehicleCount,
        outsourcedVehicleTonnage: parseFloat(outsourcedVehicleTonnage.toFixed(3)),
        truckTonnage: parseFloat(truckTonnage.toFixed(3)),
        vesselTonnage: parseFloat(vesselTonnage.toFixed(3))
      }
    });

  } catch (err) {
    console.error('getDashboardStatistics error:', err);
    res.json({ ok: false, error: err.message });
  }
};

/**
 * Get invoice details for dashboard drill-down (总配发吨数)
 */
exports.getDashboardInvoiceDetails = async function (req, res) {
  try {
    const user = req.user || { userid: 'admin', privilege: ['admin'] };
    const isAdmin = isAdminPrivilege(user.privilege);

    let startDate, endDate;
    if (req.query.startDate && req.query.endDate) {
      ({ startDate, endDate } = parseFiscalDateRange(req.query.startDate, req.query.endDate));
    } else {
      const year = parseInt(req.query.year) || new Date().getFullYear();
      ({ startDate, endDate } = parseFiscalYearRange(year));
    }

    const matchStage = {
      ship_date: { $gte: startDate, $lte: endDate },
      state: { $ne: '新建' }
    };

    if (!isAdmin) {
      matchStage.shipper = user.userid;
    }

    // Get invoices with required fields
    const invoices = await Invoice.find(buildTenantQuery(req, matchStage))
      .select('waybill_no vehicle_vessel_name ship_name ship_date total_weight vessel_price bills')
      .lean()
      .exec();

    // Get all bill IDs from invoices
    const billIds = [];
    invoices.forEach(inv => {
      if (inv.bills) {
        inv.bills.forEach(b => {
          if (b.bill_id) billIds.push(b.bill_id);
        });
      }
    });

    // Get bill details to calculate customer and collection prices
    const bills = await Bill.find(buildTenantQuery(req, { _id: { $in: billIds } }))
      .select('_id collection_price weight')
      .lean()
      .exec();

    // Create bill map for quick lookup
    const billMap = {};
    bills.forEach(bill => {
      billMap[bill._id.toString()] = bill;
    });

    // Process invoices to calculate prices
    const data = invoices.map(inv => {
      let customerPrice = 0;
      let collectionPrice = 0;
      let totalWeight = 0;

      if (inv.bills) {
        inv.bills.forEach(b => {
          const billId = b.bill_id ? b.bill_id.toString() : null;
          const bill = billId ? billMap[billId] : null;

          if (bill) {
            const weight = b.weight || 0;
            totalWeight += weight;

            // collection_price is the customer price per ton
            if (bill.collection_price) {
              customerPrice += weight * bill.collection_price;
            }
          }
        });
      }

      // Use invoice total_weight if calculated weight is 0
      if (totalWeight === 0) {
        totalWeight = inv.total_weight || 0;
      }

      const vehiclePrice = inv.vessel_price || 0;

      // Calculate total: income (customer) - expense (vehicle + collection)
      const totalIncome = customerPrice;
      const totalExpense = vehiclePrice + collectionPrice;
      const netProfit = totalIncome - totalExpense;

      return {
        waybill_no: inv.waybill_no,
        vehicle: inv.vehicle_vessel_name || '-',
        billingName: inv.ship_name || '-',
        shipDate: inv.ship_date,
        tonnage: parseFloat((totalWeight).toFixed(3)),
        vehiclePrice: parseFloat(vehiclePrice.toFixed(2)),
        customerPrice: parseFloat(customerPrice.toFixed(2)),
        collectionPrice: parseFloat(collectionPrice.toFixed(2)),
        totalIncome: parseFloat(totalIncome.toFixed(2)),
        totalExpense: parseFloat(totalExpense.toFixed(2)),
        netProfit: parseFloat(netProfit.toFixed(2))
      };
    });

    res.json({ ok: true, data });
  } catch (err) {
    console.error('getDashboardInvoiceDetails error:', err);
    res.json({ ok: false, error: err.message });
  }
};

/**
 * Get billing names statistics for dashboard drill-down
 */
exports.getDashboardBillingNamesStats = async function (req, res) {
  try {
    const user = req.user || { userid: 'admin', privilege: ['admin'] };
    const isAdmin = isAdminPrivilege(user.privilege);

    let startDate, endDate;
    if (req.query.startDate && req.query.endDate) {
      ({ startDate, endDate } = parseFiscalDateRange(req.query.startDate, req.query.endDate));
    } else {
      const year = parseInt(req.query.year) || new Date().getFullYear();
      ({ startDate, endDate } = parseFiscalYearRange(year));
    }

    // 流程：结算 → 开票 → 回款
    // 所有 Settle 记录都已经过结算，status 标记当前所处阶段
    // 结算 = ALL, 开票 = 已开票+已回款, 回款 = 已回款
    // 重量和金额从 Bill 重新计算（定尺：weight=0 时用 num*单重）

    const settleMatchStage = {
      settle_date: { $gte: startDate, $lte: endDate }
    };
    if (!isAdmin) {
      settleMatchStage.settler = user.userid;
    }

    const settles = await Settle.find(buildTenantQuery(req, settleMatchStage))
      .select('billing_name status bills ship_weight price')
      .lean()
      .exec();

    // 收集所有 bill_id，批量查询 Bill
    const allBillIds = new Set();
    settles.forEach(s => {
      s.bills?.forEach(b => {
        if (b.bill_id) allBillIds.add(b.bill_id.toString());
      });
    });

    const billDocs = await Bill.find(buildTenantQuery(req, { _id: { $in: Array.from(allBillIds) } }))
      .select('size_type weight collection_price invoices')
      .lean()
      .exec();

    const billMap = {};
    billDocs.forEach(b => { billMap[b._id.toString()] = b; });

    // 逐条 Settle 计算重量和金额，按 billing_name 汇总
    const nameStatsMap = {};

    settles.forEach(s => {
      const name = s.billing_name || '未命名';
      if (!nameStatsMap[name]) {
        nameStatsMap[name] = {
          settledWeight: 0, settledAmount: 0,
          invoicedWeight: 0, invoicedAmount: 0,
          paidWeight: 0, paidAmount: 0
        };
      }

      let weight = 0;
      let amount = 0;

      if (s.bills && s.bills.length > 0) {
        s.bills.forEach(sb => {
          const bill = sb.bill_id ? billMap[sb.bill_id.toString()] : null;

          // 重量：优先用存储值，定尺且为0时回退到 num*单重
          let w = sb.weight || 0;
          if (w === 0 && bill && bill.size_type === '定尺' && bill.weight > 0 && sb.num > 0) {
            w = sb.num * bill.weight;
          }
          weight += w;

          // 金额：从 Bill 的 collection_price 和 invoices[].price 计算
          if (bill) {
            if (bill.collection_price > 0) {
              amount += bill.collection_price * w;
            }
            const billInv = bill.invoices?.find(i => i.inv_no === sb.inv_no);
            if (billInv && billInv.price > 0) {
              amount += billInv.price * w;
            }
          }
        });
      } else {
        // 无 bills 引用，回退到 Settle 自身数据
        weight = s.ship_weight || 0;
        amount = s.price ? s.price * weight : 0;
      }

      const stats = nameStatsMap[name];

      // 所有记录都已结算
      stats.settledWeight += weight;
      stats.settledAmount += amount;

      // 已开票 = 已开票 + 已回款
      if (s.status === '已开票' || s.status === '已回款') {
        stats.invoicedWeight += weight;
        stats.invoicedAmount += amount;
      }

      // 已回款
      if (s.status === '已回款') {
        stats.paidWeight += weight;
        stats.paidAmount += amount;
      }
    });

    const data = Object.entries(nameStatsMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, stats]) => ({
        name,
        settledWeight: parseFloat(stats.settledWeight.toFixed(3)),
        settledAmount: parseFloat(stats.settledAmount.toFixed(2)),
        invoicedWeight: parseFloat(stats.invoicedWeight.toFixed(3)),
        invoicedAmount: parseFloat(stats.invoicedAmount.toFixed(2)),
        paidWeight: parseFloat(stats.paidWeight.toFixed(3)),
        paidAmount: parseFloat(stats.paidAmount.toFixed(2))
      }));

    res.json({ ok: true, data });
  } catch (err) {
    console.error('getDashboardBillingNamesStats error:', err);
    res.json({ ok: false, error: err.message });
  }
};