const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const F = require('./finance-core.js');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
const source = html.match(/^function buildAdvisorPlan\([^]*?^\}/m)[0];

test('Advisor includes loans and personal debts and never suggests a negative extra payment', () => {
  const context = vm.createContext({ F });
  vm.runInContext(source, context);
  const plan = context.buildAdvisorPlan({ income: 100000, expense: 92000, flexibleExpense: 10000, personalDebt: 135000, loanDebt: 3838303.36, cutPercent: 20 });
  assert.equal(plan.totalDebt, 3973303.36);
  assert.equal(plan.extraForDebt, 10000);
  assert.equal(context.buildAdvisorPlan({ income: 100, expense: 500, flexibleExpense: 0, personalDebt: 0, loanDebt: 0, cutPercent: 20 }).extraForDebt, 0);
});
