import mongoose from 'mongoose';
import { tenantScope } from '../middleware/tenant.js';

const { Schema, model } = mongoose;
const opts = { timestamps: true };
function tenantModel(name, schema, tenantPath = 'company') {
  schema.plugin(tenantScope, tenantPath);
  return model(name, schema);
}

export const Company = tenantModel('Company', new Schema({
  name: { type: String, required: true }, officeStart: { type: String, default: '09:00' },
  graceMinutes: { type: Number, default: 15 }, weekends: { type: [Number], default: [0, 6] },
  latitude: Number, longitude: Number, radiusMeters: { type: Number, default: 150 },
  timezone: { type: String, default: 'Asia/Karachi' }, tenantMigrationVersion: { type: Number, default: 0, select: false }
}, opts), '_id');

export const User = tenantModel('User', new Schema({
  name: String, email: { type: String, required: true, lowercase: true, trim: true, unique: true },
  passwordHash: { type: String, required: true }, role: { type: String, enum: ['ADMIN', 'HR', 'EMPLOYEE'], required: true },
  employee: { type: Schema.Types.ObjectId, ref: 'Employee' }, active: { type: Boolean, default: true },
  mustChangePassword: { type: Boolean, default: false }, tokenVersion: { type: Number, default: 0 }
}, opts));

const employeeSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  code: { type: String, required: true }, firstName: { type: String, required: true }, lastName: { type: String, required: true },
  email: { type: String, required: true, lowercase: true }, phone: String, address: String, department: String, designation: String,
  joiningDate: { type: Date, required: true }, endDate: Date, status: { type: String, default: 'active' },
  basicSalary: { type: Number, min: 0, default: 0 }, gender: String,
  company: { type: Schema.Types.ObjectId, ref: 'Company', required: true }
}, opts);
employeeSchema.index({ company: 1, code: 1 }, { unique: true });
employeeSchema.index({ company: 1, email: 1 }, { unique: true });
export const Employee = tenantModel('Employee', employeeSchema);

export const Attendance = tenantModel('Attendance', new Schema({
  employee: { type: Schema.Types.ObjectId, ref: 'Employee', required: true }, date: { type: String, required: true },
  checkIn: Date, checkOut: Date, status: { type: String, enum: ['present', 'late', 'half-day'], default: 'present' }, verification: Schema.Types.Mixed
}, opts).index({ employee: 1, date: 1 }, { unique: true }));

export const AttendanceCorrection = tenantModel('AttendanceCorrection', new Schema({
  employee: { type: Schema.Types.ObjectId, ref: 'Employee', required: true }, date: { type: String, required: true },
  requestedCheckIn: Date, requestedCheckOut: Date, reason: { type: String, required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  reviewer: { type: Schema.Types.ObjectId, ref: 'User' }, comment: String, history: [Schema.Types.Mixed]
}, opts));

const leaveTypeSchema = new Schema({ name: { type: String, required: true }, code: { type: String, required: true }, quota: Number, unpaid: { type: Boolean, default: false } }, opts);
leaveTypeSchema.index({ company: 1, code: 1 }, { unique: true });
export const LeaveType = tenantModel('LeaveType', leaveTypeSchema);

const holidaySchema = new Schema({ date: { type: String, required: true }, name: { type: String, required: true } }, opts);
holidaySchema.index({ company: 1, date: 1 }, { unique: true });
export const Holiday = tenantModel('Holiday', holidaySchema);

const departmentSchema = new Schema({ name: { type: String, required: true }, description: String, active: { type: Boolean, default: true } }, opts);
departmentSchema.index({ company: 1, name: 1 }, { unique: true });
export const Department = tenantModel('Department', departmentSchema);

const designationSchema = new Schema({ name: { type: String, required: true }, department: String, active: { type: Boolean, default: true } }, opts);
designationSchema.index({ company: 1, name: 1 }, { unique: true });
export const Designation = tenantModel('Designation', designationSchema);

export const SalaryStructure = tenantModel('SalaryStructure', new Schema({
  employee: { type: Schema.Types.ObjectId, ref: 'Employee', required: true, unique: true }, basicSalary: { type: Number, required: true, min: 1 },
  allowances: { type: Map, of: Number, default: {} }, effectiveFrom: { type: String, required: true }
}, opts));

export const LeaveBalance = tenantModel('LeaveBalance', new Schema({
  employee: { type: Schema.Types.ObjectId, ref: 'Employee', required: true }, type: { type: Schema.Types.ObjectId, ref: 'LeaveType', required: true },
  year: { type: Number, required: true }, used: { type: Number, default: 0, min: 0 }
}, opts).index({ employee: 1, type: 1, year: 1 }, { unique: true }));

export const LeaveRequest = tenantModel('LeaveRequest', new Schema({
  employee: { type: Schema.Types.ObjectId, ref: 'Employee', required: true }, type: { type: Schema.Types.ObjectId, ref: 'LeaveType', required: true },
  start: { type: String, required: true }, end: { type: String, required: true }, days: { type: Number, required: true }, daysByYear: Schema.Types.Mixed,
  reason: { type: String, required: true }, status: { type: String, enum: ['pending', 'approved', 'rejected', 'cancelled'], default: 'pending' },
  reviewer: { type: Schema.Types.ObjectId, ref: 'User' }, comment: String, history: [Schema.Types.Mixed]
}, opts));

const payrollRunSchema = new Schema({
  period: { type: String, required: true }, status: { type: String, enum: ['draft', 'finalized'], default: 'draft' },
  rows: [Schema.Types.Mixed], total: Number, finalizedAt: Date, finalizedBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, opts);
payrollRunSchema.index({ company: 1, period: 1 }, { unique: true });
export const PayrollRun = tenantModel('PayrollRun', payrollRunSchema);

export const Payslip = tenantModel('Payslip', new Schema({
  run: { type: Schema.Types.ObjectId, ref: 'PayrollRun', required: true }, employee: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
  period: String, values: Schema.Types.Mixed
}, opts));
export const Announcement = tenantModel('Announcement', new Schema({
  title: String, body: String, audience: { type: [String], default: ['ADMIN', 'HR', 'EMPLOYEE'] }, author: { type: Schema.Types.ObjectId, ref: 'User' }
}, opts));
export const Notification = tenantModel('Notification', new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true }, title: String, body: String, readAt: Date
}, opts));
export const AuditLog = tenantModel('AuditLog', new Schema({
  actor: { type: Schema.Types.ObjectId, ref: 'User' }, action: String, entityType: String, entityId: String,
  before: Schema.Types.Mixed, after: Schema.Types.Mixed, createdAt: { type: Date, default: Date.now, immutable: true }
}, { versionKey: false }));
export const AiLog = tenantModel('AiLog', new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User' }, action: String, outcome: String, durationMs: Number
}, opts));
