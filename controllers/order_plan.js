/**
 * date: 2020/03/17
 * author: jzefan
 */
"use strict";

var OrderPlan = require('../models/OrderPlan');
//var Bill = require('../models/Bill');
//var utils = require('./utils');

var bunyan = require('bunyan');
var logger = bunyan.createLogger({
  name: 'XHT',
  streams: [ { level: 'info', stream: process.stdout }, { level: 'error', path: 'app.log' } ]
});


exports.createOrderPlan = function (req, res) {
  if (req.user.privilege[0] === '0' && req.user.privilege[1] === '0') {
    res.status.render(404);
  }
  else {
    res.render('order/create_plan', {
      title: '订单计划管理',
      curr_page: '新建订单计划',
      curr_page_name: '新建',
      bShowDataTable: true,
      dDataDict: data,
      scripts: [
        '/js/plugins/select2/select2.min.js',
        '/js/plugins/select2/select2_locale_zh-CN.js',
        '/js/plugins/datatables/jquery.dataTables.min.js',
        '/js/bill_import_create.js'
      ]
    });
  }
};