const Company = require('../../models/Company');
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
exports.searchCompanies = async (req, res) => {
  try {
    const search = (req.query.search || '').trim();
    const limit = parseInt(req.query.limit) || 20;

    const query = buildTenantQuery(req, {});
    const allCompanies = await Company.find(query).sort({ name: 1 }).lean();

    // 按 name 去重，保留第一条完整文档
    const seen = new Set();
    let unique = [];
    for (const c of allCompanies) {
      if (!seen.has(c.name)) {
        seen.add(c.name);
        unique.push(c);
      }
    }

    if (search) {
      const searchLower = search.toLowerCase();
      const cache = getCache(req.tenantId);
      unique = unique.filter(c => matchWithPinyin(c.name, searchLower, cache));
    }

    const data = unique.slice(0, limit).map(c => ({
      name: c.name,
      customers: c.customers || [],
      contact_name: c.contact_name || '',
      phone: c.phone || '',
      address: c.address || '',
    }));

    res.json({ ok: true, data });
  } catch (error) {
    console.error('searchCompanies error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

exports.getCompanies = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = (req.query.search || '').trim();
    const skipCount = req.query.skipCount === 'true';

    const query = buildTenantQuery(req, {});
    const allCompanies = await Company.find(query).sort({ name: 1 }).lean();

    // 按 name 去重，保留第一条完整文档
    const seen = new Set();
    let unique = [];
    for (const c of allCompanies) {
      if (!seen.has(c.name)) {
        seen.add(c.name);
        unique.push(c);
      }
    }

    if (search) {
      const searchLower = search.toLowerCase();
      const cache = getCache(req.tenantId);
      unique = unique.filter(c => matchWithPinyin(c.name, searchLower, cache));
    }

    const total = unique.length;
    const data = unique.slice((page - 1) * limit, page * limit).map(c => ({
      name: c.name,
      customers: c.customers || [],
      contact_name: c.contact_name || '',
      phone: c.phone || '',
      address: c.address || '',
    }));

    res.json({
      ok: true,
      data,
      total: skipCount ? -1 : total,
      page,
      totalPages: skipCount ? -1 : Math.ceil(total / limit)
    });
  } catch (error) {
    console.error('getCompanies error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};
