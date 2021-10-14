"use strict";

let Vehicle = require('../models/Vehicle');
let Company = require('../models/Company');
let Destination = require('../models/Destination');
let Brand = require('../models/Brand');
let SaleDep = require('../models/SaleDep');
let Bill = require('../models/Bill');
let OrderPlan = require('../models/OrderPlan');
let bunyan = require('bunyan');
let logger = bunyan.createLogger({
  name: 'XHT',
  streams: [ { level: 'info', stream: process.stdout }, { level: 'error', path: 'app.log' }]
});

exports.getDataCfg = async function () {
  const dataCfg = {};

  try {
    dataCfg["billing_name"] = await Bill.distinct('billing_name', {left_num: { $gt: 0 }}).lean().exec();
    dataCfg["company"] = await Company.find({}).lean().sort({name: 'asc'}).exec();
    dataCfg["brand"] = await Brand.find({}).lean().sort({name: 'asc'}).exec();
    dataCfg["sale_dep"] = await SaleDep.find({}).lean().sort({name: 'asc'}).exec();
    dataCfg["vechile"] = await Vehicle.find({}).lean().exec();
    dataCfg["destination"] = await Destination.distinct('name').lean().exec();
    dataCfg["plan_cu_name"] = await OrderPlan.distinct('customer_name').exec();

    logger.info("Load data end.");

  } catch (e) {
    logger.info("Load data dict error: %s", e.toString())
  }

  return dataCfg;
};