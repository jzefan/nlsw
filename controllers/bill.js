/**
 * Created by zefan on 2014/4/22.
 */
"use strict";

let Vehicle = require('../models/Vehicle');
let Company = require('../models/Company');
let Warehouse = require('../models/Warehouse');
let Destination = require('../models/Destination');
let Brand = require('../models/Brand');
let SaleDep = require('../models/SaleDep');
let Bill = require('../models/Bill');
let Invoice = require('../models/Invoice');
let Settle = require('../models/Settle');
let OrderPlan = require('../models/OrderPlan');
let utils = require('./utils');
let bunyan = require('bunyan');
const { hasPermission, hasAnyPermission } = require('../shared/permissions');

let logger = bunyan.createLogger({
  name: 'XHT',
  streams: [{ level: 'info', stream: process.stdout }, { level: 'error', path: 'app.log' }]
});

const CUSTOMER_SETTLE_FLAG = 1; // 0001
const COLLECTION_SETTLE_FLAG = 2; // 0010
const VESSEL_SETTLE_FLAG = 4; // 0100
const EPSILON = 0.000001; //Number.EPSILON === undefined ? 0.000001 : Number.EPSILON;

function pushArr(arr, elem) {
  if (elem && arr.indexOf(elem) < 0) {
    arr.push(elem);
  }
};

exports.createBills = async function (req, res) {
  if (!hasAnyPermission(req.user.privilege, 'operator', 'statistics', 'selfVehicle')) {
    res.status(404);
    res.render('404');
  }
  else {
    await getDictDataAndRender('bill', false, false, false, function (data) {
      res.render('bill/create_bill', {
        title: '提单管理',
        curr_page: '新建提单',
        curr_page_name: '新建',
        bShowDataTable: true,
        dDataDict: data,
        scripts: [
          '/js/plugins/sheetJS/shim.js',
          '/js/plugins/sheetJS/XLSX/jszip.js',
          '/js/plugins/sheetJS/XLSX/xlsx.core.min.js',
          '/js/plugins/sheetJS/XLS/xls.min.js',
          '/js/plugins/select2/select2.min.js',
          '/js/plugins/select2/select2_locale_zh-CN.js',
          '/js/plugins/datatables/jquery.dataTables.min.js',
          '/js/bill_import_create_01.js'
        ]
      });
    })
  }
};

function isInteger(n) {
  return n === +n && n === (n | 0);
}

function isExist(variable) {
  return ((typeof variable != 'undefined') && undefined != variable);
}
function isEmpty(variable) {
  return (typeof variable === 'undefined' || !variable || 0 === variable.length);
}

exports.postCreateBills = async function (req, res) {
  let allBillName = [];
  let allWarehouse = [];
  let allBrandNo = [];
  let allocatedData = [];

  for (let row_data of req.body) {
    let order = row_data.order;
    let bno = row_data.bill_no;

    try {
      let bill = await Bill.findOne({ order: order, bill_no: bno }).exec();
      if (!bill) {
        bill = new Bill({
          order: order, bill_no: bno,
          order_no: row_data.order_no,
          order_item_no: row_data.order_item_no,
          billing_name: row_data.billing_name,
          sale_dep: row_data.sales_dep,
          block_num: utils.getIntValue(row_data.block_num),
          total_weight: utils.getFloatValue(row_data.total_weight, 3),

          warehouse: row_data.warehouse,
          ship_warehouse: row_data.ship_warehouse,
          contract_no: row_data.contract_no,
          shipping_address: row_data.shipping_address,
          product_type: row_data.product_type,
          creater: req.user.userid,
          invoices: [],
          customer_price: 0,
          collection_price: 0
        });

        if (row_data.brand_no) {
          let brd_list = row_data.brand_no.split(/\s*;\s*/);
          if (brd_list.length) {
            bill.brand_no = brd_list[brd_list.length - 1];
            pushArr(allBrandNo, bill.brand_no);
          }
        }

        if (!isEmpty(row_data.dimensions)) {
          bill.len = bill.width = bill.thickness = 0;

          let temp = row_data.dimensions.replace(/≠/, "").split('*');
          if (temp.length) {
            bill.thickness = utils.getFloatValue(temp[0], 0);
            if (temp.length === 2) {
              bill.width = utils.getIntValue(temp[1]);
            } else if (temp.length === 3) {
              bill.width = utils.getIntValue(temp[1]);
              bill.len = utils.getIntValue(temp[2]);
            }
          }
        } else {
          bill.len = utils.getIntValue(row_data.block_len);
          bill.width = utils.getIntValue(row_data.width);
          bill.thickness = utils.getFloatValue(row_data.thickness, 0);
        }

        if (isEmpty(row_data.size_type) || row_data.size_type == '双定尺') {
          bill.size_type = '定尺';
        } else if (row_data.size_type === '单定尺') {
          bill.size_type = '单定';
        } else {
          bill.size_type = row_data.size_type;
        }

        if (bill.total_weight > 0) {
          if (bill.block_num > 0) {
            bill.weight = bill.total_weight / bill.block_num;
          } else {
            bill.block_num = 0;

            let weight = 0;
            if (row_data.weight) {
              weight = utils.getFloatValue(row_data.weight, 3);
            } else {
              if (bill.len > 0 && bill.width > 0 && bill.thickness > 0) {
                weight = utils.toFixedNumber(bill.len * bill.width * bill.thickness * 7.85 * Math.pow(10, -9), 3);
              }
            }

            if (weight > 0) {
              let n = bill.total_weight / weight;
              if (isInteger(n)) {
                bill.block_num = n;
              } else {
                let round = Math.round(n);
                if (Math.abs(round - n) < 0.00001) {
                  bill.block_num = round;
                }
              }
            }

            bill.weight = bill.block_num > 0 ? weight : 0;
          }

          bill.left_num = (bill.block_num > 0) ? bill.block_num : bill.total_weight;

          await bill.save();
        }
      } else {
        if (bill.status != '新建') {
          allocatedData.push(bill);
        }
      }
    } catch (err) {
      logger.error('保存出错！(订单号:' + order + ', 提单号:' + bno + ', 原因:' + err);
      return res.end(JSON.stringify({ ok: false, response: err }));
    }

    pushArr(allBillName, row_data.billing_name);
    pushArr(allWarehouse, row_data.warehouse);
    pushArr(allWarehouse, row_data.ship_warehouse);
  }

  for (let w of allWarehouse) {
    try {
      let ware = await Warehouse.findOne({ name: w }).exec();
      if (!ware) {
        ware = new Warehouse({ name: w });
        await ware.save();
      }
    } catch (e) {
      logger.error("Save warehouse error! %s", e.toString());
    }
  }

  for (let b of allBrandNo) {
    try {
      let brand = await Brand.findOne({ name: b }).exec();
      if (!brand) {
        brand = new Brand({ name: b });
        await brand.save();
      }
    } catch (e) {
      logger.error("Save brand error! %s", e.toString());
    }
  }

  for (let bn of allBillName) {
    try {
      let comp = await Company.findOne({ name: bn }).exec();
      if (!comp) {
        comp = new Company({ name: bn });
        await comp.save();
      }
    } catch (e) {
      logger.error("Save company error! %s", e.toString());
    }
  }

  res.end(JSON.stringify({ ok: true, noUpdatedData: allocatedData }));
};

exports.modifyBill = function (req, res) {
  if (!hasAnyPermission(req.user.privilege, 'operator', 'statistics', 'selfVehicle')) {
    res.status(404);
    res.render('404');
  }
  else {
    res.render('bill/modify_bill', {
      title: '提单管理',
      curr_page: '提单管理-修改订单',
      curr_page_name: '修改',
      bUseJstree: true,
      scripts: [
        '/js/lib/jstree.min.js',
        '/js/plugins/select2/select2.min.js',
        '/js/plugins/select2/select2_locale_zh-CN.js',
        '/js/bill_mgt.js'
      ]
    })
  }
};


