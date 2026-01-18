/**
 * Created by ezefjia on 2015/3/23.
 */
"use strict";

var Vehicle = require('../models/Vehicle');
var Company = require('../models/Company');
var Warehouse = require('../models/Warehouse');
var Destination = require('../models/Destination');
var Brand = require('../models/Brand');
var SaleDep = require('../models/SaleDep');
var Bill = require('../models/Bill');
var Invoice = require('../models/Invoice');
var Settle = require('../models/Settle');
var VehVesCost = require('../models/VesselCost');
var DFReceivables = require('../models/DrayageForklift');
var User = require('../models/User');
var utils = require('./utils');
var bunyan = require('bunyan');
const fastcsv = require('fast-csv');
const fs = require('fs');

var logger = bunyan.createLogger({
  name: 'XHT',
  streams: [{ level: 'info', stream: process.stdout }, { level: 'error', path: 'app.log' }]
});

exports.getInvoiceWithVessel = async function (req, res) {
  let query = req.query;
  let condi = [{ state: { $ne: '新建' } }]
  if (query.fSettledState === '全部') {
    condi.push({ $or: [{ vessel_settle_state: '未结算' }, { vessel_settle_state: '已结算' }, { vessel_settle_state: '不需要结算' }, { vessel_settle_state: '已付款' }] })
  } else {
    condi.push({ vessel_settle_state: query.fSettledState })
  }
  // var obj = { $and: [{ vessel_settle_state: query.fSettledState }, { state: { $ne: '新建' } }] };

  if (query.fDest) {
    condi.push({ ship_to: query.fDest });
  }

  if (!utils.isEmpty(query.fDate1) && !utils.isEmpty(query.fDate2)) {
    var qDate = getStartEndDate(query.fDate1, query.fDate2, true);
    condi.push({ ship_date: { $gte: qDate.s, $lte: qDate.e } });
  }

  if (query.fName) {
    condi.push({ ship_name: query.fName });
  }

  if (query.fVeh) {
    condi.push({ $or: [{ vehicle_vessel_name: query.fVeh }, { 'bills.vehicles.veh_name': query.fVeh }] });
  }

  if (query.fContact) {
    const vehs = await Vehicle.find({ boss: new RegExp(query.fContact, 'i') }).exec();
    const names = vehs.map(veh => {
      if (veh.real_boss && veh.real_boss.length) {
        let found = false
        veh.real_boss.forEach((elem) => {
          if (elem.rb === query.fContact) {
            found = true
          }
        })

        if (found) {
          return veh.name
        }
      } else {
        return veh.name
      }
    })
    condi.push({ $or: [{ vehicle_vessel_name: { $in: names } }, { 'bills.vehicles.veh_name': { $in: names } }] });
  }

  if (query.fReceipt) {
    const receipt = +query.fReceipt;
    if (receipt !== 2) {
      condi.push({ receipt: query.fReceipt });
    }
  }

  if (query.selfOwned === 'true') {
    condi.push({ selfOwned: 1 });
  } else if (query.selfOwned === 'false') {
    condi.push({ selfOwned: 0 });
  }

  const amount = Number(query.fAmount);
  if (amount > 0) {
    const sAmount = amount - 0.01
    const eAmount = amount + 0.01
    condi.push({ vessel_price: { $gt: sAmount, $lt: eAmount } });
  }
  const weight = Number(query.fWeight);
  if (weight > 0) {
    const sWeight = weight - 0.001
    const eWeight = weight + 0.001
    condi.push({ total_weight: { $gt: sWeight, $lt: eWeight } });
  }

  // console.log('query condition', obj);
  try {
    let db_invs = await Invoice.find({ $and: condi }).sort({ ship_date: 'desc' }).lean().exec();
    if (db_invs) {
      res.json({ ok: true, invs: db_invs });
    } else {
      res.json({ ok: false });
    }
  } catch (e) {
    res.json({ ok: false });
  }
};

