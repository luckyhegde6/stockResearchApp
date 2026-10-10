export const analysisSchema = {
  type: 'object',
  required: ['schema_version','company','analysis_meta','recommendation','news_sentiment','scores','executive_summary','fundamentals','management','valuation','technical','shareholding','risks','catalysts','scenarios','contrarian_test','entry_zones','portfolio_action','what_would_change_my_mind','sources','audit'],
  properties: {
    schema_version:{type:'string'}, company:{type:'object'}, analysis_meta:{type:'object'}, market_snapshot:{type:'object'}, recommendation:{type:'object'}, news_sentiment:{type:'object'}, scores:{type:'object'}, executive_summary:{type:'object'}, fundamentals:{type:'object'}, management:{type:'object'}, valuation:{type:'object'}, technical:{type:'object'}, shareholding:{type:'object'}, risks:{type:'array'}, catalysts:{type:'array'}, scenarios:{type:'object'}, contrarian_test:{type:'object'}, entry_zones:{type:'object'}, portfolio_action:{type:'object'}, what_would_change_my_mind:{type:'array'}, sources:{type:'array'}, audit:{type:'object'}
  }, additionalProperties:true
} as const;
