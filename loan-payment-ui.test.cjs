const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
const source = html.match(/^function openLoanPayModal\([^]*?^\}/m)[0];

test('Payment modal pre-fills the latest reconciled payment breakdown', () => {
  const elements = new Map();
  const element = (id) => elements.get(id) || elements.set(id, {
    value: '', textContent: '', classList: { add() {} }
  }).get(id);
  const loan = {
    id: 'loan-1', name: 'Кредит №1', isPersonalDebt: false,
    nextPaymentBreakdown: { body: 6536.5, interest: 6499.73, penalty: 81.97 }
  };
  const context = vm.createContext({
    LOANS: [loan], activeLoanId: null, currentRole: 'andrey', todayISO: () => '2026-10-07',
    document: { body: { style: {} }, getElementById: element },
    updateActualPayment() {}
  });
  vm.runInContext(source, context);
  context.openLoanPayModal('loan-1');
  assert.equal(element('actual-body').value, '6536.50');
  assert.equal(element('actual-interest').value, '6499.73');
  assert.equal(element('actual-penalty').value, '81.97');
  assert.equal(element('loanPayOwner').value, 'andrey');
});
