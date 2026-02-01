/**
 * Multer 文件上传配置
 */

const multer = require('multer');
const path = require('path');
const fs = require('fs');

// 创建存储配置
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // 按年/月/日创建目录
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');

    const uploadDir = path.join(__dirname, '../uploads/receipts', `${year}/${month}/${day}`);

    // 确保目录存在
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // 临时文件名格式：时间戳_随机数.扩展名
    // 运单号稍后在控制器中添加（因为此时 req.body.inv_no 还未解析）
    const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
    const randomStr = Math.random().toString(36).substring(2, 8);
    const ext = path.extname(file.originalname);
    const filename = `temp_${timestamp}_${randomStr}${ext}`;

    cb(null, filename);
  }
});

// 文件过滤器
const fileFilter = function (req, file, cb) {
  // 只允许图片格式
  const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('只支持图片格式文件（JPEG, PNG, GIF, WebP）'), false);
  }
};

// 创建 multer 实例 - 支持多文件上传（最多9张）
const uploadReceiptImages = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 9 // 最多9个文件
  }
}).array('images', 9); // 字段名为 'images'，最多9个文件

module.exports = {
  uploadReceiptImages
};
