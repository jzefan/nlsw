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
    default: 'free'
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
    companyName: String  // 显示在界面上的公司名称
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

// 索引
tenantSchema.index({ code: 1 });
tenantSchema.index({ status: 1 });
tenantSchema.index({ createDate: -1 });

module.exports = mongoose.model('Tenant', tenantSchema);
