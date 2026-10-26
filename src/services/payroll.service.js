// Challenge-only illustrative annual slabs. The computed annual tax is split evenly by 12.
export function annualTax(annualTaxableGross) {
  const value = Math.max(0, Number(annualTaxableGross) || 0);
  if (value <= 600000) return 0;
  if (value <= 1200000) return (value - 600000) * 0.05;
  if (value <= 2400000) return 30000 + (value - 1200000) * 0.15;
  if (value <= 3600000) return 210000 + (value - 2400000) * 0.25;
  return 510000 + (value - 3600000) * 0.35;
}
export function monthlyPayroll(basicSalary) {
  const basic = Math.round(Number(basicSalary) * 100) / 100;
  const hra = Math.round(basic * 0.4 * 100) / 100;
  const medical = Math.round(basic * 0.1 * 100) / 100;
  const gross = Math.round((basic + hra + medical) * 100) / 100;
  const tax = Math.round((annualTax(gross * 12) / 12) * 100) / 100;
  return { basic, hra, medical, gross, deductions: 0, tax, net: Math.round((gross - tax) * 100) / 100 };
}

export function calculatePayrollRow({ basicSalary, monthWorkingDays, employeeWorkingDays, absentDays = 0, unpaidLeaveDays = 0, halfDays = 0 }) {
  const base=monthlyPayroll(basicSalary),ratio=monthWorkingDays>0?Math.min(1,employeeWorkingDays/monthWorkingDays):0;
  const basic=Math.round(base.basic*ratio*100)/100,hra=Math.round(base.hra*ratio*100)/100,medical=Math.round(base.medical*ratio*100)/100;
  const gross=Math.round((basic+hra+medical)*100)/100,dailySalary=monthWorkingDays?base.gross/monthWorkingDays:0;
  const deductions=Math.round(dailySalary*(absentDays+unpaidLeaveDays+halfDays*.5)*100)/100;
  const tax=Math.round((annualTax(gross*12)/12)*100)/100;
  return {basic,hra,medical,gross,dailySalary:Math.round(dailySalary*100)/100,absentDays,unpaidLeaveDays,halfDays,deductions,tax,net:Math.round((gross-deductions-tax)*100)/100};
}
