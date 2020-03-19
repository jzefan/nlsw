/**
 * date: 2020/03/17
 * author: jzefan
 */
"use strict";

const OrderPlan = require('../models/OrderPlan');
const dataCfg = require('./cache');
//var Bill = require('../models/Bill');
//var utils = require('./utils');

var bunyan = require('bunyan');
var logger = bunyan.createLogger({
  name: 'XHT',
  streams: [ { level: 'info', stream: process.stdout }, { level: 'error', path: 'app.log' } ]
});


exports.createOrderPlan = async function (req, res) {
  if (req.user.privilege[0] === '0' && req.user.privilege[1] === '0') {
    res.status.render(404);
  }
  else {
    let cacheCfg = await dataCfg;
    let company = cacheCfg['company'];
    let destination = await cacheCfg['destination'];
    let customer_name = [];
    for (let com in company) {
      customer_name.push(com.name);
    }

    res.render('order/create_plan', {
      title: '订单计划管理',
      curr_page: '新建订单计划',
      curr_page_name: '新建',
      bShowDataTable: true,
      dDataDict: {
        customer_name,
        destination
      },
      scripts: [
        '/js/plugins/select2/select2.min.js',
        '/js/plugins/select2/select2_locale_zh-CN.js',
        '/js/plugins/datatables/jquery.dataTables.min.js',
        '/js/create_order_plan.js'
      ]
    });
  }
};