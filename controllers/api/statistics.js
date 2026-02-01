const Invoice = require('../../models/Invoice');
const Bill = require('../../models/Bill');
const Settle = require('../../models/Settle');
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
 * Get Customer Chart Data
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

    var allNames = [];
    var invNoObj = {};
    var chartData = [];

    for (var i = 0, len = db_invs.length; i < len; ++i) {
      var inv = db_invs[i];
      if (allNames.indexOf(inv.ship_name) < 0) {
        allNames.push(inv.ship_name);
      }

      var idx = -1;
      // Use helper to format date
      var date = new Date(inv.ship_date).format('yyyy-MM');
      for (var m = 0; m < months.length; ++m) {
        if (date === months[m]) {
          idx = m;
          break;
        }
      }

      invNoObj[inv.inv_no] = { name: inv.ship_name, date: date, index: idx };
    }

    allNames.sort(function (a, b) { return a.localeCompare(b); });

    for (var idx = 0; idx < months.length; ++idx) {
      var nnv = { month: months[idx] };
      allNames.forEach(function (name) {
        nnv[name] = 0;
      });

      chartData.push(nnv);
    }

    for (i = 0, len = bills.length; i < len; ++i) {
      var b = bills[i];
      b.invoices.forEach(function (inv) {
        var ship_date = invNoObj[inv.inv_no];
        if (ship_date && ship_date.index >= 0) {
          var weight = (b.block_num > 0) ? inv.num * b.weight : inv.weight;
          var price = b.collection_price > 0 ? b.collection_price * weight : 0;

          if (inv.price > 0) {
            price += inv.price * weight;
          }

          chartData[ship_date.index][ship_date.name] += price;
        }
      });
    }

    for (idx = 0; idx < chartData.length; ++idx) {
      for (var k = 0; k < allNames.length; ++k) {
        if (chartData[idx][allNames[k]] > 0) {
          chartData[idx][allNames[k]] = utils.toFixedNumber(chartData[idx][allNames[k]], 3);
        }
      }
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

    const top5BillingNames = formatList(data.byBillingName.slice(0, 5));
    const top5Vehicles = formatList(data.byVehicle.slice(0, 5));
    const allVehicles = formatList(data.byVehicle);

    // Calculate invoice tonnage and payment tonnage from Settle table
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

    res.json({
      ok: true,
      data: {
        totalTonnage: parseFloat(totalTonnage.toFixed(3)),
        totalInvoiceTonnage: parseFloat(totalInvoiceTonnage.toFixed(3)),
        totalPaymentTonnage: parseFloat(totalPaymentTonnage.toFixed(3)),
        billingNameCount,
        monthlyTrend,
        top5BillingNames,
        top5Vehicles,
        allVehicles
      }
    });

  } catch (err) {
    console.error('getDashboardStatistics error:', err);
    res.json({ ok: false, error: err.message });
  }
};