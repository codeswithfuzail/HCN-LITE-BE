import 'dotenv/config';
import express from 'express'; import cors from 'cors'; import mongoose from 'mongoose';
import bcrypt from 'bcryptjs'; import jwt from 'jsonwebtoken';
import { User, Attendance, Leave, Payroll, Setting, Audit } from './models.js';
import { today, minutesNow, workdays, isWork, settings, leaveBalance, payrollRows, QUOTA } from './rules.js';
import { chat, smartLeave } from './ai.js';

const app = express(); app.use(cors()); app.use(express.json());
let conn; app.use(async (_, res, next) => { try { conn ||= mongoose.connect(process.env.MONGO_URI); await conn; next(); } catch (e) { conn = null; res.status(500).json({ error: 'DB connection failed' }); } });
const wrap = (f) => (req, res) => Promise.resolve(f(req, res)).catch(e => res.status(e.code || 500).json({ error: e.message }));
const fail = (code, message) => Object.assign(new Error(message), { code });
const sign = (u) => jwt.sign({ id: u._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
const pub = (u) => ({ id: u._id, name: u.name, email: u.email, role: u.role, mustChange: u.mustChange });
const auth = (...roles) => async (req, res, next) => { try {
  const u = await User.findById(jwt.verify((req.headers.authorization || '').slice(7), process.env.JWT_SECRET).id);
  if (!u || !u.active) return res.status(401).json({ error: 'Unauthorized' });
  if (roles.length && !roles.includes(u.role)) return res.status(403).json({ error: 'Forbidden' });
  req.user = u; next(); } catch { res.status(401).json({ error: 'Unauthorized' }); } };
const log = (u, action, entity, detail) => Audit.create({ actor: u.email, action, entity, detail });
const api = express.Router(); app.use('/api', api);

// Auth (first-run setup = signup)
api.get('/auth/status', wrap(async (_, res) => res.json({ needsSetup: !(await User.countDocuments()) })));
api.post('/auth/setup', wrap(async (req, res) => {
  if (await User.countDocuments()) throw fail(403, 'Setup already done');
  const { company, name, email, password } = req.body; if (!company || !name || !email || (password || '').length < 6) throw fail(422, 'All fields required, password min 6');
  await Setting.create({ company }); const u = await User.create({ name, email, role: 'admin', password: await bcrypt.hash(password, 10) });
  res.json({ token: sign(u), user: pub(u) }); }));
api.post('/auth/login', wrap(async (req, res) => {
  const u = await User.findOne({ email: (req.body.email || '').toLowerCase() });
  if (!u || !u.active || !(await bcrypt.compare(req.body.password || '', u.password))) throw fail(401, 'Invalid email or password');
  res.json({ token: sign(u), user: pub(u) }); }));
api.get('/auth/me', auth(), (req, res) => res.json({ user: pub(req.user) }));
api.post('/auth/change-password', auth(), wrap(async (req, res) => {
  if ((req.body.password || '').length < 6) throw fail(422, 'Min 6 characters');
  req.user.password = await bcrypt.hash(req.body.password, 10); req.user.mustChange = false; await req.user.save(); res.json({ user: pub(req.user) }); }));

// Setup & users
api.get('/settings', auth(), wrap(async (_, res) => res.json(await settings())));
api.put('/settings', auth('admin'), wrap(async (req, res) => { const s = await Setting.findOneAndUpdate({}, req.body, { upsert: true, new: true }); await log(req.user, 'update', 'settings', req.body); res.json(s); }));
api.post('/hr', auth('admin'), wrap(async (req, res) => { const { name, email, password } = req.body;
  const u = await User.create({ name, email, role: 'hr', password: await bcrypt.hash(password, 10), mustChange: true }); await log(req.user, 'create', 'hr', { email }); res.json(pub(u)); }));

// Employees
api.get('/employees', auth('admin', 'hr'), wrap(async (req, res) => { const { q = '', page = 1 } = req.query, re = new RegExp(q, 'i');
  res.json(await User.find({ role: { $ne: 'admin' }, $or: [{ name: re }, { email: re }, { dept: re }] }).select('-password').sort('-createdAt').skip((page - 1) * 20).limit(20)); }));
api.post('/employees', auth('hr'), wrap(async (req, res) => { const { name, email, dept, designation, basic, phone, password } = req.body;
  if (!name || !email || !(basic > 0) || (password || '').length < 6) throw fail(422, 'name, email, salary > 0 and temp password (min 6) required');
  const u = await User.create({ name, email, dept, designation, basic, phone, password: await bcrypt.hash(password, 10), mustChange: true });
  await log(req.user, 'create', 'employee', { email }); res.json(pub(u)); }));
api.patch('/employees/:id', auth('admin', 'hr'), wrap(async (req, res) => { const b = req.body;
  const patch = req.user.role === 'admin' ? { active: b.active } : { dept: b.dept, designation: b.designation, basic: b.basic, phone: b.phone };
  const u = await User.findByIdAndUpdate(req.params.id, patch, { new: true }).select('-password'); await log(req.user, 'update', 'employee', patch); res.json(u); }));

// Attendance
api.post('/attendance/checkin', auth('hr', 'employee'), wrap(async (req, res) => {
  const date = today(); if (await Attendance.findOne({ user: req.user._id, date })) throw fail(409, 'Already checked in today');
  const s = await settings(), [h, m] = s.start.split(':').map(Number);
  res.json(await Attendance.create({ user: req.user._id, date, checkIn: new Date(), status: minutesNow() > h * 60 + m + s.grace ? 'late' : 'present' })); }));
api.post('/attendance/checkout', auth('hr', 'employee'), wrap(async (req, res) => {
  const a = await Attendance.findOne({ user: req.user._id, date: today() }); if (!a) throw fail(404, 'Check in first'); if (a.checkOut) throw fail(409, 'Already checked out');
  a.checkOut = new Date(); if ((a.checkOut - a.checkIn) / 36e5 < 5) a.status = 'half_day'; res.json(await a.save()); }));
api.get('/attendance', auth(), wrap(async (req, res) => { const f = req.user.role === 'employee' ? { user: req.user._id } : {}; if (req.query.date) f.date = req.query.date;
  res.json(await Attendance.find(f).populate('user', 'name').sort('-date').limit(100)); }));

// Leave
api.post('/leave', auth('hr', 'employee'), wrap(async (req, res) => { const { type, start, end, reason } = req.body;
  if (!start || !end || end < start || !(type in { ...QUOTA, unpaid: 1 })) throw fail(422, 'Invalid leave');
  const days = workdays(start, end); if (!days) throw fail(422, 'No working days in range');
  if (await Leave.findOne({ user: req.user._id, status: { $in: ['pending', 'approved'] }, start: { $lte: end }, end: { $gte: start } })) throw fail(422, 'Overlaps another leave');
  if (type !== 'unpaid') { const b = (await leaveBalance(req.user._id))[type]; if (b.used + days > b.quota) throw fail(422, `Over balance: ${b.quota - b.used} ${type} days left`); }
  res.json(await Leave.create({ user: req.user._id, type, start, end, days, reason })); }));
api.get('/leave', auth(), wrap(async (req, res) => res.json(await Leave.find(req.user.role === 'employee' ? { user: req.user._id } : {}).populate('user', 'name').sort('-createdAt').limit(100))));
api.get('/leave/balance', auth(), wrap(async (req, res) => res.json(await leaveBalance(req.user._id))));
api.patch('/leave/:id', auth('hr'), wrap(async (req, res) => { const l = await Leave.findById(req.params.id); if (!l) throw fail(404, 'Not found');
  if (l.status === 'approved' && req.body.status === 'approved') throw fail(409, 'Already approved');
  l.status = req.body.status === 'approved' ? 'approved' : 'rejected'; l.comment = req.body.comment; await l.save(); await log(req.user, l.status, 'leave', { id: l._id }); res.json(l); }));
api.delete('/leave/:id', auth('hr', 'employee'), wrap(async (req, res) => { const l = await Leave.findOne({ _id: req.params.id, user: req.user._id, status: 'pending' }); if (!l) throw fail(404, 'Only own pending leave can be cancelled'); await l.deleteOne(); res.json({ ok: true }); }));

// Payroll
api.get('/payroll', auth(), wrap(async (req, res) => { const ps = await Payroll.find().sort('-month');
  res.json(req.user.role === 'employee' ? ps.filter(p => p.finalized).map(p => ({ month: p.month, rows: p.rows.filter(r => String(r.user) === String(req.user._id)) })) : ps); }));
api.post('/payroll/run', auth('hr'), wrap(async (req, res) => { const month = req.body.month; if (!/^\d{4}-\d{2}$/.test(month)) throw fail(422, 'month = YYYY-MM');
  const ex = await Payroll.findOne({ month }); if (ex?.finalized) throw fail(409, 'Month is finalized');
  const p = await Payroll.findOneAndUpdate({ month }, { rows: await payrollRows(month) }, { upsert: true, new: true }); await log(req.user, 'create', 'payroll', { month }); res.json(p); }));
api.post('/payroll/:month/finalize', auth('admin'), wrap(async (req, res) => { const p = await Payroll.findOneAndUpdate({ month: req.params.month }, { finalized: true }, { new: true }); if (!p) throw fail(404, 'Run payroll first');
  await log(req.user, 'finalize', 'payroll', { month: p.month }); res.json(p); }));

// Dashboard, audit, announcements-lite
api.get('/dashboard', auth(), wrap(async (req, res) => { const d = today(), mo = d.slice(0, 7), u = req.user;
  if (u.role === 'employee') { const recs = await Attendance.find({ user: u._id, date: { $regex: '^' + mo } });
    return res.json({ late: recs.filter(r => r.status === 'late').length, present: recs.length, balance: await leaveBalance(u._id), today: recs.find(r => r.date === d) || null }); }
  const heads = await User.countDocuments({ role: 'employee', active: true }), todayRecs = await Attendance.find({ date: d });
  const onLeave = await Leave.countDocuments({ status: 'approved', start: { $lte: d }, end: { $gte: d } }), pending = await Leave.countDocuments({ status: 'pending' });
  const byDept = await User.aggregate([{ $match: { role: 'employee', active: true } }, { $group: { _id: '$dept', n: { $sum: 1 }, avgGross: { $avg: { $multiply: ['$basic', 1.5] } } } }]);
  res.json({ headcount: heads, present: todayRecs.length, late: todayRecs.filter(r => r.status === 'late').length, onLeave, pending, byDept,
    rate: heads && isWork(d) ? Math.round(100 * todayRecs.length / Math.max(1, heads - onLeave)) : 0 }); }));
api.get('/audit', auth('admin'), wrap(async (_, res) => res.json(await Audit.find().sort('-createdAt').limit(100))));

// AI
const aiGuard = new Map(); const limit = (req, res, next) => { const k = req.user.id, now = Date.now(), a = (aiGuard.get(k) || []).filter(t => now - t < 36e5);
  if (a.length >= 20) return res.status(429).json({ error: 'AI limit: 20 requests/hour' }); aiGuard.set(k, [...a, now]); next(); };
api.post('/ai/chat', auth(), limit, wrap(async (req, res) => { try { res.json({ answer: await chat(req.body.message, req.user), label: 'AI-generated' }); }
  catch (e) { res.json({ answer: 'AI is unavailable right now. Please try the dashboard.', error: e.message }); } }));
api.post('/ai/leave', auth('hr', 'employee'), limit, wrap(async (req, res) => { try { res.json(await smartLeave(req.body.text)); } catch { res.status(502).json({ error: 'Could not understand. Use the normal form.' }); } }));
api.post('/ai/summary', auth('admin', 'hr'), limit, wrap(async (req, res) => { try { res.json({ answer: await chat('Summarize these KPIs in 3-5 bullets using only these numbers: ' + JSON.stringify(req.body.kpis), req.user) }); }
  catch { res.json({ answer: 'Summary unavailable.' }); } }));

if (!process.env.VERCEL) app.listen(process.env.PORT || 5000, () => console.log('API on', process.env.PORT || 5000));
export default app;
