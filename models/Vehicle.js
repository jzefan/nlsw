/**
 * Created by ezefjia on 5/15/2014.
 */

var mongoose = require('mongoose');

var vehicleSchema = new mongoose.Schema({
  // === SaaS 多租户字段 ===
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true
  },

  name: { type: String, required: true },
  contact_name: String,
  veh_type: String,     // 车, 船
  veh_category: String, // 自有,外挂
  affiliated: { type: Boolean, default: false }, // 是否挂靠到本单位
  boss: String, // 承运单位于承运人
  real_boss: [
    {
      waybill_no: String,
      rb: String
    }
  ],
  phone: String,
  remark: String,
  create_time: { type: Date, default: Date.now }
  // lastUsedDate: Date // 最近使用
});

// 租户内名称唯一
vehicleSchema.index({ tenantId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Vehicle', vehicleSchema);
