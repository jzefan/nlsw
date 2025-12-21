/**
 * Created by ezefjia on 5/15/2014.
 */

var mongoose = require('mongoose');

var vehicleSchema = new mongoose.Schema({
  name: { type: String, unique: true },
  contact_name: String,
  veh_type: String,     // 车, 船
  veh_category: String, // 自有,外挂
  boss: String, // 承运单位于承运人
  real_boss: [
    {
      waybill_no: String,
      rb: String
    }
  ],
  phone: String,
  remark: String
  // lastUsedDate: Date // 最近使用
});

module.exports = mongoose.model('Vehicle', vehicleSchema);