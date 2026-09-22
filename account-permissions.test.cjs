const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const html=fs.readFileSync(__dirname+'/index.html','utf8');
const extract=name=>html.match(new RegExp('^function '+name+'\\([^]*?^\\}', 'm'))[0];
function setup(role) {
 const rows=Array.from({length:2},()=>({hidden:false,controls:[{disabled:false},{disabled:false}],classList:{toggle(_,hidden){this.row.hidden=hidden;}},querySelectorAll(){return this.controls;}}));
 rows.forEach(row=>row.classList.row=row);
 const input={value:'123.45'},writes=[],errors=[];
 const context=vm.createContext({getCurrentUserRole:()=>role,document:{querySelectorAll:()=>rows,getElementById:()=>input},setStatus:message=>errors.push(message),withWrite:action=>action(),ACCOUNTS_COLLECTION:'accounts',F:{money:n=>n},db:{collection:()=>({doc:()=>({set:async(data)=>writes.push(data)})})}});
 vm.runInContext(extract('updateAccountPermissions')+'\n'+extract('setAccountBalance'),context);
 return {context,rows,writes,errors};
}
test('Lera and unauthenticated users cannot see or use either balance editor',async()=>{
 for(const role of ['lera',null]) {
   const s=setup(role);s.context.updateAccountPermissions();
   assert.ok(s.rows.every(row=>row.hidden && row.controls.every(c=>c.disabled)));
   await s.context.setAccountBalance('andrey');await s.context.setAccountBalance('lera');
   assert.equal(s.writes.length,0);assert.equal(s.errors.length,2);
 }
});
test('Andrey can edit initial balances for either account',async()=>{
 for(const owner of ['andrey','lera']) {
   const s=setup('andrey');s.context.updateAccountPermissions();
   assert.ok(s.rows.every(row=>!row.hidden && row.controls.every(c=>!c.disabled)));
   await s.context.setAccountBalance(owner);assert.equal(s.writes.length,1);assert.equal(s.writes[0][owner],123.45);
 }
});

