import { URLSearchParams } from 'node:url';

export const NSE_BASE = 'https://www.nseindia.com';

export type NseApiFamily =
  | 'identity'
  | 'market'
  | 'financials'
  | 'corporate'
  | 'ownership'
  | 'annual_reports'
  | 'compliance'
  | 'peers';

export interface NseApiSpec {
  id: string;
  family: NseApiFamily;
  functionName: string;
  filename: string;
  title: string;
  requiresIdentifier?: boolean;
  buildPath: (symbol: string, options?: Record<string, string>) => string;
}

function nextApi(functionName: string, params: Record<string, string>) {
  const qs = new URLSearchParams({ functionName, ...params });
  return `/api/NextApi/apiClient/GetQuoteApi?${qs.toString()}`;
}

export const NSE_NEXTAPI_SPECS: NseApiSpec[] = [
  { id:'symbol-name', family:'identity', functionName:'getSymbolName', filename:'symbol-name.json', title:'NSE NextApi symbol name', buildPath:s => nextApi('getSymbolName',{symbol:s}) },
  { id:'metadata', family:'identity', functionName:'getMetaData', filename:'symbol-metadata.json', title:'NSE NextApi symbol metadata', buildPath:s => nextApi('getMetaData',{symbol:s}) },
  { id:'symbol-data', family:'market', functionName:'getSymbolData', filename:'symbol-data.json', title:'NSE NextApi canonical symbol quote data', buildPath:s => nextApi('getSymbolData',{marketType:'N',series:'EQ',symbol:s}) },
  { id:'yearwise', family:'market', functionName:'getYearwiseData', filename:'yearwise.json', title:'NSE NextApi yearwise performance', requiresIdentifier:true, buildPath:s => nextApi('getYearwiseData',{symbol:s}) },
  { id:'chart-1d', family:'market', functionName:'getSymbolChartData', filename:'symbol-chart-1d.json', title:'NSE NextApi 1D symbol chart data', requiresIdentifier:true, buildPath:s => nextApi('getSymbolChartData',{symbol:s,days:'1D'}) },
  { id:'announcement-subjects', family:'corporate', functionName:'getCorporateAnnouncementSubject', filename:'corporate-announcement-subjects.json', title:'NSE corporate announcement subject catalog', buildPath:s => nextApi('getCorporateAnnouncementSubject',{symbol:s,marketApiType:'equities'}) },
  { id:'announcements', family:'corporate', functionName:'getCorporateAnnouncement', filename:'corporate-announcements-nextapi.json', title:'NSE corporate announcements', buildPath:(s,o={}) => nextApi('getCorporateAnnouncement',{symbol:s,marketApiType:'equities',subject:'',fromDate:o.fromDate ?? '',toDate:o.toDate ?? ''}) },
  { id:'board-meetings', family:'corporate', functionName:'getCorpBoardMeeting', filename:'board-meetings.json', title:'NSE corporate board meetings', buildPath:s => nextApi('getCorpBoardMeeting',{symbol:s,marketApiType:'equities',type:'W'}) },
  { id:'corporate-actions', family:'corporate', functionName:'getCorpAction', filename:'corporate-actions-nextapi.json', title:'NSE corporate actions', buildPath:s => nextApi('getCorpAction',{symbol:s,type:'W',marketApiType:'equities'}) },
  { id:'event-calendar', family:'corporate', functionName:'getCorpEventCalender', filename:'event-calendar.json', title:'NSE corporate event calendar', buildPath:s => nextApi('getCorpEventCalender',{symbol:s,marketApiType:'equities'}) },
  { id:'annual-reports', family:'annual_reports', functionName:'getCorpAnnualReport', filename:'annual-reports-index.json', title:'NSE corporate annual report index', buildPath:s => nextApi('getCorpAnnualReport',{symbol:s,marketApiType:'equities'}) },
  { id:'brsr', family:'compliance', functionName:'getCorpBrsr', filename:'brsr.json', title:'NSE BRSR corporate disclosure', buildPath:s => nextApi('getCorpBrsr',{symbol:s}) },
  { id:'shareholding', family:'ownership', functionName:'getShareholdingPattern', filename:'shareholding-pattern-nextapi.json', title:'NSE shareholding pattern', buildPath:s => nextApi('getShareholdingPattern',{symbol:s,noOfRecords:'5'}) },
  { id:'financial-result-data', family:'financials', functionName:'getFinancialResultData', filename:'financial-result-data.json', title:'NSE financial result data', buildPath:s => nextApi('getFinancialResultData',{symbol:s,marketApiType:'equities',noOfRecords:'5'}) },
  { id:'financial-status', family:'financials', functionName:'getFinancialStatus', filename:'financial-status.json', title:'NSE financial status', buildPath:s => nextApi('getFinancialStatus',{symbol:s}) },
  { id:'peer-quarters', family:'peers', functionName:'getPeerComparisonQuaters', filename:'peer-comparison-quarters.json', title:'NSE peer comparison quarter catalog', buildPath:s => nextApi('getPeerComparisonQuaters',{symbol:s}) },
  { id:'peer-comparison', family:'peers', functionName:'getPeerComparisonData', filename:'peer-comparison.json', title:'NSE peer comparison data', buildPath:(s,o={}) => nextApi('getPeerComparisonData',{symbol:s,type:'S',quarter:o.quarter ?? '',param:'industry',index:''}) },
];

export function specById(id: string) { return NSE_NEXTAPI_SPECS.find(s => s.id === id); }
export const NSE_NEXTAPI_FAMILY_LABELS: Record<NseApiFamily,string> = {
  identity:'Identity & instrument metadata',
  market:'Market & performance',
  financials:'Financial results',
  corporate:'Corporate events & announcements',
  ownership:'Shareholding',
  annual_reports:'Annual reports',
  compliance:'BRSR & compliance',
  peers:'Peer comparison',
};
