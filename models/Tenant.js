var mongoose = require('mongoose');

var tenantSchema = new mongoose.Schema({
  // 基础信息
  code: {
    type: String,
    unique: true,
    required: true,
    uppercase: true,
    trim: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  fullName: {
    type: String,
    trim: true
  },

  // 联系信息
  contact: {
    name: String,
    phone: String,
    email: String,
    address: String
  },

  // 订阅计划
  plan: {
    type: String,
    enum: ['free', 'basic', 'pro', 'enterprise'],
    default: 'basic'
  },
  maxUsers: {
    type: Number,
    default: 5
  },

  // 状态
  status: {
    type: String,
    enum: ['active', 'suspended', 'deleted'],
    default: 'active'
  },

  // 配置
  settings: {
    logo: String,
    theme: String,
    companyName: String,  // 显示在界面上的公司名称
    attendanceEnabled: { type: Boolean, default: false }, // 考勤模块开关
    attendanceCalendarOverrides: { type: mongoose.Schema.Types.Mixed, default: {} }, // YYYY-MM-DD: holiday | workday
    attendanceCalendarYears: { type: [Number], default: [] }, // 管理员已确认日历的年份
    attendanceSaturdayMorningWorkday: { type: Boolean, default: false }, // 每周六上午按工作日计（法定节假日与调休上班日除外）
    attendanceGeneralManagerDelegateId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // 总经理本人长假代理审批人
    // 五险一金费率方案（全公司统一）：五险 + 公积金。这里只声明字段、不写默认值，
    // 默认值与补全逻辑统一在 utils/payroll-calculations.js 的
    // DEFAULT_CONTRIBUTION_SCHEME / normalizeContributionScheme，避免两处默认值漂移；
    // 未保存过的租户由读取路径兜底成默认口径。
    payrollContributionScheme: {
      pensionEmployerPercent: Number,
      pensionEmployeePercent: Number,
      medicalEmployerPercent: Number,
      medicalEmployeePercent: Number,
      medicalEmployeeFlatCents: Number,
      unemploymentEmployerPercent: Number,
      unemploymentEmployeePercent: Number,
      injuryEmployerPercent: Number,
      maternityEmployerPercent: Number,
      housingFundEmployerPercent: Number,
      housingFundEmployeePercent: Number,
    },
    sealEnabled: { type: Boolean, default: false }, // 用章模块开关
    sealCustodianId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // 专职印章保管员（首位兼容）
    sealCustodianIds: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], default: [] }, // 专职印章保管员（多选）
    sealOverdueRemindMinutes: { type: Number, default: 120 }, // 逾期催办主管阈值（分钟）
    sealOverdueEscalateMinutes: { type: Number, default: 1440 }, // 逾期升级总经理阈值（分钟）
    requireReceiptForSettle: { type: Boolean, default: false },  // 结算前是否必须有回执
    drayageRate: { type: Number, default: 0 },  // 车运到船应收单价（元/吨），0=使用原有计算逻辑
    ownVehicleDeductPayable: { type: Boolean, default: true },  // 自有车利润是否减去应付金额，true=减去（默认），false=不减
    receiptStorage: { type: String, enum: ['local', 'minio'], default: 'local' },  // 回执图片存储方式
    billImportCarrierRule: {
      type: String,
      enum: ['contains_company_name', 'unrestricted'],
      default: 'contains_company_name'
    }  // 提单导入时承运单位校验规则
  },

  // 时间
  createDate: {
    type: Date,
    default: Date.now
  },
  expireDate: Date,

  // 创建者
  creator: String
});

// 索引 (code index already created by unique: true)
tenantSchema.index({ status: 1 });
tenantSchema.index({ createDate: -1 });

module.exports = mongoose.model('Tenant', tenantSchema);
