/* Administrative helper. Requires firebase-admin and Google application credentials.
   Dry-run by default. Never put this script, seed or service credentials on hosting. */
const fs=require('node:fs');
const args=process.argv.slice(2);
const apply=args.includes('--apply');
const get=key=>args[args.indexOf(key)+1];
const command=args[0];
async function main(){
 if(!['role','seed'].includes(command)) throw Error('Usage: node setup-firebase.cjs role --uid UID --role andrey|lera [--apply]\nOR: node setup-firebase.cjs seed --date YYYY-MM-DD [--apply]');
 if(command==='role') {
   const uid=get('--uid'),role=get('--role');
   if(!args.includes('--uid') || !args.includes('--role') || !uid || !['andrey','lera'].includes(role)) throw Error('Supply an exact Firebase Authentication UID and role.');
   if(!apply){console.log('DRY RUN: assign familyRole',role,'to UID',uid);return;}
   const admin=require('firebase-admin');admin.initializeApp({credential:admin.credential.applicationDefault(),projectId:'family-finance-72604'});
   const user=await admin.auth().getUser(uid);
   await admin.auth().setCustomUserClaims(uid,{...user.customClaims,familyRole:role});
   console.log('Role assigned. Sign out and sign in again.');
 } else {
   if(!args.includes('--date'))throw Error('Provide the statement reconciliation date using --date.');
   const date=require('./finance-core.js').date(get('--date'));
   const loans=JSON.parse(fs.readFileSync(__dirname+'/PRIVATE-loan-seed.json','utf8'));
   if(!apply){console.log('DRY RUN:',loans.length,'loans; reconciliation date',date,'; existing loan documents will not be overwritten.');return;}
   const admin=require('firebase-admin');admin.initializeApp({credential:admin.credential.applicationDefault(),projectId:'family-finance-72604'});
   const db=admin.firestore();
   await db.runTransaction(async tx=>{
     const refs=loans.map(l=>db.collection('loans').doc(l.id));
     const existing=await Promise.all(refs.map(ref=>tx.get(ref)));
     if(existing.some(d=>d.exists))throw Error('Migration aborted: at least one loan already exists. No changes applied.');
     loans.forEach((loan,i)=>{const next={...loan,asOfDate:date,revision:1,breakdownVerified:false};tx.create(refs[i],next);tx.create(db.collection('loanReconciliations').doc(),{loanId:loan.id,date,before:{},after:next,createdAt:Date.now(),source:'reviewed-seed'});});
   });
   console.log('Loan balances imported atomically. Existing transactions unchanged.');
 }
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});

