/**
 * Created by ezefjia on 2015/7/6.
 */


var mongoose = require('mongoose');

var drayageForkliftSchema = new mongoose.Schema({
  // === SaaS 多租户字段 ===
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true
  },

  month: { type: String, required: true },
  drayage: Number,
  forklift: Number
});

// 租户内月份唯一
drayageForkliftSchema.index({ tenantId: 1, month: 1 }, { unique: true });

module.exports = mongoose.model('DrayageForklift', drayageForkliftSchema);
