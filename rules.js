import { Attendance, Leave, User, Setting } from './models.js';
const TZ = process.env.TZ_NAME || 'Asia/Karachi';
export const QUOTA = { annual: 14, sick: 8, casual: 10 };
export const today = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ });
export const minutesNow = () => { const [h, mi] = new Date().toLocaleTimeString('en-GB', { timeZone: TZ, hour12: false }).split(':'); return +h * 60 + +mi; };
export const isWork = (d) => { const w = new Date(d + 'T00:00:00Z').getUTCDay(); return w !== 0 && w !== 6; };
export const workdays = (a, b) => { let n = 0; for (let d = new Date(a + 'T00:00:00Z'); d <= new Date(b + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) if (isWork(d.toISOString().slice(0, 10))) n++; return n; };
export const monthRange = (m) => { const [y, mo] = m.split('-').map(Number); return [`${m}-01`, `${m}-${String(new Date(y, mo, 0).getDate()).padStart(2, '0')}`]; };
export const settings = async () => (await Setting.findOne()) || { start: '09:00', grace: 15 };
export async function leaveBalance(userId) {
  const yr = today().slice(0, 4), ls = await Leave.find({ user: userId, status: 'approved', start: { $regex: '^' + yr } });
  return Object.fromEntries(Object.entries(QUOTA).map(([t, q]) => [t, { quota: q, used: ls.filter(l => l.type === t).reduce((s, l) => s + l.days, 0) }]));
}
export function tax(gross) { const a = gross * 12; let t = 0;
  if (a > 3.6e6) t = 510000 + .35 * (a - 3.6e6); else if (a > 2.4e6) t = 210000 + .25 * (a - 2.4e6); else if (a > 1.2e6) t = 30000 + .15 * (a - 1.2e6); else if (a > 6e5) t = .05 * (a - 6e5);
  return Math.round(t / 12); }
export async function payrollRows(month) {
  const [a, b] = monthRange(month), end = today() < b ? today() : b, wd = workdays(a, b), past = a > end ? 0 : workdays(a, end), rows = [];
  for (const u of await User.find({ role: 'employee', active: true })) {
    const recs = await Attendance.find({ user: u._id, date: { $gte: a, $lte: b } });
    const ls = await Leave.find({ user: u._id, status: 'approved', start: { $lte: b }, end: { $gte: a } });
    const unpaid = ls.filter(l => l.type === 'unpaid').reduce((s, l) => s + l.days, 0), paidLeave = ls.reduce((s, l) => s + l.days, 0) - unpaid;
    const half = recs.filter(r => r.status === 'half_day').length, absent = Math.max(0, past - recs.length - paidLeave - unpaid);
    const gross = u.basic * 1.5, day = gross / wd, ded = Math.round(day * (absent + unpaid + .5 * half)), tx = tax(gross);
    rows.push({ user: u._id, name: u.name, basic: u.basic, gross, absent, unpaid, half, deductions: ded, tax: tx, net: Math.round(gross - ded - tx) });
  } return rows; }
