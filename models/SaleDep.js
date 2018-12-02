/**
 * Created by ezefjia on 10/27/2014.
 */
var mongoose = require('mongoose');

var saleDepSchema = new mongoose.Schema({
  name: { type: String, unique: true }
});

module.exports = mongoose.model('SaleDep', saleDepSchema);