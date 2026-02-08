/**
 * Created by ezefjia on 8/14/2014.
 */

var mongoose = require('mongoose');

var brandSchema = new mongoose.Schema({
  // === SaaS 多租户字段 ===
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true
  },

  name: { type: String, required: true }
});

// 租户内名称唯一
brandSchema.index({ tenantId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Brand', brandSchema);