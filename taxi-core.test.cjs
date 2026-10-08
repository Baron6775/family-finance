const test=require('node:test');
const assert=require('node:assert/strict');
const Taxi=require('./taxi-core.js');

test('рассчитывает заказ по полной детализации',()=>{
  assert.deepEqual(Taxi.orderBreakdown({amount:871,serviceFee:172.68,parkFee:43.55,otherFee:34.84,points:27}),{fare:871,tips:0,gross:871,service:172.68,park:43.55,other:34.84,tax:0,points:27,net:619.93});
});
test('личная машина исключает только аренду и комиссию парка',()=>{
  const total=Taxi.shiftTotals({orders:[{amount:1000,serviceFee:100,parkFee:50,otherFee:10,tax:20}],fuel:200,wash:100,rent:700});
  assert.equal(total.rentedNet,-180);
  assert.equal(total.personalNet,570);
  assert.equal(total.personalAdvantage,750);
});
test('считает дневной темп до конца месяца включительно',()=>{
  const result=Taxi.loyalty({month:'2026-10',target:10000,carriedPoints:555},0,new Date(2026,9,8));
  assert.equal(result.days,24); assert.equal(result.remaining,9445); assert.equal(result.neededPerDay,394);
});
