import test from 'node:test';
import assert from 'node:assert/strict';
import { annualTax, monthlyPayroll, calculatePayrollRow } from '../src/services/payroll.service.js';

test('illustrative tax slabs apply progressive marginal rates', () => {
  assert.equal(annualTax(600000), 0);
  assert.equal(annualTax(1200000), 30000);
  assert.equal(annualTax(1800000), 120000);
  assert.equal(annualTax(3000000), 360000);
  assert.equal(annualTax(4200000), 720000);
});
test('monthly salary components and tax are rounded to paisa', () => {
  assert.deepEqual(monthlyPayroll(100000), { basic:100000, hra:40000, medical:10000, gross:150000, deductions:0, tax:10000, net:140000 });
});
test('payroll prorates joining month and deducts absence, unpaid leave and half days', () => {
  const row=calculatePayrollRow({basicSalary:100000,monthWorkingDays:20,employeeWorkingDays:10,absentDays:1,unpaidLeaveDays:1,halfDays:2});
  assert.equal(row.gross,75000);
  assert.equal(row.deductions,22500);
  assert.equal(row.net,row.gross-row.deductions-row.tax);
});
