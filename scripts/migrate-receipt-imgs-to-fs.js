/**
 * 回执图片迁移脚本
 *
 * 将 receiptimgs 集合中存储的二进制图片数据迁移到本地文件系统，
 * 并在 receiptimages 集合中创建对应的元数据记录。
 *
 * 用法：
 *   node scripts/migrate-receipt-imgs-to-fs.js --tenant DEFAULT
 *   node scripts/migrate-receipt-imgs-to-fs.js --tenant DEFAULT --dry-run
 *
 * 说明：
 *   - 按租户 code 过滤，只迁移指定租户的数据
 *   - 文件保存到 uploads/receipts/{tenantId}/{年}/{月}/{日}/ 目录
 *   - 幂等：已迁移的记录不会重复处理
 *   - 原始 receiptimgs 记录不会被删除（保留备份）
 */

require("dotenv").config();
const { MongoClient, ObjectId } = require("mongoose").mongo;
const path = require("path");
const fs = require("fs");

// ─── 配置 ────────────────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes("--dry-run");

// 解析 --tenant 参数
const tenantArgIdx = process.argv.indexOf("--tenant");
const TENANT_CODE = tenantArgIdx !== -1 ? process.argv[tenantArgIdx + 1] : null;

if (!TENANT_CODE) {
  console.error("错误：必须指定租户 code，例如：--tenant DEFAULT");
  process.exit(1);
}

// 文件存储根目录（与 multer 配置保持一致）
const UPLOADS_BASE = path.join(__dirname, "../uploads/receipts");

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

function buildMongoUri() {
  if (process.env.MONGODB) {
    return process.env.MONGODB;
  }
  const host = process.env.MONGO_HOST || "localhost";
  const port = process.env.MONGO_PORT || "27027";
  const database = process.env.MONGO_DATABASE || "nldb";
  const user = process.env.MONGO_USER;
  const password = process.env.MONGO_PASSWORD;
  const authSource = process.env.MONGO_AUTH_SOURCE || "admin";
  if (user && password) {
    return `mongodb://${user}:${password}@${host}:${port}/${database}?authSource=${authSource}`;
  }
  return `mongodb://${host}:${port}/${database}`;
}

function log(msg) {
  const prefix = DRY_RUN ? "[DRY-RUN] " : "";
  console.log(`${prefix}${msg}`);
}

function getExtension(contentType) {
  const map = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
  };
  return map[contentType] || ".jpg";
}

/**
 * 构造迁移记录的 original_filename。
 * 格式：migrated-{receiptImgId}{ext}
 * 用于幂等检查：如果 receiptimages 里已有此文件名的记录，说明已迁移过。
 */
function buildOriginalFilename(sourceId, ext) {
  return `migrated-${sourceId}${ext}`;
}

/**
 * 构造磁盘上的文件名（与 vessel_settle.js 控制器命名规范一致）。
 * 格式：{inv_no}_{时间戳}_{随机数}{ext}
 */
function buildDiskFilename(invNo, uploadTime, ext) {
  const timestamp = uploadTime
    .toISOString()
    .replace(/:/g, "-")
    .replace(/\..+/, "");
  const randomStr = Math.random().toString(36).substring(2, 8);
  return `${invNo}_${timestamp}_${randomStr}${ext}`;
}

// ─── 主流程 ───────────────────────────────────────────────────────────────────