exports.getInvoiceReport = async function (req, res) {
  var query = req.query;
  var obj = { $and: [] };

  if (query.fDest) {
    obj["$and"].push({ ship_to: query.fDest });
  }

  if (!utils.isEmpty(query.fDate1) && !utils.isEmpty(query.fDate2)) {
    var qDate = getStartEndDate(query.fDate1, query.fDate2, true);
    obj["$and"].push({ ship_date: { $gte: qDate.s, $lte: qDate.e } });
  }

  if (query.fName) {
    obj["$and"].push({ ship_name: query.fName });
  }

  if (query.fVeh) {
    obj["$and"].push({ vehicle_vessel_name: query.fVeh });
  }

  if (query.fShipper) {
    obj["$and"].push({ shipper: query.fShipper });
  }

  try {
    const db_invs = await Invoice.find(obj).sort({ ship_date: 'desc' }).lean().exec();
    if (db_invs) {
      if (db_invs.length > 150) {
        res.json({ ok: true, hint: true, num: db_invs.length, invs: db_invs });
      } else {
        var ids = utils.getAllList(true, db_invs, "bills", "bill_id");
        const bills = await Bill.find({ _id: { $in: ids } }).lean().exec();
        if (!bills || bills.length === 0) {
          res.json({ ok: false });
        } else {
          var prices = {};
          db_invs.forEach(function (inv) {
            var isVessel = false;
            var customer_price = 0;
            var veh_price = inv.vessel_price > 0 ? inv.vessel_price * inv.total_weight : 0;

            inv.bills.forEach(function (b) {
              for (var i = 0; i < bills.length; ++i) {
                if (String(b.bill_id) == String(bills[i]._id)) {

                  for (var j = 0; j < bills[i].invoices.length; ++j) {
                    if (bills[i].invoices[j].inv_no === inv.waybill_no) {
                      var w = bills[i].invoices[j].weight;
                      if (w == 0 && bills[i].block_num > 0) {
                        w = bills[i].invoices[j].num * bills[i].weight;
                      }

                      var p = bills[i].invoices[j].price > 0 ? bills[i].invoices[j].price : 0;
                      p += bills[i].collection_price > 0 ? bills[i].collection_price : 0;
                      customer_price += p * w;
                      break;
                    }
                  }

                  break;
                }
              }
            });

            if (!isVessel) {
              var c = customer_price / inv.total_weight;
              var v = veh_price / inv.total_weight;
              prices[inv.waybill_no] = {
                cust_price: c,
                veh_price: v,
                net_income: c - v
              };
            }
          });

          res.json({ ok: true, hint: false, invs: db_invs, prices: prices });
        }
      }
    } else {
      res.json({ ok: false });
    }
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
};

/**
 * All Vessel operation statistics
 */
exports.getVesselStatistics = async function (req, res) {
  if (req.user.privilege[3] === '1' || req.user.privilege[4] === '1' || req.user.privilege[5] === '1') {
    try {
      const dfData = await DFReceivables.find({}).lean().exec();
      res.render('statistics/vessel_revenue', {
        title: '报表和打印',
        curr_page: '车船营业额',
        curr_page_name: '车船统计',
        dData: dfData,
        scripts: [
          '/js/plugins/amcharts/amcharts.js',
          '/js/plugins/amcharts/serial.js',
          '/js/report_stat.js'
        ]
      });
    } catch (err) {
      res.status(500).send(err.message);
    }
  }
  else {
    res.status(404);
    res.render('404');
  }
};

exports.getVesselRevenueData = async function (req, res) {
  let query = req.query;
  let months = query.fMonths;
  let dLen = months.length;
  let resultData = [];

  for (let i = 0; i < dLen; ++i) {
    let nnv = {
      month: months[i],
      vhTotal: 0, vhRevenue: 0, vhOwnWeight: 0, vhOwnIncome: 0, vhOwnDeposit: 0, vhOwnProfit: 0, vhNonOwnWeight: 0, vhNonOwnIncome: 0, vhNonOwnDeposit: 0, vhProfit: 0, vhFixedCost: 0,   // 车
      vsTotal: 0, vsRevenue: 0, vsOwnWeight: 0, vsOwnIncome: 0, vsOwnDeposit: 0, vsOwnProfit: 0, vsNonOwnWeight: 0, vsNonOwnIncome: 0, vsNonOwnDeposit: 0, vsProfit: 0, vsFixedCost: 0
    }; // 船

    resultData.push(nnv);
  }

  let vehList = await Vehicle.find({}).select('name veh_category').exec();
  if (!vehList) {
    return res.json({ ok: false });
  }

  let vehObject = {};
  vehList.forEach(vl => { vehObject[vl.name] = vl.veh_category; });

  let vvcList = await VehVesCost.find({ month: { $gte: query.fDate1, $lte: query.fDate2 } }).select('name total month').exec();
  if (!vvcList) {
    return res.json({ ok: false });
  }

  let cost = {};
  vvcList.forEach(elem => {
    if (cost[elem.month]) {
      cost[elem.month].push({ name: elem.name, total: elem.total, used: false });
    } else {
      cost[elem.month] = [{ name: elem.name, total: elem.total, used: false }];
    }
  })

  let obj = { $and: [] };

  if (query.fDate1 && query.fDate2) {
    let qDate = getStartEndDate(query.fDate1, query.fDate2, false);
    obj["$and"].push({ ship_date: { $gte: query.fDate1, $lt: query.fDate2 } });
    //obj["$and"].push({ship_date: { $gte: qDate.s, $lt: qDate.e }});
  }

  if (query.fName && query.fName.length) {
    obj["$and"].push({ ship_name: { $in: query.fName } });
  }

  let db_invs = await Invoice.find(obj).select('waybill_no vehicle_vessel_name ship_date bills total_weight').exec();
  if (!db_invs) {
    return res.json({ ok: false });
  }

  for (let i = 0; i < db_invs.length; ++i) {
    let db_inv = db_invs[i];

    let date = db_inv.ship_date.format('yyyy-MM');
    let invIdxObj = { index: months.indexOf(date), fixed_cost: cost[date], vvName: db_inv.vehicle_vessel_name };

    let ids = [];
    db_inv.bills.forEach(inv_bill => { ids.push(inv_bill.bill_id) });

    let bills = await Bill.find({ _id: { $in: ids } }).select('block_num weight collection_price invoices').exec();
    //if (ids.length !== bills.length) {
    //  console.log("why!!!!!")
    //} else {
    //  console.log("ids = " + ids.length);
    //}

    bills.forEach(b => {

      b.invoices.forEach(inv => {

        if (inv.inv_no === db_inv.waybill_no) {

          let vehType = vehObject[inv.veh_ves_name];
          //let invIdxObj = invDate[inv.inv_no];

          if (vehType && invIdxObj.index >= 0) {
            let tmp = resultData[invIdxObj.index];
            let fc = invIdxObj.fixed_cost;
            let fcTrue = fc && fc.length;
            let weight = (b.block_num > 0) ? inv.num * b.weight : inv.weight;
            let price = b.collection_price > 0 ? b.collection_price * weight : 0;

            if (inv.price > 0) {
              price += inv.price * weight;
            }

            let veh_price = inv.veh_ves_price > 0 ? inv.veh_ves_price * weight : 0;

            if (inv.vehicles.length) { // vessel
              tmp.vsTotal += weight;
              tmp.vsRevenue += price;

              if (vehType === '自有') {
                tmp.vsOwnWeight += weight;
                tmp.vsOwnIncome += price;
                // tmp.vsOwnDeposit += veh_price;
              }
              else if (vehType === '外挂') {
                tmp.vsNonOwnWeight += weight;
                tmp.vsNonOwnIncome += price;
                tmp.vsNonOwnDeposit += veh_price;  // 外付金额
              } else {
                logger.error("No type and category!");
              }

              let vnameList = [];
              // 针对每辆装船的车, 算入到车的应付金额中
              let w = 0;
              inv.vehicles.forEach(function (veh) {
                tmp.vhTotal += veh.send_weight;
                w += veh.send_weight;

                veh_price = (veh.veh_price > 0) ? veh.veh_price * veh.send_weight : 0;
                vehType = vehObject[veh.veh_name];
                if (vehType === '自有') {
                  tmp.vhOwnWeight += veh.send_weight;
                  // tmp.vhOwnDeposit += veh_price;  // 应付

                  if (veh.veh_name && vnameList.indexOf(veh.veh_name) < 0) {
                    vnameList.push(veh.veh_name);
                  }
                }
                else if (vehType === '外挂') {
                  tmp.vhNonOwnWeight += veh.send_weight;
                  //tmp.vhNonOwnDeposit += veh_price; // 2020.06.20
                } else {
                  logger.error("vehicles: No type and category!");
                }
              });

              if (fcTrue) {
                for (var k = 0; k < fc.length; ++k) {
                  if (!fc[k].used && fc[k].name === 'chuan') {
                    tmp.vsFixedCost += fc[k].total;
                    fc.remove(k);
                    break;
                  }
                }

                if (vnameList.length > 0) {
                  for (k = 0; k < fc.length; ++k) {
                    if (!fc[k].used && fc[k].name && vnameList.indexOf(fc[k].name) >= 0) {
                      fc[k].used = true;
                      tmp.vhFixedCost += fc[k].total;
                    }
                  }
                }
              }
            }
            else { // 非船
              if (fcTrue) {
                for (k = 0; k < fc.length; ++k) {
                  //console.log("fc.name = " + fc[k].name + ", vvName = " + invIdxObj.vvName);
                  if (!fc[k].used && fc[k].name === invIdxObj.vvName) {
                    //console.log("vvname = " + invIdxObj.vvName);
                    tmp.vhFixedCost += fc[k].total;
                    fc.remove(k);
                    break;
                  }
                }
              }

              tmp.vhTotal += weight;
              tmp.vhRevenue += price;

              if (vehType === '自有') {
                tmp.vhOwnWeight += weight;
                tmp.vhOwnIncome += price;
                // tmp.vhOwnDeposit += veh_price;
              }
              else if (vehType === '外挂') {
                tmp.vhNonOwnWeight += weight;
                tmp.vhNonOwnIncome += price;
                tmp.vhNonOwnDeposit += veh_price;
              } else {
                logger.error("VH: No type and category!");
              }
            }
          } else {
            logger.error(inv.veh_ves_name + ' not found!');
          }
        }
      })
    })

  }

  res.json({ ok: true, stat_data: resultData });
};

exports.getVesselAllocationDetail = async function (req, res) {
  var query = req.query;
  var vehType = query.fVehType;
  var isSummary = (query.fSummary === 'YES');

  try {
    const vehList = await Vehicle.find({ veh_category: vehType }).select('name contact_name').lean().exec();
    var vehObject = [];
    vehList.forEach(function (vl) { vehObject.push(vl.name); });

    var detailObj = {};
    const searchResult = await searchDbData(res, query, null, 'block_num weight invoices');
    if (!searchResult.ok) {
      return res.json({ ok: false });
    }
    const db_invs = searchResult.db_invs;
    const bills = searchResult.bills;

    var invDate = {};
    for (var i = 0, len = db_invs.length; i < len; ++i) {
      invDate[db_invs[i].waybill_no] = i;
    }

    for (i = 0, len = bills.length; i < len; ++i) {
      var b = bills[i];
      for (var j = 0, jLen = b.invoices.length; j < jLen; ++j) {
        var inv = b.invoices[j];
        var idx = invDate[inv.inv_no];

        if (idx >= 0) {
          var db_inv = db_invs[idx];
          var weight = (b.block_num > 0) ? inv.num * b.weight : inv.weight;

          if (inv.veh_ves_name && vehObject.indexOf(inv.veh_ves_name) >= 0) {
            if (!utils.isExist(detailObj[inv.veh_ves_name])) {
              detailObj[inv.veh_ves_name] = [];
            }

            detailObj[inv.veh_ves_name].push({
              name: db_inv.ship_customer ? db_inv.ship_name + '/' + db_inv.ship_customer : db_inv.ship_name,
              ship_from: db_inv.ship_from ? db_inv.ship_from : '',
              ship_to: db_inv.ship_to,
              price: (inv.veh_ves_price > 0 ? inv.veh_ves_price * weight : 0),
              single_price: inv.veh_ves_price,
              send_num: inv.num,
              send_weight: weight,
              ship_date: db_inv.ship_date,
              charge_cash: db_inv.charge_cash,
              charge_oil: db_inv.charge_oil,
              delay_day: db_inv.delay_day
            });
          }

          var k = 0;
          for (k = 0; k < db_inv.inner_settle.length; ++k) {
            var tmp = db_inv.inner_settle[k];
            tmp.ok = false;
            tmp.send_num = 0;
            tmp.send_weight = 0;
            tmp.price = 0;
            if (!utils.isExist(tmp.veh_name)) { tmp.veh_name = ''; }
            if (!utils.isExist(tmp.veh_ship_from)) { tmp.veh_ship_from = ''; }
            if (!utils.isExist(tmp.charge_cash)) { tmp.charge_cash = 0; }
            if (!utils.isExist(tmp.charge_oil)) { tmp.charge_cash = 0; }
            if (!utils.isExist(tmp.delay_day)) { tmp.delay_day = 0; }
          }

          inv.vehicles.forEach(function (veh) {
            if (vehObject.indexOf(veh.veh_name) >= 0) {
              for (k = 0; k < db_inv.inner_settle.length; ++k) {
                if (veh.inner_waybill_no === db_inv.inner_settle[k].inner_waybill_no) {
                  var tmp = db_inv.inner_settle[k];
                  if (!utils.isExist(detailObj[veh.veh_name])) {
                    detailObj[veh.veh_name] = [];
                  }

                  detailObj[veh.veh_name].push({
                    name: db_inv.ship_customer ? db_inv.ship_name + '/' + db_inv.ship_customer : db_inv.ship_name,
                    ship_from: veh.veh_ship_from ? veh.veh_ship_from : '',
                    ship_to: db_inv.vehicle_vessel_name,
                    price: (veh.veh_price > 0 ? veh.veh_price * veh.send_weight : 0),
                    single_price: veh.veh_price,
                    send_num: veh.send_num,
                    send_weight: veh.send_weight,
                    ship_date: db_inv.ship_date,
                    charge_cash: tmp.charge_cash,
                    charge_oil: tmp.charge_oil,
                    delay_day: tmp.delay_day
                  });

                  break;
                }
              }
            }
          });
        }
      }
    }

    var vehs = [];
    for (var name in detailObj) {
      if (detailObj.hasOwnProperty(name)) {
        vehs.push(name);
      }
    }

    vehs = utils.pinyin_sort(vehs);

    if (isSummary) {
      var summaryData = {};
      vehs.forEach(function (vname) {
        var index = vehObject.indexOf(vname);
        var contact = (index >= 0 ? vehList[index].contact_name : '');
        summaryData[vname] = { weight: 0, amount: 0, contact: contact };

        detailObj[vname].forEach(function (item) {
          summaryData[vname].weight += item.send_weight;
          summaryData[vname].amount += item.price;
        });
      });

      res.json({ ok: true, summary_data: summaryData });
    } else {
      res.json({ ok: true, vessel_detail: detailObj, vehNameList: vehs });
    }
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
};


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
          //ship_customer: bill.ship_customer,
          // inv_ship_date: bill.inv_ship_date,
          // inv_shipper: bill.inv_shipper,
          //status_2: bill.status_2,
          //inv_settle_flag : bill.inv_settle_flag,			
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

async function getDataFromInvoiceFirst(query) {
  let obj = { $and: [{ state: { $ne: '新建' } }] };
  let bVeh = !utils.isEmpty(query.fVeh);
  let bDest = !utils.isEmpty(query.fDest);
  let bDate = !utils.isEmpty(query.fDate1) && !utils.isEmpty(query.fDate2);
  let bName = !utils.isEmpty(query.fName);
  let bBNo = !utils.isEmpty(query.fBno);
  let bOrder = !utils.isEmpty(query.fOrder);
  if (bVeh) obj["$and"].push({ vehicle_vessel_name: { $in: query.fVeh } });
  if (bDest) obj["$and"].push({ ship_to: { $in: query.fDest } });
  if (bDate) {
    let qDate = getStartEndDate(query.fDate1, query.fDate2, true);
    obj["$and"].push({ ship_date: { $gte: qDate.s, $lte: qDate.e } });
  }
  if (bName) obj["$and"].push({ ship_name: { $in: query.fName } });

  try {
    const db_invs = await Invoice.find(obj)
      .select('waybill_no ship_customer ship_date shipper bills incoming_price_remark')
      .lean()
      .exec();

    if (!db_invs || db_invs.length === 0) {
      return { ok: false };
    }

    let ids = utils.getAllList(true, db_invs, "bills", "bill_id");
    let billQueryObj = { $and: [{ _id: { $in: ids } }] };
    if (bBNo) billQueryObj["$and"].push({ bill_no: { $regex: new RegExp(query.fBno, 'gi') } });
    if (bOrder) billQueryObj["$and"].push({ order_no: { $regex: new RegExp(query.fOrder, 'gi') } });

    const bills = await Bill.find(billQueryObj).lean().exec();
    if (!bills || bills.length === 0) {
      return { ok: false };
    }
    return { bills: combineBill(bills, db_invs), ok: true };
  } catch (err) {
    console.error("getDataFromInvoiceFirst error:", err);
    return { ok: false };
  }
}

exports.getInvoiceBill = async function (req, res) {
  var query = req.query;
  var obj = {};
  var bVeh = !utils.isEmpty(query.fVeh);
  var bDest = !utils.isEmpty(query.fDest);
  var bDate = !utils.isEmpty(query.fDate1) && !utils.isEmpty(query.fDate2);
  var bName = !utils.isEmpty(query.fName);
  var bBNo = !utils.isEmpty(query.fBno);
  var bOrder = !utils.isEmpty(query.fOrder);
  var bVehMode = !utils.isEmpty(query.fVehMode);
  var qDate;

  if (bDate) {
    qDate = getStartEndDate(query.fDate1, query.fDate2, true);
  }

  try {
    if (query.fType === 'invoice-first') {
      obj = { $and: [{ state: { $ne: '新建' } }] };
      if (bVeh) obj["$and"].push({ vehicle_vessel_name: { $in: query.fVeh } });
      if (bDest) obj["$and"].push({ ship_to: { $in: query.fDest } });
      if (bDate) obj["$and"].push({ ship_date: { $gte: qDate.s, $lte: qDate.e } });
      if (bName) obj["$and"].push({ ship_name: { $in: query.fName } });

      if (!utils.isEmpty(query.selfOwned)) {
        if (query.selfOwned === 1 || query.selfOwned === '1') {
          obj["$and"].push({ selfOwned: 1 })
        } else {
          obj["$and"].push({ selfOwned: { $ne: 1 } })
        }
      }

      const db_invs = await Invoice.find(obj)
        .select('waybill_no ship_customer ship_date shipper bills incoming_price_remark')
        .lean()
        .exec();

      if (db_invs && db_invs.length) {
        let ids = utils.getAllList(true, db_invs, "bills", "bill_id");
        let billQueryObj = { $and: [{ _id: { $in: ids } }] };
        if (bBNo) billQueryObj["$and"].push({ bill_no: { $regex: new RegExp(query.fBno, 'gi') } });
        if (bOrder) billQueryObj["$and"].push({ order_no: { $regex: new RegExp(query.fOrder, 'gi') } });

        const bills = await Bill.find(billQueryObj).lean().exec();
        if (bills && bills.length) {
          res.json({ bills: combineBill(bills, db_invs), ok: true })
        } else {
          res.json({ ok: false })
        }
      } else {
        res.json({ ok: false })
      }
    } else {  // bill first
      var showVehicles = (utils.isExist(query.fShowDestForVessel) && (query.fShowDestForVessel == 1)) ? 1 : 0;
      var showUnsend = (utils.isExist(query.fShowUnsend) && (query.fShowUnsend == 1)) ? true : false;
      var bc = !utils.isEmpty(query.fCustomerName);

      const vehList = await Vehicle.find({ veh_category: '自有' }).select('name').lean().exec();
      var vehs = utils.getAllList(false, vehList, "name", "");

      obj = { $and: [] };
      if (!showUnsend && (bVeh || bDest || bDate || bc)) {
        if (bVeh && !bDest && !bDate && !bc) {
          obj["$and"].push({ $or: [{ vehicle_vessel_name: { $in: query.fVeh } }, { 'bills.vehicles.veh_name': { $in: query.fVeh } }] });
        } else if (bDest && !bVeh && !bDate && !bc) {
          obj["$and"].push({ ship_to: { $in: query.fDest } });
        } else if (bDate && !bVeh && !bDest && !bc) {
          obj["$and"].push({ ship_date: { $gte: qDate.s, $lte: qDate.e } });
        } else if (bc && !bVeh && !bDest && !bDate) {
          obj["$and"].push({ ship_customer: query.fCustomerName });
        } else {
          if (bVeh) obj["$and"].push({ $or: [{ vehicle_vessel_name: { $in: query.fVeh } }, { 'bills.vehicles.veh_name': { $in: query.fVeh } }] });
          if (bDest) obj["$and"].push({ ship_to: { $in: query.fDest } });
          if (bDate) obj["$and"].push({ ship_date: { $gte: query.fDate1, $lte: query.fDate2 } });
          if (bc) obj["$and"].push({ ship_customer: query.fCustomerName });
        }

        let invoices;
        if (bVehMode) {
          var vehs_inner = utils.getAllList(false, vehList, "name", "");
          if (query.fVehMode === '自有') {
            if (Object.keys(obj).length > 0)
              obj["$and"].push({ $or: [{ vehicle_vessel_name: { $in: vehs_inner } }, { 'bills.vehicles.veh_name': { $in: vehs_inner } }] });
            else
              obj = { $or: [{ vehicle_vessel_name: { $in: vehs_inner } }, { 'bills.vehicles.veh_name': { $in: vehs_inner } }] };
          } else {
            if (Object.keys(obj).length > 0) {
              obj["$and"].push({ $and: [{ vehicle_vessel_name: { $nin: vehs_inner } }, { 'bills.vehicles.veh_name': { $nin: vehs_inner } }] });
            } else {
              obj = { $and: [{ vehicle_vessel_name: { $nin: vehs_inner } }, { 'bills.vehicles.veh_name': { $nin: vehs_inner } }] };
            }
          }
          invoices = await Invoice.find(obj).select('waybill_no ship_customer ship_date shipper bills').lean().exec();
        } else {
          invoices = await Invoice.find(obj).select('waybill_no ship_customer ship_date shipper bills').lean().exec();
        }

        if (invoices && invoices.length) {
          var ids = utils.getAllList(true, invoices, "bills", "bill_id");
          let billQueryObj = { _id: { $in: ids } };
          if (bName || bBNo || bOrder) {
            billQueryObj = { $and: [{ _id: { $in: ids } }] };
            if (bName) billQueryObj["$and"].push({ billing_name: { $in: query.fName } });
            if (bBNo) billQueryObj["$and"].push({ bill_no: { $regex: new RegExp(query.fBno, 'gi') } });
            if (bOrder) billQueryObj["$and"].push({ order_no: { $regex: new RegExp(query.fOrder, 'gi') } });
          }

          const bills = await Bill.find(billQueryObj).lean().exec();
          const settles = await Settle.find({ status: { '$ne': '已结算' } }).select('bills status').lean().exec();
          res.json({ ok: true, bills: getBillArray(bills, invoices, settles, query.fVeh, showVehicles) });
        } else {
          res.json({ ok: false });
        }

      } else { // only find from Bill
        if (bName || bBNo || bOrder || bVehMode) {
          obj = { $and: [] };
          if (bName) obj["$and"].push({ billing_name: { $in: query.fName } });
          if (bBNo) obj["$and"].push({ bill_no: { $regex: new RegExp(query.fBno, 'gi') } });
          if (bOrder) obj["$and"].push({ order_no: { $regex: new RegExp(query.fOrder, 'gi') } });
          if (showUnsend) {
            obj["$and"].push({ status: { $ne: '已配发' } });
            obj["$and"].push({ status: { $ne: '已结算' } });
            obj["$and"].push({ status: { $ne: '待配发' } });
          }

          if (bVehMode) {
            if (query.fVehMode === '自有') {
              obj["$and"].push({ $or: [{ 'invoices.veh_ves_name': { $in: vehs } }, { 'invoices.vehicles.veh_name': { $in: vehs } }] });
            } else {
              obj["$and"].push({ $and: [{ 'invoices.veh_ves_name': { $nin: vehs } }, { 'invoices.vehicles.veh_name': { $nin: vehs } }] });
            }
          }

          const bills = await Bill.find(obj).lean().exec();
          if (showUnsend) {
            res.json({ ok: true, bills: bills });
          } else {
            var invNoList = utils.getAllList(true, bills, "invoices", "inv_no");
            if (invNoList.length) {
              const db_invs = await Invoice.find({ waybill_no: { $in: invNoList } })
                .select('waybill_no ship_customer ship_date shipper')
                .lean()
                .exec();
              const settles = await Settle.find({ status: { '$ne': '已结算' } }).select('bills status').lean().exec();
              res.json({ ok: true, bills: getBillArray(bills, db_invs, settles, query.fVeh, showVehicles) });
            } else {
              res.json({ ok: true, bills: getBillArray(bills, [], [], query.fVeh, showVehicles) });
            }
          }
        } else {
          res.json({ ok: false });
        }
      }
    }
  } catch (err) {
    console.error("getInvoiceBill error:", err);
    res.json({ ok: false });
  }
};

exports.getInvoiceBill1 = function (req, res) {
  var query = req.query;
};

// destFilterMode: 0 - 目的地为非船; 1 - 目的地为船; 2 - both
function getBillArray(bills, invs, settles, vehList, mode) {
  var statObj = {};
  settles.forEach(function (settle) {
    settle.bills.forEach(function (sbill) {
      if (statObj[sbill.bill_id]) {
        statObj[sbill.bill_id].push({ no: sbill.inv_no, stat: settle.status })
      } else {
        statObj[sbill.bill_id] = [{ no: sbill.inv_no, stat: settle.status }];
      }
    })
  });

  var invObj = {};
  invs.forEach(function (inv) {
    invObj[inv.waybill_no] = { customer: inv.ship_customer, date: inv.ship_date, shipper: inv.shipper }
  });

  var copied = [];
  var b = vehList && vehList.length > 0;

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
            copied.push(copyBill(bill, binv, null));
          }
        } else if (mode === 1) {
          binv.vehicles.forEach(function (veh) {
            if (!b || vehList.indexOf(veh.veh_name) >= 0) {
              copied.push(copyBill(bill, binv, veh));
            }
          })
        } else {
          if (!b || vehList.indexOf(binv.veh_ves_name) >= 0) {
            copied.push(copyBill(bill, binv, null));
            binv.vehicles.forEach(function (veh) {
              if (!b || vehList.indexOf(veh.veh_name) >= 0) {
                copied.push(copyBill(bill, binv, veh));
              }
            })
          }
        }
      }
    })
  });

  return copied;
}

