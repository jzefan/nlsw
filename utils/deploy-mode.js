const secrets = require('../config/secrets');

function isStandalone() {
  return secrets.deployMode === 'standalone';
}

function isSaas() {
  return !isStandalone();
}

function getDeployMode() {
  return isStandalone() ? 'standalone' : 'saas';
}

function getStandaloneCompany() {
  return secrets.standaloneCompany || '';
}

module.exports = { isStandalone, isSaas, getDeployMode, getStandaloneCompany };
