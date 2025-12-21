let mongoose = require('mongoose');
let Schema = mongoose.Schema;

let archivedReceiptImgSchema = new Schema(
  {
    inv_no: String,
    status: { type: Number, default: 0 }, // 状态，未确定，只上传(0)，已确定(1)
    data: Buffer,    // 图片内容
    contentType: String,
    create_time: { type: Date, default: Date.now },  // 创建时间
    creator: String  // 上传人
  });


archivedReceiptImgSchema.index({ invoice_no: 1 });
archivedReceiptImgSchema.index({ create_time: 1 });

module.exports = mongoose.model('ArchivedReceiptImg', archivedReceiptImgSchema);