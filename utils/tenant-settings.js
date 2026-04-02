const BILL_IMPORT_CARRIER_RULES = {
  CONTAINS_COMPANY_NAME: 'contains_company_name',
  UNRESTRICTED: 'unrestricted',
};

function sanitizeBillImportCarrierRule(rule) {
  return Object.values(BILL_IMPORT_CARRIER_RULES).includes(rule)
    ? rule
    : BILL_IMPORT_CARRIER_RULES.CONTAINS_COMPANY_NAME;
}

function getBillImportCarrierRule(settings = {}) {
  return sanitizeBillImportCarrierRule(settings.billImportCarrierRule);
}

module.exports = {
  BILL_IMPORT_CARRIER_RULES,
  sanitizeBillImportCarrierRule,
  getBillImportCarrierRule,
};
