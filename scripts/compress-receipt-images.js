/**
 * 批量压缩回单图片。
 *
 * 背景：线上 `uploads/receipts` 累积到 29G / 9609 个文件，平均 3.0MB
 * （9559 个落在 1–5MB），全是未压缩的手机照片，把根盘挤到 99%。
 * 回单是业务凭证，压到「长边 1600 + 质量 82」仍能看清运单号与签收笔迹。
 *
 * ⚠️ **必须保持文件名与扩展名完全不变** —— `receiptimages.file_path` 存的是
 *    含扩展名的绝对路径，改名或换格式会让线上图片全部 404。
 *    所以本脚本只做「同格式重编码」，不转格式、不改名。
 *
 * ⚠️ **默认 DRY-RUN**：只抽样压缩算比例、外推总量，一个字节都不写。
 *    带 `--apply` 才真正写盘。
 *
 * 两种写法（推荐第一种）：
 *
 *   1) 另存到新目录（原图不动，可直接支撑「压缩 + 搬迁」一步做，最安全）
 *      node scripts/compress-receipt-images.js \
 *        --dir uploads/receipts \
 *        --out-dir /mnt/data/nlsw2-uploads/receipts --apply
 *      → 原目录完整保留，校验无误后再 mv 原名 + 建软链；不满意就删掉 out-dir 重来。
 *
 *   2) 原地压缩（写盘前先把原图备份出去）
 *      node scripts/compress-receipt-images.js --apply --backup-dir /mnt/data/receipts-orig
 *
 * 其它用法：
 *   node scripts/compress-receipt-images.js                     # 抽样 300 张试算
 *   node scripts/compress-receipt-images.js --all-samples       # 全量试算（慢，最准）
 *   node scripts/compress-receipt-images.js --dir uploads/receipts --quality 78 --max-dim 1400
 *
 * 依赖：sharp（`npm i sharp --no-save` 或 `pnpm add -D sharp`）
 */

require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const REENCODABLE_FORMATS = new Set(['jpeg', 'png', 'webp']);

// 压完如果没省下这么多，就当没压（不为了 0.5% 的收益去损失画质）
const MIN_GAIN_RATIO = 0.05;

const DEFAULTS = {
  quality: 82,
  maxDim: 1600,
  minSizeKb: 300,
  sampleSize: 300,
  concurrency: 3,
};

function getArgValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? (process.argv[index + 1] || '') : '';
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function toPositiveInt(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function loadSharp() {
  try {
    return require('sharp');
  } catch (error) {
    console.error('缺少依赖 sharp，无法压缩图片。安装方式（任选其一）：');
    console.error('  npm i sharp --no-save');
    console.error('  pnpm add -D sharp');
    console.error('');
    console.error('原始错误: ' + (error && error.message ? error.message : error));
    process.exit(1);
  }
}

/** 递归收集所有图片文件（只按扩展名判断，不解码） */
function walkImages(root) {
  const out = [];
  const stack = [root];

  while (stack.length > 0) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (error) {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile() && IMAGE_EXTS.has(path.extname(entry.name).toLowerCase())) {
        out.push(full);
      }
    }
  }

  return out.sort();
}

/** 判定某个文件是否值得压 */
function shouldSkip(fileSize, minSizeBytes) {
  return fileSize < minSizeBytes;
}

/** 均匀抽 n 个下标（跨整个列表取样，避免只看到同一批目录） */
function pickSampleIndexes(total, n) {
  if (n >= total) return Array.from({ length: total }, (_, i) => i);
  const step = total / n;
  const picked = [];
  for (let i = 0; i < n; i += 1) {
    picked.push(Math.min(total - 1, Math.floor(i * step)));
  }
  return Array.from(new Set(picked));
}

function encodeFormatFor(sharpFormat) {
  if (sharpFormat === 'jpeg') return 'jpeg';
  if (sharpFormat === 'png') return 'png';
  if (sharpFormat === 'webp') return 'webp';
  return null;
}