async function migrate() {
  const uri = buildMongoUri();
  const dbName = process.env.MONGO_DATABASE || "nldb";

  log("=".repeat(60));
  log("回执图片迁移：receiptimgs (Binary) → 本地文件系统");
  log("=".repeat(60));
  if (DRY_RUN) {
    log("*** 预览模式 — 不会写入任何文件或数据库记录 ***");
  }
  log(`数据库:    ${dbName}`);
  log(`租户 code: ${TENANT_CODE}`);
  log(`存储目录:  ${UPLOADS_BASE}`);
  log("");

  const client = new MongoClient(uri);

  try {
    await client.connect();
    log("✓ 已连接到 MongoDB");

    const db = client.db(dbName);
    const tenantsCol = db.collection("tenants");
    const receiptImgsCol = db.collection("receiptimgs");
    const receiptImagesCol = db.collection("receiptimages");

    // ── Step 1: 查找租户 ───────────────────────────────────────────────────
    log("\n── Step 1: 查找租户 ──");

    const tenant = await tenantsCol.findOne({ code: TENANT_CODE.toUpperCase() });
    if (!tenant) {
      console.error(`✗ 未找到租户 code="${TENANT_CODE}"，请确认租户 code 正确`);
      process.exit(1);
    }
    log(`✓ 租户: ${tenant.name} (${tenant._id})`);

    const tenantId = tenant._id;

    // ── Step 2: 统计待迁移数量 ─────────────────────────────────────────────
    log("\n── Step 2: 统计待迁移数量 ──");

    const totalInSource = await receiptImgsCol.countDocuments({ tenantId });
    log(`receiptimgs 中属于该租户的记录总数: ${totalInSource}`);

    if (totalInSource === 0) {
      log("没有需要迁移的记录，退出。");
      return;
    }

    // ── Step 3: 逐条迁移 ──────────────────────────────────────────────────
    log("\n── Step 3: 开始迁移 ──");

    const stats = {
      total: totalInSource,
      migrated: 0,
      skipped: 0,
      failed: 0,
      failedIds: [],
    };

    const cursor = receiptImgsCol.find({ tenantId });

    for await (const doc of cursor) {
      const ext = getExtension(doc.contentType);
      const originalFilename = buildOriginalFilename(doc._id, ext);

      // 幂等检查：是否已在 receiptimages 里存在
      const existing = await receiptImagesCol.findOne({
        tenantId,
        original_filename: originalFilename,
      });

      if (existing) {
        stats.skipped++;
        continue;
      }

      // 没有图片数据则跳过
      if (!doc.data || doc.data.length === 0) {
        log(`  ⚠ 跳过 ${doc._id}（inv_no: ${doc.inv_no}）：无图片数据`);
        stats.skipped++;
        continue;
      }

      const uploadTime = doc.create_time || new Date();
      const year = uploadTime.getFullYear();
      const month = String(uploadTime.getMonth() + 1).padStart(2, "0");
      const day = String(uploadTime.getDate()).padStart(2, "0");

      const uploadDir = path.join(
        UPLOADS_BASE,
        `${tenantId}/${year}/${month}/${day}`
      );
      const diskFilename = buildDiskFilename(
        doc.inv_no || "unknown",
        uploadTime,
        ext
      );
      const filePath = path.join(uploadDir, diskFilename);

      if (DRY_RUN) {
        const dataLen = typeof doc.data.length === 'function' ? doc.data.length() : doc.data.length;
        log(
          `  [预览] ${doc._id} → ${path.relative(process.cwd(), filePath)} (${dataLen} 字节)`
        );
        stats.migrated++;
        continue;
      }

      try {
        // 创建目录
        fs.mkdirSync(uploadDir, { recursive: true });

        // 写入文件（MongoDB Binary 需要取 .buffer 转为 Buffer）
        const fileData = doc.data.buffer ? Buffer.from(doc.data.buffer) : doc.data;
        fs.writeFileSync(filePath, fileData);

        // 写入 receiptimages 元数据
        await receiptImagesCol.insertOne({
          tenantId,
          waybill_no: doc.inv_no,
          uploader: doc.creator || "migrated",
          upload_time: uploadTime,
          file_path: filePath,
          original_filename: originalFilename,
          file_size: typeof doc.data.length === 'function' ? doc.data.length() : doc.data.length,
          mime_type: doc.contentType || "image/jpeg",
        });

        stats.migrated++;

        // 每 50 条打印一次进度
        if ((stats.migrated + stats.skipped) % 50 === 0) {
          log(
            `  进度: ${stats.migrated + stats.skipped + stats.failed}/${stats.total}`
          );
        }
      } catch (err) {
        stats.failed++;
        stats.failedIds.push(String(doc._id));
        console.error(
          `  ✗ 迁移失败 ${doc._id}（inv_no: ${doc.inv_no}）: ${err.message}`
        );

        // 清理已写入的文件（如果写文件成功但 DB 插入失败）
        if (fs.existsSync(filePath)) {
          try {
            fs.unlinkSync(filePath);
          } catch (_) {
            // ignore cleanup error
          }
        }
      }
    }

    // ── Step 4: 汇总 ─────────────────────────────────────────────────────
    log("\n" + "=".repeat(60));
    log("迁移汇总");
    log("=".repeat(60));
    log(`  租户:       ${TENANT_CODE} (${tenantId})`);
    log(`  总记录数:   ${stats.total}`);
    log(`  已迁移:     ${stats.migrated}`);
    log(`  已跳过:     ${stats.skipped}（已迁移过或无图片数据）`);
    log(`  失败:       ${stats.failed}`);
    if (stats.failedIds.length > 0) {
      log(`  失败 ID:    ${stats.failedIds.join(", ")}`);
    }
    if (DRY_RUN) {
      log("\n  *** 预览模式 — 运行时去掉 --dry-run 参数以执行实际迁移 ***");
    } else {
      log(
        `\n  状态: ${stats.failed === 0 ? "✓ 全部成功" : "⚠ 部分失败，请查看上方错误信息"}`
      );
    }
    log("=".repeat(60));
  } catch (err) {
    console.error("\n✗ 脚本执行失败:", err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await client.close();
    log("\n✓ 已断开 MongoDB 连接");
  }
}

migrate();
