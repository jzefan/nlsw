const Invoice = require('../../models/Invoice');
const Bill = require('../../models/Bill');
const Settle = require('../../models/Settle');
const Vehicle = require('../../models/Vehicle');
const utils = require('../../controllers/utils');

// Helper function: Search DB Data
async function searchDbData(res, query, inv_f_selected, bill_f_selected) {
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
    let invQuery = Invoice.find(obj);
    if (inv_f_selected) {
      invQuery.select(inv_f_selected);
    }
    const db_invs = await invQuery.lean().exec();

    if (!db_invs || db_invs.length === 0) {
      return { ok: true, db_invs: [], bills: [] };
    }

    const ids = utils.getAllList(true, db_invs, "bills", "bill_id");
    let billQuery = Bill.find({ _id: { $in: ids } });
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

    const searchResult = await searchDbData(res, req.query, 'waybill_no ship_name ship_date bills', 'billing_name block_num weight collection_price invoices');
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
    
    const searchResult = await searchDbData(res, req.query, 'waybill_no ship_name ship_customer ship_date bills', null);
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

    const searchResult = await searchDbData(res, query, 'waybill_no ship_name ship_date bills', 'billing_name block_num weight collection_price invoices');
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
    const user = req.user || { userid: 'admin', privilege: 'admin' }; 
    const isAdmin = user.privilege === 'admin' || user.privilege === '11111111';

    let startDate, endDate;
    // Check for YYYY-MM format from frontend input type="month"
    if (req.query.startDate && req.query.endDate) {
      // Start date: 1st of the month
      startDate = new Date(req.query.startDate + "-01"); 
      
      // End date: Last second of the end month
      const endParts = req.query.endDate.split('-');
      const endYear = parseInt(endParts[0]);
      const endMonth = parseInt(endParts[1]);
      // Date(year, month, 0) gives the last day of the previous month. 
      // So Date(endYear, endMonth, 0) gives last day of endMonth (since month is 0-indexed in Date but 1-indexed in input)
      // Wait: Date(2024, 1, 0) -> Jan 31. Date(2024, 12, 0) -> Dec 31.
      // input 2024-01 -> endMonth=1. Date(2024, 1, 0) is Jan 31. Correct.
      endDate = new Date(endYear, endMonth, 0, 23, 59, 59, 999);
    } else {
      // Default to current year
      const year = parseInt(req.query.year) || new Date().getFullYear();
      startDate = new Date(year, 0, 1);
      endDate = new Date(year, 11, 31, 23, 59, 59, 999);
    }

    const matchStage = {
      ship_date: { $gte: startDate, $lte: endDate },
      state: { $ne: '新建' }
    };

    if (!isAdmin) {
      matchStage.shipper = user.userid;
    }

    const facetPipeline = [
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
                weight: { $sum: '$total_weight' }
              }
            },
            { $sort: { weight: -1 } }
          ]
        }
      }
    ];

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

    const top8BillingNames = formatList(data.byBillingName.slice(0, 8));
    const top5Vehicles = formatList(data.byVehicle.slice(0, 5));

    // 已开票吨数: 从Settle获取，status = '已开票' OR status = '已回款' (两种状态之和)
    // 已回款吨数: 从Settle获取，status = '已回款'
    const settleMatchStage = {
      settle_date: { $gte: startDate, $lte: endDate }
    };

    if (!isAdmin) {
      settleMatchStage.settler = user.userid;
    }

    const settleTonnageResult = await Settle.aggregate([
      { $match: settleMatchStage },
      {
        $group: {
          _id: null,
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
    ]).exec();

    const totalInvoiceTonnage = settleTonnageResult[0] ? settleTonnageResult[0].invoiceTonnage : 0;
    const totalPaymentTonnage = settleTonnageResult[0] ? settleTonnageResult[0].paymentTonnage : 0;

    // 计算车辆分类统计
    // 从data.byVehicle获取所有车船及其吨数
    const vehicleNames = data.byVehicle.map(v => v._id).filter(name => name); // 过滤掉空名称

    // 查询Vehicle表获取车辆信息
    const vehicles = await Vehicle.find({ name: { $in: vehicleNames } })
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

    // 统计各分类的数量和吨数，同时构建包含车辆信息的allVehicles
    let ownVehicleCount = 0;
    let ownVehicleTonnage = 0;
    let outsourcedVehicleCount = 0;
    let outsourcedVehicleTonnage = 0;
    let truckTonnage = 0;
    let vesselTonnage = 0;

    const allVehicles = data.byVehicle.map(v => {
      const vehicleName = v._id;
      const tonnage = v.weight;
      const info = vehicleInfoMap[vehicleName];

      if (info) {
        // 按所有权分类
        if (info.veh_category === '自有') {
          ownVehicleCount++;
          ownVehicleTonnage += tonnage;
        } else if (info.veh_category === '外挂') {
          outsourcedVehicleCount++;
          outsourcedVehicleTonnage += tonnage;
        }

        // 按类型分类
        if (info.veh_type === '车') {
          truckTonnage += tonnage;
        } else if (info.veh_type === '船') {
          vesselTonnage += tonnage;
        }
      }

      return {
        name: vehicleName || '未命名',
        value: parseFloat(tonnage.toFixed(3)),
        veh_type: info ? info.veh_type : '',
        veh_category: info ? info.veh_category : ''
      };
    });

    res.json({
      ok: true,
      data: {
        totalTonnage: parseFloat(totalTonnage.toFixed(3)),
        totalInvoiceTonnage: parseFloat(totalInvoiceTonnage.toFixed(3)),
        totalPaymentTonnage: parseFloat(totalPaymentTonnage.toFixed(3)),
        billingNameCount,
        monthlyTrend,
        top8BillingNames,
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
    const user = req.user || { userid: 'admin', privilege: 'admin' };
    const isAdmin = user.privilege === 'admin' || user.privilege === '11111111';

    let startDate, endDate;
    if (req.query.startDate && req.query.endDate) {
      startDate = new Date(req.query.startDate + "-01");
      const endParts = req.query.endDate.split('-');
      const endYear = parseInt(endParts[0]);
      const endMonth = parseInt(endParts[1]);
      endDate = new Date(endYear, endMonth, 0, 23, 59, 59, 999);
    } else {
      const year = parseInt(req.query.year) || new Date().getFullYear();
      startDate = new Date(year, 0, 1);
      endDate = new Date(year, 11, 31, 23, 59, 59, 999);
    }

    const matchStage = {
      ship_date: { $gte: startDate, $lte: endDate },
      state: { $ne: '新建' }
    };

    if (!isAdmin) {
      matchStage.shipper = user.userid;
    }

    // Get invoices with required fields
    const invoices = await Invoice.find(matchStage)
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
    const bills = await Bill.find({ _id: { $in: billIds } })
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
    const user = req.user || { userid: 'admin', privilege: 'admin' };
    const isAdmin = user.privilege === 'admin' || user.privilege === '11111111';

    let startDate, endDate;
    if (req.query.startDate && req.query.endDate) {
      startDate = new Date(req.query.startDate + "-01");
      const endParts = req.query.endDate.split('-');
      const endYear = parseInt(endParts[0]);
      const endMonth = parseInt(endParts[1]);
      endDate = new Date(endYear, endMonth, 0, 23, 59, 59, 999);
    } else {
      const year = parseInt(req.query.year) || new Date().getFullYear();
      startDate = new Date(year, 0, 1);
      endDate = new Date(year, 11, 31, 23, 59, 59, 999);
    }

    // Get all settle records in date range
    const settleMatchStage = {
      settle_date: { $gte: startDate, $lte: endDate }
    };

    if (!isAdmin) {
      settleMatchStage.settler = user.userid;
    }

    const settleStats = await Settle.aggregate([
      { $match: settleMatchStage },
      {
        $group: {
          _id: '$billing_name',
          settledWeight: {
            $sum: {
              $cond: [{ $eq: ['$status', '已结算'] }, '$ship_weight', 0]
            }
          },
          settledAmount: {
            $sum: {
              $cond: [{ $eq: ['$status', '已结算'] }, '$price', 0]
            }
          },
          invoicedWeight: {
            $sum: {
              $cond: [{ $in: ['$status', ['已开票', '已回款']] }, '$ship_weight', 0]
            }
          },
          invoicedAmount: {
            $sum: {
              $cond: [{ $in: ['$status', ['已开票', '已回款']] }, '$price', 0]
            }
          },
          paidWeight: {
            $sum: {
              $cond: [{ $eq: ['$status', '已回款'] }, '$ship_weight', 0]
            }
          },
          paidAmount: {
            $sum: {
              $cond: [{ $eq: ['$status', '已回款'] }, '$price', 0]
            }
          }
        }
      },
      { $sort: { _id: 1 } }
    ]).exec();

    const data = settleStats.map(item => ({
      name: item._id || '未命名',
      settledWeight: parseFloat((item.settledWeight || 0).toFixed(3)),
      settledAmount: parseFloat((item.settledAmount || 0).toFixed(2)),
      invoicedWeight: parseFloat((item.invoicedWeight || 0).toFixed(3)),
      invoicedAmount: parseFloat((item.invoicedAmount || 0).toFixed(2)),
      paidWeight: parseFloat((item.paidWeight || 0).toFixed(3)),
      paidAmount: parseFloat((item.paidAmount || 0).toFixed(2))
    }));

    res.json({ ok: true, data });
  } catch (err) {
    console.error('getDashboardBillingNamesStats error:', err);
    res.json({ ok: false, error: err.message });
  }
};