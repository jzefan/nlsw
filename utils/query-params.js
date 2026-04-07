function normalizeStringArrayParam(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized ? [normalized] : [];
  }

  if (value === undefined || value === null) {
    return [];
  }

  const normalized = String(value).trim();
  return normalized ? [normalized] : [];
}

module.exports = {
  normalizeStringArrayParam,
};
