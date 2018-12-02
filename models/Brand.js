/**
 * Created by ezefjia on 8/14/2014.
 */

var mongoose = require('mongoose');

var brandSchema = new mongoose.Schema({
  name: { type: String, unique: true }
});

module.exports = mongoose.model('Brand', brandSchema);