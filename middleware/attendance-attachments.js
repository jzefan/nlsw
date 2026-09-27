const multer = require('multer');

const allowedMimeTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 5, fields: 20 },
  fileFilter(_req, file, callback) {
    if (!allowedMimeTypes.has(file.mimetype)) return callback(new Error('附件仅支持图片、PDF、Word 或 Excel 文件'));
    callback(null, true);
  },
}).array('attachments', 5);

function parseAttendanceAttachments(req, res, next) {
  upload(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError) {
      const message = error.code === 'LIMIT_FILE_SIZE'
        ? '单个附件不能超过 10MB'
        : error.code === 'LIMIT_FILE_COUNT'
          ? '最多上传 5 个附件'
          : error.code === 'LIMIT_UNEXPECTED_FILE'
            ? '附件数量或字段无效'
            : '附件上传失败';
      return res.status(400).json({ ok: false, error: message });
    }
    return res.status(400).json({ ok: false, error: error.message || '附件上传失败' });
  });
}

module.exports = { parseAttendanceAttachments };
