const fs = require('fs');
const path = require('path');

// 参与「运行中的代码是否过期」判断的后端源码范围：前端改动不需要重启后端。
const DEFAULT_SOURCE_DIRS = ['controllers', 'models', 'utils', 'middleware', 'config'];
const DEFAULT_SOURCE_FILES = ['app.js', 'routes.js', 'routes_api.js'];
const STATUS_CACHE_MS = 10 * 1000;

function listSourceFiles(root, dirs, files) {
  const found = [];
  for (const file of files) {
    const full = path.join(root, file);
    if (fs.existsSync(full)) found.push(full);
  }
  const walk = (dir) => {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith('.js')) found.push(full);
    }
  };
  for (const dir of dirs) {
    const full = path.join(root, dir);
    if (fs.existsSync(full)) walk(full);
  }
  return found;
}

function newestMtime(files) {
  let newest = 0;
  for (const file of files) {
    try {
      newest = Math.max(newest, fs.statSync(file).mtimeMs);
    } catch {
      // 文件在启动后被删除等情况下忽略即可
    }
  }
  return newest;
}

/**
 * 记录进程启动时的后端源码时间戳，之后按需重新比对：
 * 有文件比启动时更新，说明当前进程跑的是旧代码，需要重启才生效。
 */
function createSourceWatcher({ root = path.join(__dirname, '..'), dirs = DEFAULT_SOURCE_DIRS, files = DEFAULT_SOURCE_FILES, now = () => Date.now(), cacheMs = STATUS_CACHE_MS } = {}) {
  const sourceFiles = listSourceFiles(root, dirs, files);
  const bootMtime = newestMtime(sourceFiles);
  const bootedAt = now();
  let cachedAt = 0;
  let cached = null;

  return {
    bootedAt: new Date(bootedAt).toISOString(),
    sourceFileCount: sourceFiles.length,
    status() {
      if (!cached || now() - cachedAt > cacheMs) {
        const newestSourceAt = newestMtime(sourceFiles);
        cached = {
          bootedAt: new Date(bootedAt).toISOString(),
          sourceFileCount: sourceFiles.length,
          // 找不到源码时不做判断，避免误报
          stale: sourceFiles.length > 0 && newestSourceAt > bootMtime,
          newestSourceAt: newestSourceAt ? new Date(newestSourceAt).toISOString() : null,
          checkedAt: new Date(now()).toISOString(),
        };
        cachedAt = now();
      }
      return cached;
    },
  };
}

module.exports = { createSourceWatcher, serverVersion: createSourceWatcher() };
