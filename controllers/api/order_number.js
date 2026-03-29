const OrderNumber = require('../../models/OrderNumber');
const { pinyin } = require('pinyin-pro');

// Pinyin cache: tenantId -> { names: Map<name, initials>, ts }
const _pinyinCache = new Map();
const PINYIN_CACHE_TTL = 5 * 60 * 1000;

function getPinyinInitials(name) {
  return pinyin(name, { pattern: 'first', toneType: 'none', type: 'array' }).join('').toLowerCase();
}

function matchWithPinyin(name, searchLower, cache) {
  if (name.toLowerCase().includes(searchLower)) return true;
  let initials = cache.names.get(name);
  if (initials === undefined) {
    initials = getPinyinInitials(name);
    cache.names.set(name, initials);
  }
  return initials.includes(searchLower);
}

function getCache(tenantId, type) {
  const cacheKey = `${String(tenantId || 'platform')}_${type}`;
  let cache = _pinyinCache.get(cacheKey);
  if (!cache || Date.now() - cache.ts > PINYIN_CACHE_TTL) {
    cache = { names: new Map(), ts: Date.now() };
    _pinyinCache.set(cacheKey, cache);
  }
  return cache;
}

async function searchByType(req, res, type) {
  try {
    const search = (req.query.search || '').trim();
    const limit = parseInt(req.query.limit) || 20;

    const matchStage = { type };
    if (req.tenantId) {
      matchStage.tenantId = req.tenantId;
    }

    const allValues = await OrderNumber.aggregate([
      { $match: matchStage },
      { $group: { _id: '$value' } },
      { $sort: { _id: 1 } }
    ]);

    let filtered = allValues.map(r => r._id);

    if (search) {
      const searchLower = search.toLowerCase();
      const cache = getCache(req.tenantId, type);
      filtered = filtered.filter(name => matchWithPinyin(name, searchLower, cache));
    }

    const data = filtered.slice(0, limit).map(name => ({ name }));

    res.json({ ok: true, data });
  } catch (error) {
    console.error(`searchOrderNumbers(${type}) error:`, error);
    res.status(500).json({ ok: false, error: error.message });
  }
}

// 添加新值
async function addByType(req, res, type) {
  try {
    const value = (req.body.value || '').trim();
    if (!value) {
      return res.status(400).json({ ok: false, error: '值不能为空' });
    }

    await OrderNumber.updateOne(
      { tenantId: req.tenantId, type, value },
      { $setOnInsert: { tenantId: req.tenantId, type, value } },
      { upsert: true }
    );

    // 清除缓存
    const cacheKey = `${String(req.tenantId || 'platform')}_${type}`;
    _pinyinCache.delete(cacheKey);

    res.json({ ok: true });
  } catch (error) {
    console.error(`addOrderNumber(${type}) error:`, error);
    res.status(500).json({ ok: false, error: error.message });
  }
}

exports.searchOrderNumbers = (req, res) => searchByType(req, res, 'order_no');
exports.searchBillNumbers = (req, res) => searchByType(req, res, 'bill_no');
exports.addOrderNumber = (req, res) => addByType(req, res, 'order_no');
exports.addBillNumber = (req, res) => addByType(req, res, 'bill_no');
