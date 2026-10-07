export type EvidenceType =
  | 'annual_report'
  | 'mda'
  | 'concall'
  | 'technical_chart'
  | 'screener_fundamentals'
  | 'shareholding'
  | 'market_data'
  | 'news'
  | 'source_page'
  | 'financials'
  | 'derived_data'
  | 'screening_results'
  | 'sentiment';

export interface SourceArtifact {
  id: string;
  type: EvidenceType;
  provider: string;
  title: string;
  url?: string;
  localPath?: string;
  markdownPath?: string;
  screenshotPath?: string;
  retrievedAt: string;
  period?: string;
  status: 'ok' | 'ok_with_fallback' | 'partial' | 'not_found' | 'blocked' | 'error';
  notes?: string[];
  method?: 'webfetch' | 'playwright' | 'markitdown' | 'script';
}

export interface ResearchManifest {
  schema_version: '1.49';
  ticker: string;
  companyName?: string;
  isin?: string;
  bseScrip?: string;
  runId?: string;
  input?: { raw: string; normalized: string; exchange: string; instrumentType: 'equity'; };
  features?: { chartinkEnabled: boolean; };
  generatedAt: string;
  acquisitionOnly: true;
  sourceArtifacts: SourceArtifact[];
  derivedArtifacts?: SourceArtifact[];
  dataGaps: string[];
  warnings: string[];
}

export interface AdapterContext {
  ticker: string;
  companyName?: string;
  isin?: string;
  bseScrip?: string;
  researchDir: string;
}

export interface AdapterResult {
  artifacts: SourceArtifact[];
  companyName?: string;
  isin?: string;
  bseScrip?: string;
  gaps?: string[];
  warnings?: string[];
}
