const {test}=require('node:test');
const assert=require('node:assert/strict');
const F=require('./finance-core.js');
const loan={bodyDebt:10000,interestRemaining:2000,penalty:50,monthlyPayment:1000,rate:12,nextPaymentDate:'2026-01-31',nextPaymentBreakdown:{body:900,interest:100,penalty:10}};
test('Reject invalid amounts and precision',()=>{
 for(const n of ['',NaN,Infinity,-1,0,1.001,1e13]) assert.throws(()=>F.amount(n));
 assert.equal(F.amount('0.01'),.01); assert.equal(F.amount(0,true),0);
});
test('Validate real calendar dates',()=>{
 assert.throws(()=>F.date('2026-02-30')); assert.throws(()=>F.date('2026-13-01'));
 assert.equal(F.date('2028-02-29'),'2028-02-29');
});
test('Month end and leap-year arithmetic',()=>{
 assert.equal(F.addMonths('2026-01-31',1),'2026-02-28');
 assert.equal(F.addMonths('2028-01-31',1),'2028-02-29');
 assert.equal(F.addMonths('2026-12-31',1),'2027-01-31');
});
test('Schedule conserves principal and ends at zero',()=>{
 const rows=F.schedule(loan);
 assert.equal(rows.at(-1).remain,0);
 assert.equal(F.money(rows.reduce((s,r)=>s+r.body,0)),10000);
 for(const r of rows) assert.equal(F.money(r.body+r.interest),r.payment);
 assert.equal(rows[2].date,'2026-03-31');
});
test('Zero rate and non-amortizing payments',()=>{
 assert.equal(F.schedule({...loan,rate:0}).length,10);
 assert.throws(()=>F.schedule({...loan,monthlyPayment:100}));
 assert.deepEqual(F.schedule({...loan,bodyDebt:0,monthlyPayment:0}),[]);
});
test('Zero prepayment gives no fake savings',()=>{
 for(const strategy of ['reduce_term','reduce_payment']) assert.equal(F.prepay(loan,0,strategy).savings,0);
});
test('Prepayment reduces term or payment and handles full payoff',()=>{
 const term=F.prepay(loan,3000,'reduce_term'),pay=F.prepay(loan,3000,'reduce_payment');
 assert.ok(term.months<F.schedule(loan).length); assert.ok(pay.newMonthly<loan.monthlyPayment);
 assert.ok(term.savings>0); assert.ok(pay.savings>0);
 assert.equal(F.prepay(loan,10000,'reduce_term').newMonthly,0);
 assert.equal(F.prepay({...loan,rate:0},3000,'reduce_payment').newMonthly,700);
 assert.throws(()=>F.prepay(loan,10001,'reduce_term'));
});
test('Payment must equal breakdown and does not mutate original',()=>{
 const old=JSON.stringify(loan), {next,breakdown}=F.payment(loan,1010,'regular');
 assert.equal(next.bodyDebt,9100); assert.equal(next.interestRemaining,1900); assert.equal(next.penalty,40);
 assert.equal(next.nextPaymentDate,'2026-01-31');
 assert.equal(F.money(breakdown.body+breakdown.interest+breakdown.penalty),1010);
 assert.equal(JSON.stringify(loan),old); assert.throws(()=>F.payment(loan,100,'regular'));
});
test('Personal and interest payments never overpay balances',()=>{
 assert.throws(()=>F.payment(loan,10001,'personal'));
 assert.throws(()=>F.payment(loan,2001,'interest'));
 const {next}=F.payment(loan,200,'interest');
 assert.equal(next.bodyDebt,10000); assert.equal(next.interestRemaining,1800);
 assert.equal(F.payment(loan,10000,'personal').next.bodyDebt,0);
});