const updateInvoiceStatus = async function (res, allInvNo, settle_type) {
  try {
    let invs = await Invoice.find({ waybill_no: { $in: allInvNo } }).exec();
    for (let invoice of invs) {
      let ids = utils.getAllList(true, invoice.bills, "bill_id");
      let billArr = await Bill.find({ _id: { $in: ids } }).exec();

      let settled = true;
      for (let idx = 0, len = billArr.length; idx < len && settled; ++idx) {
        for (let binv of billArr[idx].invoices) {
          settled = checkFlag(binv.inv_settle_flag, settle_type);
          if (!settled) {
            break;
          }
        }
      }

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

    res.end(JSON.stringify({ ok: true }));
  } catch (e) {
    res.end(JSON.stringify({ ok: false, response: '更新运单状态错:' + e.toString() }));
  }
}

exports.postModifySingleBill = async function (req, res) {
  try {
    await Bill.findByIdAndUpdate(req.body._id, req.body, null).exec();
    
    let company = await Company.findOne({ name: req.body.billing_name }).exec();
    if (!company) {
      company = new Company({ name: req.body.billing_name });
      await company.save();
    }
    
    res.end(JSON.stringify({ ok: true }));
  } catch (err) {
    logger.error("postModifySingleBill: error! %s", err);
    res.end(JSON.stringify({ ok: false, response: '修改失败' }));
  }
};

exports.postBatchModifyBill = async function (req, res) {
  try {
    for (let bill of req.body.bills) {
      let b = await Bill.findByIdAndUpdate(bill._id, bill, { new: true });
      if (!b) {
        return res.end(JSON.stringify({ ok: false, error: "No update with the given bill" }));
      }
    }

    if (req.body.nameChanged) {
      let bname = req.body.bills[0].billing_name;
      let comp = await Company.findOne({ name: bname }).exec();
      if (!comp) {
        company = new Company({ name: bname });
        await company.save();
      }
    }

    res.end(JSON.stringify({ ok: true }));
  } catch (e) {
    res.end(JSON.stringify({ ok: false, error: e.toString() }));
  }
};

exports.getBillsByNo = async function (req, res) {
  var reg = new RegExp(req.query.q, 'gi');
  await queryBills({ order_no: { $regex: reg } }, { order_no: 'asc' }, res, function (bills, result) {
    var list = utils.getAllList(true, bills, "order_no");
    result.targetData = buildTargetData(list);
  });
};

exports.getBillsByBillName = async function (req, res) {
  var dt = new Date();
  if (req.query.q === '南京钢铁集团国际经济贸易有限公司') {
    dt.setMonth(dt.getMonth() - 12);
  } else {
    dt.setMonth(dt.getMonth() - 18);
  }
  var obj = {
    $and: [
      { billing_name: req.query.q },
      { left_num: { $gt: 0 } },
      // { status: { $ne: '已配发'} },
      // { status: { $ne: '已结算'} },
      // { status: { $ne: '已开票'} },
      // { status: { $ne: '已回款'} },
      { create_date: { $gte: dt } }
    ]
  };

  // console.log(obj['$and'])

  try {
    const count = await Bill.countDocuments(obj).exec();
    if (count === 0) {
      res.end(JSON.stringify({ ok: false, number: 0 }));
    } else {
      let query = Bill.find(obj, {
        settle_flag: 0, contract_no: 0, product_type: 0, creater: 0,
        customer_price: 0, collection_price: 0, brand_no: 0, shipper: 0, shipping_date: 0,
        size_type: 0, warehouse: 0,
      });

      if (count > 20000) {
        console.log('count = ' + count);
        // query.limit(20000);
      }

      const bills = await query.sort({ create_date: -1 }).lean().exec();
      var result = { ok: true, bills: bills, number: count };
      // var list = utils.getAllList(true, bills, "order_no");
      // result.targetData = buildTargetData(list);

      res.json(result);
    }
  } catch (err) {
    res.end(JSON.stringify({ ok: false, response: '查询数据库出错' + err, number: 0 }));
  }
};

exports.getBillsByOrder = async function (req, res) {
  await queryBills({ order_no: { $regex: new RegExp(req.query.q, 'gi') } }, { order_no: 'asc' }, res, function (bills, result) {
    var order_map = {};
    var order_list = [];

    bills.forEach(function (bill) {
      var order_no = bill.order_no;
      var order_item_no = bill.order_item_no;

      if (order_no && order_list.indexOf(order_no) >= 0) {
        var o = order_map[order_no];
        pushArr(o, order_item_no);
      } else {
        order_list.push(order_no);
        order_map[order_no] = [order_item_no];
      }
    });

    result.targetData = buildTargetData(order_list);
    result.orderItemNoMap = order_map;
  });
};

async function queryBills(queryObj, sortObj, res, getTargetData) {
  try {
    const count = await Bill.countDocuments(queryObj).exec();
    if (count === 0) {
      res.end(JSON.stringify({ ok: false, number: 0 }));
    } else {
      var query = Bill.find(queryObj);
      if (count > 20000) {
        console.log('count = ' + count);
        // query.limit(20000);
      }

      const bills = await query.sort(sortObj).lean().exec();
      var result = { ok: true, bills: bills, number: count };
      if (getTargetData) {
        getTargetData(bills, result);
      }

      res.json(JSON.stringify(result));
    }
  } catch (err) {
    res.end(JSON.stringify({ ok: false, response: '查询数据库出错' + err, number: 0 }));
  }
}

exports.getBillsWithCondition = async function (req, res) {
  var query = req.query;
  if (query.search_left == 1) {
    await queryBills({
      $and: [
        { status: { $regex: new RegExp('已配发', 'gi') } },
        { block_num: 0 },
        { left_num: { $gt: 0, $lt: parseFloat(query.left) } }
      ]
    }, { order_no: 'asc' }, res);
  } else {
    var q = JSON.parse(query.q);
    if (query.isNeedAnalysis == 'true') {
      var obj = getQueryFromNodes(q, query.field);
      if (Object.keys(obj).length > 0) {
        await queryBills(obj, { order_no: 'asc' }, res);
      } else {
        res.end(JSON.stringify({ ok: false, response: '查询条件为空!' }));
      }
    } else {
      await queryBills(q, { order_no: 'asc' }, res);
    }
  }
};

exports.deleteBill = function (req, res) {
  if (!hasAnyPermission(req.user.privilege, 'operator', 'statistics', 'selfVehicle')) {
    res.status(404);
    res.render('404');
  }
  else {
    res.render('bill/delete_bill', {
      title: '提单管理',
      curr_page: '提单管理-删除订单',
      curr_page_name: '删除',
      bUseJstree: true,
      scripts: [
        '/js/lib/jstree.min.js',
        '/js/plugins/select2/select2.min.js',
        '/js/plugins/select2/select2_locale_zh-CN.js',
        '/js/bill_mgt.js'
      ]
    })
  }
};

exports.postDeleteBill = async function (req, res) {
  try {
    for (let bill of req.body) {
      await Bill.findByIdAndDelete(bill._id).exec();
    }
    res.end(JSON.stringify({ ok: true }));
  } catch (e) {
    res.end(JSON.stringify({ ok: false, response: e.toString() }));
  }
};

///////////////////////////////////////////////////////////////////////////////
// 结算代码
///////////////////////////////////////////////////////////////////////////////
function pushInvVehs(arr, bills) {
  for (let bill of bills) {
    if (bill.vehicles.length > 0) {
      for (let veh of bill.vehicles) {
        pushArr(arr, veh.veh_name);
      }
    }
  }
}

exports.getSettleBill = async function (req, res) {
  if (!hasAnyPermission(req.user.privilege, 'operator', 'statistics')) {
    res.status(404);
    res.render('404');
  }
  else {
    let bnameList = [];
    let vehList = [];
    let destList = [];
    let bs = [], vs = [], ds = [];
    try {
      let db_invs = await Invoice.find({ state: { $ne: '新建' }, selfOwned: { $ne: 1 } })
        .select({ "_id": 0, "settle_flag": 1, "ship_name": 1, "vehicle_vessel_name": 1, "ship_to": 1, "bills": 1 })
        .lean().exec();

      for (let inv of db_invs) {
        if ((inv.settle_flag & CUSTOMER_SETTLE_FLAG) !== CUSTOMER_SETTLE_FLAG) {
          pushInvVehs(vehList, inv.bills);

          pushArr(bnameList, inv.ship_name);
          pushArr(vehList, inv.vehicle_vessel_name);
          pushArr(destList, inv.ship_to);
        }

        if ((inv.settle_flag & COLLECTION_SETTLE_FLAG) !== COLLECTION_SETTLE_FLAG) {
          pushInvVehs(vs, inv.bills);

          pushArr(bs, inv.ship_name);
          pushArr(vs, inv.vehicle_vessel_name);
          pushArr(ds, inv.ship_to);
        }
      }

      res.render('settle/settle', {
        title: '结算管理',
        curr_page: '结算管理-结算',
        curr_page_name: '结算',
        dData: {
          nameList: utils.pinyin_sort(bnameList),
          vehList: utils.pinyin_sort(vehList),
          destList: utils.pinyin_sort(destList),
          orderList: [], billNoList: [],
          forSelf: false
        },
        dData_2: {
          nameList: utils.pinyin_sort(bs),
          vehList: utils.pinyin_sort(vs),
          destList: utils.pinyin_sort(ds),
          orderList: [], billNoList: []
        },
        scripts: [
          '/js/plugins/select2/select2.min.js',
          '/js/plugins/select2/select2_locale_zh-CN.js',
          '/js/lib/bootstrap-multiselect.js',
          '/js/plugins/tablesorter/jquery.tablesorter.min.js',
          '/js/plugins/tablesorter/jquery.tablesorter.widgets.min.js',
          '/js/settle_mgt_01.js'
        ]
      });
    } catch (e) {
      res.status(500).render('500');
    }
  }
};

exports.getSettleBillSelf = async function (req, res) {
  if (!hasPermission(req.user.privilege, 'selfVehicle')) {
    res.status(404);
    res.render('404');
  }
  else {
    let bnameList = [];
    let vehList = [];
    let destList = [];
    let bs = [], vs = [], ds = [];
    try {
      let db_invs = await Invoice.find({ state: { $ne: '新建' }, selfOwned: 1 })
        .select({ "_id": 0, "settle_flag": 1, "ship_name": 1, "vehicle_vessel_name": 1, "ship_to": 1, "bills": 1 })
        .lean().exec();

      for (let inv of db_invs) {
        if ((inv.settle_flag & CUSTOMER_SETTLE_FLAG) !== CUSTOMER_SETTLE_FLAG) {
          pushInvVehs(vehList, inv.bills);

          pushArr(vehList, inv.vehicle_vessel_name);
          pushArr(bnameList, inv.ship_name);
          pushArr(destList, inv.ship_to);
        }

        // if ((inv.settle_flag & COLLECTION_SETTLE_FLAG) !== COLLECTION_SETTLE_FLAG) {
        //   pushArr(bs, inv.ship_name);
        //   pushArr(vs, inv.vehicle_vessel_name);
        //   pushArr(ds, inv.ship_to);
        // }
      }

      res.render('settle/settle', {
        title: '自有车结算管理',
        curr_page: '自有车结算管理-结算',
        curr_page_name: '自有车结算',
        dData: {
          nameList: utils.pinyin_sort(bnameList),
          vehList: utils.pinyin_sort(vehList),
          destList: utils.pinyin_sort(destList),
          orderList: [], billNoList: [],
          forSelf: true
        },
        dData_2: {
          nameList: utils.pinyin_sort(bs),
          vehList: utils.pinyin_sort(vs),
          destList: utils.pinyin_sort(ds),
          orderList: [], billNoList: []
        },
        scripts: [
          '/js/plugins/select2/select2.min.js',
          '/js/plugins/select2/select2_locale_zh-CN.js',
          '/js/lib/bootstrap-multiselect.js',
          '/js/plugins/tablesorter/jquery.tablesorter.min.js',
          '/js/plugins/tablesorter/jquery.tablesorter.widgets.min.js',
          '/js/settle_mgt_01.js'
        ]
      });
    } catch (e) {
      console.log(e)
      res.status(500).render('500');
    }
  }
};

exports.postPriceInput = async function (req, res) {
  try {
    for (let priceObj of req.body.data) {
      let db_bill = await Bill.findById(priceObj.bid).exec();
      if (req.body.act === "CUSTOMER") {
        for (let inv of db_bill.invoices) {
          if (inv.inv_no === priceObj.inv_no) {
            inv.price = priceObj.price;
          }
        }
      } else {
        db_bill.collection_price = priceObj.price;
      }

      await db_bill.save();

      // console.log(priceObj)
      let db_inv = await Invoice.find({ waybill_no: priceObj.inv_no }).exec();
      if (db_inv.length) {
        db_inv[0].incoming_price_remark = priceObj.remark;
        await db_inv[0].save();
      }
    }

    res.end(JSON.stringify({ ok: true }));
  } catch (e) {
    res.end(JSON.stringify({ ok: false, response: e.toString() }));
  }
};

function getSettleFalgWithType(flag, type) {
  let f = 0;
  if (type === "CUSTOMER" || type === "客户结算") {
    f = flag & CUSTOMER_SETTLE_FLAG;
  } else if (type === "COLLECTION" || type === "代收代付结算") {
    f = flag & COLLECTION_SETTLE_FLAG;
  } else if (type === "VESSEL_VEH" || type === "车船结算") {
    f = flag & VESSEL_SETTLE_FLAG;
  }

  return f;
}

function setFlag(flag, type) {
  if (type === "CUSTOMER" || type === "客户结算") {
    return flag | CUSTOMER_SETTLE_FLAG;
  } else if (type === "COLLECTION" || type === "代收代付结算") {
    return flag | COLLECTION_SETTLE_FLAG;
  } else if (type === "VESSEL_VEH" || type === "车船结算") {
    return flag | VESSEL_SETTLE_FLAG;
  }
}

function checkFlag(flag, type) {
  if (type === "CUSTOMER" || type === "客户结算") {
    return ((flag & CUSTOMER_SETTLE_FLAG) === CUSTOMER_SETTLE_FLAG);
  } else if (type === "COLLECTION" || type === "代收代付结算") {
    return ((flag & COLLECTION_SETTLE_FLAG) === COLLECTION_SETTLE_FLAG);
  } else if (type === "VESSEL_VEH" || type === "车船结算") {
    return ((flag & VESSEL_SETTLE_FLAG) === VESSEL_SETTLE_FLAG);
  }
}

function clearFlag(flag, type) {
  if (type === "CUSTOMER" || type === "客户结算") {
    return flag & ~CUSTOMER_SETTLE_FLAG;
  } else if (type === "COLLECTION" || type === "代收代付结算") {
    return flag & ~COLLECTION_SETTLE_FLAG;
  } else if (type === "VESSEL_VEH" || type === "车船结算") {
    return flag & ~VESSEL_SETTLE_FLAG;
  }
}

exports.postSettleBill = async function (req, res) {
  let uno = utils.leftPad(req.user.no, 4);
  let date_no = new Date().yyyymmdd() + uno;
  let reg = new RegExp('^JS' + date_no + '.*', 'g');

  try {
    let settles = await Settle.find({ serial_number: { $regex: reg } }).sort({ serial_number: 'desc' }).exec();
    let no = utils.leftPad(1, 3);
    if (settles.length > 0) {
      let str = settles[0].serial_number.substring(14);
      no = utils.leftPad((+str) + 1, 3);
    }

    let tn = 0, tw = 0;
    let allIDs = [];
    let allInvNo = [];
    for (let item of req.body.settleObj) {
      allIDs.push({
        bill_id: item.bid,
        num: item.num,
        weight: item.weight,
        inv_no: item.inv_no,
        settle_flag: item.settle_flag
      });

      tn += item.num;
      tw += item.weight;

      pushArr(allInvNo, item.inv_no);
    }

    let settle_type = req.body.settle_type;
    if (settle_type === 'CUSTOMER') {
      settle_type = '客户结算';
    } else if (settle_type === 'COLLECTION') {
      settle_type = '代收代付结算';
    } else {
      settle_type = '车船结算';
    }

    let settle = new Settle({
      serial_number: 'JS' + date_no + no,
      billing_name: req.body.billName,
      price: parseFloat(req.body.price),
      real_price: parseFloat(req.body.price),
      settle_type: settle_type,
      ship_number: tn,
      ship_weight: tw,
      ship_to: req.body.shipTo,
      bills: allIDs.slice(0),
      settle_date: new Date(),
      settler: req.user.userid,
      selfOwned: req.body.selfOwned,
      status: '已结算'
    });

    for (let idObj of allIDs) {
      let db_bill = await Bill.findById(idObj.bill_id).exec();
      if (db_bill) {
        if (db_bill.status === '已配发') {
          db_bill.status = "已结算";
        }

        for (let inv of db_bill.invoices) {
          if (inv.inv_no === idObj.inv_no) {
            inv.inv_settle_flag = setFlag(inv.inv_settle_flag, settle_type);
          }
        }

        if (db_bill.invoices.length === 1) {
          db_bill.settle_flag = db_bill.invoices[0].inv_settle_flag;
        } else {
          if (isSameSettleFlag(db_bill, settle_type)) {
            db_bill.settle_flag = setFlag(db_bill.settle_flag, settle_type);
          }
        }

        await db_bill.save();
      }
    }

    updateInvoiceStatus(res, allInvNo, settle_type);
    await settle.save();
  } catch (e) {
    res.end(JSON.stringify({ ok: false, response: '结算时不能生成流水号, 查询数据库出错' + e.toString() }));
  }
};

function isSameSettleFlag(bill, type) {
  let same = true;
  if (bill.invoices.length) {
    let flag = getSettleFalgWithType(bill.invoices[0].inv_settle_flag, type);
    for (let binv of bill.invoices) {
      let f = getSettleFalgWithType(binv.inv_settle_flag, type);
      if (same && flag !== f) {
        same = false;
        break;
      }
    }
  }

  return same;
}

exports.postSettleCollectionNotRequire = async function (req, res) {
  let nonSettleObj = req.body.nonSettleObj;
  let action = req.body.settle_type;
  let allInvNo = utils.getAllList(true, nonSettleObj, "inv_no");
  try {
    for (let obj of nonSettleObj) {
      let db_bill = await Bill.findById(obj.bid).exec();
      if (action === "COLLECTION") {
        db_bill.collection_price = -1;
        //db_bill.settle_flag = clearFlag(db_bill.settle_flag, action);
        for (let inv of db_bill.invoices) {
          if (inv.inv_no === obj.inv_no) {
            inv.inv_settle_flag = clearFlag(inv.inv_settle_flag, action);
          }
        }
      } else {
        for (let inv of db_bill.invoices) {
          if (inv.inv_no === obj.inv_no) {
            inv.inv_settle_flag = clearFlag(inv.inv_settle_flag, action);
            inv.price = -1;
          }
        }
      }

      if (db_bill.invoices.length === 1) {
        db_bill.settle_flag = db_bill.invoices[0].inv_settle_flag;
      } else {
        if (isSameSettleFlag(db_bill, action)) {
          db_bill.settle_flag = clearFlag(db_bill.settle_flag, action);
        }
      }

      if (db_bill.settle_flag === 0 && db_bill.left_num < EPSILON) {
        db_bill.left_num = 0;
        db_bill.status = "已配发";
      }

      await db_bill.save();
    }

    updateInvoiceStatus(res, allInvNo, action);
  } catch (e) {
    res.end(JSON.stringify({ ok: false, response: e.toString() }));
  }
};

exports.postDeleteSettle = async function (req, res) {
  try {
    for (let settle of req.body.allSelected) {
      let dbSettle = await Settle.findById(settle._id).exec();
      if (!dbSettle) {
        return res.end(JSON.stringify({ ok: false, response: '删除结算:' + settle._id + '出错' }));
      }

      let settle_type = settle.settle_type;
      let ids = [];
      let allInvNo = [];
      dbSettle.bills.forEach(function (b) {
        ids.push(b.bill_id);
        pushArr(allInvNo, b.inv_no);
      });

      // let docs = await Settle.aggregate([
      //   { $match: { serial_number: dbSettle.serial_number } },
      //   { $unwind: "$bills" },
      //   { $lookup: { from: "bills", localField: "bills.bill_id", foreignField: "_id", as: "bill_doc" }},
      //   { $unwind: "$bill_doc" },
      // ])
      // console.log(docs);
      let dbBills = await Bill.find({ _id: { $in: ids } }).exec();
      for (let bill of dbBills) {
        dbSettle.bills.forEach((sb) => {
          if (String(bill._id) === String(sb.bill_id)) {
            bill.invoices.forEach((inv) => {
              if (inv.inv_no === sb.inv_no) {
                inv.inv_settle_flag = clearFlag(inv.inv_settle_flag, settle_type);
              }
            })
          }
        });

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

        if (bill.settle_flag === 0 && bill.left_num < EPSILON) {
          bill.left_num = 0;
          bill.status = '已配发';
        }

        await bill.save();
      }

      let dbInvs = await Invoice.find({ waybill_no: { $in: allInvNo } }).exec();
      for (let invoice of dbInvs) {
        let ids = utils.getAllList(true, invoice.bills, "bill_id");
        // 2. find all Bills for each invoice
        let dbBills = await Bill.find({ _id: { $in: ids } }).lean().exec();
        let settled = true;
        for (let idx = 0, len = dbBills.length; idx < len && settled; ++idx) {
          for (let binv of dbBills[idx].invoices) {
            settled = checkFlag(binv.inv_settle_flag, settle_type);
            if (!settled) {
              break;
            }
          }
        }

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

      await Settle.deleteOne({ serial_number: settle.serial_number });
    }

    res.end(JSON.stringify({ ok: true }));
  } catch (e) {
    res.end(JSON.stringify({ ok: false, response: e.toString() }));
  }
};

exports.getSettleTicket = async function (req, res) {
  if (!hasPermission(req.user.privilege, 'account')) {
    res.status(404);
    res.render('404');
  } else {
    await ticket_money_render(res, { status: { $in: ['已结算', '已开票'] }, selfOwned: 0 }, "settle/settle_ticket", "开票", false);
  }
};

exports.getSettleTicketSelf = async function (req, res) {
  if (!hasPermission(req.user.privilege, 'selfVehicle')) {
    res.status(404);
    res.render('404');
  } else {
    await ticket_money_render(res, { status: { $in: ['已结算', '已开票'] }, selfOwned: 1 }, "settle/settle_ticket", "开票", true);
  }
};

exports.getSettleMoney = async function (req, res) {
  if (!hasPermission(req.user.privilege, 'account')) {
    res.status(404);
    res.render('404');
  }
  else {
    await ticket_money_render(res, { status: { $in: ['已回款', '已开票'] }, selfOwned: 0 }, "settle/settle_money", "回款", false);
  }
};

exports.getSettleMoneySelf = async function (req, res) {
  if (!hasPermission(req.user.privilege, 'selfVehicle')) {
    res.status(404);
    res.render('404');
  }
  else {
    await ticket_money_render(res, { status: { $in: ['已回款', '已开票'] }, selfOwned: 1 }, "settle/settle_money", "回款", true);
  }
};

async function ticket_money_render(res, search_obj, route, title, forSelf) {
  const tit = forSelf ? '自有车' : '';
  try {
    const settles = await Settle.find(search_obj, { bills: 0 }).lean().sort({ settle_date: -1 }).exec();
    res.render(route, {
      title: tit + '结算管理',
      curr_page: tit + '结算管理-' + title,
      curr_page_name: title,
      dbSettleData: { settles: settles, forSelf: forSelf },
      forSelf: forSelf,
      scripts: [
        '/js/plugins/select2/select2.min.js',
        '/js/plugins/select2/select2_locale_zh-CN.js',
        '/js/plugins/tablesorter/jquery.tablesorter.min.js',
        '/js/plugins/tablesorter/jquery.tablesorter.widgets.min.js',
        '/js/ticket_money_03.js'
      ]
    });
  } catch (err) {
    res.render(route, {
      title: tit + '结算管理',
      curr_page: tit + '结算管理-' + title,
      curr_page_name: title,
      forSelf: forSelf,
      scripts: [
        '/js/plugins/select2/select2.min.js',
        '/js/plugins/select2/select2_locale_zh-CN.js',
        '/js/plugins/tablesorter/jquery.tablesorter.min.js',
        '/js/plugins/tablesorter/jquery.tablesorter.widgets.min.js',
        '/js/ticket_money_03.js'
      ]
    });
  }
}

exports.getSettleInvoiceBill = async function (req, res) {
  var query = req.query;
  try {
    const settle = await Settle.findOne({ serial_number: query.fSerial }).exec();
    if (!settle) {
        return res.end(JSON.stringify({ ok: false }));
    }
    
    var allIds = utils.getAllList(true, settle.bills, "bill_id");
    const billArr = await Bill.find({ _id: { $in: allIds } }).exec();
    
    if (billArr) {
      res.end(JSON.stringify({ ok: true, bills: billArr, settle_bills: settle.bills }));
    } else {
      res.end(JSON.stringify({ ok: false }));
    }
  } catch (err) {
    res.end(JSON.stringify({ ok: false }));
  }
};

exports.postSettleTicketMoney = async function (req, res) {
  try {
    for (let settle of req.body) {
      let dbSettle = await Settle.findById(settle._id).exec();
      if (dbSettle) {
        dbSettle.ticket_no = settle.ticket_no;
        dbSettle.ticket_date = settle.ticket_date;
        dbSettle.ticket_person = settle.ticket_person;
        dbSettle.status = settle.status;
        dbSettle.return_person = settle.return_person;
        dbSettle.return_money_date = settle.return_money_date;

        await dbSettle.save();
      }
    }

    res.end(JSON.stringify({ ok: true }));
  } catch (e) {
    res.end(JSON.stringify({ ok: false, response: e.toString() }));
  }
};

exports.postSettleRealPrice = async function (req, res) {
  try {
    let settle = await Settle.findOne({ serial_number: req.body.sno }).exec();
    settle.real_price = req.body.price;
    await settle.save();
    res.end(JSON.stringify({ ok: true }));
  } catch (e) {
    res.end(JSON.stringify({ ok: false, response: '查找结算号出错:' + e.toString() }));
  }
};

/// 车船结算 ------------
////////////////////////
async function getSettleVesselData(selfOwned) {
  var qObj = { state: { $ne: '新建' }, selfOwned: 1 };
  if (!selfOwned) {
    qObj.selfOwned = { $ne: 1 };
  }

  let data = {
    nameList: [],
    vehList: [],
    destList: [],
    contactNameList: [],
    vehPersonMap: {},
    selfOwned: selfOwned
  }

  const invs = await Invoice.find(qObj).select({ "_id": 0, "settle_flag": 1, "ship_name": 1, "vehicle_vessel_name": 1, "ship_to": 1, "bills": 1 }).exec();
  invs.forEach(function (inv) {
    pushArr(data.nameList, inv.ship_name);
    pushArr(data.destList, inv.ship_to);

    pushArr(data.vehList, inv.vehicle_vessel_name);
    if (inv.bills && inv.bills.length) {
      inv.bills.forEach(function (bill) {
        if (bill.vehicles.length) {
          bill.vehicles.forEach(function (veh) {
            pushArr(data.vehList, veh.veh_name);
          })
        }
      })
    }
  });


  const vehs = await Vehicle.find({}).select('name contact_name boss real_boss').lean().exec()
  vehs.forEach(function (veh) {
    const isExist = data.vehList.find((item) => item === veh.name);
    if (isExist) {
      // data.vehList.push(veh.name);
      if (veh.boss.includes(',') || veh.boss.includes('，')) {
        const list = veh.boss.split(/,|，/);
        list.forEach(function (b) {
          pushArr(data.contactNameList, b.trim());
        })

        data.vehPersonMap[veh.name] = { boss: veh.boss, real_boss: veh.real_boss };
      } else {
        pushArr(data.contactNameList, veh.boss);
        data.vehPersonMap[veh.name] = veh.boss;
      }
    }
  })

  data.nameList = utils.pinyin_sort(data.nameList);
  data.vehList = utils.pinyin_sort(data.vehList);
  data.contactNameList = utils.pinyin_sort(data.contactNameList);

  return data;
}

exports.getSettleVesselSelf = async function (req, res) {
  if (!hasPermission(req.user.privilege, 'selfVehicle')) {
    res.status(404);
    res.render('404');
  }
  else {
    try {
      const data = await getSettleVesselData(true);
      res.render('settle/settle_vessel', {
        title: '自有车结算管理',
        curr_page: '结算管理-自有车船结算',
        curr_page_name: '自有车船结算',
        dData: data,
        scripts: [
          '/js/plugins/select2/select2.min.js',
          '/js/plugins/select2/select2_locale_zh-CN.js',
          '/js/settle_vessel_24.js'
        ]
      });
    } catch (e) {
      res.end(JSON.stringify({ ok: false, response: '系统错！' + e }));
      console.log(e);
    }
  }
};

exports.getSettleVessel = async function (req, res) {
  if (!hasAnyPermission(req.user.privilege, 'statistics', 'account')) {
    res.status(404);
    res.render('404');
  }
  else {
    try {
      const data = await getSettleVesselData(false);
      res.render('settle/settle_vessel', {
        title: '结算管理',
        curr_page: '结算管理-车船结算',
        curr_page_name: '车船结算',
        dData: data,
        scripts: [
          '/js/plugins/select2/select2.min.js',
          '/js/plugins/select2/select2_locale_zh-CN.js',
          '/js/settle_vessel_24.js'
        ]
      });
    } catch (err) {
      res.end(JSON.stringify({ ok: false, response: '获取已配发的运单数据出错' + err }));
    }
  }
};

function getVesselPrice(prices, wno, inner) {
  let res = false;
  for (let price of prices) {
    if (wno == price.wno && price.inner == inner) {
      res = price;
      break;
    }
  }

  return res;
}

exports.postVesselPriceInput = async function (req, res) {
  try {
    let priceData = req.body.priceData;
    console.log(priceData)

    for (let wno of req.body.wnoList) {
      let priceObj = getVesselPrice(priceData, wno, 0);

      // let foundPrice = (price === -99999) ? false : true;

      let db_inv = await Invoice.findOne({ waybill_no: wno }).exec();
      if (db_inv) {
        let ids = utils.getAllList(true, db_inv.bills, "bill_id");
        let billArr = await Bill.find({ _id: { $in: ids } }).exec();

        for (let db_bill of billArr) {
          let found = false;
          db_bill.invoices.forEach(function (dbi) {
            if (dbi.inv_no === wno) {
              found = true;
              if (priceObj) {
                dbi.veh_ves_price = priceObj.unitPrice;
              }

              dbi.vehicles.forEach(function (dVeh) {
                let p = getVesselPrice(priceData, dVeh.inner_waybill_no, 1);
                if (p) {
                  dVeh.veh_price = p.unitPrice;
                }
              });
            }   // find same bill in invoice
          });

          if (found) {
            await db_bill.save();
          }
        }

        if (priceObj) {
          db_inv.vessel_price = priceObj.unitPrice;
          db_inv.price_remark = priceObj.remark;
        }

        db_inv.bills.forEach(function (bill) {
          bill.vehicles.forEach(function (bveh) {
            let p = getVesselPrice(priceData, bveh.inner_waybill_no, 1);
            if (p) {
              bveh.veh_price = p.unitPrice;
              bveh.price_remark = priceObj.remark;
            }
          })
        });

        await db_inv.save();
      }
    }

    res.end(JSON.stringify({ ok: true }));
  } catch (e) {
    res.end(JSON.stringify({ ok: false, response: e.toString() }));
  }
};

exports.postVesselNotNeeded = async function (req, res) {
  try {
    let isNotNeeded = req.body.notNeeded;
    for (let wno of req.body.wayNoList) {
      let waybillNo = wno;
      if (wno.length > 17) {
        waybillNo = wno.substring(0, 17);
      }

      let db_inv = await Invoice.findOne({ waybill_no: waybillNo }).exec();
      if (db_inv) {
        if (wno.length > 17) {
          var ids = utils.getAllList(true, db_inv.bills, "bill_id");
          let billArr = await Bill.find({ _id: { $in: ids } }).exec();

          for (let db_bill of billArr) {
            var found = false;
            db_bill.invoices.forEach(function (dbi) {
              if (dbi.inv_no === waybillNo) {
                dbi.vehicles.forEach(function (dbi_veh) {
                  if (dbi_veh.inner_waybill_no === wno) {
                    dbi_veh.veh_price = isNotNeeded ? -1 : 0;
                  }
                });
                found = true;
              }   // find same bill in invoice
            });

            if (found) {
              await db_bill.save();
            }
          }

          db_inv.bills.forEach(function (bill) {
            bill.vehicles.forEach(function (bveh) {
              if (wno === bveh.inner_waybill_no) {
                bveh.veh_price = isNotNeeded ? -1 : 0;
              }
            })
          });

          buildInnerSettleData(db_inv); // if not exist, create and initialize it.

          db_inv.inner_settle.forEach(function (db_inner) {
            if (db_inner.inner_waybill_no === wno) {
              if (isNotNeeded) {
                db_inner.state = '不需要结算';
                db_inner.date = new Date();
              } else {
                db_inner.state = '未结算';
                db_inner.date = null;
              }
            }
          });
        } else {
          if (isNotNeeded) {
            db_inv.vessel_price = -1;
            db_inv.vessel_settle_state = '不需要结算';
            db_inv.vessel_settle_date = new Date();
          } else {
            db_inv.vessel_price = 0;
            db_inv.vessel_settle_state = '未结算';
            db_inv.vessel_settle_date = null;
          }
        }

        await db_inv.save();
      }
    }

    res.end(JSON.stringify({ ok: true }));
  } catch (e) {
    res.end(JSON.stringify({ ok: false, response: e.toString() }));
  }
};

exports.postVesselDelayInfo = async function (req, res) {
  let unshipData = req.body.unshipData;
  let partInd = req.body.partInd;

  let wnoList = [];
  for (let wno of req.body.wnoList) {
    let queryNo = wno.length > 17 ? wno.substring(0, 17) : wno;
    if (!wnoList.includes(queryNo)) wnoList.push(queryNo);
  }

  try {
    let db_invs = await Invoice.find({ waybill_no: { $in: wnoList } }).exec();
    for (let db_inv of db_invs) {
      buildInnerSettleData(db_inv);
      db_inv.inner_settle.forEach(function (db_inner) {
        if (req.body.wnoList.includes(db_inner.inner_waybill_no)) {
          if (partInd == 1) {
            db_inner.charge_cash = unshipData.charge_cash;
            db_inner.charge_oil = unshipData.charge_oil;
          } else if (partInd == 2) {
            db_inner.receipt = unshipData.receipt;
          } else if (partInd == 0) {
            db_inner.unship_date = unshipData.unship_date;
            db_inner.charge_cash = unshipData.charge_cash;
            db_inner.charge_oil = unshipData.charge_oil;
            db_inner.delay_day = unshipData.delay_day;
            db_inner.receipt = unshipData.receipt;
            db_inner.remark = unshipData.remark;
            //db_inner.vessel_info_cost = unshipData.vessel_info_cost;
          }
        }
      });

      if (req.body.wnoList.includes(db_inv.waybill_no)) {
        if (partInd == 1) {
          db_inv.charge_cash = unshipData.charge_cash;
          db_inv.charge_oil = unshipData.charge_oil;
        } else if (partInd == 2) {
          db_inv.receipt = unshipData.receipt;
        } else if (partInd == 0) {
          db_inv.unship_date = unshipData.unship_date;
          db_inv.charge_cash = unshipData.charge_cash;
          db_inv.charge_oil = unshipData.charge_oil;
          db_inv.delay_day = unshipData.delay_day;
          db_inv.receipt = unshipData.receipt;
          db_inv.remark = unshipData.remark;
          // console.log("delay day = " + db_inv.delay_day);
        }
      }

      await db_inv.save();
    }

    res.end(JSON.stringify({ ok: true }));
  } catch (e) {
    res.end(JSON.stringify({ ok: false, response: e.toString() }));
  }
};

exports.postSettleUploadReceipt = async function (req, res) {
  let wno = req.body.wno;
  let isInner = wno.length > 17
  let queryNo = isInner ? wno.substring(0, 17) : wno;

  try {
    let db_invs = await Invoice.find({ waybill_no: queryNo }).exec();
    for (let db_inv of db_invs) {
      if (isInner) {
        buildInnerSettleData(db_inv);
        db_inv.inner_settle.forEach(function (db_inner) {
          if (db_inner.inner_waybill_no === wno) {
            db_inner.receipt = 1;
          }
        });
      } else {
        db_inv.receipt = 1;
      }

      await db_inv.save();
    }

    res.end(JSON.stringify({ ok: true }));
  } catch (e) {
    res.end(JSON.stringify({ ok: false, response: e.toString() }));
  }
};

exports.postSettleVessel = async function (req, res) {
  let allSelectedInvNo = req.body.allSelectedInvNo;
  let allInnerNo = req.body.allInnerNo;
  let allInvNo = allSelectedInvNo.slice(0);
  req.body.allInvNoFromInner.forEach(no => allInvNo.push(no));

  try {
    let db_invs = await Invoice.find({ waybill_no: { $in: allInvNo } }).exec();

    let v_state = '未结算';
    let v_state_date = null;
    if (req.body.settle) {
      v_state = '已结算';
      v_state_date = new Date();
    }

    for (let inv of db_invs) {
      if (allSelectedInvNo.includes(inv.waybill_no)) {
        inv.vessel_settle_state = v_state;
        inv.vessel_settle_date = v_state_date;
        inv.vessel_settler = req.user.userid;
      }

      inv.inner_settle.forEach(db_inner => {
        if (db_inner.inner_waybill_no && allInnerNo.includes(db_inner.inner_waybill_no)) {
          db_inner.state = v_state;
          db_inner.date = v_state_date;
        }
      });

      await inv.save();
    }

    res.end(JSON.stringify({ ok: true }));
  } catch (e) {
    res.end(JSON.stringify({ ok: false, response: e.toString() }));
  }
};

exports.postSettleVesselPay = async function (req, res) {
  let allPayInvNo = req.body.allPayInvNo;
  let allInnerNo = req.body.allInnerNo;
  let allInvNo = allPayInvNo.slice(0);
  req.body.allInvNoFromInner.forEach(inno => { allInvNo.push(inno) });

  try {
    let db_invs = await Invoice.find({ waybill_no: { $in: allInvNo } }).exec();
    let v_state_text = '已结算';
    let v_state_date = null;
    if (req.body.forPay) {
      v_state_text = '已付款';
      v_state_date = new Date();
    }

    for (let inv of db_invs) {
      if (allPayInvNo.includes(inv.waybill_no)) {
        inv.vessel_settle_state = v_state_text;
        inv.pay_date = v_state_date;
      }

      inv.inner_settle.forEach(function (db_inner) {
        if (allInnerNo.includes(db_inner.inner_waybill_no)) {
          db_inner.state = v_state_text;
          db_inner.pay_date = v_state_date;
        }
      });

      await inv.save();
    }

    res.end(JSON.stringify({ ok: true }));
  } catch (e) {
    res.end(JSON.stringify({ ok: false, response: e.toString() }));
  }
};

exports.searchBill = function (req, res) {
  res.render('bill/search_bill', {
    title: '提单管理',
    curr_page: '提单管理-查询订单',
    curr_page_name: '查询',
    bUseJstree: true,
    scripts: [
      '/js/lib/jstree.min.js',
      '/js/plugins/select2/select2.min.js',
      '/js/plugins/select2/select2_locale_zh-CN.js',
      '/js/bill_mgt.js'
    ]
  });
};

////////////////////////////////////////////////////////////////////////////
//////////// INVOICE
////////////////////////////////////////////////////////////////////////////
async function getDataAndRender(type, data, forSelf, render) {
  data.warehouse = [];
  try {
    const result = await Warehouse.find({}).lean().exec();
    data.warehouse = utils.getAllList(false, result, "name");
    data.warehouse.push('南钢');

    if (type === 'bill') {
      data.brand = [];
      data.sale_dep = [];
      
      const brands = await Brand.find({}).lean().sort({ name: 'asc' }).exec();
      data.brand = utils.getAllList(false, brands, "name");

      const saleDeps = await SaleDep.find({}).lean().sort({ name: 'asc' }).exec();
      if (saleDeps) {
        data.sale_dep = utils.getAllList(false, saleDeps, "name");
      }
      render(data);
    } else {
      data.vehicles = [];
      data.destination = [];

      const vehs = await Vehicle.find({}).lean().exec();
      data.vehicles = utils.getAllList(false, vehs, "name");
      data.vehInfo = vehs;

      const dnames = await Destination.distinct('name').exec();
      data.destination = dnames;
      render(data);
    }
  } catch (err) {
    console.error("getDataAndRender error:", err);
    render(data);
  }
}

async function getDictDataAndRender(type, fromBill, fromInvoice, forSelf, render) {
  var data = { selfOwned: forSelf ? 1 : 0, company: [] };
  try {
    if (fromBill) {
      const names = await Bill.distinct('billing_name', { left_num: { $gt: 0 } }).lean().exec();
      const companies = await Company.find({ name: { $in: names } }).lean().exec();
      data.company = companies;
    } else if (fromInvoice) {
      const names = await Invoice.distinct('ship_name').lean().exec();
      const companies = await Company.find({ name: { $in: names } }).exec();
      data.company = companies;
    } else {
      const companies = await Company.find({}).lean().exec();
      data.company = companies;
    }
  } catch (err) {
    console.error("getDictDataAndRender error:", err);
  }
  
  await getDataAndRender(type, data, forSelf, render);
}

exports.getMaxWaybillNo = async function (req, res) {
  let userNo = req.user.no || 0;
  let uno = utils.leftPad(userNo, 4);
  let date_no = new Date().yyyymmdd() + uno;
  let reg = new RegExp('^01' + date_no + '.*', 'g');
  
  try {
    const inv_wnos = await Invoice.find({ waybill_no: { $regex: reg } }).select('waybill_no').sort({ waybill_no: 'desc' }).exec();
    
    let no = utils.leftPad(1, 3);
    if (inv_wnos.length) {
      var str = inv_wnos[0].waybill_no.substring(14);
      no = utils.leftPad((+str) + 1, 3);
    }

    let max = '01' + date_no + no;
    res.end(JSON.stringify({ ok: true, max_no: max }));
  } catch (err) {
    res.end(JSON.stringify({ ok: false, response: '查询数据库出错' + err }));
  }
};

exports.getBuildInvoice = async function (req, res) {
  if (!hasAnyPermission(req.user.privilege, 'operator', 'statistics')) {
    res.status(404);
    res.render('404');
  }
  else {
    await getDictDataAndRender('invoice', true, false, false, function (data) {
      res.render('bill/build_invoice', {
        title: '运单管理',
        curr_page: '运单管理-配发货',
        curr_page_name: '配发货登记',
        bUseJstree: true,
        bAdd: true,
        dDataDict: data,
        scripts: [
          '/js/lib/jstree.min.js',
          '/js/plugins/select2/select2.min.js',
          '/js/plugins/select2/select2_locale_zh-CN.js',
          '/js/lib/bootstrap-multiselect.js',
          '/js/inv_utils_02.js',
          '/js/invoice_mgt_01.js'
        ]
      });
    })
  }
};

exports.getBuildInvoiceSelf = async function (req, res) {
  if (!hasPermission(req.user.privilege, 'selfVehicle')) {
    res.status(404);
    res.render('404');
  }
  else {
    await getDictDataAndRender('invoice', true, false, true, function (data) {
      res.render('bill/build_invoice', {
        title: '运单管理',
        curr_page: '运单管理-自有车配发货',
        curr_page_name: '配发货登记（自有车）',
        bUseJstree: true,
        bAdd: true,
        dDataDict: data,
        scripts: [
          '/js/lib/jstree.min.js',
          '/js/plugins/select2/select2.min.js',
          '/js/plugins/select2/select2_locale_zh-CN.js',
          '/js/lib/bootstrap-multiselect.js',
          '/js/inv_utils_02.js',
          '/js/invoice_mgt_01.js'
        ]
      });
    })
  }
};

function compareVehicles(oldVehicles, newVehicles) {
  if (oldVehicles.length !== newVehicles.length) {
    return false; // 长度不同，则不相同
  }
  // 更高效的比较方式，例如使用Map或排序后比较
  // 为简化，这里仍用嵌套循环，但实际中应优化
  for (let vo of newVehicles) {
    let find_veh_obj = false;
    for (let ovo of oldVehicles) {
      if (vo.veh_name === ovo.veh_name && vo.inner_waybill_no === ovo.inner_waybill_no &&
        vo.send_num === ovo.send_num && Math.abs(vo.send_weight - ovo.send_weight) < EPSILON &&
        vo.veh_ship_from === ovo.veh_ship_from) {
        find_veh_obj = true;
        break;
      }
    }
    if (!find_veh_obj) {
      return false; // 发现一个不匹配的车辆
    }
  }
  return true; // 所有车辆都匹配
}

function getChangedBills(old_inv, new_inv) {
  let allBills = [];
  let invBills = new_inv.bills.map(obj => {
    return { ...obj, passed: false };
  });

  for (let old_bill of old_inv.bills) {
    let found = false;
    for (let new_bill of invBills) {
      let isModified = false;
      if (!new_bill.passed && String(old_bill.bill_id) === String(new_bill.bill_id)) {

        // if (Math.abs(new_bill.weight) === 0 || new_bill.num === 0) {
        //   old_bill.flag = 'remove';
        //   allBills.push(old_bill);
        // } else {
        if (old_bill.num != new_bill.num || Math.abs(old_bill.weight - new_bill.weight) > EPSILON) {
          isModified = true;
        } else {
          if (!compareVehicles(old_bill.vehicles, new_bill.vehicles)) {
            isModified = true;
          }
        }

        if (isModified) {
          allBills.push({ ...new_bill, flag: 'modify', old_num: old_bill.num, old_weight: old_bill.weight });
        } else {
          allBills.push({ ...new_bill, flag: 'same' });
        }
        // }

        new_bill.passed = true;
        found = true;
        break;
      }
    }

    if (!found) {
      old_bill.flag = 'remove'
      allBills.push(old_bill);
    }
  }

  invBills.forEach(function (bill) {
    if (!bill.passed) {
      allBills.push({ ...bill, flag: 'add' });
    }
  });

  return allBills;
}

function updateStatus(uname, bill, status, date) {
  bill.shipper = uname;
  bill.shipping_date = date;
  bill.status = status;
  return true;
}

function updateBillStatus(uname, bill, inv_status) {
  let updated = false;

  console.log('bill status: ' + bill.status);

  let left = 0;
  if (bill.status != '已结算' && bill.status != '已开票' && bill.status != '已回款') {
    let state_str = '';
    if (bill.block_num > 0) {
      left = bill.block_num - bill.left_num;
      state_str = '已配发' + left + '块';
    } else {
      left = Math.abs(bill.total_weight - bill.left_num);
      state_str = '已配发重量' + utils.toFixedStr(left, 3);
    }

    if (bill.left_num == 0) { // == 0
      if (inv_status === '已配发') {
        updated = updateStatus(uname, bill, '已配发', new Date());
      } else {
        if (bill.status != '待配发') {
          updated = true;
          bill.status = '待配发';
        }
      }
    } else if (left < EPSILON) { // left === 0) {
      if (bill.status != '新建') {
        updated = updateStatus('', bill, '新建', null);
        bill.collection_price = 0;
      } else {
        console.log("left = " + left + ", status = " + bill.status);
      }
    } else if (left > 0) { // left > 0) {
      if (bill.status != state_str) {
        updated = updateStatus(uname, bill, state_str, new Date());
      }
    } else {
      console.log("something is wrong!!!");
    }
  } else if (bill.status == '已结算') {
    if (bill.block_num > 0) {
      left = bill.block_num - bill.left_num;
    } else {
      left = Math.abs(bill.total_weight - bill.left_num);
    }

    if (left < EPSILON) {
      updated = updateStatus('', bill, '新建', null);
      bill.collection_price = 0;
    } else {
      console.log("settled: something is wrong!");
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
    vehicles: inv_bill.vehicles.slice(0)
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
        db_inv.vehicles = inv_bill.vehicles.slice(0);
        found = true;
        break;
      }
    }

    if (!found) {
      db_bill.invoices.push(obj);
    }
  } else {
    db_bill.invoices = [];
    db_bill.invoices.push(obj);
  }
}

function modifyInvBill(dbBill, bill, waybillNo) {
  if (dbBill.block_num > 0) {
    dbBill.left_num += bill.old_num - bill.num;
  } else {
    dbBill.left_num += (bill.old_weight - bill.weight);
    dbBill.left_num = utils.toFixedNumber(dbBill.left_num, 3);
  }

  if (dbBill.invoices.length > 0) {
    for (let i = 0; i < dbBill.invoices.length; ++i) {
      if (dbBill.invoices[i].inv_no === waybillNo) {
        dbBill.invoices[i].num = bill.num;
        dbBill.invoices[i].weight = bill.weight;
        dbBill.invoices[i].vehicles = bill.vehicles.slice(0);
        dbBill.invoices[i].vehicles.forEach(function (veh) { veh.veh_price = 0 });
        break;
      }
    }
  }

  return dbBill;
}

function removeInvBill(dbBill, bill, waybillNo) {
  if (dbBill.block_num > 0) {
    dbBill.left_num += bill.num;
  } else {
    dbBill.left_num += bill.weight;
    dbBill.left_num = utils.toFixedNumber(dbBill.left_num, 3);
  }

  let invs = [];
  dbBill.invoices.forEach(inv => {
    if (inv.inv_no !== waybillNo) {
      invs.push(inv);
    }
  });

  dbBill.invoices = invs;
  return dbBill;
}

async function assignInvoice(dbInv, inv, state) {
  dbInv.vehicle_vessel_name = inv.vehicle_vessel_name;
  dbInv.ship_name = inv.ship_name;
  dbInv.ship_customer = inv.ship_customer;
  dbInv.ship_warehouse = inv.ship_warehouse;
  dbInv.ship_date = inv.ship_date;
  dbInv.total_weight = inv.total_weight;
  dbInv.username = inv.username;
  dbInv.shipper = inv.shipper;
  dbInv.ship_to = inv.ship_to;
  dbInv.ship_from = inv.ship_from;
  dbInv.state = state;
  dbInv.bills = [];// inv.bills.slice(0);

  let totalWeight = 0;
  for (let bill of inv.bills) {
    let dbBill = await Bill.findById(bill.bill_id).exec();
    if (dbBill) {
      let w = 0;
      if (dbBill.block_num > 0) {
        w = bill.num * dbBill.weight;
      } else {
        w = bill.weight;
      }
      totalWeight += w

      if (w > 0) {
        dbInv.bills.push(bill)
      }
    }
  }
  if (!areFloatsEqual(totalWeight, dbInv.total_weight)) {
    console.warn('waybill weight 不一致!', totalWeight, dbInv.total_weight)
    dbInv.total_weight = totalWeight
  }
}

function getDeltaWeight(leftNum, prevLeftNum, blockNum, weight) {
  if (blockNum > 0) {
    return (leftNum - prevLeftNum) * weight;
  } else {
    return leftNum - prevLeftNum;
  }
}

const updateWaybill = async function (res, dbInv, new_inv, userId) {
  let state = dbInv.state === "已配发" ? "已配发" : new_inv.state;
  let shipUpdated = (dbInv.ship_to !== new_inv.ship_to) || (dbInv.ship_from !== new_inv.ship_from);
  let allBills = getChangedBills(dbInv, new_inv);

  // console.log('all Bills>>>', allBills)

  let savedBills = [];
  let savedPlans = [];
  for (let bill of allBills) {
    let dbBill = await Bill.findById(bill.bill_id).exec();
    if (dbBill) {
      let prevLeftNum = dbBill.left_num;
      let updated = true;
      if (bill.flag === 'modify') {
        // console.log('>>>modify>>>', bill);
        dbBill = modifyInvBill(dbBill, bill, new_inv.waybill_no);
      } else if (bill.flag === 'remove') {
        // console.log('>>>remove>>>', bill);
        dbBill = removeInvBill(dbBill, bill, new_inv.waybill_no);
      } else if (bill.flag === 'add') {
        // console.log('>>>add>>>', bill);
        if (dbBill.block_num > 0) {
          dbBill.left_num -= bill.num;
        } else {
          dbBill.left_num -= bill.weight;
          dbBill.left_num = utils.toFixedNumber(dbBill.left_num, 3);
        }
        addInvoiceToBill(dbBill, new_inv, bill);
      } else {
        // console.log('>>>same>>>', bill);
        updated = false;
      }

      if (shipUpdated && dbBill.invoices.length) {
        dbBill.invoices.forEach(function (dbInv) {
          if (dbInv.inv_no === new_inv.waybill_no) {
            dbInv.ship_to = new_inv.ship_to;
            dbInv.ship_from = new_inv.ship_from;
          }
        });
      }

      let ubs = updateBillStatus(userId, dbBill, state);

      if (updated || shipUpdated || ubs) {
        if (Math.abs(prevLeftNum - dbBill.left_num) > EPSILON) {
          let plan = await OrderPlan.findOne({ order_no: dbBill.order_no }).exec();
          if (plan) {
            plan.left_weight += getDeltaWeight(dbBill.left_num, prevLeftNum, dbBill.left_num, dbBill.weight);
            if (plan.left_weight < 0) {
              return res.end(JSON.stringify({ ok: false, response: '[' + dbBill.order_no + ']修改运单后，订单计划的剩余量小于零:' + plan.left_weight }));
            } else {
              if (plan.left_weight > EPSILON) {
                plan.status = 0;
              } else if (plan.left_weight < EPSILON) {
                plan.left_weight = 0;
                plan.status = 1;
              }

              savedPlans.push(plan);
            }
          } else {
            console.log('no plan:' + dbBill.order_no);
          }
        }

        savedBills.push(dbBill);
      }
    }
  }

  await assignInvoice(dbInv, new_inv, state);

  let allInnerNo = utils.getAllList(true, new_inv.bills, "vehicles", "inner_waybill_no");
  if (allInnerNo.length) {
    if (isExist(dbInv.inner_settle) && !isEmpty(dbInv.inner_settle)) {
      let len = dbInv.inner_settle.length;
      while (len--) {
        if (allInnerNo.indexOf(dbInv.inner_settle[len].inner_waybill_no) < 0) {
          dbInv.inner_settle.splice(len, 1);
        }
      }
    } else {
      dbInv.inner_settle = [];
    }

    allInnerNo.forEach(function (innerNo) {
      let found = false;
      for (let k = 0; k < dbInv.inner_settle.length; ++k) {
        if (dbInv.inner_settle[k].inner_waybill_no === innerNo) {
          found = true;
          break;
        }
      }
      if (!found) {
        dbInv.inner_settle.push({ inner_waybill_no: innerNo, state: '未结算', price: 0, date: null, unship_date: null, delay_day: 0, charge_cash: 0, charge_oil: 0, receipt: 0, remark: '' });
      }
    })
  }

  for (let b of savedBills) { await b.save({ optimisticConcurrency: false }) }

  for (let p of savedPlans) { await p.save() }

  await dbInv.save({ optimisticConcurrency: false });

  res.end(JSON.stringify({ ok: true }));
};

function buildInnerSettleData(invoice) {
  var allInnerNo = utils.getAllList(true, invoice.bills, "vehicles", "inner_waybill_no");
  if (allInnerNo.length) {
    if (!isExist(invoice.inner_settle) || isEmpty(invoice.inner_settle)) {
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
          receipt: 0, remark: ''
        });
      })
    }
  }
}

