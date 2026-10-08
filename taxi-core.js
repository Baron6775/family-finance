(function(root){
  'use strict';
  const n=value=>Number.isFinite(Number(value)) ? Number(value) : 0;
  const money=value=>Math.round(n(value)*100)/100;
  function orderBreakdown(order={}){
    const service=money(order.serviceFee);
    const park=money(order.parkFee);
    const other=money(order.otherFee);
    const tax=money(order.tax);
    const gross=money(order.amount);
    return {gross,service,park,other,tax,points:Math.max(0,Math.round(n(order.points))),net:money(gross-service-park-other-tax)};
  }
  function shiftTotals(shift={}){
    const orders=Array.isArray(shift.orders)?shift.orders:[];
    const result=orders.reduce((sum,order)=>{const b=orderBreakdown(order);sum.gross+=b.gross;sum.service+=b.service;sum.park+=b.park;sum.other+=b.other;sum.tax+=b.tax;sum.points+=b.points;return sum},{gross:0,service:0,park:0,other:0,tax:0,points:0});
    result.fuel=money(shift.fuel); result.rent=money(shift.rent); result.wash=money(shift.wash);
    result.rentedNet=money(result.gross-result.service-result.park-result.other-result.tax-result.fuel-result.rent-result.wash);
    result.personalNet=money(result.gross-result.service-result.other-result.tax-result.fuel-result.wash);
    result.personalAdvantage=money(result.personalNet-result.rentedNet);
    return result;
  }
  function remainingDays(month,today=new Date()){
    if(!/^\d{4}-\d{2}$/.test(month||'')) return 0;
    const [year,monthNumber]=month.split('-').map(Number),first=new Date(year,monthNumber-1,1),last=new Date(year,monthNumber,0),now=new Date(today); now.setHours(0,0,0,0);
    if(last<now) return 0;
    const start=first>now?first:now;
    return Math.floor((last-start)/86400000)+1;
  }
  function loyalty(goal,earned,today){
    const target=Math.max(0,Math.round(n(goal.target))),carried=Math.max(0,Math.round(n(goal.carriedPoints))),actual=Math.max(0,Math.round(n(earned))),remaining=Math.max(0,target-carried-actual),days=remainingDays(goal.month,today);
    return {target,earned:carried+actual,remaining,days,neededPerDay:days?Math.ceil(remaining/days):null,percent:target?Math.min(100,(carried+actual)/target*100):0};
  }
  const api={money,orderBreakdown,shiftTotals,remainingDays,loyalty};
  if(typeof module!=='undefined'&&module.exports) module.exports=api; else root.TaxiCore=api;
})(typeof window!=='undefined'?window:this);
