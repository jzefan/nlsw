/**
 * 回执图片存储抽象层
 *
 * 支持两种存储后端：
 *   - local: 本地文件系统（默认，uploads/receipts/...）
 *   - minio: MinIO 对象存储
 *
 * 存储方式由租户设置 (Tenant.settings.receiptStorage) 决定。
 * 读取时根据 file_path 前缀自动判断（minio:// 前缀为 MinIO，其余为本地）。
 */

const fs = require('fs');
const secrets = require('../config/secrets');

let minioClient = null;

/**
 * 获取 MinIO 客户端（懒初始化）
 */
function getMinioClient() {
  if (!minioClient) {
    const Minio = require('minio');
    const cfg = secrets.minio;
    if (!cfg.accessKey || !cfg.secretKey) {
      throw new Error('MinIO 未配置：请在 .env 中设置 MINIO_ACCESS_KEY 和 MINIO_SECRET_KEY');
    }
    minioClient = new Minio.Client({
      endPoint: cfg.endpoint,
      port: cfg.port,
      useSSL: cfg.useSSL,
      accessKey: cfg.accessKey,
      secretKey: cfg.secretKey,
    });
  }
  return minioClient;
}

/**
 * 确保 MinIO bucket 存在
 */
async function ensureBucket() {
  const client = getMinioClient();
  const bucket = secrets.minio.bucket;
  const exists = await client.bucketExists(bucket);
  if (!exists) {
    await client.makeBucket(bucket);
  }
}

/**
 * 保存文件到存储后端
 *
 * @param {string} storageType - 'local' 或 'minio'
 * @param {string} tenantId - 租户 ID
 * @param {string} relativePath - 相对路径（如 2026/03/25/filename.jpg）
 * @param {string} localFilePath - multer 保存的本地临时文件路径
 * @returns {string} 最终存储路径（local 为绝对路径，minio 为 minio://objectName）
 */
async function saveFile(storageType, tenantId, relativePath, localFilePath) {
  if (storageType === 'minio') {
    await ensureBucket();
    const objectName = `${tenantId}/${relativePath}`;
    await getMinioClient().fPutObject(secrets.minio.bucket, objectName, localFilePath);
    // 删除本地临时文件
    if (fs.existsSync(localFilePath)) {
      fs.unlinkSync(localFilePath);
    }
    return `minio://${objectName}`;
  }
  // local 模式：文件已在正确位置
  return localFilePath;
}

/**
 * 从存储后端读取文件
 *
 * 根据 file_path 前缀自动判断存储类型（不依赖租户配置，兼容历史数据）
 *
 * @param {string} filePath - 存储路径
 * @returns {Buffer} 文件内容
 */
async function getFile(filePath) {
  if (filePath.startsWith('minio://')) {
    const objectName = filePath.substring(8);
    const stream = await getMinioClient().getObject(secrets.minio.bucket, objectName);
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
  // local 模式
  return fs.readFileSync(filePath);
}

/**
 * 从存储后端删除文件
 *
 * @param {string} filePath - 存储路径
 */
async function deleteFile(filePath) {
  if (filePath.startsWith('minio://')) {
    const objectName = filePath.substring(8);
    await getMinioClient().removeObject(secrets.minio.bucket, objectName);
  } else if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

module.exports = { saveFile, getFile, deleteFile };
