/**
 * Created by ezefjia on 5/15/2014.
 */

var mongoose = require('mongoose');

var vehicleSchema = new mongoose.Schema({
  name: { type: String, unique: true },
  contact_name: String,
  veh_type: String,     // 车, 船
  veh_category: String, // 自有,外挂
  phone: String,
  remark: String
});

module.exports = mongoose.model('Vehicle', vehicleSchema);