let mongoose = require('mongoose');
let Schema = mongoose.Schema;

let receiptImgSchema = new Schema(
{
  inv_no: String,
  status: { type: Number, default: 0 }, // 状态，未确定，只上传(0)，已确定(1)
  data: Buffer,    // 图片内容
  contentType: String,
  create_time: { type: Date, default: Date.now },  // 创建时间
  creator: String  // 上传人
});


receiptImgSchema.index({ invoice_no: 1 });

module.exports = mongoose.model('ReceiptImg', receiptImgSchema);