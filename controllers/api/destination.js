const Destination = require('../../models/Destination');
const { buildTenantQuery } = require('../../utils/tenant');
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

function getCache(tenantId) {
  const cacheKey = String(tenantId || 'platform');
  let cache = _pinyinCache.get(cacheKey);
  if (!cache || Date.now() - cache.ts > PINYIN_CACHE_TTL) {
    cache = { names: new Map(), ts: Date.now() };
    _pinyinCache.set(cacheKey, cache);
  }
  return cache;
}

// 快速搜索接口 - 支持拼音首字母搜索
exports.searchDestinations = async (req, res) => {
  try {
    const search = (req.query.search || '').trim();
    const limit = parseInt(req.query.limit) || 20;

    const matchStage = {};
    if (req.tenantId) {
      matchStage.tenantId = req.tenantId;
    }

    // Get all distinct names (small set)
    const allNames = await Destination.aggregate([
      { $match: matchStage },
      { $group: { _id: '$name' } },
      { $sort: { _id: 1 } }
    ]);

    let filtered = allNames.map(r => r._id);

    if (search) {
      const searchLower = search.toLowerCase();
      const cache = getCache(req.tenantId);
      filtered = filtered.filter(name => matchWithPinyin(name, searchLower, cache));
    }

    const data = filtered.slice(0, limit).map(name => ({ name }));

    res.json({ ok: true, data });
  } catch (error) {
    console.error('searchDestinations error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

exports.getDestinations = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = (req.query.search || '').trim();
    const skipCount = req.query.skipCount === 'true';

    const matchStage = {};
    if (req.tenantId) {
      matchStage.tenantId = req.tenantId;
    }

    // Get all distinct names (small set)
    const allNames = await Destination.aggregate([
      { $match: matchStage },
      { $group: { _id: '$name' } },
      { $sort: { _id: 1 } }
    ]);

    let filtered = allNames.map(r => r._id);

    if (search) {
      const searchLower = search.toLowerCase();
      const cache = getCache(req.tenantId);
      filtered = filtered.filter(name => matchWithPinyin(name, searchLower, cache));
    }

    const total = filtered.length;
    const data = filtered.slice((page - 1) * limit, page * limit).map(name => ({ name }));

    res.json({
      ok: true,
      data,
      total: skipCount ? -1 : total,
      page,
      totalPages: skipCount ? -1 : Math.ceil(total / limit)
    });
  } catch (error) {
    console.error('getDestinations error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};
