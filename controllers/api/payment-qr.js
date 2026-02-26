const multer = require('multer');
const path = require('path');
const fs = require('fs');

const QR_DIR = path.join(__dirname, '../../uploads/platform');
const QR_BASENAME = 'payment-qr';

// Multer storage for single QR image
const storage = multer.diskStorage({
  destination(req, file, cb) {
    if (!fs.existsSync(QR_DIR)) {
      fs.mkdirSync(QR_DIR, { recursive: true });
    }
    cb(null, QR_DIR);
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${QR_BASENAME}${ext}`);
  },
});

const upload = multer({
  storage,
  fileFilter(req, file, cb) {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('只支持图片格式文件（JPEG, PNG, GIF, WebP）'), false);
    }
  },
  limits: { fileSize: 2 * 1024 * 1024 },
}).single('qrImage');

/**
 * Find the current QR file (any extension)
 */
function findQRFile() {
  if (!fs.existsSync(QR_DIR)) return null;
  const files = fs.readdirSync(QR_DIR);
  const qrFile = files.find(f => f.startsWith(QR_BASENAME + '.'));
  return qrFile ? path.join(QR_DIR, qrFile) : null;
}

/**
 * POST /platform/payment-qr
 * Upload payment QR (platform admin only)
 */
exports.uploadQR = (req, res) => {
  upload(req, res, (err) => {
    if (err) {
      const msg = err instanceof multer.MulterError
        ? (err.code === 'LIMIT_FILE_SIZE' ? '文件大小不能超过2MB' : '上传失败')
        : err.message;
      return res.status(400).json({ ok: false, msg });
    }
    if (!req.file) {
      return res.status(400).json({ ok: false, msg: '请选择要上传的图片' });
    }

    // Clean up any old QR files with different extensions after successful upload
    try {
      const files = fs.readdirSync(QR_DIR);
      for (const f of files) {
        const fullPath = path.join(QR_DIR, f);
        if (f.startsWith(QR_BASENAME + '.') && fullPath !== req.file.path) {
          fs.unlinkSync(fullPath);
        }
      }
    } catch (_) { /* ignore cleanup errors */ }

    res.json({ ok: true });
  });
};

/**
 * GET /payment-qr
 * Serve QR image (any authenticated user)
 */
exports.getQR = (req, res) => {
  const filePath = findQRFile();
  if (!filePath) {
    return res.status(404).json({ ok: false, msg: '未设置收款二维码' });
  }
  res.sendFile(filePath);
};

/**
 * GET /payment-qr/check
 * Check if QR exists
 */
exports.checkQR = (req, res) => {
  const exists = !!findQRFile();
  res.json({ ok: true, exists });
};
