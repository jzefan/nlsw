/**
 * AsyncLocalStorage wrapper for tenant context
 *
 * Allows Mongoose hooks (which have no access to Express `req`)
 * to read the current tenant context set by the tenantContext middleware.
 */
const { AsyncLocalStorage } = require('node:async_hooks');

const tenantStore = new AsyncLocalStorage();

/**
 * Get current tenant context from AsyncLocalStorage.
 * Returns null when called outside a request (e.g. scheduled jobs, passport deserialize).
 * @returns {{ tenantId: string|null, isPlatform: boolean } | null}
 */
function getTenantContext() {
  return tenantStore.getStore() || null;
}

module.exports = {
  tenantStore,
  getTenantContext,
};
