import { User, Attendance, Leave } from './models.js';
import { leaveBalance, today } from './rules.js';
const KEY = () => process.env.OPENAI_API_KEY, MODEL = () => process.env.OPENAI_MODEL || 'gpt-4o-mini';
const call = async (body) => { const r = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', signal: AbortSignal.timeout(15000),
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + KEY() }, body: JSON.stringify({ model: MODEL(), ...body }) });
  const d = await r.json(); if (!r.ok) throw new Error(d.error?.message || 'AI error'); return d.choices[0].message; };
const tools = [['get_headcount', 'Active employee count by department'], ['get_late_comers', 'Employees ranked by late count this month'],
  ['get_attendance_summary', 'Attendance status counts for a month'], ['who_is_on_leave_today', 'Approved leaves covering today'],
  ['get_my_leave_balance', 'Logged-in user leave balance this year']].map(([name, description]) => ({ type: 'function', function: { name, description, parameters: { type: 'object', properties: {} } } }));
const run = async (name, u) => {
  const staff = u.role !== 'employee', mine = staff ? {} : { user: u._id }, mo = today().slice(0, 7), re = { $regex: '^' + mo };
  if (name === 'get_my_leave_balance') return leaveBalance(u._id);
  if (!staff && name !== 'get_attendance_summary') return { error: 'Not allowed for your role' };
  if (name === 'get_headcount') { const us = await User.find({ role: 'employee', active: true }); const by = {}; us.forEach(x => by[x.dept || 'n/a'] = (by[x.dept || 'n/a'] || 0) + 1); return { total: us.length, by }; }
  if (name === 'get_late_comers') return Attendance.aggregate([{ $match: { status: 'late', date: re } }, { $group: { _id: '$user', lates: { $sum: 1 } } }, { $sort: { lates: -1 } }, { $limit: 5 },
    { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'u' } }, { $project: { name: { $first: '$u.name' }, lates: 1, _id: 0 } }]);
  if (name === 'get_attendance_summary') return Attendance.aggregate([{ $match: { ...mine, date: re } }, { $group: { _id: '$status', n: { $sum: 1 } } }]);
  if (name === 'who_is_on_leave_today') return (await Leave.find({ status: 'approved', start: { $lte: today() }, end: { $gte: today() } }).populate('user', 'name')).map(l => ({ name: l.user?.name, type: l.type }));
  return { error: 'unknown tool' }; };
export async function chat(message, u) {
  if (!KEY()) throw new Error('OPENAI_API_KEY not set');
  const msgs = [{ role: 'system', content: `You are HCM Lite assistant for ${u.name} (role: ${u.role}). Today ${today()}. Answer only from tool results. Never reveal other employees' salaries or data to employees; politely refuse. Policy: office 09:00, grace 15 min, late after 09:15, half day under 5h, weekend Sat-Sun, quotas annual 14/sick 8/casual 10, unpaid unlimited, payroll gross=1.5x basic, Admin finalizes payroll. If unknown, say you don't know. Be brief.` }, { role: 'user', content: message }];
  for (let i = 0; i < 3; i++) { const m = await call({ messages: msgs, tools }); msgs.push(m);
    if (!m.tool_calls) return m.content;
    for (const t of m.tool_calls) msgs.push({ role: 'tool', tool_call_id: t.id, content: JSON.stringify(await run(t.function.name, u)) }); }
  return 'Could not complete the request.'; }
export async function smartLeave(text) {
  const m = await call({ response_format: { type: 'json_object' }, messages: [{ role: 'system', content: `Today is ${today()}. Return JSON only: {"type":"annual|sick|casual|unpaid","start":"YYYY-MM-DD","end":"YYYY-MM-DD","reason":"..."}` }, { role: 'user', content: text }] });
  const j = JSON.parse(m.content); if (!j.start || !j.end || !j.type) throw new Error('bad'); return j; }
