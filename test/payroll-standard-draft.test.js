const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const frontend = path.resolve(__dirname, '../front_end');
const ts = require(path.join(frontend, 'node_modules/typescript'));
const vue = require(path.join(frontend, 'node_modules/vue'));

function evaluate(source, dependencies, extras = {}) {
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  const context = { exports, module: { exports }, require: name => dependencies[name] || {}, ...extras };
  vm.runInNewContext(output, context);
  return context.module.exports;
}

// Execute the actual SFC script; isolate API writes and lifecycle mounting only.
function settings() {
  const utils = evaluate(fs.readFileSync(path.join(frontend, 'src/utils/payroll.ts'), 'utf8'), {});
  let standard = { basicPayCents: 500000, positionPayCents: 0, seniorityPayCents: 0, attendanceBonusCents: 0, companySocialInsuranceBaseCents: 0, personalSocialInsuranceBaseCents: 0, companyHousingFundBaseCents: 0, personalHousingFundBaseCents: 0, version: 1 };
  let reads = 0;
  const messages = [];
  const api = {
    async getPayrollStandards() { reads++; return { ok: true, data: { rows: [{ employeeId: 'employee', name: '员工', standard: { ...standard } }] } }; },
    async getPayrollContributionScheme() { return { ok: true, data: { scheme: { ...utils.DEFAULT_CONTRIBUTION_SCHEME } } }; },
    async savePayrollStandard(employeeId, value, version) { assert.equal(employeeId, 'employee'); assert.equal(version, standard.version); standard = { ...value, version: version + 1 }; return { ok: true }; },
    async savePayrollContributionScheme() { return { ok: true }; },
  };
  const script = fs.readFileSync(path.join(frontend, 'src/pages/attendance/components/PayrollStandardSettings.vue'), 'utf8').split('<script setup lang="ts">')[1].split('</script>')[0];
  const state = evaluate(`${script}\nmodule.exports = {load, startEdit, confirmEdit, startSchemeEdit, confirmSchemeEdit, rows, drafts, editingId, schemeDraft, schemeEditing};`, {
    vue: { ...vue, onMounted() {} },
    'vue-sonner': { toast: { error: value => messages.push(value), success() {} } },
    '@/services/api/payroll.api': api,
    '@/utils/payroll': utils,
  }, { defineProps: () => ({ canEdit: true }), defineExpose() {} });
  return { ...state, reads: () => reads, messages };
}

test('refresh preserves an unsaved employee standard and does not fetch replacement data', async () => {
  const state = settings();
  await state.load();
  state.startEdit(state.rows.value[0]);
  state.drafts.value.employee.basicPayCents = '6000.00';
  await state.load();
  assert.equal(state.reads(), 1);
  assert.equal(state.editingId.value, 'employee');
  assert.equal(state.drafts.value.employee.basicPayCents, '6000.00');
});

test('scheme editing excludes employee edits and refresh preserves the unsaved scheme', async () => {
  const state = settings();
  await state.load();
  state.startSchemeEdit();
  state.schemeDraft.value.pensionEmployerPercent = '16';
  state.startEdit(state.rows.value[0]);
  assert.equal(state.editingId.value, '');
  await state.load();
  assert.equal(state.reads(), 1);
  assert.equal(state.schemeDraft.value.pensionEmployerPercent, '16');
  assert.equal(state.schemeEditing.value, true);
});

test('successful standard save clears its draft and reloads the saved version', async () => {
  const state = settings();
  await state.load();
  const row = state.rows.value[0];
  state.startEdit(row);
  state.drafts.value.employee.basicPayCents = '6000.00';
  await state.confirmEdit(row);
  assert.equal(state.reads(), 2);
  assert.equal(state.editingId.value, '');
  assert.equal(state.rows.value[0].standard.basicPayCents, 600000);
  assert.equal(state.rows.value[0].standard.version, 2);
});
