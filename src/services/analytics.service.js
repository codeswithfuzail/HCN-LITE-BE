import { Employee, Attendance, AttendanceCorrection, LeaveRequest, PayrollRun, Payslip, LeaveType, LeaveBalance, Company, Holiday } from '../models/index.js';

export async function getHeadcount(department) {
  const match={status:'active'};if(department)match.department=department;
  const [count,byDepartment]=await Promise.all([Employee.countDocuments(match),Employee.aggregate([{$match:match},{$group:{_id:'$department',count:{$sum:1}}},{$sort:{_id:1}}])]);
  return {activeHeadcount:count,byDepartment};
}
export async function getAttendanceSummary({from,to,department,employeeId}={}) {
  const filter={};if(employeeId)filter.employee=employeeId;if(from||to)filter.date={...(from?{$gte:from}:{}),...(to?{$lte:to}:{})};
  const records=await Attendance.find(filter).populate('employee','firstName lastName code department');
  const scoped=department?records.filter(r=>r.employee?.department===department):records;
  const byStatus=scoped.reduce((out,r)=>(out[r.status]=(out[r.status]||0)+1,out),{});
  return {totalRecords:scoped.length,present:byStatus.present||0,late:byStatus.late||0,halfDay:byStatus['half-day']||0,missingCheckout:scoped.filter(r=>r.checkIn&&!r.checkOut).length,records:scoped.slice(0,100).map(r=>({employee:r.employee?`${r.employee.firstName} ${r.employee.lastName}`:'Employee',code:r.employee?.code,date:r.date,status:r.status,checkIn:r.checkIn,checkOut:r.checkOut}))};
}
export async function getLateComers({from,to,department,limit=10}={}) {
  const filter={status:'late'};if(from||to)filter.date={...(from?{$gte:from}:{}),...(to?{$lte:to}:{})};
  const records=await Attendance.find(filter).populate('employee','firstName lastName code department').sort({date:-1}).limit(Math.min(50,limit));
  return records.filter(r=>!department||r.employee?.department===department).map(r=>({name:`${r.employee?.firstName||''} ${r.employee?.lastName||''}`.trim(),code:r.employee?.code,department:r.employee?.department,date:r.date,checkIn:r.checkIn}));
}
export async function getLeaveSummary({from,to,department}={}) {
  const filter={};if(from||to)filter.start={...(from?{$gte:from}:{}),...(to?{$lte:to}:{})};
  const requests=await LeaveRequest.find(filter).populate('type','name code unpaid').populate('employee','department firstName lastName');
  const scoped=requests.filter(r=>!department||r.employee?.department===department);
  return {total:scoped.length,pending:scoped.filter(r=>r.status==='pending').length,approved:scoped.filter(r=>r.status==='approved').length,rejected:scoped.filter(r=>r.status==='rejected').length,byType:scoped.reduce((out,r)=>{const key=r.type?.code||'unknown';out[key]??={type:r.type?.name||key,requests:0,approvedDays:0};out[key].requests++;if(r.status==='approved')out[key].approvedDays+=r.days;return out;},{})};
}
export async function getPayrollSummary({period}={}) {
  const runs=await PayrollRun.find(period?{period}:{status:'finalized'}).sort({period:-1}).limit(24);
  return {runs:runs.map(r=>({period:r.period,status:r.status,netPayroll:r.total,employees:r.rows.length})),totalNetPayroll:runs.reduce((n,r)=>n+r.total,0)};
}
export async function searchEmployees(query,limit=10) {
  const safe=String(query||'').trim().slice(0,80);if(!safe)return [];
  const regex=new RegExp(safe.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i');
  return Employee.find({$or:[{firstName:regex},{lastName:regex},{code:regex},{department:regex}]})
    .select('firstName lastName code department designation status').limit(Math.min(25,Math.max(1,limit))).lean();
}
export async function getAdminAnalytics({from,to,department}={}) {
  const range={};if(from||to)range.$and=[...(from?[{joiningDate:{$lte:new Date(`${to||'9999-12-31'}T23:59:59.999Z`)}}]:[]),...(to?[{joiningDate:{$lte:new Date(`${to}T23:59:59.999Z`)}}]:[])];
  const match={status:'active',...(department?{department}:{})};
  const [activeHeadcount,totalEmployees,average,gender,employees,departments,payroll,attendance]=await Promise.all([
    Employee.countDocuments(match),Employee.countDocuments(range),Employee.aggregate([{$match:match},{$group:{_id:null,averageSalary:{$avg:'$basicSalary'}}}]),
    Employee.aggregate([{$match:match},{$group:{_id:{$ifNull:['$gender','unspecified']},count:{$sum:1}}}]),
    Employee.find(match).select('joiningDate endDate basicSalary status gender department').lean(),
    Employee.aggregate([{$match:match},{$group:{_id:'$department',headcount:{$sum:1},payrollCost:{$sum:'$basicSalary'}}},{$sort:{_id:1}}]),
    PayrollRun.find({status:'finalized',...(from||to?{period:{...(from?{$gte:from.slice(0,7)}:{}),...(to?{$lte:to.slice(0,7)}:{})}}:{})}).select('period total').sort({period:1}),
    Attendance.aggregate([{$match:{...(from||to?{date:{...(from?{$gte:from}:{}),...(to?{$lte:to}:{})}}:{})}},{$group:{_id:{date:'$date',status:'$status'},count:{$sum:1}}},{$sort:{'_id.date':1}}])
  ]);
  const now=new Date(),tenure=employees.reduce((out,e)=>{const years=(now-new Date(e.joiningDate))/31557600000,key=years<1?'<1 year':years<3?'1–3 years':years<5?'3–5 years':'5+ years';out[key]=(out[key]||0)+1;return out;},{}),separations=employees.filter(e=>e.endDate&&(!from||e.endDate>=new Date(from))&&(!to||e.endDate<=new Date(to))).length;
  return {activeHeadcount,totalEmployees,attrition:{separations,rate:activeHeadcount?Math.round(separations/activeHeadcount*10000)/100:0,denominator:'current active headcount; separation dates within selected range'},averageSalary:Math.round((average[0]?.averageSalary||0)*100)/100,payrollCost:payroll.reduce((s,p)=>s+p.total,0),payrollByPeriod:payroll,byDepartment:departments,genderBreakdown:gender,tenureBreakdown:tenure,attendanceTrends:attendance.map(x=>({date:x._id.date,status:x._id.status,count:x.count}))};
}
export async function getHrAnalytics({from,to,department}={}) {
  const start=from||new Date(Date.now()-29*86400000).toISOString().slice(0,10),end=to||new Date().toISOString().slice(0,10),company=await Company.findOne();
  const [employees,records,leaves,holidays,late,pendingCorrections]=await Promise.all([
    Employee.find({status:'active',...(department?{department}:{})}).select('department'),
    Attendance.find({date:{$gte:start,$lte:end}}).populate('employee','department firstName lastName code'),
    LeaveRequest.find({status:'approved',start:{$lte:end},end:{$gte:start}}).populate('type','unpaid').populate('employee','department'),
    Holiday.find({date:{$gte:start,$lte:end}}).select('date -_id'),
    Attendance.find({status:'late',date:{$gte:start,$lte:end}}).populate('employee','firstName lastName code department').sort({date:-1}),
    AttendanceCorrection.countDocuments({status:'pending'})
  ]);
  const holidaySet=new Set(holidays.map(h=>h.date)),departmentNames=[...new Set(employees.map(e=>e.department||'Unassigned'))],workingDates=[];
  for(let d=new Date(`${start}T00:00:00Z`),last=new Date(`${end}T00:00:00Z`);d<=last;d.setUTCDate(d.getUTCDate()+1))if(!company.weekends.includes(d.getUTCDay())&&!holidaySet.has(d.toISOString().slice(0,10)))workingDates.push(d.toISOString().slice(0,10));
  const trends=workingDates.map(date=>{const day=records.filter(r=>r.date===date);return {date,present:day.filter(r=>r.status==='present').length,late:day.filter(r=>r.status==='late').length,halfDay:day.filter(r=>r.status==='half-day').length};});
  const departmentAbsenteeism=departmentNames.map(name=>{const members=employees.filter(e=>(e.department||'Unassigned')===name),onLeave=leaves.filter(l=>(l.employee?.department||'Unassigned')===name).reduce((n,l)=>n+(l.type?.unpaid?0:Math.min(l.days,workingDates.length)),0),recorded=records.filter(r=>r.employee?.department===name).length,expected=members.length*workingDates.length,absent=Math.max(0,expected-recorded-onLeave);return {department:name,employees:members.length,expectedDays:expected,absentDays:absent,absenteeismRate:expected?Math.round(absent/expected*10000)/100:0};});
  const leaveUtilization=leaves.reduce((out,l)=>{const code=l.type?.code||'unknown';out[code]??={type:l.type?.name||code,days:0};out[code].days+=l.days;return out;},{}),topLateComers=Object.values(late.reduce((out,r)=>{if(!r.employee)return out;const id=String(r.employee.id);out[id]??={employee:`${r.employee.firstName} ${r.employee.lastName}`,code:r.employee.code,department:r.employee.department,count:0};out[id].count++;return out;},{})).sort((a,b)=>b.count-a.count).slice(0,10);
  const endingRecords=records.filter(r=>r.date===end),endingLeaves=leaves.filter(l=>l.start<=end&&l.end>=end);return {range:{from:start,to:end},headcount:employees.length,present:trends.at(-1)?.present||0,late:trends.at(-1)?.late||0,absent:departmentAbsenteeism.reduce((n,d)=>n+d.absentDays,0),onLeave:endingLeaves.length,missingCheckout:endingRecords.filter(r=>r.checkIn&&!r.checkOut).length,pendingLeaveApprovals:await LeaveRequest.countDocuments({status:'pending'}),pendingCorrections,attendanceTrends:trends,departmentAbsenteeism,leaveUtilization,topLateComers};
}
export async function getEmployeeAnalytics(employeeId) {
  const now=new Date(),today=now.toISOString().slice(0,10),weekStart=new Date(now);weekStart.setUTCDate(now.getUTCDate()-((now.getUTCDay()+6)%7));const from=weekStart.toISOString().slice(0,10),[attendance,todayRecord,lateCount,pendingLeaves,types,latestPayslip]=await Promise.all([
    Attendance.find({employee:employeeId,date:{$gte:from,$lte:today}}).sort({date:1}),Attendance.findOne({employee:employeeId,date:today}),Attendance.countDocuments({employee:employeeId,status:'late'}),LeaveRequest.countDocuments({employee:employeeId,status:'pending'}),LeaveType.find(),Payslip.findOne({employee:employeeId}).sort({period:-1})
  ]);const weeklyHours=attendance.reduce((n,r)=>n+(r.checkIn&&r.checkOut?(r.checkOut-r.checkIn)/36e5:0),0),leaveBalances=await Promise.all(types.map(async t=>{if(t.unpaid||t.quota==null)return {type:t.code,name:t.name,quota:null,used:0,remaining:null};const ledger=await LeaveBalance.findOne({employee:employeeId,type:t.id,year:now.getUTCFullYear()}),approved=ledger?null:await LeaveRequest.find({employee:employeeId,type:t.id,status:'approved',start:{$lte:`${now.getUTCFullYear()}-12-31`},end:{$gte:`${now.getUTCFullYear()}-01-01`}}),used=ledger?.used??approved.reduce((n,r)=>n+Number(r.daysByYear?.[now.getUTCFullYear()]??r.days),0);return {type:t.code,name:t.name,quota:t.quota,used,remaining:Math.max(0,t.quota-used)};}));return {today:todayRecord,weeklyHours:Math.round(weeklyHours*100)/100,weeklyTargetHours:40,lateCount,pendingLeaves,leaveBalances,attendance,latestPayslip:latestPayslip?{id:latestPayslip.id,period:latestPayslip.period,net:latestPayslip.values?.net}:null};
}
