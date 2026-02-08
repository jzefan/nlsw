let mongoose = require('mongoose');
let Schema = mongoose.Schema;

let receiptImgSchema = new Schema(
{
  // === SaaS 多租户字段 ===
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true
  },

  inv_no: String,
  status: { type: Number, default: 0 }, // 状态，未确定，只上传(0)，已确定(1)
  data: Buffer,    // 图片内容
  contentType: String,
  create_time: { type: Date, default: Date.now },  // 创建时间
  creator: String  // 上传人
});


// 租户内按发票号查询
receiptImgSchema.index({ tenantId: 1, inv_no: 1 });

module.exports = mongoose.model('ReceiptImg', receiptImgSchema);