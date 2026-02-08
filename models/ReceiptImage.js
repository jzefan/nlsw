/**
 * 回执图片模型
 * 用于存储运单回执图片的元数据
 */

const mongoose = require('mongoose');

const receiptImageSchema = new mongoose.Schema({
  // === SaaS 多租户字段 ===
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true
  },

  // 运单号
  waybill_no: {
    type: String,
    required: true,
    index: true,
  },
  // 上传人
  uploader: {
    type: String,
    required: true,
  },
  // 上传时间
  upload_time: {
    type: Date,
    default: Date.now,
    required: true,
  },
  // 本地文件路径
  file_path: {
    type: String,
    required: true,
  },
  // 原始文件名
  original_filename: {
    type: String,
    required: true,
  },
  // 文件大小（字节）
  file_size: {
    type: Number,
    required: true,
  },
  // 文件MIME类型
  mime_type: {
    type: String,
    required: true,
  },
});

// 创建复合索引，便于查询某个租户的运单图片
receiptImageSchema.index({ tenantId: 1, waybill_no: 1, upload_time: -1 });

module.exports = mongoose.model('ReceiptImage', receiptImageSchema);
