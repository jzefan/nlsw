const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('../front_end/node_modules/typescript');

const ROOT = path.join(__dirname, '..');

function loadCompressModule() {
  const source = fs.readFileSync(
    path.join(ROOT, 'front_end/src/utils/compress-image.ts'),
    'utf8',
  );
  const js = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  }).outputText;

  const module = { exports: {} };
  const context = { module, exports: module.exports, console };
  vm.createContext(context);
  vm.runInContext(js, context);
  return module.exports;
}

const compress = loadCompressModule();

// vm 里造出来的数组属于另一个 realm，deepStrictEqual 会因为原型不同判不等，
// 统一用 Array.from 搬回当前 realm 再比较。
function targetSize(width, height, maxSize) {
  return Array.from(compress.computeTargetSize(width, height, maxSize));
}

function fakeFile(type, size) {
  return { type, size, name: 'receipt.jpg' };
}

// ---------- 几何：长边限制 ----------

test('computeTargetSize 不放大小图', () => {
  assert.deepEqual(targetSize(800, 600, 1600), [800, 600]);
  assert.deepEqual(targetSize(1600, 1600, 1600), [1600, 1600]);
});

test('computeTargetSize 把长边压到上限并保持长宽比', () => {
  assert.deepEqual(targetSize(3200, 1600, 1600), [1600, 800]);
  assert.deepEqual(targetSize(1600, 3200, 1600), [800, 1600]);
  assert.deepEqual(targetSize(4000, 1000, 1600), [1600, 400]);
});

test('computeTargetSize 竖长回单（3192x3776）与 sharp 实测输出一致', () => {
  // 线上真实样本 3192x3776，sharp 同参数压出来正好是 1353x1600
  const [width, height] = compress.computeTargetSize(3192, 3776, 1600);
  assert.equal(height, 1600);
  assert.equal(width, 1353);
  assert.ok(Math.abs(width / height - 3192 / 3776) < 0.01, '长宽比偏差过大');
});

test('computeTargetSize 退化输入不抛错也不产出 0 尺寸', () => {
  assert.deepEqual(targetSize(0, 0, 1600), [0, 0]);
  assert.deepEqual(targetSize(-5, 10, 1600), [-5, 10]);
  const [width, height] = targetSize(1, 5000, 1600);
  assert.ok(width >= 1 && height >= 1, '缩放后不允许出现 0 像素边');
});

// ---------- 判据：该不该压 ----------

test('shouldCompress 只处理可保持同格式的类型', () => {
  const big = 4 * 1024 * 1024;
  assert.equal(compress.shouldCompress(fakeFile('image/jpeg', big)), true);
  assert.equal(compress.shouldCompress(fakeFile('image/jpg', big)), true);
  assert.equal(compress.shouldCompress(fakeFile('image/png', big)), true);
  assert.equal(compress.shouldCompress(fakeFile('image/webp', big)), true);
});

test('shouldCompress 放过已够小的图与无法解码的类型', () => {
  const big = 4 * 1024 * 1024;
  assert.equal(compress.shouldCompress(fakeFile('image/jpeg', 100 * 1024)), false);
  // HEIC 浏览器里解不开，压不了；类型也拿不到对应输出格式
  assert.equal(compress.shouldCompress(fakeFile('image/heic', big)), false);
  assert.equal(compress.shouldCompress(fakeFile('application/pdf', big)), false);
  assert.equal(compress.shouldCompress(fakeFile('', big)), false);
});

test('shouldCompress 支持自定义体积门槛与长边', () => {
  assert.equal(
    compress.shouldCompress(fakeFile('image/jpeg', 100 * 1024), { minBytes: 50 * 1024 }),
    true,
  );
  assert.equal(
    compress.shouldCompress(fakeFile('image/jpeg', 4 * 1024 * 1024), { minBytes: 8 * 1024 * 1024 }),
    false,
  );
});

// ---------- 接线：三个上传入口必须「先压缩、再判大小」 ----------

const UPLOAD_COMPONENTS = [
  'VesselUploadReceiptDialog.vue',
  'VesselReceiptImageDialog.vue',
  'VesselDelayInfoDialog.vue',
];

for (const component of UPLOAD_COMPONENTS) {
  test(component + ' 在判大小之前先压缩', () => {
    const source = fs.readFileSync(
      path.join(ROOT, 'front_end/src/pages/settle/components', component),
      'utf8',
    );

    assert.ok(
      source.includes("import { compressImageFile } from '@/utils/compress-image'"),
      component + ' 未引入压缩工具',
    );

    const compressIndex = source.indexOf('await compressImageFile(rawFile)');
    const sizeCheckIndex = source.indexOf('file.size > MAX_FILE_SIZE');

    assert.ok(compressIndex >= 0, component + ' 未真正调用压缩');
    assert.ok(sizeCheckIndex >= 0, component + ' 缺少体积检查');
    // 顺序是关键：手机原图常 3–5MB，先判大小会把本来能压到几百 KB 的图直接拒掉
    assert.ok(
      compressIndex < sizeCheckIndex,
      component + ' 必须先压缩再判大小（当前顺序相反）',
    );
  });
}
