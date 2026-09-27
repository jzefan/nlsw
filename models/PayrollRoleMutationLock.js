const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  token: String,
  acquiredAt: Date,
  ownerPid: Number,
  ownerHost: String
});
schema.index({ tenantId: 1 }, { unique: true });
module.exports = mongoose.model('PayrollRoleMutationLock', schema);