function copyBill(bill, binv, veh) {
  var obj = {
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

  return obj;
}


exports.getStatistics = async function (req, res) {
  if (req.user.privilege[3] === '1' || req.user.privilege[4] === '1' || req.user.privilege[5] === '1') {
    try {
      const names = await Company.distinct('name').exec();
      res.render('statistics/statistics', {
        title: '报表和打印',
        curr_page: '客户营业额',
        curr_page_name: '客户统计',
        dData: names,
        scripts: [
          '/js/lib/bootstrap-multiselect.js',
          '/js/plugins/amcharts/amcharts.js',
          '/js/plugins/amcharts/serial.js',
          '/js/report_stat.js'
        ]
      });
    } catch (err) {
      res.status(500).send(err.message);
    }
  }
  else {
    res.status(404);
    res.render('404');
  }
};

exports.getShippingChargeReport = async function (req, res) {
  if (req.user.privilege[3] === '1' || req.user.privilege[4] === '1' || req.user.privilege[5] === '1') {
    try {
      const names = await Company.distinct('name').exec();
      const result = {
        title: '运输价格报表',
        curr_page: '运输价格报表',
        curr_page_name: '运输价格报表',
        dData: {
          ship_name: names,
          vehicles: [],
          destination: [],
          users: [],
        },
        scripts: [
          '/js/lib/bootstrap-multiselect.js',
          '/js/plugins/select2/select2.min.js',
          '/js/plugins/select2/select2_locale_zh-CN.js',
          '/js/shipping_charge.js'
        ]
      };

      const vehs = await Vehicle.find({}).lean().exec();
      result.dData.vehicles = utils.getAllList(false, vehs, "name");
      
      const dnames = await Destination.distinct('name').exec();
      result.dData.destination = dnames;

      const unames = await User.distinct('userid').exec();
      result.dData.users = unames;
      
      res.render('statistics/shipping_charge', result);
    } catch (err) {
      res.status(500).send(err.message);
    }
  }
  else {
    res.status(404);
    res.render('404');
  }
};

exports.getStatisticsDataByCondition = async function (req, res) {
  try {
    const searchResult = await searchDbData(res, req.query, 'waybill_no ship_name ship_date bills', 'billing_name block_num weight collection_price invoices');
    if (!searchResult.ok) {
      return res.json({ ok: false });
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
      } else {
        logger.error("Cannot find " + b);
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

exports.getCustomerDetail = async function (req, res) {
  try {
    const searchResult = await searchDbData(res, req.query, 'waybill_no ship_name ship_customer ship_date bills', null);
    if (!searchResult.ok) {
      return res.json({ ok: false });
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
            order: bill.order,
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

exports.getCustomerChartData = async function (req, res) {
  var query = req.query;
  var months = query.fMonths;
  
  try {
    const searchResult = await searchDbData(res, query, 'waybill_no ship_name ship_date bills', 'billing_name block_num weight collection_price invoices');
    if (!searchResult.ok) {
      return res.json({ ok: false });
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
      var date = (new Date(inv.ship_date)).format('yyyy-MM');
      for (var m = 0; m < months.length; ++m) {
        if (date === months[m]) {
          idx = m;
          break;
        }
      }

      invNoObj[inv.inv_no] = { name: inv.ship_name, date: date, index: idx };
    }

    allNames.sort(function (a, b) { return a.localeCompare(b); });

    for (idx = 0; idx < months.length; ++idx) {
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



// Helper function list
async function searchDbData(res, query, inv_f_selected, bill_f_selected) {
  var obj = { $and: [{ state: { $ne: '新建' } }] };

  if (query.fDate1 && query.fDate2) {
    var qDate = getStartEndDate(query.fDate1, query.fDate2, false);
    obj["$and"].push({ ship_date: { $gte: qDate.s, $lte: qDate.e } });
  }

  if (query.fName && query.fName.length) {
    obj["$and"].push({ ship_name: { $in: query.fName } });
  }

  try {
    let invQuery = Invoice.find(obj);
    if (inv_f_selected) {
      invQuery.select(inv_f_selected);
    }
    const db_invs = await invQuery.lean().exec();

    if (!db_invs || db_invs.length === 0) {
      return { ok: false };
    }

    const ids = utils.getAllList(true, db_invs, "bills", "bill_id");
    let billQuery = Bill.find({ _id: { $in: ids } });
    if (bill_f_selected) {
      billQuery.select(bill_f_selected);
    }
    const bills = await billQuery.lean().exec();

    if (!bills || bills.length === 0) {
      return { ok: false };
    }

    return { ok: true, db_invs, bills };
  } catch (err) {
    console.error("searchDbData error:", err);
    return { ok: false };
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
