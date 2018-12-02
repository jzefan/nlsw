/**
 * Created by zefan on 2014/5/15.
 */

var mongoose = require('mongoose');

var warehouseSchema = new mongoose.Schema({
  name: { type: String, unique: true },
  address: String,
  contact_name: String,
  phone: String,
  remark: String
});

module.exports = mongoose.model('Warehouse', warehouseSchema);