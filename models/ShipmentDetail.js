var mongoose = require('mongoose');

var shipmentDetailSchema = new mongoose.Schema({
  // === SaaS 多租户字段 ===
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true
  },

  // 批次标识（同一次保存的数据共享一个 batchId）
  batchId: { type: String, required: true },

  // 产品类型：圆钢 or 板材
  productType: {
    type: String,
    enum: ['round-steel', 'plate'],
    required: true
  },

  // 明细数据
  bundleNo: String,        // 捆号/块号
  orderNo: String,         // 订单编号
  orderItemNo: String,     // 订单项次
  quantity: Number,         // 支数/块数
  weight: Number,           // 重量
  thickness: Number,        // 厚度(直径)
  width: Number,            // 宽度
  length: Number,           // 长度
  brandNo: String,          // 牌号
  fixedLength: Number,      // 定尺
  customerName: String,     // 客户名称
  loadingListNo: String,    // 装车单号
  vehicleNo: String,        // 车船号
  contractNo: String,       // 合同号

  // 审计
  createdBy: String,
  createdAt: { type: Date, default: Date.now }
});

// 索引
shipmentDetailSchema.index({ tenantId: 1, batchId: 1 });
shipmentDetailSchema.index({ tenantId: 1, loadingListNo: 1 });
shipmentDetailSchema.index({ tenantId: 1, createdAt: -1 });

module.exports = mongoose.model('ShipmentDetail', shipmentDetailSchema);
