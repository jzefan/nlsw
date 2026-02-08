/**
 * Created by ezefjia on 7/15/2014.
 */
var mongoose = require('mongoose');

var destinationSchema = new mongoose.Schema({
  // === SaaS 多租户字段 ===
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true
  },

  name: { type: String, required: true },
  address: String,
  phone: String,
  contact_name: String,
  remark: String
});

// 租户内名称唯一
destinationSchema.index({ tenantId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Destination', destinationSchema);