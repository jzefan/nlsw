/**
 * Created by ezefjia on 7/15/2014.
 */
var mongoose = require('mongoose');

var destinationSchema = new mongoose.Schema({
  name: { type: String, unique: true },
  address: String,
  phone: String,
  contact_name: String,
  remark: String
});

module.exports = mongoose.model('Destination', destinationSchema);