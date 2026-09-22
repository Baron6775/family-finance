const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const html=fs.readFileSync(__dirname+'/index.html','utf8');
const extract=name=>html.match(new RegExp('^function '+name+'\\([^]*?^\\}', 'm'))[0];
function setup(){
 const fields={transferFrom:{value:'andrey'},transferAmount:{value:'123.45'},transferDate:{value:'2026-09-22'}};
 const c=vm.createContext({F:require('./finance-core.js'),accounts:{andrey:1000,lera:500},items:[],OWNER_LABEL:{andrey:'Андрей',lera:'Леруська'},todayISO:()=> '2026-09-22',isIncomeLike:t=>['income','debt-in','debt-get'].includes(t),isExpenseLike:t=>['expense','debt-out','debt-give','loan-payment'].includes(t),document:{getElementById:id=>fields[id]},withWrite:fn=>fn(),COLLECTION:'transactions',renderAll:()=>{},currentYear:2026,currentMonth:8});
 c.db={collection:()=>({add:async data=>c.items.push(data)})};
 vm.runInContext(['transferData','calcCurrentAccount','sumIncomes','sumExpenses','transferMoney'].map(extract).join('\n'),c);
 return {c,fields};
}
test('Transfers in both directions conserve total and do not affect cash-flow statistics',()=>{
 for(const from of ['andrey','lera']){
  const {c}=setup(),to=from==='andrey'?'lera':'andrey';
  const before=c.calcCurrentAccount(from),recipientBefore=c.calcCurrentAccount(to);
  c.items.push(c.transferData(from,to,'123.45','2026-09-22'));
  assert.equal(c.calcCurrentAccount(from),before-123.45);
  assert.equal(c.calcCurrentAccount(to),recipientBefore+123.45);
  assert.equal(c.calcCurrentAccount('andrey')+c.calcCurrentAccount('lera'),1500);
  assert.equal(c.sumIncomes(c.items),0);assert.equal(c.sumExpenses(c.items),0);
 }
});
test('Deleting one transfer reverses both sides',()=>{
 const {c}=setup();c.items.push(c.transferData('andrey','lera',100,'2026-09-22'));c.items.pop();
 assert.equal(c.calcCurrentAccount('andrey'),1000);assert.equal(c.calcCurrentAccount('lera'),500);
});
test('Reject same account, unknown account, invalid amounts and future dates',()=>{
 const {c}=setup();
 for(const args of [['andrey','andrey',100],['unknown','lera',100],['andrey','lera',0],['andrey','lera',-1],['andrey','lera',Infinity],['andrey','lera',1.001]])assert.throws(()=>c.transferData(...args,'2026-09-22'));
 assert.throws(()=>c.transferData('andrey','lera',100,'2026-09-23'));
});
test('One write records both sides of a transfer',async()=>{
 const {c,fields}=setup();await c.transferMoney();assert.equal(c.items.length,1);
 assert.equal(c.items[0].recipient,'lera');assert.equal(c.items[0].amount,123.45);assert.equal(fields.transferAmount.value,'');
});
test('Failed transfer leaves both balances and entered amount unchanged',async()=>{
 const {c,fields}=setup();c.db={collection:()=>({add:async()=>{throw Error('Network failure');}})};
 await assert.rejects(c.transferMoney());assert.equal(c.items.length,0);
 assert.equal(c.calcCurrentAccount('andrey'),1000);assert.equal(c.calcCurrentAccount('lera'),500);assert.equal(fields.transferAmount.value,'123.45');
});

