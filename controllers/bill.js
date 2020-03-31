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
let async = require('async');
let bunyan = require('bunyan');

let logger = bunyan.createLogger({
  name: 'XHT',
  streams: [ { level: 'info', stream: process.stdout }, { level: 'error', path: 'app.log' }]
});

const CUSTOMER_SETTLE_FLAG   = 1; // 0001
const COLLECTION_SETTLE_FLAG = 2; // 0010
const VESSEL_SETTLE_FLAG     = 4; // 0100
const EPSILON = 1e-5; //Number.EPSILON === undefined ? 0.000001 : Number.EPSILON;

exports.createBills = function (req, res) {
  if (req.user.privilege[0] === '0' && req.user.privilege[1] === '0') { // === ACCOUNT) {
    res.status(404);
    res.render('404');
  }
  else {
    getDictDataAndRender('bill', false, false, function (data) {
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
          '/js/bill_import_create.js'
        ]
      });
    })
  }
};

function isInteger(n) {
  return n === +n && n === (n|0);
}

function isExist(variable) {
  return ((typeof variable != 'undefined') && undefined != variable);
}
function isEmpty(variable) {
  return (typeof variable === 'undefined' || !variable || 0 === variable.length);
}

exports.postCreateBills = async function (req, res) {
  let allBillName   = [];
  let allWarehouse  = [];
  let allBrandNo    = [];
  let allocatedData = [];

  for (let row_data of req.body) {
    let order = row_data.order;
    let bno   = row_data.bill_no;

    try {
      let bill = await Bill.findOne({order: order, bill_no: bno}).exec();
      if (!bill) {
        bill = new Bill({
          order: order, bill_no: bno,
          order_no:      row_data.order_no,
          order_item_no: row_data.order_item_no,
          billing_name:  row_data.billing_name,
          sale_dep:      row_data.sales_dep,
          block_num:     utils.getIntValue(row_data.block_num),
          total_weight:  utils.getFloatValue(row_data.total_weight, 3),

          warehouse:        row_data.warehouse,
          ship_warehouse:   row_data.ship_warehouse,
          contract_no:      row_data.contract_no,
          shipping_address: row_data.shipping_address,
          product_type:     row_data.product_type,
          creater:          req.user.userid,
          invoices: [],
          customer_price:   0,
          collection_price: 0
        });

        if (row_data.brand_no) {
          let brd_list = row_data.brand_no.split(/\s*;\s*/);
          if (brd_list.length) {
            bill.brand_no = brd_list[brd_list.length - 1];
            if (bill.brand_no && allBrandNo.indexOf(bill.brand_no) < 0) {
              allBrandNo.push(bill.brand_no);
            }
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
          bill.len       = utils.getIntValue(row_data.block_len);
          bill.width     = utils.getIntValue(row_data.width);
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
      return res.end(JSON.stringify({ok: false, response: err}));
    }	

    if (row_data.billing_name && allBillName.indexOf(row_data.billing_name) < 0) {
      allBillName.push(row_data.billing_name);
    }

    if (row_data.warehouse && allWarehouse.indexOf(row_data.warehouse) < 0) {
      allWarehouse.push(row_data.warehouse);
    }

    if (row_data.ship_warehouse && allWarehouse.indexOf(row_data.ship_warehouse) < 0) {
      allWarehouse.push(row_data.ship_warehouse);
    }
  }

  for (let w of allWarehouse) {
    try {
      let ware = await Warehouse.findOne({name: w}).exec();
      if (!ware) {
        ware = new Warehouse({name: w});
        await ware.save();
      }
    } catch (e) {
      logger.error("Save warehouse error! %s", e.toString());
    }
  }

  for (let b of allBrandNo) {
    try {
      let brand = await Brand.findOne({name: b}).exec();
      if (!brand) {
        brand = new Brand({name: b});
        await brand.save();
      }
    } catch (e) {
      logger.error("Save brand error! %s", e.toString());
    }
  }

  for (let bn of allBillName) {
    try {
      let comp = await Company.findOne({name: bn}).exec();
      if (!comp) {
        comp = new Company({name: bn});
        await comp.save();
      }
    } catch (e) {
      logger.error("Save company error! %s", e.toString());
    }
  }

  res.end(JSON.stringify({ok: true, noUpdatedData: allocatedData}));
};

exports.modifyBill = function(req, res) {
  if (req.user.privilege[0] === '0' && req.user.privilege[1] === '0') { // === ACCOUNT) {
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


function updateInvoiceStatus(res, allInvNo, settle_type) {
  // 1. find all Invoices by waybill no
  Invoice.find({waybill_no: { $in: allInvNo }}).exec(function (err, invs) {
    if (err) {
      logger.error("updateInvoicesStatus: Cannot find invoice! %s", err);
      res.end(JSON.stringify({ok: false, response: '更新运单状态错:' + err}));
    } else {
      async.each(invs,
        function (invoice, callback) {
          var ids = utils.getAllList(true, invoice.bills, "bill_id");
          // 2. find all Bills for each invoice
          Bill.find({_id: { $in: ids }}).exec(function (err, billArr) {
            if (err) {
              callback("更新运单状态错");
            } else {
              var settled = true;
              for (var idx = 0, len = billArr.length; idx < len && settled; ++idx) {
                billArr[idx].invoices.forEach(function(binv) {
                  settled = checkFlag(binv.inv_settle_flag, settle_type);
                });
              }

              if (settled) {
                if (!checkFlag(invoice.settle_flag, settle_type)) {
                  invoice.state = '已结算';
                  invoice.settle_flag = setFlag(invoice.settle_flag, settle_type);
                  updateOneDBRecord(invoice, "更新运单状态出错", callback);// 3. Update state if all bills had settledState
                } else {
                  callback();
                }
              } else {
                if (checkFlag(invoice.settle_flag, settle_type)) {
                  invoice.state = '已配发';
                  invoice.settle_flag = clearFlag(invoice.settle_flag, settle_type);
                  updateOneDBRecord(invoice, "更新运单状态出错", callback);// 3. Update state if all bills had settledState
                } else {
                  callback();
                }
              }
            }
          });
        },
        function (err) {
          if (err) {
            res.end(JSON.stringify({ok: false, response: err}));
          } else {
            res.end(JSON.stringify({ok: true}));
          }
        });
    }
  });
}

exports.postModifySingleBill = function(req, res) {
  Bill.findByIdAndUpdate(req.body._id, req.body, null, function (err) {
    if (err) {
      logger.error("postModifySingleBill: Cannot find bill! %s", err, req.body._id);
      res.end(JSON.stringify({ok: false, response: '修改失败'}));
    } else {
      Company.findOne({ name: req.body.billing_name }).exec(function (err, company) {
        if (!err && !company) {
          company = new Company({ name: req.body.billing_name });
          company.save(function (err) {
            if (err) {
              logger.error("postModifySingleBill: save company error! %s", err);
            }
          })
        }
      });

      res.end(JSON.stringify({ok: true}));
    }
  });
};

exports.postBatchModifyBill = async function(req, res) {
  try {
    for (let bill of req.body.bills) {
      let b = await Bill.findByIdAndUpdate(bill._id, bill, { new: true });
      if (!b) {
        res.end(JSON.stringify({ok: false, error: "No update with the given bill"}));
      }
    }
  } catch (e) {
    res.end(JSON.stringify({ok: false, error: e.toString()}));
  }

  if (req.body.nameChanged) {
    let bname = req.body.bills[0].billing_name;
    let comp  = await Company.findOne({ name: bname }).exec();
    if (!comp) {
      company = new Company({ name: bname });
      company.save(err => { if (err) logger.error("modifyBill: save company error! %s", err)} );
    }
  }

  res.end(JSON.stringify({ok: true}));
};

exports.getBillsByNo = function(req, res) {
  var reg = new RegExp(req.query.q, 'gi');
  queryBills( {order_no: {$regex: reg}}, {order_no: 'asc'}, res, function(bills, result) {
    var list = utils.getAllList(true, bills, "order_no");
    result.targetData = buildTargetData(list);
  });
};

exports.getBillsByBillName = function(req, res) {
  var obj = {
    $and : [
      { billing_name: req.query.q },
      { status: { $ne: '已配发'} },
      { status: { $ne: '已结算'} },
      { status: { $ne: '已开票'} },
      { status: { $ne: '已回款'} }
    ]
  };
  queryBills( obj, {order_item_no: 'asc'}, res, function(bills, result) {
    var list = utils.getAllList(true, bills, "order_no");
    result.targetData = buildTargetData(list);
  });
};

exports.getBillsByOrder = function(req, res) {
  queryBills( {order_no: {$regex: new RegExp(req.query.q, 'gi')}}, {order_no: 'asc'}, res, function(bills, result) {
    var order_map = {};
    var order_list = [];

    bills.forEach(function (bill) {
      var order_no = bill.order_no;
      var order_item_no = bill.order_item_no;

      if (order_no && order_list.indexOf(order_no) >= 0) {
        var o = order_map[order_no];
        if (order_item_no && o.indexOf(order_item_no) < 0) {
          o.push(order_item_no);
        }
      } else {
        order_list.push(order_no);
        order_map[order_no] = [order_item_no];
      }
    });

    result.targetData = buildTargetData(order_list);
    result.orderItemNoMap = order_map;
  });
};

function queryBills(queryObj, sortObj, res, getTargetData) {
  Bill.countDocuments(queryObj, function(err, count) {
    if (err || count === 0) {
      res.end(JSON.stringify( { ok: false, number: 0 }));
    } else {
      var query = Bill.find(queryObj);
      if (count > 25000) {
        query.limit(25000);
      }

      query.sort(sortObj).lean().exec(function (err, bills) {
        if (err) {
          res.end(JSON.stringify({ok: false, response: '查询数据库出错' + err, number: 0}));
        } else {
          var result = {ok: true, bills: bills, number: count};
          if (getTargetData) {
            getTargetData(bills, result);
          }

          res.json(JSON.stringify(result));
        }
      })
    }
  });
}

exports.getBillsWithCondition = function(req, res) {
  var query = req.query;
  if (query.search_left == 1) {
    queryBills({ $and: [
      {status: { $regex: new RegExp('已配发', 'gi') }},
      { block_num: 0 },
      {left_num: {$gt: 0, $lt: parseFloat(query.left)}}
    ] }, {order_no: 'asc'}, res);
  } else {
    var q = JSON.parse(query.q);
    if (query.isNeedAnalysis == 'true') {
      var obj = getQueryFromNodes(q, query.field);
      if (Object.keys(obj).length > 0) {
        queryBills(obj, {order_no: 'asc'}, res);
      } else {
        res.end(JSON.stringify({ ok: false, response: '查询条件为空!' }));
      }
    } else {
      queryBills(q, {order_no: 'asc'}, res);
    }
  }
};

exports.deleteBill = function(req, res) {
  if (req.user.privilege[0] === '0' && req.user.privilege[1] === '0') { // === ACCOUNT) {
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

exports.postDeleteBill = function(req, res) {
  var bills = req.body;
  async.each(bills,
    function (bill, callback) {
      Bill.findByIdAndRemove(bill._id, function (err) {
        if (err) {
          callback('Failed: 删除提单' + bill.bill_no + '出错:' + err);
        } else {
          callback();
        }
      });
    },
    function (err) {
      if (err) {
        res.end(JSON.stringify({ok: false, response: err}));
      } else {
        res.end(JSON.stringify({ok: true}));
      }
    });
};

///////////////////////////////////////////////////////////////////////////////
// 结算代码
///////////////////////////////////////////////////////////////////////////////
exports.getSettleBill = function(req, res) {
  if (req.user.privilege[1] === '0' && req.user.privilege[2] === '0') { // === ACCOUNT) {
    res.status(404);
    res.render('404');
  }
  else {
    var bnameList = [];
    var vehList = [];
    var destList = [];
    var bs = [], vs = [], ds = [];
    Invoice.find({state: {$ne: '新建'}})
	.select({
	  "_id": 0,	
      "settle_flag": 1,
      "ship_name": 1,
      "vehicle_vessel_name": 1,
      "ship_to": 1
    })
	.lean()
	.exec( (err, db_invs) => {
      if (!err && db_invs.length) {
        db_invs.forEach( (inv) => {
          if ((inv.settle_flag & CUSTOMER_SETTLE_FLAG) !== CUSTOMER_SETTLE_FLAG) {
            if (bnameList.indexOf(inv.ship_name) < 0) {
              bnameList.push(inv.ship_name);
            }
            if (vehList.indexOf(inv.vehicle_vessel_name) < 0) {
              vehList.push(inv.vehicle_vessel_name);
            }
            if (destList.indexOf(inv.ship_to) < 0) {
              destList.push(inv.ship_to);
            }
          }

          if ((inv.settle_flag & COLLECTION_SETTLE_FLAG) !== COLLECTION_SETTLE_FLAG) {
            if (bs.indexOf(inv.ship_name) < 0) {
              bs.push(inv.ship_name);
            }
            if (vs.indexOf(inv.vehicle_vessel_name) < 0) {
              vs.push(inv.vehicle_vessel_name);
            }
            if (ds.indexOf(inv.ship_to) < 0) {
              ds.push(inv.ship_to);
            }
          }
        })
      }

      res.render('settle/settle', {
        title: '结算管理',
        curr_page: '结算管理-结算',
        curr_page_name: '结算',
        dData: {
          nameList: utils.pinyin_sort(bnameList),
          vehList: utils.pinyin_sort(vehList),
          destList: utils.pinyin_sort(destList),
          orderList: [], billNoList: []
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
          '/js/settle_mgt.js'
        ]
      });
    })
  }
};

exports.postPriceInput = function(req, res) {
  var action = req.body.act;
  async.each(req.body.data,
    function (priceObj, callback) {
      Bill.findById(priceObj.bid, function (err, db_bill) {
        if (!err && db_bill) {
          if (action === "CUSTOMER") {
            db_bill.invoices.forEach(function(inv) {
              if (inv.inv_no === priceObj.inv_no) {
                inv.price = priceObj.price;
              }
            })
          } else {
            db_bill.collection_price = priceObj.price;
          }

          updateOneDBRecord(db_bill, "保存价格出错", callback);
        } else {
          callback('没有找到提单');
        }
      });
    },
    function (err) {
      if (err) {
        res.end(JSON.stringify({ok: false, response: err}));
      } else {
        res.end(JSON.stringify({ok: true}));
      }
    });
};

function getSettleFalgWithType(flag, type) {
  var f = 0;
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

exports.postSettleBill = function(req, res) {
  var uno = utils.leftPad(req.user.no, 4);
  var date_no = new Date().yyyymmdd() + uno;
  var reg = new RegExp('^JS' + date_no + '.*', 'g');

  Settle.find({serial_number: {$regex: reg }}).sort({serial_number: 'desc'}).exec(function (err, settles) {
    if (err) {
      res.end(JSON.stringify({ok: false, response: '结算时不能生成流水号, 查询数据库出错' + err}));
    } else {
      var no = utils.leftPad(1, 3);
      if (settles.length > 0) {
        var str = settles[0].serial_number.substring(14);
        no = utils.leftPad((+str) + 1, 3);
      }

      var max = 'JS' + date_no + no;
      var tn = 0, tw = 0;
      var allIDs = [];
      var allInvNo = [];
      var settleObj = req.body.settleObj;
      settleObj.forEach(function(item) {
        allIDs.push({
          bill_id: item.bid,
          num: item.num,
          weight: item.weight,
          inv_no: item.inv_no,
          settle_flag : item.settle_flag
        });

        tn += item.num;
        tw += item.weight;
        
        if (item.inv_no && allInvNo.indexOf(item.inv_no) < 0) {
          allInvNo.push(item.inv_no);
        }
      });

      var settle_type = req.body.settle_type;
      if (settle_type === 'CUSTOMER') {
        settle_type = '客户结算';
      } else if (settle_type === 'COLLECTION') {
        settle_type = '代收代付结算';
      } else {
        settle_type = '车船结算';
      }
      var in_p = parseFloat(req.body.price);

      var settle = new Settle({
        serial_number: max,
        billing_name: req.body.billName,
        price: in_p,
        real_price: in_p,
        settle_type: settle_type,
        ship_number: tn,
        ship_weight: tw,
        ship_to : req.body.shipTo,
        bills: allIDs.slice(0),
        settle_date: new Date(),
        settler: req.user.userid,
        status: '已结算'
      });
      settle.save(function (err) {
        if (err) {
          res.end(JSON.stringify({ok: false, response: '结算出错:' + err}));
        } else {
          async.each(allIDs,
            function (idObj, callback) {
              Bill.findById(idObj.bill_id, function (err, db_bill) {
                if (!err && db_bill) {
                  if (db_bill.status === '已配发') {
                    db_bill.status = "已结算";
                  }

                  db_bill.invoices.forEach(function (inv) {
                    if (inv.inv_no === idObj.inv_no) {
                      inv.inv_settle_flag = setFlag(inv.inv_settle_flag, settle_type);
                    }
                  });

                  if (db_bill.invoices.length === 1) {
                    db_bill.settle_flag = db_bill.invoices[0].inv_settle_flag;
                  } else {
                    if (isSameSettleFlag(db_bill, settle_type)) {
                      db_bill.settle_flag = setFlag(db_bill.settle_flag, settle_type);
                    }
                  }

                  updateOneDBRecord(db_bill, "结算出错", callback);
                } else {
                  callback('结算:没有找到提单');
                }
              });
            },
            function (err) {
              if (err) {
                res.end(JSON.stringify({ok: false, response: err}));
              } else {
                updateInvoiceStatus(res, allInvNo, settle_type);
              }
            });
        }
      });
    }
  })
};

function isSameSettleFlag(bill, type) {
  var same = true;
  if (bill.invoices.length) {
    var flag = getSettleFalgWithType(bill.invoices[0].inv_settle_flag, type);
    for (var i = 1; i < bill.invoices.length; ++i) {
      var f = getSettleFalgWithType(bill.invoices[i].inv_settle_flag, type);
      if (same && flag != f) {
        same = false;
        break;
      }
    }
  }

  return same;
}

exports.postSettleCollectionNotRequire = function(req, res) {
  var nonSettleObj = req.body.nonSettleObj;
  var action = req.body.settle_type;
  var allInvNo = utils.getAllList(true, nonSettleObj, "inv_no");
  async.each(nonSettleObj,
    function (obj, callback) {
      Bill.findById(obj.bid, function (err, db_bill) {
        if (!err && db_bill) {
          if (action === "COLLECTION") {
            db_bill.collection_price = -1;
            //db_bill.settle_flag = clearFlag(db_bill.settle_flag, action);
            db_bill.invoices.forEach(function (inv) {
              if (inv.inv_no === obj.inv_no) {
                inv.inv_settle_flag = clearFlag(inv.inv_settle_flag, action);
              }
            });
          } else {
            db_bill.invoices.forEach(function (inv) {
              if (inv.inv_no === obj.inv_no) {
                inv.inv_settle_flag = clearFlag(inv.inv_settle_flag, action);
                inv.price = -1;
              }
            });
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

          updateOneDBRecord(db_bill, "(不)结算出错", callback);
        } else {
          callback('不结算:没有找到提单');
        }
      });
    },
    function (err) {
      if (err) {
        res.end(JSON.stringify({ok: false, response: err}));
      } else {
        updateInvoiceStatus(res, allInvNo, action);
      }
    });
};

function updateOneDBRecord(data, msg, callback) {
  data.save(function (err) {
    if (err) {
      callback(msg + err);
    } else {
      callback();
    }
  });
}

exports.postDeleteSettle = async function(req, res) {
  try {
    for (let settle of req.body.allSelected) {
      let dbSettle = await Settle.findByIdAndRemove(settle._id).exec();
      if (!dbSettle) {
        return res.end(JSON.stringify({ok: false, response: '删除结算:' + settle._id + '出错'}));
      }

      let settle_type = settle.settle_type;
      let ids = [];
      let allInvNo = [];
      dbSettle.bills.forEach(function(b) {
        if (b.bill_id && ids.indexOf(b.bill_id) < 0) ids.push(b.bill_id);

        if (b.inv_no && allInvNo.indexOf(b.inv_no) < 0) allInvNo.push(b.inv_no);
      });

      let bills = await Bill.find({_id: { $in: ids }}).exec();
      for (let bill of bills) {
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

      let dbInvs = await Invoice.find({waybill_no: { $in: allInvNo }}).exec();
      for (let invoice of dbInvs) {
        let ids = utils.getAllList(true, invoice.bills, "bill_id");
        // 2. find all Bills for each invoice
        Bill.find({_id: {$in: ids}}).lean().exec(function (err, dbBills) {
          let settled = true;
          for (let idx = 0, len = dbBills.length; idx < len && settled; ++idx) {
            dbBills[idx].invoices.forEach(function (binv) {
              settled = checkFlag(binv.inv_settle_flag, settle_type);
            });
          }

          if (settled) {
            if (!checkFlag(invoice.settle_flag, settle_type)) {
              invoice.state = '已结算';
              invoice.settle_flag = setFlag(invoice.settle_flag, settle_type);
              invoice.save( (err) => {} );
            }
          } else {
            if (checkFlag(invoice.settle_flag, settle_type)) {
              invoice.state = '已配发';
              invoice.settle_flag = clearFlag(invoice.settle_flag, settle_type);
              invoice.save( (err) => {} );
            }
          }
        })
      }
    }
  } catch (e) {
    return res.end(JSON.stringify({ok: false, response: e.toString()}));
  }

  res.end(JSON.stringify({ok: true}));
/*  
  var settles = req.body.allSelected;
  //var which = req.body.which;
  async.each(settles,
      function (settle, next) {
        Settle.findByIdAndRemove(settle._id, function (err, dbSettle) {
          if (err) {
            next('删除结算记录出错' + err);
          } else {
            var settle_type = settle.settle_type;
            var ids = [];
            var allInvNo = [];
            dbSettle.bills.forEach(function(b) {
              if (b.bill_id && ids.indexOf(b.bill_id) < 0) {
                ids.push(b.bill_id);
              }
              if (b.inv_no && allInvNo.indexOf(b.inv_no) < 0) {
                allInvNo.push(b.inv_no);
              }
            });

            Bill.find({_id: { $in: ids }}, function (err, billArr) {
              if (err) {
                next('删除结算记录时,更新提单信息出错:' + err);
              } else {
                async.each(billArr,
                  function (bill, callback) {
                    for (var i = 0; i < dbSettle.bills.length; ++i) {
                      if (String(bill._id) === String(dbSettle.bills[i].bill_id)) {
                        bill.invoices.forEach(function (inv) {
                          if (inv.inv_no === dbSettle.bills[i].inv_no) {
                            inv.inv_settle_flag = clearFlag(inv.inv_settle_flag, settle_type);
//                            logger.error('=====inv_no: ' + inv.inv_no + ' inv_settle_flag: ' + inv.inv_settle_flag + ' bill._id = ' + bill._id);
                          }
                        });
                      }
                    }

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

                    if (bill.settle_flag === 0 && bill.left_num === 0) {
                      bill.status = '已配发';
                    }

                    updateOneDBRecord(bill, '更新提单(删除结算)出错', callback);
                  },
                  function (err) { if (err) next(err); });

                updateInvoiceStatus(res, allInvNo, settle_type);

                next();
              }
            });
          }
        });
      },
      function (err) {
        if (err) {
          res.end(JSON.stringify({ok: false, response: err}));
        } else {
          res.end(JSON.stringify({ok: true}));
        }
      });*/
};

exports.getSettleTicket = function(req, res) {
  if (req.user.privilege[2] !== '1') {// === OPERATOR || req.user.privilege === STATISTICS || req.user.privilege === '11000000') {
    res.status(404);
    res.render('404');
  }
  else {
    ticket_money_render(res, {$or: [{status: '已结算'}, {status: '已开票'}]}, "settle/settle_ticket", "开票");
  }
};

exports.getSettleMoney = function(req, res) {
  if (req.user.privilege[2] !== '1') {// === OPERATOR || req.user.privilege === STATISTICS || req.user.privilege === '11000000') {
    res.status(404);
    res.render('404');
  }
  else {
    ticket_money_render(res, {status : {$in: ['已回款', '已开票']}}, "settle/settle_money", "回款");
  }
};

function ticket_money_render(res, search_obj, route, title) {
  console.time("queryTime");

  Settle.find(search_obj, {bills: 0})
  .lean()
  .sort({settle_date: -1})
  .exec(function (err, settles) {
    if (err) {
      res.render(route, {
        title: '结算管理',
        curr_page: '结算管理-' + title,
        curr_page_name: title,
        scripts: [ '/js/ticket_money.js' ]
      });
    } else {
      console.timeEnd("queryTime");
      res.render(route, {
        title: '结算管理',
        curr_page: '结算管理-' + title,
        curr_page_name: title,
        dbSettleData: settles,
        scripts: [
          '/js/ticket_money.js'
        ]
      });
    }
  })
}

exports.getSettleInvoiceBill = function(req, res) {
  var query = req.query;
  Settle.findOne({serial_number: query.fSerial}).exec(function (err, settle) {
    if (err) {
      res.end(JSON.stringify({ok: false}));
    } else {
      var allIds = utils.getAllList(true, settle.bills, "bill_id");
      Bill.find({_id: {$in: allIds}}).exec(function (err, billArr) {
        if (!err && billArr) {
          res.end(JSON.stringify({ ok: true, bills: billArr, settle_bills: settle.bills }));
        } else {
          res.end(JSON.stringify({ ok: false }));
        }
      });
    }
  });
};

exports.postSettleTicketMoney = function(req, res) {
  var settles = req.body;
  async.each(settles,
      function (settle, callback) {
        var cid = settle._id;
//        delete settle.isShow;
        Settle.findById(cid, function(err, dbSettle) {
          if (err) {
            callback('更新数据库出错');
          } else {
            dbSettle.ticket_no = settle.ticket_no;
            dbSettle.ticket_date = settle.ticket_date;
            dbSettle.ticket_person = settle.ticket_person;
            dbSettle.status = settle.status;
            dbSettle.return_person = settle.return_person;
            dbSettle.return_money_date = settle.return_money_date;

            //Settle.findByIdAndUpdate(cid, settle, null, function (err) {
            dbSettle.save(function(err) {
              if (err) {
                callback('更新数据库出错');
              } else {
                callback();
              }
            })
          }
        });
      },
      function (err) {
        if (err) {
          res.end(JSON.stringify({ok: false, response: '更新数据库出错:' + err}));
        }
      });

  res.end(JSON.stringify({ok: true}));
};

exports.postSettleRealPrice = function(req, res) {
  var sno = req.body.sno;
  var price = req.body.price;
  Settle.findOne({serial_number: sno}, function(err, settle) {
    if (!err) {
      settle.real_price = price;
      settle.save(function(err) {
        if (err) {
          res.end(JSON.stringify({ok: false, response: '更新实收价格出错:' + err}));
        } else {
          res.end(JSON.stringify({ok: true}));
        }
      })
    } else {
      res.end(JSON.stringify({ok: false, response: '查找结算号出错:' + err}));
    }
  });
};

/// 车船结算 ------------
////////////////////////
exports.getSettleVessel = function(req, res) {
  if (req.user.privilege[1] === '0' && req.user.privilege[2] === '0') { // === OPERATOR || req.user.privilege === '10010000') {
    res.status(404);
    res.render('404');
  }
  else {
    console.time("queryTime");
    Invoice.find({state: {$ne: '新建'}})
	.select({
	  "_id": 0,	
      "settle_flag": 1,
      "ship_name": 1,
      "vehicle_vessel_name": 1,
      "ship_to": 1
    })
	.lean()
	.exec( (err, invs) => {
	
    //Invoice.find({state: {$ne: "新建"}}, 'vehicle_vessel_name ship_name ship_to', function(err, invs) {
      if (err) {
        res.end(JSON.stringify({ok: false, response: '获取已配发的运单数据出错' + err}));
      } else {
        console.timeEnd("queryTime");
        console.time("handleTime");
        var vesselNames = [];
        var destList = [];
        var shipNames = [];
        invs.forEach(function (inv) {
          if (shipNames.indexOf(inv.ship_name) < 0) {
            shipNames.push(inv.ship_name);
          }
          if (destList.indexOf(inv.ship_to) < 0) {
            destList.push(inv.ship_to);
          }
        });

        var contacter = [];
        var veh_person_map = {};
        Vehicle.find({}).select('name contact_name').lean().exec(function (err, vehs) {
          if (!err) {
            vehs.forEach(function(veh) {
              if (veh.contact_name && contacter.indexOf(veh.contact_name) < 0) {
                contacter.push(veh.contact_name);
              }

              vesselNames.push(veh.name);
              veh_person_map[veh.name] = veh.contact_name;
            })
          }

          console.timeEnd("handleTime");
          res.render('settle/settle_vessel', {
            title: '结算管理',
            curr_page: '结算管理-车船结算',
            curr_page_name: '车船结算',
            dData: {
              nameList: utils.pinyin_sort(shipNames),
              vehList: utils.pinyin_sort(vesselNames),
              destList: destList, //utils.pinyin_sort(destList),
              contactNameList: utils.pinyin_sort(contacter),
              vehPersonMap: veh_person_map
            },
            scripts: [
              '/js/plugins/select2/select2.min.js',
              '/js/plugins/select2/select2_locale_zh-CN.js',
              '/js/settle_vessel.js'
            ]
          });
        })
      }
    })
  }
};

exports.postVesselPriceInput = function(req, res) {
  var wnoList = req.body.wnoList;
  var priceData = req.body.priceData;

  async.each(wnoList,
    function (wno, next) {
      var foundPrice = false;
      var price = 0;
      for (var i = 0; i < priceData.length; ++i) {
        if (wno == priceData[i].wno && priceData[i].inner == 0) {
          price = priceData[i].price;
          foundPrice = true;
          break;
        }
      }

      Invoice.findOne({ waybill_no: wno }, function (err, db_inv) {
        if (!err && db_inv) {
          var ids = utils.getAllList(true, db_inv.bills, "bill_id");
          Bill.find({_id: { $in: ids }}, function (err, billArr) {
            if (!err && billArr && billArr.length) {
              async.each(billArr,
                function (db_bill, callback) {
                  var found = false;
                  db_bill.invoices.forEach(function(dbi) {
                    if (dbi.inv_no === wno) {
                      found = true;
                      if (foundPrice) {
                        dbi.veh_ves_price = price;
                      }

                      dbi.vehicles.forEach(function(dVeh) {
                        for (var k = 0; k < priceData.length; ++k) {
                          if (dVeh.inner_waybill_no == priceData[k].wno && priceData[k].inner == 1) {
                            dVeh.veh_price = priceData[k].price;
                            break;
                          }
                        }
                      });
                    }   // find same bill in invoice
                  });

                  if (found) {
                    updateOneDBRecord(db_bill, '车船价格保存', callback);
                  } else {
                    callback();
                  }
                },
                function (err) {
                  if (err) next(err);
                });

              if (foundPrice) {
                db_inv.vessel_price = price;
              }

              db_inv.bills.forEach(function(bill) {
                bill.vehicles.forEach(function(bveh) {
                  for (var k = 0; k < priceData.length; ++k) {
                    if (bveh.inner_waybill_no == priceData[k].wno && priceData[k].inner == 1) {
                      bveh.veh_price = priceData[k].price;
                      break;
                    }
                  }
                })
              });

              updateOneDBRecord(db_inv, '车船价格保存(运单)', next);
            } else {
              next('没找到相应的提单');
            }
          })
        } else {
          next('没找到相应的运单');
        }
      })
    },
    function (err) {
      if (err) {
        res.end(JSON.stringify({ok: false, response: err}));
      } else {
        res.end(JSON.stringify({ok: true}));
      }
    });
};

exports.postVesselNotNeeded = function(req, res) {
  var wnoList = req.body.wayNoList;
  var isNotNeeded = req.body.notNeeded;
  async.each(wnoList,
    function (wno, next) {
      var waybillNo = wno;
      if (wno.length > 17) {
        waybillNo = wno.substring(0, 17);
      }
      Invoice.findOne({ waybill_no: waybillNo }, function (err, db_inv) {
        if (!err && db_inv) {
          if (wno.length > 17) {
            var ids = utils.getAllList(true, db_inv.bills, "bill_id");
            Bill.find({_id: { $in: ids }}, function (err, billArr) {
              if (!err && billArr && billArr.length) {
                async.each(billArr,
                  function (db_bill, callback) {
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
                      updateOneDBRecord(db_bill, '不需要车船结算', callback);
                    } else {
                      callback();
                    }
                  },
                  function (err) {
                    if (err) next(err);
                  });

                db_inv.bills.forEach(function (bill) {
                  bill.vehicles.forEach(function (bveh) {
                    if (wno === bveh.inner_waybill_no) {
                      bveh.veh_price = isNotNeeded ? -1 : 0;
                    }
                  })
                });

                buildInnerSettleData(db_inv); // if not exist, create and initialize it.

                db_inv.inner_settle.forEach(function(db_inner) {
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

                updateOneDBRecord(db_inv, '不需要车船结算(运单)', next);
              } else {
                next('没找到相应的提单');
              }
            })
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
            updateOneDBRecord(db_inv, '不需要车船结算(运单)', next);
          }
        } else {
          next('没找到相应的运单');
        }
      })
    },
    function (err) {
      if (err) {
        res.end(JSON.stringify({ok: false, response: err}));
      } else {
        res.end(JSON.stringify({ok: true}));
      }
    });
};

exports.postVesselDelayInfo = async function(req, res) {
  let unshipData = req.body.unshipData;
  let partInd = req.body.partInd;

  //console.log(req.body);
  let wnoList = [];
  for (let wno of req.body.wnoList) {
    let queryNo = wno.length > 17 ? wno.substring(0, 17) : wno;
    if (!wnoList.includes(queryNo)) wnoList.push(queryNo);
  }

  let db_invs = await Invoice.find( {waybill_no: {$in: wnoList} }).exec();
  db_invs.forEach( (db_inv) => {
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
        //db_inv.vessel_info_cost = unshipData.vessel_info_cost;
      }
    }

    db_inv.save( (err) => { if (err) console.log(err); });
  });

  res.end(JSON.stringify({ok: true}));
};

exports.postSettleVessel = async function(req, res) {
  let allSelectedInvNo = req.body.allSelectedInvNo;
  let allInnerNo = req.body.allInnerNo;
  let allInvNo   = allSelectedInvNo.slice(0);
  req.body.allInvNoFromInner.forEach( no => allInvNo.push(no) );

  let db_invs = await Invoice.find( {waybill_no: {$in: allInvNo}} ).exec();

  let v_state = '未结算';
  let v_state_date = null;
  if (req.body.settle) {
    v_state = '已结算';
    v_state_date = new Date();
  }

  db_invs.forEach( inv => {
    if (allSelectedInvNo.includes(inv.waybill_no)) {
      inv.vessel_settle_state = v_state;
      inv.vessel_settle_date  = v_state_date;
      inv.vessel_settler      = req.user.userid;
    }

    inv.inner_settle.forEach( db_inner => {
      if (db_inner.inner_waybill_no && allInnerNo.includes(db_inner.inner_waybill_no)) {
        db_inner.state = v_state;
        db_inner.date  = v_state_date;
      }
    });

    inv.save( (err) => { if (err) console.log(err); });
  });

  res.end(JSON.stringify({ok: true}));
};

exports.postSettleVesselPay = async function(req, res) {
  let allPayInvNo = req.body.allPayInvNo;
  let allInnerNo  = req.body.allInnerNo;
  let allInvNo = allPayInvNo.slice(0);
  req.body.allInvNoFromInner.forEach( inno => { allInvNo.push(inno) });

  let db_invs = await Invoice.find( {waybill_no: {$in: allInvNo}} ).exec();
  let v_state_text = '已结算';
  let v_state_date = null;
  if (req.body.forPay) {
    v_state_text = '已付款';
    v_state_date = new Date();
  }

  db_invs.forEach( inv => {
    if (allPayInvNo.includes(inv.waybill_no)) {
      inv.vessel_settle_state = v_state_text;
      inv.pay_date            = v_state_date;
    }

    inv.inner_settle.forEach(function (db_inner) {
      if (allInnerNo.includes(db_inner.inner_waybill_no)) {
        db_inner.state    = v_state_text;
        db_inner.pay_date = v_state_date;
      }
    });

    inv.save( (err) => { if (err) console.log(err); });
  });

  res.end(JSON.stringify({ok: true}));
};

exports.searchBill = function(req, res) {
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
function getDataAndRender(type, data, render) {
  data.warehouse = [];
  Warehouse.find({}).lean().exec(function (err, result) {
    if (err) {
      render(data);
    } else {
      data.warehouse = utils.getAllList(false, result, "name");
      data.warehouse.push('南钢');

      if (type === 'bill') {
        data.brand = [];
        data.sale_dep = [];
        Brand.find({}).lean().sort({name: 'asc'}).exec(function (err, result) {
          if (err) {
            render(data);
          } else {
            data.brand = utils.getAllList(false, result, "name");

            SaleDep.find({}).lean().sort({name: 'asc'}).exec(function (err, result) {
              if (!err && result) {
                data.sale_dep = utils.getAllList(false, result, "name");
              }
              render(data);
            });
          }
        });
      } else {
        data.vehicles = [];
        data.destination = [];
        Vehicle.find({}).lean().exec(function (err, vehs) {
          if (err) {
            render(data);
          } else {
            data.vehicles = utils.getAllList(false, vehs, "name");
            data.vehInfo = vehs;

            Destination.distinct('name', function(err, dnames) {
              data.destination = dnames;
              render(data);
            });
          }
        });
      }
    }
  });
}

function getDictDataAndRender(type, fromBill, fromInvoice, render) {
  var data = {};
  data.company = [];
  if (fromBill) {
    Bill.distinct('billing_name', {left_num: { $gt: 0 }}).lean().exec(function(err, names) {
      if (!err) {
        Company.find({name: { $in: names }}).lean().exec(function (err, companies) {
          if (!err) { data.company = companies; }
          getDataAndRender(type, data, render);
        })
      } else {
        getDataAndRender(type, data, render);
      }
    })
  }
  else if (fromInvoice) {
    Invoice.distinct('ship_name').lean().exec(function(err, names) {
      Company.find({name: { $in: names }}, function (err, companies) {
        if (!err) { data.company = companies; }
        getDataAndRender(type, data, render);
      })
    });
  }
  else {
    Company.find({}).lean().exec(function(err, companies) {
      if (!err) { data.company = companies; }
      getDataAndRender(type, data, render);
    });
  }
}

exports.getMaxWaybillNo = function (req, res) {
  var uno = utils.leftPad(req.user.no, 4);
  var date_no = new Date().yyyymmdd() + uno;
  var reg = new RegExp('^01' + date_no + '.*', 'g');
  Invoice.find({waybill_no: {$regex: reg }}).select('waybill_no').sort({waybill_no: 'desc'}).exec(function (err, inv_wnos) {
    if (err) {
      res.end(JSON.stringify({ok: false, response: '查询数据库出错' + err}));
    } else {
      var no = utils.leftPad(1, 3);
      if (inv_wnos.length) {
        var str = inv_wnos[0].waybill_no.substring(14);
        no = utils.leftPad((+str) + 1, 3);
      }

      var max = '01' + date_no + no;
      res.end(JSON.stringify( {ok: true, max_no: max} ));
    }
  });
};

exports.getBuildInvoice = function (req, res) {
  if (req.user.privilege[0] === '0' && req.user.privilege[1] === '0') { // === ACCOUNT) {
    res.status(404);
    res.render('404');
  }
  else {
    getDictDataAndRender('invoice', true, false, function (data) {
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
          '/js/inv_utils.js',
          '/js/invoice_mgt.js'
        ]
      });
    })
  }
};

function waybillModified(old_bill, new_bill) {
  return old_bill.num != new_bill.num ||
    Math.abs(old_bill.weight - new_bill.weight) > EPSILON ||
    old_bill.vehicles.length !== new_bill.vehicles.length;
}

function getChangedBills(old_inv, new_inv) {
  let allBills = [];
  for (let old_bill of old_inv.bills) {
    let found = false;
    for (let new_bill of new_inv.bills) {
      let isModified = false;
      if (!new_bill.passed && String(old_bill.bill_id) === String(new_bill.bill_id)) {
        if (old_bill.num != new_bill.num || Math.abs(old_bill.weight - new_bill.weight) > EPSILON) {
          isModified = true;
        } else {
          if (old_bill.vehicles.length === new_bill.vehicles.length) {
            for (var m = 0; m < new_bill.vehicles.length; ++m) {
              var vo = new_bill.vehicles[m];
              var find_veh_obj = false;
              for (var n = 0; n < old_bill.vehicles.length; ++n) {
                var ovo = old_bill.vehicles[n];
                if (vo.veh_name === ovo.veh_name && vo.inner_waybill_no === ovo.inner_waybill_no && vo.send_num === ovo.send_num &&
                    Math.abs(vo.send_weight - ovo.send_weight) < EPSILON && vo.veh_ship_from === ovo.veh_ship_from) {
                  find_veh_obj = true;
                  break;
                }
              }

              if (!find_veh_obj) {
                isModified = true;
                break;
              }
            }
          } else {
            isModified = true;
          }
        }

        if (isModified) {
          new_bill.flag = 'modify';
          new_bill.old_num = old_bill.num;
          new_bill.old_weight = old_bill.weight;
          allBills.push(new_bill);
        } else {
          old_bill.flag = 'same';
          allBills.push(old_bill);
        }

        new_bill.passed = true;
        found = true;
        break;
      }
    }

    if (!found) {
      old_bill.flag = 'remove';
      allBills.push(old_bill);
    }
  }

  new_inv.bills.forEach(function(bill) {
    if (!bill.passed) {
      bill.flag = 'add';
      allBills.push(bill);
    }
  });

  return allBills;
}

function updateStatus(uname, bill, status, date) {
  bill.shipper       = uname;
  bill.shipping_date = date;
  bill.status        = status;
  return true;
}

function updateBillStatus(uname, bill, inv_status) {
  let updated = false;

  if (bill.status != '已结算' && bill.status != '已开票' && bill.status != '已回款') {
    let left = 0;
    let state_str = '';
    if (bill.block_num > 0) {
      left = bill.block_num - bill.left_num;
      state_str = '已配发' + left + '块';
    } else {
      left = Math.abs(bill.total_weight - bill.left_num);
      state_str = '已配发重量' + utils.toFixedStr(left, 3);
    }

    if (bill.left_num < EPSILON) { // == 0
      if (inv_status === '已配发') {
        updated = updateStatus(uname, bill, '已配发', new Date());
      } else {
        if (bill.status != '待配发') {
          updated = true;
          bill.status = '待配发';
        }
      }
    } else if (left > EPSILON) { // left > 0) {
      if (bill.status != state_str) {
        updated = updateStatus(uname, bill, state_str, new Date());
      }
    } else if (left < EPSILON) { // left === 0) {
      if (bill.status != '新建') {
        updated = updateStatus('', bill, '新建', null);
        bill.collection_price = 0;
      }
    }
  }

  return updated;
}

function addInvoiceToBill(db_bill, inv, inv_bill) {
  var obj = {
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

  obj.vehicles.forEach(function(vehs) {
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

function assignInvoice(dbInv, inv, state) {
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
  dbInv.bills = inv.bills.slice(0);
}

function getDeltaWeight(leftNum, prevLeftNum, blockNum, weight) {
  if (blockNum > 0) {
    return (leftNum - prevLeftNum) * weight;
  } else {
    return leftNum - prevLeftNum;
  }
}

const updateWaybill = async function(res, dbInv, new_inv, userId) {
  let state = dbInv.state === "已配发" ? "已配发" : new_inv.state;
  let shipUpdated = (dbInv.ship_to != new_inv.ship_to) || (dbInv.ship_from != new_inv.ship_from);
  let allBills = getChangedBills(dbInv, new_inv);

  let savedBills = [];
  let savedPlans = [];
  for (let bill of allBills) {
    let dbBill = await Bill.findById(bill.bill_id).exec();
    if (dbBill) {
      let prevLeftNum = dbBill.left_num;
      let updated = true;
      if (bill.flag === 'modify') {
        dbBill = modifyInvBill(dbBill, bill, new_inv.waybill_no);
      } else if (bill.flag === 'remove') {
        dbBill = removeInvBill(dbBill, bill, new_inv.waybill_no);
      } else if (bill.flag === 'add') {
        if (dbBill.block_num > 0) {
          dbBill.left_num -= bill.num;
        } else {
          dbBill.left_num -= bill.weight;
          dbBill.left_num = utils.toFixedNumber(dbBill.left_num, 3);
        }
        addInvoiceToBill(dbBill, new_inv, bill);
      } else {
        updated = false;
      }

      if (shipUpdated && dbBill.invoices.length) {
        dbBill.invoices.forEach(function (dbInv) {
          dbInv.ship_to = new_inv.ship_to;
          dbInv.ship_from = new_inv.ship_from;
        });
      }

      if (updated || shipUpdated || updateBillStatus(userId, dbBill, state)) {
        if (Math.abs(prevLeftNum - dbBill.left_num) > EPSILON) {
          let plan = await OrderPlan.findOne({order_no: dbBill.order_no}).exec();
          if (plan) {
            plan.left_weight += getDeltaWeight(dbBill.left_num, prevLeftNum, dbBill.left_num, dbBill.weight);
            if (plan.left_weight < 0) {
              res.end(JSON.stringify({ok: false, response: '[' + dbBill.order_no + ']修改运单后，订单计划的剩余量小于零:' + plan.left_weight}));
              return;
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

  assignInvoice(dbInv, new_inv, state);

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

    allInnerNo.forEach(function(innerNo) {
      let found = false;
      for (let k = 0; k < dbInv.inner_settle.length; ++k) {
        if (dbInv.inner_settle[k].inner_waybill_no === innerNo) {
          found = true;
          break;
        }
      }
      if (!found) {
        dbInv.inner_settle.push({inner_waybill_no: innerNo, state: '未结算', price: 0, date: null, unship_date: null, delay_day: 0, charge_cash:0, charge_oil:0, receipt: 0, remark: '' });
      }
    })
  }

  for (let b of savedBills) { await b.save() }
  for (let p of savedPlans) { await p.save() }
  await dbInv.save();
  res.end(JSON.stringify({ok: true}));
};

function buildInnerSettleData(invoice) {
  var allInnerNo = utils.getAllList(true, invoice.bills, "vehicles", "inner_waybill_no");
  if (allInnerNo.length) {
    if (!isExist(invoice.inner_settle) || isEmpty(invoice.inner_settle)) {
      invoice.inner_settle = [];
      allInnerNo.forEach(function(innerNo) {
        invoice.inner_settle.push({
          inner_waybill_no: innerNo, state: '未结算', price: 0, date: null,
          unship_date: null, delay_day: 0, charge_cash: 0, charge_oil: 0, receipt: 0, remark: ''
        });
      })
    }
  }
}

let saveWaybill = async function(res, invoice, userId) {
  buildInnerSettleData(invoice);

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

      updateBillStatus(userId, dbBill, invoice.state);
      addInvoiceToBill(dbBill, invoice, bill);

      savedBills.push(dbBill);
    }
  }

  let ok = true;
  let savedPlans = [];
  for (let orderNo in order) {
    let plan = await OrderPlan.findOne({order_no: orderNo}).exec();
    if (plan) {
      if (plan.left_weight < order[orderNo]) {
        ok = false;
        res.end(JSON.stringify({ok: ok, response: '订单计划的剩余量' + plan.left_weight + '小于要配发的重量' + order[orderNo]}));
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
      console.log('no plan');
    }
  }

  if (ok) {
    for (let i = 0; i < savedBills.length; ++i) {
      await savedBills[i].save();
    }

    for (let i = 0; i < savedPlans.length; ++i) {
      await savedPlans[i].save();
    }

    await invoice.save();
    res.end(JSON.stringify({ok: true}));
  }
};

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
    state: inv.state
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

function queryInvoices(queryObj, res) {
  Invoice.countDocuments(queryObj, function(err, count) {
    if (err || count === 0) {
      res.end(JSON.stringify( { ok: false, number: 0 }));
    } else {
      var query = Invoice.find(queryObj);
      if (count > 1000) {
        query.limit(1000);
      }

      query.sort({waybill_no: 'asc'}).lean().exec(function (err, invoices) {
        if (!err && invoices.length) {
          var ids = [];
          var list = [];
          invoices.forEach(function (inv) {
            list.push(inv.waybill_no);
            inv.bills.forEach(function (bill) {
              if (ids.indexOf(bill.bill_id) < 0) {
                ids.push(bill.bill_id);
              }
            })
          });

          Bill.find({_id: { $in: ids }}).lean().exec(function (err, bills) {
            if (!err) {
              res.end(JSON.stringify( { ok: true, bills: bills, invoices: invoices, targetData: buildTargetData(list), number: count }));
            } else {
              res.end(JSON.stringify( { ok: false, number: 0 }));
            }
          });
        } else {
          res.end(JSON.stringify( { ok: false, number: 0 }));
        }
      });
    }
  });
}

function getQueryFromNodes(obj, fieldData) {
  var text = obj.text;
  var len = obj.children.length;
  if (len) {
    if (len == 1) {
      return getQueryFromNodes(obj.children[0], fieldData);
    } else {
      var childs = [];
      for (var i = 0; i < len; ++i) {
        var res = getQueryFromNodes(obj.children[i], fieldData);
        if (Object.keys(res).length > 0) {
          childs.push(res);
        }
      }

      if (childs.length) {
        if (childs.length == 1) {
          return childs[0];
        } else {
          if (text.indexOf('OR') >= 0) {
            return { $or: childs };
          } else { // if (text.indexOf('AND') >= 0) {
            return { $and: childs };
          }
        }
      } else {
        return {};
      }
    }
  } else if ((text.indexOf('并且') >= 0) || text.indexOf('或者') >= 0) {
    return {};
  } else {
    return queryAnalysis(text, fieldData);
  }
}

function queryAnalysis(text, fieldData) {
  var res = {};
  var items = text.split(' ');
  var oper = items[1];
  var value = items[2];
  var field = fieldData[items[0]];
  var idx = field.indexOf('date');

  var value2 = new Date();
  var eq = value;
  if (idx >= 0) {
    value = utils.convertDateToUTC(new Date(items[2]));
    if (oper === '等于') {
      value2 = utils.convertDateToUTC(new Date(items[2]));
      value2.setDate(value.getDate() + 1);
      eq = { $gte: value, $lte: value2 };
    } else if (oper === '区间') {
      value2 = utils.convertDateToUTC(new Date(items[3]));
    }
  } else {
    value2 = items[3];
  }

  var obj = {
    '等于' :  eq,
    '不等于': { $ne: value },
    '大于' :  { $gt: value },
    '小于' :  { $lt: value },
    '大于等于' :  { $gte: value },
    '小于等于' :  { $lte: value },
    '包含' :  { $regex: new RegExp(value, "gi") },
    '区间' :  { $gte: value, $lte: value2 }
  };

  if (obj[oper]) {
    res[field] = obj[oper];
  }

  return res;
}

exports.getInvoicesWithCondition = function(req, res) {
  var query = req.query;
  var q = JSON.parse(query.q);
  if (query.isNeedAnalysis == 'true') {
    var obj = getQueryFromNodes(q, query.field);
    if (Object.keys(obj).length > 0) {
      queryInvoices(obj, res);
    } else {
      res.end(JSON.stringify({ ok: false, response: '查询条件为空!' }));
    }
  } else {
    queryInvoices(q, res);
  }
};

exports.getWaybillByNo = function(req, res) {
  var reg = new RegExp(req.query.q, 'gi');
  var obj = { waybill_no: { $regex: reg } };
  queryInvoices(obj, res);
};

function buildTargetData(list) {
  var target = [];
  list.forEach(function(item, index) {
    target.push({
      id: index,
      text: item
    });
  });

  return target;
}

exports.distributeInvoice = function (req, res) {
  if (req.user.privilege[0] === '0' && req.user.privilege[1] === '0') { // === ACCOUNT) {
    res.status(404);
    res.render('404');
  }
  else {
    getDictDataAndRender('invoice', false, false, function (data) {
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
          '/js/inv_utils.js',
          '/js/invoice_mgt.js'
        ]
      });
    })
  }
};

exports.postDistributeInvoice = async function (req, res) {
  try {
    let dbInv = await Invoice.findOne({waybill_no: req.body.waybill_no}).exec();
    if (dbInv) {
      await updateWaybill(res, dbInv, req.body, req.user.userid);
    } else {
      res.end(JSON.stringify({ok: false, response: 'Not Found!'}));
    }
  } catch (e) {
    res.end(JSON.stringify({ok: false, response: e.toString()}));
  }
};

exports.deleteInvoice = function (req, res) {
  if (req.user.privilege[1] !== '1') {
    res.status(404);
    res.render('404');
  }
  else {
    getDictDataAndRender('invoice', false, false, function (data) {
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
          '/js/inv_utils.js',
          '/js/invoice_mgt.js'
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
          if (bill.block_num > 0) {
            bill.left_num += wbill.num;
          } else {
            bill.left_num += wbill.weight;
            bill.left_num = utils.toFixedNumber(bill.left_num, 3);
          }

          updateBillStatus(req.user.userid, bill, undefined);

          let len = bill.invoices.length;
          while (len--) {
            if (bill.invoices[len].inv_no === waybill.waybill_no) {
              bill.invoices.splice(len, 1);
            }
          }

          await bill.save();
        }
      }

      await Invoice.remove({waybill_no: waybill.waybill_no}).exec();
      res.end(JSON.stringify({ok: true}));
    } catch (e) {
      console.error("delete error! " + e.toString());
      res.end(JSON.stringify({ ok: false, response: e.toString() }));
    }
  }
};


exports.getInvoiceReport = async function(req, res) {
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
      '/js/inv_utils.js',
      '/js/invoice_mgt.js' ]
  });
};

exports.getIntegratedQuery = function(req, res) {
  getDictDataAndRender('invoice', false, false, function(data) {
    res.render('statistics/integ_query', {
      title: '统计和报表',
      curr_page: '综合查询',
      curr_page_name: '查询',
      bMultiSelect: true,
      bTableSort: true,
      dData: data,
      scripts: [
        '/js/lib/bootstrap-multiselect.js',
        '/js/plugins/tablesorter/jquery.tablesorter.min.js',
        '/js/plugins/tablesorter/jquery.tablesorter.widgets.min.js',
        'js/integ_query.js'
      ]
    });
  })
};

/////////////////////////////////////////////////////////////////
exports.postInitSettleFlag = async function(req, res) {
  let inv = await Invoice.findOne({waybill_no:'01201810080016002'}).exec();
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

  res.end(JSON.stringify({ok: true}));
};

exports.postInvoiceChargeData = async function(req, res) {
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

exports.getVehicles = function (req, res) {
  Vehicle.find({ }).lean().exec(function(err, vehs) {
    res.end(JSON.stringify({ vehicles: vehs }));
  });
};

exports.updateStatus = async function (req, res) {
  let plans = await OrderPlan.find({}).exec();
  for (let plan of plans) {
    let bills = await Bill.find({order_no: plan.order_no}).exec();
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
