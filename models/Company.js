/**
 * Created by zefan on 2014/5/15.
 */

var mongoose = require('mongoose');

var companySchema = new mongoose.Schema({
  // === SaaS 多租户字段 ===
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true
  },

  name: { type: String, required: true },
  customers: [],
  address: String,
  phone: String,
  contact_name: String,
  remark: String,
  create_time: { type: Date, default: Date.now }
});

// 租户内名称唯一
companySchema.index({ tenantId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Company', companySchema);