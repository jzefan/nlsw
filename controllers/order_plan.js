/**
 * date: 2020/03/17
 * author: jzefan
 */
"use strict";

let OrderPlan = require('../models/OrderPlan');
let Company = require('../models/Company');
let Bill = require('../models/Bill');
let Destination = require('../models/Destination');
let utils = require('./utils');

let bunyan = require('bunyan');
let logger = bunyan.createLogger({
  name: 'XHT',
  streams: [ { level: 'info', stream: process.stdout }, { level: 'error', path: 'app.log' } ]
});
const DELTA = 1e-6; // 定义精度精确到0.00001

exports.getCreateOrderPlan = async function (req, res) {
  if (req.user.privilege[0] === '0' && req.user.privilege[1] === '0') {
    res.status.render(404);
  }
  else {
    let customer_name = await Company.distinct('name').lean().exec();
    let destination = await Destination.distinct('name').lean().exec();

    res.render('plan/create_plan', {
      title: '订单计划管理',
      curr_page: '新建订单计划',
      curr_page_name: '新建',
      dDataDict: {
        customer_name,
        destination
      },
      scripts: [
        '/js/plugins/sheetJS/shim.js',
        '/js/plugins/sheetJS/XLSX/jszip.js',
        '/js/plugins/sheetJS/XLSX/xlsx.core.min.js',
        '/js/plugins/sheetJS/XLS/xls.min.js',
        '/js/plugins/select2/select2.min.js',
        '/js/plugins/select2/select2_locale_zh-CN.js',
        '/js/lib/bootstrap-multiselect.js',
        '/js/create_order_plan.js'
      ]
    });
  }
};

exports.orderPlanExist = async function(req, res) {
  let plan = await OrderPlan.findOne({order_no: req.query.q}).exec();
  if (plan) {
    res.end(JSON.stringify({exist: true}));
  } else {
    res.end(JSON.stringify({exist: false}));
  }
};

exports.postCreateOrderPlan = async function (req, res) {
  try {
    for (let row_data of req.body) {
      let orderNo = row_data.orderNo;
      let weight = utils.getFloatValue(row_data.orderWeight, 3);
      let price = utils.getFloatValue(row_data.receivingCharge, 3);
      let exist = false;

      let plan = await OrderPlan.findOne({order_no: orderNo}).exec();
      if (!plan) {
        plan = new OrderPlan({
          order_no: orderNo,
          order_weight: weight,
          left_weight:  weight,
          destination:  row_data.destination,
          consignee:    row_data.consignee,
          customer_name:row_data.customerName,
          customer_code:row_data.customerCode,
          ds_client:    row_data.dsClient,
          transport_mode:  row_data.transportMode,
          customer_saleman:row_data.salesman,
          consigner:       row_data.consigner,
          contract_no:     row_data.contractNo,
          receiving_charge:price,
          entry_time:      new Date(),
          creator: req.user.userid
        });
      } else {
        exist = true;
        console.log("Order exist. " + orderNo);
        plan.left_weight  = weight - (plan.order_weight - plan.left_weight);
        plan.order_weight = weight;
        plan.destination  = row_data.destination;
        plan.consignee    = row_data.consignee;
        plan.customer_name=row_data.customerName;
        plan.customer_code=row_data.customerCode;
        plan.ds_client    = row_data.dsClient;
        plan.transport_mode   = row_data.transportMode;
        plan.customer_saleman = row_data.salesman;
        plan.consigner        = row_data.consigner;
        plan.contract_no      = row_data.contractNo;
        plan.receiving_charge = price;
        plan.entry_time       = new Date();
        plan.creator = req.user.userid
      }

      let bills = await Bill.find({order_no: orderNo}).exec();
      if (bills.length > 0) {
        let w = 0, left = 0;
        bills.forEach(b => {
          w += b.total_weight;
          if (b.block_num > 0) {
            left += b.block_num * b.weight;
          } else {
            left += b.left_num;
          }
        });

        if (!exist) {
          if (Math.abs(w - weight) < DELTA) {
            plan.left_weight = left;
            if (left < DELTA) {
              plan.left_weight = 0;
              plan.status = 1;
            }
          } else if (w < weight) {
            plan.left_weight = weight - w + left;
            plan.status = 0;
          } else {
            let str = plan.order_no + ":  存在的总重量大于要保存的计划订单量, " + w.toFixed(3) + " > " + weight;
            return res.end(JSON.stringify({ok: false, response: str}));
          }
        } else {
          if (w > weight) {
            let str = plan.order_no + ":  存在的总重量大于要保存的计划订单量, " + w.toFixed(3) + " > " + weight;
            return res.end(JSON.stringify({ok: false, response: str}));
          } else if (weight - w < DELTA) {
          } else {
            plan.status = 0;
          }
        }
      }

      await plan.save();
      console.log("save successful. " + orderNo);
    }

    res.end(JSON.stringify({ok: true}));
  } catch (err) {
    logger.error('保存出错！(订单号:' + orderNo + ', 原因:' + err);
    res.end(JSON.stringify({ok: false, response: err}));
  }
};

