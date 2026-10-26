import mongoose from 'mongoose';
import { env } from './env.js';
import { Company, User, Employee, Attendance, AttendanceCorrection, LeaveType, Holiday, Department, Designation, SalaryStructure, LeaveBalance, LeaveRequest, PayrollRun, Payslip, Announcement, Notification, AuditLog, AiLog } from '../models/index.js';
let connectionPromise;
let migrationPromise;

async function migrateExistingCompanyData() {
  const company = await Company.collection.findOne({}, { projection: { _id: 1, tenantMigrationVersion: 1 }, sort: { createdAt: 1 } });
  if (!company || company.tenantMigrationVersion >= 1) return;

  const tenantModels = [User, Employee, Attendance, AttendanceCorrection, LeaveType, Holiday, Department, Designation, SalaryStructure, LeaveBalance, LeaveRequest, PayrollRun, Payslip, Announcement, Notification, AuditLog, AiLog];
  for (const tenantModel of tenantModels) {
    await tenantModel.collection.updateMany(
      { $or: [{ company: { $exists: false } }, { company: null }] },
      { $set: { company: company._id } }
    );
  }

  const legacyIndexes = [[Employee, 'code_1'], [Employee, 'email_1'], [LeaveType, 'code_1'], [Holiday, 'date_1'], [Department, 'name_1'], [Designation, 'name_1'], [PayrollRun, 'period_1']];
  for (const [tenantModel, indexName] of legacyIndexes) {
    try { await tenantModel.collection.dropIndex(indexName); }
    catch (error) { if (![26, 27].includes(error.code)) throw error; }
  }

  await Promise.all([Employee, LeaveType, Holiday, Department, Designation, PayrollRun].map(tenantModel => tenantModel.createIndexes()));
  await Company.collection.updateOne({ _id: company._id }, { $set: { tenantMigrationVersion: 1 } });
}

export async function connectDatabase() {
  if (mongoose.connection.readyState === 1) return migrationPromise ? migrationPromise.then(() => mongoose) : mongoose;
  if (!connectionPromise) {
    connectionPromise = mongoose.connect(env.MONGODB_URI).then(async () => {
      if (!migrationPromise) migrationPromise = migrateExistingCompanyData();
      await migrationPromise;
      return mongoose;
    }).catch(error => {
      connectionPromise = undefined;
      migrationPromise = undefined;
      throw error;
    });
  }
  return connectionPromise;
}
