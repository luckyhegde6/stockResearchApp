import { nseEndpoints } from '../src/lib/nse-api-client.js';
import { NSE_NEXTAPI_SPECS } from '../src/lib/nse-nextapi-registry.js';
const checks={
  symbolData:nseEndpoints.quoteNextApi('ITC').includes('functionName=getSymbolData'),
  subjects:nseEndpoints.corporateAnnouncementSubjects('ITC').includes('getCorporateAnnouncementSubject'),
  announcements:nseEndpoints.corporateAnnouncements('ITC','01-03-2026','01-09-2026').includes('getCorporateAnnouncement'),
  board:nseEndpoints.boardMeetings('ITC').includes('getCorpBoardMeeting'),
  actions:nseEndpoints.corporateActionsNextApi('ITC').includes('getCorpAction'),
  calendar:nseEndpoints.eventCalendar('ITC').includes('getCorpEventCalender'),
  annual:nseEndpoints.annualReports('ITC').includes('getCorpAnnualReport'),
  brsr:nseEndpoints.brsr('ITC').includes('getCorpBrsr'),
  shareholding:nseEndpoints.shareholdingNextApi('ITC').includes('getShareholdingPattern'),
  financialResult:nseEndpoints.financialResultData('ITC').includes('getFinancialResultData'),
  financialStatus:nseEndpoints.financialStatus('ITC').includes('getFinancialStatus'),
  peerQuarters:nseEndpoints.peerQuarters('ITC').includes('getPeerComparisonQuaters'),
  peer:nseEndpoints.peerComparison('ITC','2026-06').includes('getPeerComparisonData'),
  registry:NSE_NEXTAPI_SPECS.length>=16,
};
console.log(JSON.stringify({ok:Object.values(checks).every(Boolean),checks,registryCount:NSE_NEXTAPI_SPECS.length},null,2));
if(!Object.values(checks).every(Boolean)) process.exitCode=1;
