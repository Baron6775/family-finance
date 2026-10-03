Attempting to perform the InitializeDefaultDrives operation on the 'FileSystem' provider failed.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');

const html = fs.readFileSync('./index.html', 'utf8');
const source = html.match(/^function calcCurrentAccount\([^]*?^\}/m)[0];

test('cash operations affect only the shared cash balance while retaining their author', () => {
  const context = vm.createContext({
    accounts: { andrey: 1000, lera: 500, cash: 200 },
    items: [
      { owner: 'andrey', type: 'expense', amount: 60, paymentSource: 'cash' },
      { owner: 'lera', type: 'income', amount: 20, paymentSource: 'cash' },
      { owner: 'andrey', type: 'expense', amount: 40 },
      { owner: 'lera', type: 'income', amount: 10, paymentSource: 'bank' }
    ],
    isIncomeLike: (type) => ['income', 'debt-in', 'debt-get'].includes(type),
    isExpenseLike: (type) => ['expense', 'debt-out', 'debt-give', 'loan-payment'].includes(type)
  });
  vm.runInContext(source, context);
  assert.equal(context.calcCurrentAccount('andrey'), 960);
  assert.equal(context.calcCurrentAccount('lera'), 510);
  assert.equal(context.calcCurrentAccount('cash'), 160);
});