let saveWaybill = async function (res, invoice, userId) {
  buildInnerSettleData(invoice);

  let totalWeight = 0
  let order = {};
  let savedBills = [];
  for (let i = 0; i < invoice.bills.length; ++i) {
    let bill = invoice.bills[i];
    let dbBill = await Bill.findById(bill.bill_id).exec();
    if (dbBill) {
      let w = 0;
      if (dbBill.block_num > 0) {
        dbBill.left_num -= bill.num;
        w = bill.num * dbBill.weight;
      } else {
        dbBill.left_num -= bill.weight;
        dbBill.left_num = utils.toFixedNumber(dbBill.left_num, 3);
        w = bill.weight;
      }

      if (order[dbBill.order_no]) {
        order[dbBill.order_no] += w;
      } else {
        order[dbBill.order_no] = w;
      }

      totalWeight += w;

      updateBillStatus(userId, dbBill, invoice.state);
      addInvoiceToBill(dbBill, invoice, bill);

      savedBills.push(dbBill);
    } else {
      console.log('cannot find bill: id = ' + bill.bill_id);
    }
  }

  let ok = true;
  let savedPlans = [];
  for (let orderNo in order) {
    let plan = await OrderPlan.findOne({ order_no: orderNo }).exec();
    if (plan) {
      let delta = plan.left_weight - order[orderNo];
      if (delta < 0 && Math.abs(delta) > EPSILON) {
        ok = false;
        res.end(JSON.stringify({ ok: ok, response: '订单计划的剩余量' + plan.left_weight + '小于要配发的重量' + order[orderNo] }));
        break;
      } else {
        plan.left_weight -= order[orderNo];
        if (plan.left_weight > EPSILON) {
          plan.status = 0;
        } else if (plan.left_weight < EPSILON) {
          plan.left_weight = 0;
          plan.status = 1;
        }
        savedPlans.push(plan);
      }
    } else {
      console.log('save waybill no plan: ' + orderNo);
    }
  }

  if (ok) {
    for (let i = 0; i < savedBills.length; ++i) {
      await savedBills[i].save();
    }

    for (let i = 0; i < savedPlans.length; ++i) {
      await savedPlans[i].save();
    }

    if (!areFloatsEqual(totalWeight, invoice.total_weight)) {
      console.warn('waybill weight 不一致!', totalWeight, invoice.total_weight)
      invoice.total_weight = totalWeight
    }

    await invoice.save();
    res.end(JSON.stringify({ ok: true }));
  }
};

