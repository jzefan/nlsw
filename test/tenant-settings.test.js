const test = require('node:test');
const assert = require('node:assert/strict');

const {
  BILL_IMPORT_CARRIER_RULES,
  getBillImportCarrierRule,
  sanitizeBillImportCarrierRule,
} = require('../utils/tenant-settings');

test('sanitizeBillImportCarrierRule falls back to contains_company_name for unknown values', () => {
  assert.equal(
    sanitizeBillImportCarrierRule('unknown-rule'),
    BILL_IMPORT_CARRIER_RULES.CONTAINS_COMPANY_NAME,
  );
});

test('sanitizeBillImportCarrierRule accepts unrestricted', () => {
  assert.equal(
    sanitizeBillImportCarrierRule(BILL_IMPORT_CARRIER_RULES.UNRESTRICTED),
    BILL_IMPORT_CARRIER_RULES.UNRESTRICTED,
  );
});

test('getBillImportCarrierRule reads tenant settings and applies default', () => {
  assert.equal(
    getBillImportCarrierRule({ billImportCarrierRule: BILL_IMPORT_CARRIER_RULES.UNRESTRICTED }),
    BILL_IMPORT_CARRIER_RULES.UNRESTRICTED,
  );
  assert.equal(
    getBillImportCarrierRule({}),
    BILL_IMPORT_CARRIER_RULES.CONTAINS_COMPANY_NAME,
  );
});
