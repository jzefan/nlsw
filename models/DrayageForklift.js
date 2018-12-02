/**
 * Created by ezefjia on 2015/7/6.
 */


var mongoose = require('mongoose');

var drayageForkliftSchema = new mongoose.Schema({
  month: { type: String, unique: true },
  drayage: Number,
  forklift: Number
});

module.exports = mongoose.model('DrayageForklift', drayageForkliftSchema);
