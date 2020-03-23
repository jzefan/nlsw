/**
 * date: 2020/03/17
 * author: jzefan
 */
"use strict";

let OrderPlan = require('../models/OrderPlan');
let dataCfg = require('./cache');
let utils = require('./utils');
//var Bill = require('../models/Bill');

let bunyan = require('bunyan');
let logger = bunyan.createLogger({
  name: 'XHT',
  streams: [ { level: 'info', stream: process.stdout }, { level: 'error', path: 'app.log' } ]
});


exports.getCreateOrderPlan = async function (req, res) {
  if (req.user.privilege[0] === '0' && req.user.privilege[1] === '0') {
    res.status.render(404);
  }
  else {
    let cacheCfg = await dataCfg;
    let company = await cacheCfg['company'];
    let destination = await cacheCfg['destination'];
    let customer_name = [];
    company.forEach(c => customer_name.push(c.name));

    res.render('plan/create_plan', {
      title: '订单计划管理',
      curr_page: '新建订单计划',
      curr_page_name: '新建',
      dDataDict: {
        customer_name,
        destination
      },
      scripts: [
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
  for (let row_data of req.body) {
    let orderNo = row_data.orderNo;

    try {
      let plan = await OrderPlan.findOne({order_no: orderNo}).exec();
      if (!plan) {
        let weight = utils.getFloatValue(row_data.orderWeight, 3);
        let price = utils.getFloatValue(row_data.receivingCharge, 3);
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
          entry_time:      row_data.entryTime,
          creator: req.user.userid
        });

        await plan.save();
        res.end(JSON.stringify({ok: true}));
      } else {
        res.end(JSON.stringify({ok: false, response: 'order exist!'}));
      }
    } catch (err) {
      logger.error('保存出错！(订单号:' + orderNo + ', 原因:' + err);
      res.end(JSON.stringify({ok: false, response: err}));
    }
  }
};

exports.getPlanList = async function (req, res) {
  if (req.user.privilege[0] === '0' && req.user.privilege[1] === '0') {
    res.status.render(404);
  }
  else {
    let cacheCfg = await dataCfg;
    let destination = await cacheCfg['destination'];
    let customer_name = await cacheCfg['plan_cu_name'];

    res.render('plan/plan_list', {
      title: '订单计划管理',
      curr_page: '订单列表',
      curr_page_name: '订单操作',
      bTableSort: true,
      dData: {
        customer_name,
        destination
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
    if (plan.order_weight !== data.orderWeight) {
      let undo = plan.order_weight - plan.left_weight;
      if (data.orderWeight < undo) {
        return res.end(JSON.stringify({ok: false, response: '修改失败: 修改的订单量比已发量还少' + data.orderNo}));
      }

      plan.left_weight = data.orderWeight - undo;
      if (plan.left_weight === 0) {
        plan.status = 2;
      } else if (plan.left_weight === data.orderWeight) {
        plan.status = 0;
      } else {
        plan.status = 1;
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
        plan.status = 3;
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
    for (let i = 0; i < data.length; ++i) {
      let plan = await OrderPlan.findOne({order_no: data[i]}).exec();
      if (plan) {
        if (plan.left_weight == plan.order_weight) {
          plan.status = 0;
        } else if (plan.left_weight == 0) {
          plan.status = 2;
        } else {
          plan.status = 1;
        }
        await plan.save();
      }
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
    let st = 0;
    if (query.fStatus == '发运中') {
      st = 1;
    } else if (query.fStatus == '发运完') {
      st = 2;
    } else if (query.fStatus == '发运终结') {
      st = 3;
    }
    obj["$and"].push({ status: st });
  }

  let plans = await OrderPlan.find(obj).lean().sort({order_no: 1}).exec();
  if (plans.length > 0) {
    let w = 0, left = 0;
    plans.forEach(p => {
      w += p.order_weight;
      left += p.left_weight;
    });
    console.log(left)
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
