const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('../front_end/node_modules/typescript');

const source = fs.readFileSync(path.join(__dirname, '../front_end/src/pages/attendance/components/RequestList.vue'), 'utf8');
const script = source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1];
const syntax = ts.createSourceFile('RequestList.ts', script, ts.ScriptTarget.Latest, true);
// Exercise the component's actual request functions with controlled response order.
const selectedSource = syntax.statements.filter(statement => {
  if (ts.isFunctionDeclaration(statement)) return ['load', 'loadPendingApprovalCount'].includes(statement.name?.text);
  return ts.isVariableStatement(statement) && statement.declarationList.declarations.some(declaration =>
    ['listRequestId', 'approvalCountRequestId'].includes(declaration.name.getText(syntax)));
}).map(statement => statement.getText(syntax)).join('\n');

function harness(view = 'mine') {
  const pending = [];
  const errors = [];
  const context = {
    props: { view }, page: { value: 1 }, limit: 20, scopedType: { value: 'leave' },
    loading: { value: false }, loadFailed: { value: false }, rows: { value: [] }, total: { value: 0 },
    canReview: { value: true }, pendingApprovalCount: { value: 0 },
    extractRows: response => response.requests,
    showError: error => errors.push(error),
    getAttendanceRequests: (requestedView, page, limit, type) => new Promise((resolve, reject) => {
      pending.push({ view: requestedView, page, limit, type, resolve, reject });
    }),
  };
  context.isInbox = { get value() { return context.props.view === 'inbox'; } };
  vm.createContext(context);
  vm.runInContext(ts.transpile(selectedSource, { target: ts.ScriptTarget.ES2022 }), context);
  return { context, pending, errors };
}

function result(type, total = 1) {
  return { requests: [{ type }], pagination: { total } };
}

test('switching request type ignores an older successful response', async () => {
  const { context, pending } = harness('inbox');
  const oldRequest = context.load();
  context.scopedType.value = 'overtime';
  const newRequest = context.load();
  pending[1].resolve(result('overtime', 3));
  await newRequest;
  pending[0].resolve(result('leave', 9));
  await oldRequest;
  assert.equal(context.rows.value[0].type, 'overtime');
  assert.equal(context.total.value, 3);
  assert.equal(context.pendingApprovalCount.value, 3);
  assert.equal(context.loading.value, false);
});

test('an older request failure does not clear current data or report an error', async () => {
  const { context, pending, errors } = harness();
  const oldRequest = context.load();
  context.page.value = 2;
  const newRequest = context.load();
  pending[1].resolve(result('page-2', 27));
  await newRequest;
  pending[0].reject(new Error('old network failure'));
  await oldRequest;
  assert.equal(context.rows.value[0].type, 'page-2');
  assert.equal(context.total.value, 27);
  assert.equal(context.loadFailed.value, false);
  assert.equal(errors.length, 0);
});

test('an older completion cannot clear loading or the latest error state', async () => {
  const { context, pending, errors } = harness();
  const oldRequest = context.load();
  const newRequest = context.load();
  pending[0].resolve(result('old'));
  await oldRequest;
  assert.equal(context.loading.value, true);
  assert.equal(context.rows.value.length, 0);
  const failure = new Error('current network failure');
  pending[1].reject(failure);
  await newRequest;
  assert.equal(context.loadFailed.value, true);
  assert.equal(context.loading.value, false);
  assert.equal(errors[0], failure);
});

test('an older success cannot hide the latest request failure', async () => {
  const { context, pending, errors } = harness();
  const oldRequest = context.load();
  const currentRequest = context.load();
  pending[1].reject(new Error('current network failure'));
  await currentRequest;
  pending[0].resolve(result('old', 9));
  await oldRequest;
  assert.equal(context.rows.value.length, 0);
  assert.equal(context.total.value, 0);
  assert.equal(context.loadFailed.value, true);
  assert.equal(errors.length, 1);
});

test('approval badge ignores older successes and failures', async () => {
  const { context, pending } = harness();
  const oldSuccess = context.loadPendingApprovalCount();
  const oldFailure = context.loadPendingApprovalCount();
  context.scopedType.value = 'overtime';
  const current = context.loadPendingApprovalCount();
  pending[2].resolve(result('overtime', 4));
  await current;
  pending[0].resolve(result('leave', 8));
  await oldSuccess;
  pending[1].reject(new Error('old badge failure'));
  await oldFailure;
  assert.equal(context.pendingApprovalCount.value, 4);
});

test('entering inbox invalidates an outstanding badge request', async () => {
  const { context, pending } = harness();
  const oldBadge = context.loadPendingApprovalCount();
  context.props.view = 'inbox';
  const list = context.load();
  pending[1].resolve(result('leave', 6));
  await list;
  pending[0].reject(new Error('old badge failure'));
  await oldBadge;
  assert.equal(context.pendingApprovalCount.value, 6);
});

test('revoking approval access invalidates an outstanding badge request', async () => {
  const { context, pending } = harness();
  const oldBadge = context.loadPendingApprovalCount();
  context.canReview.value = false;
  await context.loadPendingApprovalCount();
  pending[0].resolve(result('leave', 8));
  await oldBadge;
  assert.equal(context.pendingApprovalCount.value, 0);
});
