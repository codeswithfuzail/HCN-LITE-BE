import mongoose from 'mongoose';
const { Schema, model, models } = mongoose;
const ref = { type: Schema.Types.ObjectId, ref: 'User' };
const m = (n, s) => models[n] || model(n, new Schema(s, { timestamps: true }));
export const User = m('User', { name: String, email: { type: String, unique: true, lowercase: true }, password: String,
  role: { type: String, enum: ['admin', 'hr', 'employee'], default: 'employee' }, mustChange: { type: Boolean, default: false },
  active: { type: Boolean, default: true }, dept: String, designation: String, basic: { type: Number, default: 0 }, phone: String });
export const Attendance = m('Attendance', { user: ref, date: String, checkIn: Date, checkOut: Date, status: String });
export const Leave = m('Leave', { user: ref, type: String, start: String, end: String, days: Number, reason: String,
  status: { type: String, default: 'pending' }, comment: String });
export const Payroll = m('Payroll', { month: { type: String, unique: true }, rows: Array, finalized: { type: Boolean, default: false } });
export const Setting = m('Setting', { company: String, start: { type: String, default: '09:00' }, grace: { type: Number, default: 15 } });
export const Audit = m('Audit', { actor: String, action: String, entity: String, detail: Object });
