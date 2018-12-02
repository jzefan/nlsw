/**
 * Created by zefan on 2014/5/15.
 */

var mongoose = require('mongoose');

var companySchema = new mongoose.Schema({
  name: { type: String, unique: true },
  customers: [],
  address: String,
  phone: String,
  contact_name: String,
  remark: String
});

module.exports = mongoose.model('Company', companySchema);