function areFloatsEqual(a, b, epsilon = 1e-6) {
  return Math.abs(a - b) < epsilon;
}

function makeInvoiceData(inv, userId) {
  return {
    waybill_no: inv.waybill_no,
    vehicle_vessel_name: inv.vehicle_vessel_name,
    ship_warehouse: inv.ship_warehouse,
    ship_name: inv.ship_name,
    ship_customer: inv.ship_customer,
    ship_date: inv.ship_date,
    ship_to: inv.ship_to,
    ship_from: inv.ship_from,
    bills: inv.bills.slice(0),
    total_weight: inv.total_weight,
    username: inv.username,
    shipper: userId,
    state: inv.state,
    selfOwned: inv.selfOwned
  };
}

exports.postBuildInvoice = async function (req, res) {
  try {
    let data = makeInvoiceData(req.body, req.user.userid);
    let dbInv = await Invoice.findOne({ waybill_no: req.body.waybill_no }).exec();
    if (!dbInv) {
      await saveWaybill(res, new Invoice(data), req.user.userid);
    } else {
      await updateWaybill(res, dbInv, data, req.user.userid);
    }
  } catch (e) {
    res.end(JSON.stringify({ ok: false, response: '数据库操作错!' + e.toString() }));
  }
};

async function queryInvoices(queryObj, res) {
  try {
    const count = await Invoice.countDocuments(queryObj).exec();
    if (count === 0) {
      res.end(JSON.stringify({ ok: false, number: 0 }));
    } else {
      let query = Invoice.find(queryObj);
      if (count > 2000) {
        query.limit(2000);
      }

      const invoices = await query.sort({ waybill_no: 'asc' }).lean().exec();
      if (invoices.length) {
        var ids = [];
        var list = [];
        invoices.forEach(function (inv) {
          list.push(inv.waybill_no);
          inv.bills.forEach(function (bill) {
            pushArr(ids, bill.bill_id);
          })
        });

        const bills = await Bill.find({ _id: { $in: ids } }).lean().exec();
        res.end(JSON.stringify({ ok: true, bills: bills, invoices: invoices, targetData: buildTargetData(list), number: count }));
      } else {
        res.end(JSON.stringify({ ok: false, number: 0 }));
      }
    }
  } catch (err) {
    res.end(JSON.stringify({ ok: false, number: 0, response: 'Error: ' + err }));
  }
}

