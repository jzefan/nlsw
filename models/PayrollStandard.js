const mongoose = require('mongoose');

/** 金额一律按分存整数；比例按百分比存（0~100，最多两位小数），金额 = 基数 × 比例 ÷ 100 四舍五入到分。 */
const moneyField = { type: Number, default: 0, min: 0 };
const rateField = { type: Number, default: 0, min: 0, max: 100 };

const employeeSnapshotSchema = new mongoose.Schema({
  employeeNo: { type: String, default: '' },
  phone: { type: String, default: '' },
  name: { type: String, default: '' },
  department: { type: String, default: '' },
}, { _id: false });

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  employee: { type: employeeSnapshotSchema, required: true },

  // 很少变动、直接取用的固定工资项
  basicPayCents: moneyField,
  positionPayCents: moneyField,
  seniorityPayCents: moneyField,
  attendanceBonusCents: moneyField,

  // 社保：公司承担、个人承担各自的缴费基数与比例
  companySocialInsuranceBaseCents: moneyField,
  companySocialInsuranceRatePercent: rateField,
  personalSocialInsuranceBaseCents: moneyField,
  personalSocialInsuranceRatePercent: rateField,

  // 公积金：公司缴、个人缴各自的基数与比例
  companyHousingFundBaseCents: moneyField,
  companyHousingFundRatePercent: rateField,
  personalHousingFundBaseCents: moneyField,
  personalHousingFundRatePercent: rateField,

  version: { type: Number, default: 0 },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { optimisticConcurrency: true });

schema.index({ tenantId: 1, employeeId: 1 }, { unique: true });
schema.index({ tenantId: 1, 'employee.department': 1, 'employee.employeeNo': 1 });

module.exports = mongoose.model('PayrollStandard', schema);
