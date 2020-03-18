"use strict";

let Vehicle = require('../models/Vehicle');
let Company = require('../models/Company');
let Destination = require('../models/Destination');
let Brand = require('../models/Brand');
let SaleDep = require('../models/SaleDep');
let Bill = require('../models/Bill');
let bunyan = require('bunyan');
let logger = bunyan.createLogger({
  name: 'XHT',
  streams: [ { level: 'info', stream: process.stdout }, { level: 'error', path: 'app.log' }]
});

let test = require('./test');
const dataCfg = test.getDataCfg();

/*
const dataCfg = async function () {
  const dataCfg = {};

  try {
    dataCfg["billing_name"] = await Bill.distinct('billing_name', {left_num: { $gt: 0 }}).lean().exec();
    dataCfg["com_name"] = await Company.find({name: { $in: names }}).lean().exec();
    dataCfg["brand"] = await Brand.find({}).lean().sort({name: 'asc'}).exec();
    dataCfg["sale_dep"] = await SaleDep.find({}).lean().sort({name: 'asc'}).exec();
    dataCfg["vechile"] = await Vehicle.find({}).lean().exec();
    dataCfg["dest"] = await Destination.distinct('name').lean().exec();

    logger.info("Load data end.");
    console.log("success");

  } catch (e) {
    logger.info("Load data dict error: %s", e.toString())
  }

  return dataCfg;
};
*/

exports = module.exports = dataCfg;
exports.dataCfg = dataCfg;