exports.getInvoicesWithCondition = async function (req, res) {
  var query = req.query;
  var q = JSON.parse(query.q);
  if (query.isNeedAnalysis == 'true') {
    var obj = getQueryFromNodes(q, query.field);
    if (Object.keys(obj).length > 0) {
      await queryInvoices(obj, res);
    } else {
      res.end(JSON.stringify({ ok: false, response: '查询条件为空!' }));
    }
  } else {
    await queryInvoices(q, res);
  }
};

exports.getWaybillByNo = async function (req, res) {
  var reg = new RegExp(req.query.q, 'gi');
  var obj = { waybill_no: { $regex: reg } };
  await queryInvoices(obj, res);
};

function buildTargetData(list) {
  var target = [];
  list.forEach(function (item, index) {
    target.push({
      id: index,
      text: item
    });
  });

  return target;
}

exports.distributeInvoice = async function (req, res) {
  if (!hasAnyPermission(req.user.privilege, 'operator', 'statistics')) {
    res.status(404);
    res.render('404');
  }
  else {
    await getDictDataAndRender('invoice', false, false, false, function (data) {
      res.render('bill/distribute_invoice', {
        title: '运单管理',
        curr_page: '运单管理-配发货确认或修改',
        curr_page_name: '修改/确认',
        bUseJstree: true,
        dDataDict: data,
        scripts: [
          '/js/lib/jstree.min.js',
          '/js/plugins/select2/select2.min.js',
          '/js/plugins/select2/select2_locale_zh-CN.js',
          '/js/lib/bootstrap-multiselect.js',
          '/js/inv_utils_02.js',
          '/js/invoice_mgt_01.js'
        ]
      });
    })
  }
};

