import test from 'node:test';
import assert from 'node:assert/strict';
import { Company, Department } from '../src/models/index.js';
import { tenantContext } from '../src/middleware/tenant.js';

const tenantId = '65f000000000000000000001';

function runPre(model, operation, subject, args = []) {
  return tenantContext.run(tenantId, () => new Promise((resolve, reject) => {
    model.schema.s.hooks.execPre(operation, subject, args, error => error ? reject(error) : resolve());
  }));
}

test('tenant query middleware scopes company records and preserves existing filters', async () => {
  const query = Department.find({ active: true });
  await runPre(Department, 'find', query);
  assert.deepEqual(query.getFilter(), { active: true, company: tenantId });
});

test('company queries are restricted to the authenticated company id', async () => {
  const query = Company.findOne({ name: 'Acme' });
  await runPre(Company, 'findOne', query);
  assert.deepEqual(query.getFilter(), { name: 'Acme', _id: tenantId });
});

test('tenant upserts stamp the inserted document with the active company', async () => {
  const query = Department.updateOne({ name: 'People' }, { $set: { active: true } }, { upsert: true });
  await runPre(Department, 'updateOne', query);
  assert.equal(query.getFilter().company, tenantId);
  assert.equal(query.getUpdate().$setOnInsert.company, tenantId);
});

test('tenant bulk inserts assign the active company to each document', async () => {
  const documents = [{ name: 'People' }, { name: 'Finance' }];
  await runPre(Department, 'insertMany', null, [documents]);
  assert.deepEqual(documents.map(document => document.company), [tenantId, tenantId]);
});