/** 构造压缩管线：按 EXIF 摆正 → 长边限制 → 同格式重编码 */
function buildPipeline(sharp, input, options, targetFormat) {
  let pipeline = sharp(input, { failOn: 'none' }).rotate();
  pipeline = pipeline.resize({
    width: options.maxDim,
    height: options.maxDim,
    fit: 'inside',
    withoutEnlargement: true,
  });

  if (targetFormat === 'jpeg') {
    return pipeline.jpeg({ quality: options.quality, mozjpeg: true });
  }
  if (targetFormat === 'png') {
    return pipeline.png({ compressionLevel: 9, palette: true, quality: options.quality });
  }
  return pipeline.webp({ quality: options.quality });
}

/** 压缩单个文件到 Buffer；返回统计信息 */
async function compressToBuffer(sharp, file, options) {
  const size = fs.statSync(file).size;
  if (shouldSkip(size, options.minSizeBytes)) {
    return { status: 'skipped', reason: '小于阈值', size, newSize: size };
  }

  const meta = await sharp(file, { failOn: 'none' }).metadata();
  const targetFormat = encodeFormatFor(meta.format);
  if (!targetFormat) {
    return { status: 'skipped', reason: '格式 ' + meta.format, size, newSize: size };
  }

  const buffer = await buildPipeline(sharp, file, options, targetFormat).toBuffer();

  const gain = size > 0 ? 1 - buffer.length / size : 0;
  if (gain < MIN_GAIN_RATIO) {
    return {
      status: 'skipped',
      reason: '收益不足 ' + (gain * 100).toFixed(1) + '%',
      size,
      newSize: size,
      format: targetFormat,
    };
  }

  return {
    status: 'compressed',
    size,
    newSize: buffer.length,
    format: targetFormat,
    width: meta.width,
    height: meta.height,
    buffer,
  };
}

function human(bytes) {
  if (bytes >= 1024 ** 3) return (bytes / 1024 ** 3).toFixed(2) + ' GB';
  if (bytes >= 1024 ** 2) return (bytes / 1024 ** 2).toFixed(1) + ' MB';
  if (bytes >= 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return bytes + ' B';
}

async function mapWithConcurrency(items, limit, worker) {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index], index);
    }
  });
  await Promise.all(runners);
}

function printUsage() {
  console.log('用法:');
  console.log('  node scripts/compress-receipt-images.js [选项]');
  console.log('');
  console.log('选项:');
  console.log('  --dir <path>         要处理的根目录（默认 <project>/uploads/receipts）');
  console.log('  --out-dir <path>     压缩结果另存到该目录（原图不动，推荐）');
  console.log('  --backup-dir <path>  原地压缩前把原图备份到该目录');
  console.log('  --no-backup          原地压缩但不备份（危险，不可回滚）');
  console.log('  --quality <n>        JPEG/WebP 质量，默认 ' + DEFAULTS.quality);
  console.log('  --max-dim <px>       长边上限，默认 ' + DEFAULTS.maxDim);
  console.log('  --min-size <kb>      小于该体积跳过，默认 ' + DEFAULTS.minSizeKb + 'KB');
  console.log('  --limit <n>          DRY-RUN 抽样张数，默认 ' + DEFAULTS.sampleSize);
  console.log('  --all-samples        DRY-RUN 全量试算（慢，但最准）');
  console.log('  --concurrency <n>    并发数，默认 ' + DEFAULTS.concurrency);
  console.log('  --apply              真正写盘；默认只试算');
}