exports.postDistributeInvoice = async function (req, res) {
  try {
    let dbInv = await Invoice.findOne({ waybill_no: req.body.waybill_no }).exec();
    if (dbInv) {
      await updateWaybill(res, dbInv, req.body, req.user.userid);
    } else {
      res.end(JSON.stringify({ ok: false, response: 'Not Found!' }));
    }
  } catch (e) {
    res.end(JSON.stringify({ ok: false, response: e.toString() }));
  }
};

exports.deleteInvoice = async function (req, res) {
  if (!hasPermission(req.user.privilege, 'statistics')) {
    res.status(404);
    res.render('404');
  }
  else {
    await getDictDataAndRender('invoice', false, false, false, function (data) {
      res.render('bill/delete_invoice', {
        title: '运单管理',
        curr_page: '运单管理-运单删除',
        curr_page_name: '删除',
        dDataDict: data,
        bUseJstree: true,
        bDeleteInv: true,
        scripts: [
          '/js/lib/jstree.min.js',
          '/js/plugins/select2/select2.min.js',
          '/js/plugins/select2/select2_locale_zh-CN.js',
          '/js/lib/bootstrap-multiselect.js',
          '/js/inv_utils_02.js',
          '/js/invoice_mgt_01.js'
        ]
      });
    })
  }
};

