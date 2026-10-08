const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
const source = html.match(/^function countActiveCashFlowMonths\([^]*?^\}/m)[0];

test('Average statistic counts only months with cash flow', () => {
  const items = [
    { date: '2026-09-17', type: 'debt-opening-owe', amount: 35000 },
    { date: '2026-10-03', type: 'income', amount: 1000 },
    { date: '2026-10-04', type: 'expense', amount: 2500 },
    { date: '2026-10-05', type: 'transfer', amount: 2000 }
  ];
  const context = vm.createContext({
    getMonthItems: (year, month) => items.filter((item) => item.date.startsWith(`${year}-${String(month + 1).padStart(2, '0')}`)),
    sumIncomes: (rows) => rows.filter((item) => item.type === 'income').reduce((sum, item) => sum + item.amount, 0),
    sumExpenses: (rows) => rows.filter((item) => item.type === 'expense').reduce((sum, item) => sum + item.amount, 0)
  });
  vm.runInContext(source, context);
  assert.equal(context.countActiveCashFlowMonths(2026), 1);
});