exports.getPlanList = async function (req, res) {
  if (req.user.privilege[0] === '0' && req.user.privilege[1] === '0') {
    res.status.render(404);
  }
  else {
    let customer_name = await Company.distinct('name').lean().exec();
    let destination = await Destination.distinct('name').lean().exec();
    let plans = await OrderPlan.find({status: 0}).lean().sort({order_no: 1}).exec();

    res.render('plan/plan_list', {
      title: '订单计划管理',
      curr_page: '订单列表',
      curr_page_name: '订单操作',
      bTableSort: true,
      dData: {
        customer_name,
        destination,
        plans,
      },
      scripts: [
        '/js/plugins/select2/select2.min.js',
        '/js/plugins/select2/select2_locale_zh-CN.js',
        '/js/lib/bootstrap-multiselect.js',
        '/js/plugins/tablesorter/jquery.tablesorter.min.js',
        '/js/plugins/tablesorter/jquery.tablesorter.widgets.min.js',
        '/js/plan_list.js'
      ]
    });
  }
};

exports.postUpdatePlan = async function(req, res) {
  let data = req.body;
  let plan = await OrderPlan.findOne({order_no: data.orderNo}).exec();
  if (plan) {

    if (Math.abs(plan.order_weight - data.orderWeight) > DELTA) {
      let undo = plan.order_weight - plan.left_weight;
      let d = data.orderWeight - undo;
      if (d < 0 && Math.abs(d) > DELTA) {
//      if (data.orderWeight < undo) {
        return res.end(JSON.stringify({ok: false, response: '修改失败: 修改的订单量比已发量还少' + data.orderNo}));
      }

      plan.left_weight = data.orderWeight - undo;
      if (plan.left_weight < DELTA) {
        plan.left_weight = 0;
        plan.status = 1; // 结案
      } else if (plan.left_weight - data.orderWeight < DELTA) {
        plan.status = 0;
        plan.left_weight = data.orderWeight;
      } else {
        plan.status = 0;
      }

      plan.order_weight = data.orderWeight;
    }
    plan.destination = data.destination;
    plan.transport_mode = data.transportMode;
    plan.consignee = data.consignee;
    plan.consigner = data.consigner;
    plan.ds_client = data.dsClient;
    plan.customer_saleman = data.salesman;
    plan.contract_no = data.contractNo;
    plan.receiving_charge = data.charge;
    plan.entry_time = data.entryTime;
    await plan.save();

    res.end(JSON.stringify({ok: true}));
  } else {
    res.end(JSON.stringify({ok: false, response: '修改失败: 未找到对应的订单号'} + data.orderNo));
  }
};

exports.postDeletePlan = async function(req, res) {
  let data = req.body;

  try {
    for (let i = 0; i < data.length; ++i) {
      let res = await OrderPlan.deleteOne({order_no: data[i].order_no}).exec();
    }

    res.end(JSON.stringify({ok: true}));
  } catch (e) {
    res.end(JSON.stringify({ok: false, response: e.toString()}));
  }
};

exports.postPlanStatusClosed = async function(req, res) {
  let data = req.body;

  try {
    for (let i = 0; i < data.length; ++i) {
      let plan = await OrderPlan.findOne({order_no: data[i]}).exec();
      if (plan) {
        plan.status = 1;
        await plan.save();
      }
    }

    res.end(JSON.stringify({ok: true}));
  } catch (e) {
    res.end(JSON.stringify({ok: false, response: e.toString()}));
  }
};

exports.postPlanStatusUnClosed = async function(req, res) {
  let data = req.body;
  try {
    let plans = [];
    for (let i = 0; i < data.length; ++i) {
      let plan = await OrderPlan.findOne({order_no: data[i], status: 1}).exec();
      if (plan) {
        plan.status = 0;
        plans.push(plan);
      } else {
        return res.end(JSON.stringify({ok: false, response: '订单未找到' + data[i]}));
      }
    }

    for (let i = 0; i < plans.length; ++i) {
      await plans[i].save();
    }
    res.end(JSON.stringify({ok: true}));
  } catch (e) {
    res.end(JSON.stringify({ok: false, response: e.toString()}));
  }
};

exports.searchPlans = async function(req, res) {
  let query = req.query;
  let obj = { $and: [  ] };

  if (!utils.isEmpty(query.fOrder)) {
    const reg = new RegExp(query.fOrder, 'i');
    obj["$and"].push({ order_no: { $regex: reg }});
  }

  if (!utils.isEmpty(query.fName)) obj["$and"].push({ customer_name: query.fName });
  if (!utils.isEmpty(query.fDate1) && !utils.isEmpty(query.fDate2)) {
    let qDate = getStartEndDate(query.fDate1, query.fDate2, true);
    obj["$and"].push({ entry_time: { $gte: qDate.s, $lte: qDate.e } });
  }

  if (!utils.isEmpty(query.fTransportMode)) obj["$and"].push({ transport_mode: query.fTransportMode });
  if (!utils.isEmpty(query.fStatus)) {
    let st = (query.fStatus == '生效') ? 0 : 1;
    obj["$and"].push({ status: st });
  }

  let plans = await OrderPlan.find(obj).lean().sort({order_no: 1}).exec();
  if (plans.length > 0) {
    let w = 0, left = 0;
    plans.forEach(p => {
      w += p.order_weight;
      left += p.left_weight;
    });

    res.json(JSON.stringify({ok: true, plans: plans, totalWeight: w, leftWeight: left}));
  } else {
    res.json(JSON.stringify({ok: false}));
  }
};

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