exports.postDeleteInvoice = async function (req, res) {
  let waybill = req.body;
  let invoice = await Invoice.findOne({ waybill_no: waybill.waybill_no }).exec();
  if (!invoice) {
    res.end(JSON.stringify({ ok: false, response: 'Not Found!' }));
  } else {
    try {
      for (let wbill of waybill.bills) {
        let bill = await Bill.findById(wbill.bill_id).exec();
        if (bill) {
          let w = 0;
          if (bill.block_num > 0) {
            bill.left_num += wbill.num;
            w = bill.weight * wbill.num;
          } else {
            bill.left_num += wbill.weight;
            bill.left_num = utils.toFixedNumber(bill.left_num, 3);
            w = wbill.weight;
          }

          updateBillStatus(req.user.userid, bill, undefined);

          let len = bill.invoices.length;
          while (len--) {
            if (bill.invoices[len].inv_no === waybill.waybill_no) {
              bill.invoices.splice(len, 1);
            }
          }

          let plan = await OrderPlan.findOne({ order_no: bill.order_no }).exec();
          if (plan) {
            if (plan.status === 1) {
              plan.status = 0;
            }

            plan.left_weight += w;
            await plan.save();
          }

          await bill.save();
        }
      }

      await Invoice.deleteOne({ waybill_no: waybill.waybill_no }).exec();
      res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      console.error("delete error! " + e.toString());
      res.end(JSON.stringify({ ok: false, response: e.toString() }));
    }
  }
};


