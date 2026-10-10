# NSE NextApi API Catalog

All endpoint builders live in `src/lib/nse-nextapi-registry.ts` and are mirrored in `src/lib/nse-api-client.ts`.

| Family | Function | Purpose | Output folder |
|---|---|---|---|
| identity | getSymbolName | name/identifier | raw/nse-api/nextapi/identity |
| identity | getMetaData | instrument flags | raw/nse-api/nextapi/identity |
| market | getSymbolData | quote + security metadata | raw/nse-api/nextapi/market |
| market | getYearwiseData | stock/index returns | raw/nse-api/nextapi/market |
| market | getSymbolChartData | 1D points | raw/nse-api/nextapi/market |
| financials | getFinancialResultData | latest result records | raw/nse-api/nextapi/financials |
| financials | getFinancialStatus | current financial status | raw/nse-api/nextapi/financials |
| corporate | getCorporateAnnouncementSubject | subject catalog | raw/nse-api/nextapi/corporate |
| corporate | getCorporateAnnouncement | rolling announcements | raw/nse-api/nextapi/corporate |
| corporate | getCorpBoardMeeting | board meetings | raw/nse-api/nextapi/corporate |
| corporate | getCorpAction | corporate actions | raw/nse-api/nextapi/corporate |
| corporate | getCorpEventCalender | event calendar | raw/nse-api/nextapi/corporate |
| annual_reports | getCorpAnnualReport | annual report index | raw/nse-api/nextapi/annual_reports |
| compliance | getCorpBrsr | BRSR disclosure | raw/nse-api/nextapi/compliance |
| ownership | getShareholdingPattern | shareholding records | raw/nse-api/nextapi/ownership |
| peers | getPeerComparisonQuaters | comparison periods | raw/nse-api/nextapi/peers |
| peers | getPeerComparisonData | industry peers | raw/nse-api/nextapi/peers |

## Date handling

`getCorporateAnnouncement` uses a rolling window. Default: 184 days back through today. Override with `NSE_ANNOUNCEMENT_LOOKBACK_DAYS`.

## Reusability rule

Do not hard-code an endpoint URL in an adapter. Add/reuse a builder in `nse-api-client.ts` and register the function in `nse-nextapi-registry.ts`.

## Evidence rule

Every captured response is raw evidence first. Normalized outputs are deterministic-derived and must point back to the raw artifact.

## Explicit standalone command

`npm run nse:nextapi -- ITC` runs the reusable registry against one symbol and writes the raw API responses by family. The normal `npm run analyze -- ITC` flow also performs the per-symbol NextApi acquisition automatically.

## Datewise convention

`research/<SYMBOL>/` is the disposable working research package. `research/<SYMBOL>/snapshots/YYYY-MM-DD/` contains pointer/index metadata so repeated runs remain date-addressable without copying the raw payloads.
