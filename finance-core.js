/* Pure calculations shared by the application and regression tests. */
(function(root) {
  'use strict';
  const money = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  function amount(value, allowZero = false) {
    const n = Number(value);
    if (String(value).trim() === '' || !Number.isFinite(n) || n < 0 || (!allowZero && n === 0) || n > 1e12 || Math.abs(n * 100 - Math.round(n * 100)) > 0.001) throw new Error('Введите корректную сумму с точностью до копеек.');
    return money(n);
  }
  function date(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Укажите корректную дату.');
    const d = new Date(value + 'T12:00:00Z');
    if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0,10) !== value) throw new Error('Укажите корректную дату.');
    return value;
  }
  function addMonths(iso, count) {
    date(iso);
    const [y,m,d] = iso.split('-').map(Number);
    const end = new Date(Date.UTC(y, m + count, 0)).getUTCDate();
    return new Date(Date.UTC(y, m - 1 + count, Math.min(d,end),12)).toISOString().slice(0,10);
  }
  function schedule(loan) {
    let balance = amount(loan.bodyDebt, true);
    const payment = amount(loan.monthlyPayment, true);
    const rate = Number(loan.rate) / 1200;
    if (!Number.isFinite(rate) || rate < 0) throw new Error('Некорректная ставка.');
    const rows = [];
    if (!balance) return rows;
    date(loan.nextPaymentDate);
    for (let n=1; balance > 0 && n <= 1200; n++) {
      const interest = money(balance * rate);
      if (payment <= interest) throw new Error('Платёж не покрывает проценты. График не может быть рассчитан.');
      const body = Math.min(balance, money(payment - interest));
      balance = money(balance - body);
      rows.push({n, date:addMonths(loan.nextPaymentDate,n-1), payment:money(body+interest), body, interest, penalty:0, remain:balance});
    }
    if (balance > 0) throw new Error('Расчёт превышает 100 лет. Проверьте параметры.');
    return rows;
  }
  function prepay(loan, value, strategy) {
    const paid = amount(value,true);
    if (paid > loan.bodyDebt) throw new Error('Сумма превышает остаток основного долга.');
    const before = schedule(loan);
    const newBody = money(loan.bodyDebt - paid);
    let newMonthly = loan.monthlyPayment;
    if (!newBody) newMonthly = 0;
    else if (paid && strategy === 'reduce_payment') {
      const n = before.length, r = loan.rate / 1200;
      newMonthly = Math.ceil((r ? newBody*r/(1-Math.pow(1+r,-n)) : newBody/n)*100)/100;
    }
    const after = schedule({...loan,bodyDebt:newBody,monthlyPayment:newMonthly});
    return {amount:paid, newBody, newMonthly, months:after.length,
      newCloseDate:after.length ? after.at(-1).date : null,
      savings:money(before.reduce((s,r)=>s+r.interest,0)-after.reduce((s,r)=>s+r.interest,0)),
      interestRemaining:money(after.reduce((s,r)=>s+r.interest,0))};
  }
  function payment(loan, value, mode) {
    const paid = amount(value);
    const next = JSON.parse(JSON.stringify(loan));
    let body=0, interest=0, penalty=0;
    if (mode === 'personal' || mode === 'body') {
      if (paid > loan.bodyDebt) throw new Error('Сумма превышает остаток долга.');
      body = paid;
    } else if (mode === 'interest') {
      if (paid > loan.interestRemaining) throw new Error('Сумма превышает остаток процентов.');
      interest = paid;
    } else {
      ({body,interest,penalty} = loan.nextPaymentBreakdown);
      body=amount(body,true); interest=amount(interest,true); penalty=amount(penalty,true);
      if (money(body+interest+penalty) !== paid) throw new Error('Сумма должна совпадать с разбивкой платежа. Для другого платежа сначала уточните разбивку по выписке.');
      if (body > loan.bodyDebt || interest > loan.interestRemaining || penalty > loan.penalty) throw new Error('Разбивка платежа превышает остатки. Сверьте кредит с выпиской.');
      // A partial/early payment does not prove the next contractual due date.
      // Update dates only through a statement reconciliation.
    }
    next.bodyDebt=money(loan.bodyDebt-body);
    next.interestRemaining=money(loan.interestRemaining-interest);
    next.penalty=money(loan.penalty-penalty);
    next.totalRemaining=money(next.bodyDebt+next.interestRemaining+next.penalty);
    if (!next.bodyDebt && !next.interestRemaining && !next.penalty) next.monthlyPayment=0;
    // The next actual bank breakdown must come from a statement, not a forecast.
    next.breakdownVerified = mode === 'personal';
    return {next, breakdown:{body,interest,penalty}};
  }
  const api={money,amount,date,addMonths,schedule,prepay,payment};
  if (typeof module !== 'undefined' && module.exports) module.exports=api;
  else root.FinanceCore=api;
})(typeof window !== 'undefined' ? window : this);