exports.getInvoiceReport = async function (req, res) {
  let destination = await Destination.find({}).exec();
  let company = await Company.find({}).exec();
  let vehInfo = await Vehicle.find({}).exec();
  res.render('statistics/invoice_report', {
    title: '报表和打印',
    curr_page: '运单报表',
    curr_page_name: '报表',
    bUseJstree: true,
    bTableSort: true,
    dDataDict: {
      company,
      destination,
      vehInfo
    },
    scripts: [
      '/js/lib/jstree.min.js',
      '/js/plugins/select2/select2.min.js',
      '/js/plugins/select2/select2_locale_zh-CN.js',
      '/js/plugins/tablesorter/jquery.tablesorter.min.js',
      '/js/plugins/tablesorter/jquery.tablesorter.widgets.min.js',
      '/js/inv_utils_02.js',
      '/js/invoice_mgt_01.js']
  });
};

exports.getIntegratedQuery = async function (req, res) {
  await getDictDataAndRender('invoice', false, false, false, function (data) {
    res.render('statistics/integ_query', {
      title: '统计和报表',
      curr_page: '综合查询',
      curr_page_name: '查询',
      bMultiSelect: true,
      bTableSort: true,
      dData: data,
      scripts: [
        '/js/lib/bootstrap-multiselect.js',
        '/js/plugins/select2/select2.min.js',
        '/js/plugins/select2/select2_locale_zh-CN.js',
        '/js/plugins/tablesorter/jquery.tablesorter.min.js',
        '/js/plugins/tablesorter/jquery.tablesorter.widgets.min.js',
        'js/integ_query.js'
      ]
    });
  })
};

/////////////////////////////////////////////////////////////////
exports.postInitSettleFlag = async function (req, res) {
  let inv = await Invoice.findOne({ waybill_no: '01201810080016002' }).exec();
  let ids = [];
  inv.bills.forEach(vb => {
    if (!ids.includes(vb.bill_id)) {
      ids.push(vb.bill_id);
    }
  });

  let bills = await Bill.find({ _id: { $in: ids } }).exec();
  for (let b of bills) {
    b.invoices.forEach(binv => {
      if (binv.inv_no === v.waybill_no) {
        console.log(binv.num + ", weight = " + binv.weight > 0 ? binv.weight : binv.num * b.weight);
        binv.inv_settle_flag = 0;
      }
    });

    await b.save();
  }

  res.end(JSON.stringify({ ok: true }));
};

exports.postInvoiceChargeData = async function (req, res) {
  let invs = await Invoice.find({}).exec();
  for (let inv of invs) {
    if (inv.advance_charge > 0) {
      if (inv.advance_charge_mode === '现金') {
        inv.charge_cash = inv.advance_charge;
      } else {
        inv.charge_oil = inv.advance_charge;
      }
    }

    await inv.save();
  }

  res.end(JSON.stringify({ ok: true }));
};

exports.getVehicles = async function (req, res) {
  const vehs = await Vehicle.find({}).lean().exec();
  res.end(JSON.stringify({ vehicles: vehs }));
};

exports.updateStatus1 = async function (req, res) {
  let plans = await OrderPlan.find({}).exec();
  for (let plan of plans) {
    let bills = await Bill.find({ order_no: plan.order_no }).exec();
    if (bills.length > 0) {
      let w = 0, left = 0;
      bills.forEach(b => {
        w += b.total_weight;
        if (b.block_num > 0) {
          left += b.left_num * b.weight;
        } else {
          left += b.left_num;
        }
      });

      plan.left_weight = plan.order_weight - w + left;
      if (plan.left_weight < EPSILON) {
        plan.left_weight = 0;
        plan.status = 1;
      } else {
        plan.status = 0;
      }

      if (w > plan.order_weight) {
        console.log(plan.order_no + ": total weight > order weight " + w.toFixed(3) + " > " + plan.order_weight);
      }
    }

    await plan.save();
  }

  res.end(JSON.stringify({ ok: true }));
};