async function main() {
  if (hasFlag('--help') || hasFlag('-h')) {
    printUsage();
    return;
  }

  const sharp = loadSharp();

  const rootDir = path.resolve(getArgValue('--dir') || path.join(__dirname, '../uploads/receipts'));
  const outDirArg = getArgValue('--out-dir');
  const outDir = outDirArg ? path.resolve(outDirArg) : '';
  const backupDirArg = getArgValue('--backup-dir');
  const backupDir = backupDirArg ? path.resolve(backupDirArg) : '';
  const noBackup = hasFlag('--no-backup');
  const apply = hasFlag('--apply');

  const options = {
    quality: toPositiveInt(getArgValue('--quality'), DEFAULTS.quality),
    maxDim: toPositiveInt(getArgValue('--max-dim'), DEFAULTS.maxDim),
    minSizeKb: toPositiveInt(getArgValue('--min-size'), DEFAULTS.minSizeKb),
    concurrency: toPositiveInt(getArgValue('--concurrency'), DEFAULTS.concurrency),
  };
  options.minSizeBytes = options.minSizeKb * 1024;

  if (!fs.existsSync(rootDir)) {
    throw new Error('目录不存在: ' + rootDir);
  }
  if (outDir && outDir.startsWith(rootDir + path.sep)) {
    throw new Error('--out-dir 不能位于 --dir 内部，否则会递归扫到自己的输出');
  }
  if (outDir && backupDir) {
    throw new Error('--out-dir 与 --backup-dir 只能二选一');
  }
  if (!apply && backupDir) {
    throw new Error('--backup-dir 只在 --apply 时有意义');
  }
  if (apply && !outDir && !backupDir && !noBackup) {
    throw new Error('原地压缩必须先指定 --backup-dir，或显式加 --no-backup');
  }

  const files = walkImages(rootDir);
  const totalBytes = files.reduce((sum, file) => sum + fs.statSync(file).size, 0);

  console.log('模式: ' + (apply ? 'APPLY' : 'DRY-RUN'));
  console.log('源目录: ' + rootDir);
  if (outDir) console.log('输出目录: ' + outDir);
  if (backupDir) console.log('原图备份: ' + backupDir);
  console.log('参数: 质量=' + options.quality + ' 长边=' + options.maxDim
    + ' 跳过<' + options.minSizeKb + 'KB');
  console.log('命中图片: ' + files.length + ' 张，合计 ' + human(totalBytes));
  console.log('');

  // ---------- DRY-RUN：抽样试算并外推 ----------
  if (!apply) {
    const indexes = hasFlag('--all-samples')
      ? pickSampleIndexes(files.length, files.length)
      : pickSampleIndexes(files.length, toPositiveInt(getArgValue('--limit'), DEFAULTS.sampleSize));

    const samples = indexes.map((i) => files[i]);
    let sampledBytes = 0;
    let sampledNewBytes = 0;
    let compressed = 0;
    const rows = [];

    for (const file of samples) {
      try {
        const result = await compressToBuffer(sharp, file, options);
        sampledBytes += result.size;
        sampledNewBytes += result.newSize;
        if (result.status === 'compressed') {
          compressed += 1;
          rows.push({
            文件: path.relative(rootDir, file),
            原大小: human(result.size),
            压缩后: human(result.newSize),
            节省: ((1 - result.newSize / result.size) * 100).toFixed(0) + '%',
            尺寸: (result.width || '?') + 'x' + (result.height || '?'),
          });
        }
      } catch (error) {
        console.error('  取样失败 ' + path.relative(rootDir, file) + ': ' + error.message);
      }
    }

    if (rows.length > 0) {
      console.table(rows.slice(0, 20));
      if (rows.length > 20) console.log('（仅展示前 20 行，抽样共压缩 ' + rows.length + ' 张）');
    }

    const ratio = sampledBytes > 0 ? sampledNewBytes / sampledBytes : 1;
    const projected = Math.round(totalBytes * ratio);
    console.log('');
    console.log('抽样: ' + samples.length + ' 张 / ' + files.length + ' 张'
      + '（' + human(sampledBytes) + ' → ' + human(sampledNewBytes) + '，可压 ' + compressed + ' 张）');
    console.log('外推全量: ' + human(totalBytes) + ' → 约 ' + human(projected)
      + '（预计省 ' + human(totalBytes - projected)
      + '，压缩比 ' + ((1 - ratio) * 100).toFixed(1) + '%）');
    console.log('');
    console.log('未写盘。加 --apply（建议配 --out-dir）后才会真正压缩。');
    return;
  }

  // ---------- APPLY ----------
  if (outDir) fs.mkdirSync(outDir, { recursive: true });
  if (backupDir) fs.mkdirSync(backupDir, { recursive: true });

  let done = 0;
  let compressed = 0;
  let skipped = 0;
  let failed = 0;
  let beforeBytes = 0;
  let afterBytes = 0;

  await mapWithConcurrency(files, options.concurrency, async (file) => {
    const relative = path.relative(rootDir, file);
    const target = outDir ? path.join(outDir, relative) : file;
    const originalSize = fs.statSync(file).size;
    beforeBytes += originalSize;

    try {
      const result = await compressToBuffer(sharp, file, options);

      if (outDir) {
        fs.mkdirSync(path.dirname(target), { recursive: true });
      }

      if (result.status === 'compressed') {
        // 原地模式：先把原图备份出去
        if (!outDir && backupDir) {
          const backupPath = path.join(backupDir, relative);
          fs.mkdirSync(path.dirname(backupPath), { recursive: true });
          fs.copyFileSync(file, backupPath);
        }

        if (outDir) {
          // 另存模式：直接写目标（同名不换扩展名）
          fs.writeFileSync(target, result.buffer);
        } else {
          // 原地模式：同目录临时文件 + rename，保证原子性
          const temp = file + '.tmp-compress';
          fs.writeFileSync(temp, result.buffer);
          fs.renameSync(temp, file);
        }

        // 回读校验，确认写出来的图能解码
        const check = await sharp(target, { failOn: 'none' }).metadata();
        if (!check.format) throw new Error('回读校验失败');

        compressed += 1;
        afterBytes += result.newSize;
      } else {
        // 跳过压缩：另存模式要保证输出树完整，原样拷过去
        if (outDir) {
          fs.copyFileSync(file, target);
        }
        skipped += 1;
        afterBytes += originalSize;
      }
    } catch (error) {
      failed += 1;
      if (outDir) {
        try {
          fs.mkdirSync(path.dirname(target), { recursive: true });
          fs.copyFileSync(file, target);
        } catch (copyError) {
          // 拷贝也失败就只剩原目录里的原件，这里如实记日志
          console.error('  兜底拷贝失败 ' + relative + ': ' + copyError.message);
        }
      }
      console.error('  失败 ' + relative + ': ' + error.message);
    }

    done += 1;
    if (done % 200 === 0) {
      console.log('  进度 ' + done + '/' + files.length);
    }
  });

  console.log('');
  console.log('处理完成: ' + done + ' 张（压缩 ' + compressed + '，跳过 ' + skipped + '，失败 ' + failed + '）');
  console.log('体积: ' + human(beforeBytes) + ' → ' + human(afterBytes)
    + '（省 ' + human(beforeBytes - afterBytes) + '）');
  if (outDir) {
    console.log('');
    console.log('输出目录: ' + outDir);
    console.log('下一步：核对输出目录文件数与原目录一致后，再切换（mv 原名 + ln -s）。');
    console.log('原目录未改动，随时可重来。');
  }
  if (backupDir) {
    console.log('');
    console.log('原图备份: ' + backupDir + '（确认无误后方可删除）');
  }
  if (failed > 0) {
    console.log('');
    console.log('⚠️ 有 ' + failed + ' 张失败，请检查上面日志；这些文件保持原样。');
  }
}

module.exports = {
  __testables: {
    IMAGE_EXTS,
    REENCODABLE_FORMATS,
    MIN_GAIN_RATIO,
    shouldSkip,
    pickSampleIndexes,
    encodeFormatFor,
    walkImages,
  },
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error && error.message ? error.message : error);
    process.exit(1);
  });
}
