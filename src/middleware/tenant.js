import { AsyncLocalStorage } from 'node:async_hooks';
import mongoose from 'mongoose';

export const tenantContext = new AsyncLocalStorage();

export function tenantScope(schema, path = 'company') {
  if (path !== '_id' && !schema.path(path)) {
    schema.add({ [path]: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', index: true } });
  }

  const scopeQuery = function () {
    const companyId = tenantContext.getStore();
    if (!companyId) return;
    this.where({ [path]: companyId });
    if (this.getOptions?.().upsert && path !== '_id') {
      const update = this.getUpdate() || {};
      update.$setOnInsert = { ...update.$setOnInsert, [path]: companyId };
      this.setUpdate(update);
    }
  };

  for (const operation of ['find', 'findOne', 'countDocuments', 'distinct', 'updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndDelete', 'deleteOne', 'deleteMany', 'replaceOne']) {
    schema.pre(operation, scopeQuery);
  }

  schema.pre('save', function () {
    const companyId = tenantContext.getStore();
    if (companyId && path !== '_id' && !this[path]) this[path] = companyId;
  });

  schema.pre('insertMany', function (next, documents) {
    const companyId = tenantContext.getStore();
    if (companyId && path !== '_id') {
      for (const document of documents) if (!document[path]) document[path] = companyId;
    }
    next();
  });

  schema.pre('aggregate', function () {
    const companyId = tenantContext.getStore();
    if (companyId) this.pipeline().unshift({ $match: { [path]: new mongoose.Types.ObjectId(companyId) } });
  });
}
