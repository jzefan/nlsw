/**
 * Created by zefan on 2014/5/15.
 */

var mongoose = require('mongoose');

var warehouseSchema = new mongoose.Schema({
  // === SaaS 多租户字段 ===
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true
  },

  name: { type: String, required: true },
  address: String,
  contact_name: String,
  phone: String,
  remark: String
});

// 租户内名称唯一
warehouseSchema.index({ tenantId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Warehouse', warehouseSchema);