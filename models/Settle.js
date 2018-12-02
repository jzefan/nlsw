/**
 * Created by zefan on 2014/11/16.
 */

var mongoose = require('mongoose');
var Schema = mongoose.Schema,
  ObjectId = Schema.ObjectId;

var settleSchema = new Schema({
  serial_number: String,
  billing_name: String,   // 开单名称
  price: Number,           // 结算价格
  settle_type: String,    // 结算类型: 客户结算, 代收代付结算, 车船结算
  ship_number: Number,
  ship_weight: Number,
  ship_to: String,

  bills: [
    {
      bill_id: Schema.Types.ObjectId,
      num: Number,         // 数量
      weight: Number,      // 重量
      inv_no: String,
      settle_flag: Number
      // 最好再加个目的地
    }
  ],

  settle_date: Date,
  ticket_date: Date,
  return_money_date: Date,
  settler: String,
  ticket_person: String,
  return_person: String,

  ticket_no: String,

  status: String, // 已结算, 已开票, 已回款
  remark: String, // 备注
  real_price: Number // 实收价格
});

module.exports = mongoose.model('Settle', settleSchema);