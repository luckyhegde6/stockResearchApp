import { normalize52WeekHighPayload } from '../src/adapters/nse-52week-high.js';
const fixture = { high: 2, timestamp: '28-Aug-2026 16:00:00', data: [
  { change: 1.2, comapnyName: 'ITC LIMITED', ltp: 266, new52WHL: 270, pChange: 0.45, prev52WHL: 269, prevClose: '264.8', prevHLDate: '27-Aug-2026', series: 'EQ', symbol: 'ITC' },
  { change: 2, comapnyName: 'SME DEMO', ltp: 10, new52WHL: 10, pChange: 2, prev52WHL: 9, prevClose: '9.8', prevHLDate: '27-Aug-2026', series: 'SM', symbol: 'SMEDEMO' }
] };
const universe = [
  {symbol:'ITC',companyName:'ITC LIMITED',series:'EQ',dateOfListing:'',paidUpValue:1,marketLot:1,isin:'INE154A01025',faceValue:1,equityEligible:true,preferredForStockResearch:true},
  {symbol:'SMEDEMO',companyName:'SME DEMO',series:'SM',dateOfListing:'',paidUpValue:1,marketLot:1,isin:'INE000A00000',faceValue:1,equityEligible:false,preferredForStockResearch:false},
];
const rows = normalize52WeekHighPayload(fixture, universe);
const itc = rows.find(r=>r.symbol==='ITC');
const ok = rows.length === 2 && itc?.ltp === 266 && itc?.series === 'EQ' && itc?.fromOfficialSecurityMaster === true;
console.log(JSON.stringify({ ok, rows }, null, 2));
if (!ok) process.exitCode = 1;
