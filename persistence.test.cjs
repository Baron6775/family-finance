const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const F=require('./finance-core.js');
const source=fs.readFileSync(__dirname+'/index.html','utf8').match(/^async function saveLoanOperation\([^]*?^\}/m)[0];
function setup({fail=false,exists=true}={}) {
 const initial={id:'test',name:'Test',bodyDebt:100,interestRemaining:10,penalty:0,monthlyPayment:20,nextPaymentDate:'2026-10-01',nextPaymentBreakdown:{body:19,interest:1,penalty:0},asOfDate:'2026-09-01',revision:1};
 const store={loans:exists?{test:structuredClone(initial)}:{},transactions:{}};
 let seq=0,tail=Promise.resolve();
 const db={collection:collection=>({doc:id=>({collection,id:id||'tx-'+(++seq)})}),runTransaction:callback=>{
   const run=tail.then(async()=>{const pending=[];await callback({get:async ref=>({exists:!!store[ref.collection][ref.id],data:()=>structuredClone(store[ref.collection][ref.id])}),set:(ref,data)=>pending.push([ref,structuredClone(data)])});if(fail)throw Error('Network failure');for(const [ref,data]of pending)store[ref.collection][ref.id]=data;});tail=run.catch(()=>{});return run;
 }};
 const ctx=vm.createContext({F,db,initialLoans:[initial],COLLECTION:'transactions',todayISO:()=> '2026-09-22'});
 vm.runInContext(source,ctx);return {ctx,store};
}
test('Atomic persistence: loan and transaction agree',async()=>{
 const {ctx,store}=setup();await ctx.saveLoanOperation('test','2026-09-22','andrey',20,'body');
 assert.equal(store.loans.test.bodyDebt,80);assert.equal(store.loans.test.revision,2);
 const tx=Object.values(store.transactions)[0];assert.equal(tx.amount,20);assert.equal(tx.breakdown.body,20);assert.equal(tx.loanId,'test');
});
test('Failed write does not change the loan or create a transaction',async()=>{
 const {ctx,store}=setup({fail:true});await assert.rejects(ctx.saveLoanOperation('test','2026-09-22','andrey',20,'body'));
 assert.equal(store.loans.test.bodyDebt,100);assert.equal(Object.keys(store.transactions).length,0);
});
test('Concurrent serialized payments read the latest balance',async()=>{
 const {ctx,store}=setup();const results=await Promise.allSettled([ctx.saveLoanOperation('test','2026-09-22','andrey',60,'body'),ctx.saveLoanOperation('test','2026-09-22','lera',60,'body')]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(store.loans.test.bodyDebt,40);assert.equal(Object.keys(store.transactions).length,1);
});
test('Unreconciled loans cannot silently use embedded balances',async()=>{
 const {ctx,store}=setup({exists:false});await assert.rejects(ctx.saveLoanOperation('test','2026-09-22','andrey',20,'body'));assert.equal(Object.keys(store.transactions).length,0);
});
test('Reject future and pre-reconciliation payment dates',async()=>{
 const {ctx}=setup();await assert.rejects(ctx.saveLoanOperation('test','2026-09-23','andrey',20,'body'));await assert.rejects(ctx.saveLoanOperation('test','2026-08-01','andrey',20,'body'));
});

