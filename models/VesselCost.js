/**
 * Created by ezefjia on 2015/5/9.
 */

var mongoose = require('mongoose');

var vesselCostSchema = new mongoose.Schema({
  name: String, // 车名或 'chuan'
  ic: Number,   // 保险费用 insurance cost
  hc: Number,   // 吊装 hoisting cost
  pcc: Number,  // 港口建设费 port construction cost
  aux: Number,  // 辅料 auxiliary
  fittings: Number,       // 配件
  repair: Number,         // 修理费
  annual_survey: Number,  // 年检二维费用
  salary: Number,         // 驾驶员工资
  oil: Number,            // 油费
  toll: Number,           // 过路费
  fine: Number,           // 罚款
  other: Number,
  total: Number,
  month: String,
  vv_type: String
});

module.exports = mongoose.model('VesselCost', vesselCostSchema);