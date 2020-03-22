let mongoose = require('mongoose');
let Schema = mongoose.Schema;

let orderPlanSchema = new Schema(
{
  order_no: String,
  order_weight: Number,     // 订单量
  left_weight: Number,      // 未发量
  destination: String,      // 发运目的地
  consignee: String,        // 收货人
  consignee_phone: String,  // 收货人号码
  customer_code: String,    // 客户代码
  customer_name: String,    // 客户名称
  ds_client: String,        // 下游客户
  transport_mode: String,   // 运输方式
  customer_saleman: String, // 客户业务员
  consigner: String,        // 发货人
  status: { type: Number, default: 0 }, // 状态，未发运(0)，发运中(1)，发运完(2)，发运终结(3)
  contract_no: String,      // 合同号
  receiving_charge: Number, // 接单价
  entry_time: Date,         // 录单时间
  create_time: { type: Date, default: Date.now },  // 创建时间
  creator: String  // 创建人
});


orderPlanSchema.index({ order: 1 });
orderPlanSchema.index({ status: 1 });
orderPlanSchema.index({ order:1, status: 1 });
orderPlanSchema.index({ create_time: 1 });
orderPlanSchema.index({ entry_time: 1 });

module.exports = mongoose.model('OrderPlan', orderPlanSchema);