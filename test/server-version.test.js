const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createSourceWatcher } = require('../utils/server-version');

function makeTree() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'server-version-'));
  fs.mkdirSync(path.join(root, 'controllers'));
  fs.writeFileSync(path.join(root, 'controllers', 'a.js'), '// a');
  fs.writeFileSync(path.join(root, 'app.js'), '// app');
  fs.writeFileSync(path.join(root, 'controllers', 'readme.md'), '# not source');
  return root;
}

test('reports stale once a backend source file is newer than process start', () => {
  const root = makeTree();
  let clock = Date.now();
  const startedAt = clock;
  const watcher = createSourceWatcher({ root, dirs: ['controllers'], files: ['app.js'], now: () => clock, cacheMs: 0 });

  assert.equal(watcher.sourceFileCount, 2, 'only .js sources are counted');
  assert.equal(watcher.status().stale, false);
  assert.equal(watcher.status().bootedAt, new Date(startedAt).toISOString());

  clock += 60_000;
  const touched = new Date(clock);
  fs.utimesSync(path.join(root, 'controllers', 'a.js'), touched, touched);

  const status = watcher.status();
  assert.equal(status.stale, true);
  // 时间戳精度由文件系统决定，只断言「比启动时更新」这一契约
  assert.ok(Date.parse(status.newestSourceAt) > Date.parse(status.bootedAt));
  assert.equal(status.bootedAt, new Date(startedAt).toISOString(), '启动时间不随检查变化');
});

test('caches the check inside the interval and never reports stale without sources', () => {
  const root = makeTree();
  let clock = Date.now();
  const watcher = createSourceWatcher({ root, dirs: ['controllers'], files: [], now: () => clock, cacheMs: 60_000 });
  const first = watcher.status();
  assert.equal(watcher.status(), first, '同一缓存窗口内返回同一份快照');

  clock += 1_000;
  const touched = new Date(clock + 10_000);
  fs.utimesSync(path.join(root, 'controllers', 'a.js'), touched, touched);
  assert.equal(watcher.status(), first, '缓存未过期时不做判断');

  clock += 120_000;
  assert.equal(watcher.status().stale, true);

  const empty = createSourceWatcher({ root: path.join(root, 'missing'), dirs: ['controllers'], files: [], now: () => clock, cacheMs: 0 });
  assert.equal(empty.sourceFileCount, 0);
  assert.equal(empty.status().stale, false, '找不到源码时不误报');
});
