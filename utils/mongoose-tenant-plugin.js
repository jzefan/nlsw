/**
 * Mongoose global plugin for automatic tenant isolation.
 *
 * For every schema that has a `tenantId` field, this plugin registers
 * pre-hooks that read the current tenant context from AsyncLocalStorage
 * and automatically inject tenantId conditions into queries, updates,
 * deletes, aggregations, and new document saves.
 *
 * Skip conditions (no tenantId is injected when):
 * - No AsyncLocalStorage context (background jobs, passport deserialize)
 * - Platform user (isPlatform === true)
 * - Schema has no tenantId path (e.g. Tenant, ArchivedReceiptImg)
 */
const { getTenantContext } = require('./tenant-context');

// Query operations that need a tenantId where-clause
const QUERY_HOOKS = [
  'find',
  'findOne',
  'countDocuments',
  'distinct',
  'findOneAndUpdate',
  'findOneAndDelete',
  'updateOne',
  'updateMany',
  'deleteOne',
  'deleteMany',
];

/**
 * Returns the tenantId to inject, or null if filtering should be skipped.
 */
function getActiveTenantId() {
  const ctx = getTenantContext();
  if (!ctx) return null;           // no request context (background job)
  if (ctx.isPlatform) return null; // platform user sees all tenants
  return ctx.tenantId || null;
}

/**
 * @param {import('mongoose').Schema} schema
 */
function mongooseTenantPlugin(schema) {
  // Only apply to schemas that declare a tenantId field
  if (!schema.path('tenantId')) return;

  // --- Query hooks ---
  QUERY_HOOKS.forEach((hook) => {
    schema.pre(hook, function () {
      const tenantId = getActiveTenantId();
      if (tenantId) {
        this.where({ tenantId });
      }
    });
  });

  // --- Aggregate hook ---
  schema.pre('aggregate', function () {
    const tenantId = getActiveTenantId();
    if (tenantId) {
      this.pipeline().unshift({ $match: { tenantId } });
    }
  });

  // --- Validate hook (new documents) ---
  // Must use pre('validate'), NOT pre('save'), because Mongoose runs
  // validation before save. If tenantId is required in the schema,
  // pre('save') would be too late — validation already failed.
  schema.pre('validate', function () {
    if (!this.isNew) return; // only for creates, not updates via save()
    if (this.tenantId) return; // already set (e.g. by injectTenantId or explicit)
    const tenantId = getActiveTenantId();
    if (tenantId) {
      this.tenantId = tenantId;
    }
  });
}

module.exports = mongooseTenantPlugin;
