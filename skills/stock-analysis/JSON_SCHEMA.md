# Frontend JSON Contract

This is the canonical response shape for the analysis engine.

```json
{
  "schema_version": "1.0.0",
  "company": {
    "name": "",
    "ticker": "",
    "exchange": "",
    "isin": null,
    "sector": null,
    "industry": null
  },
  "analysis_meta": {
    "analysis_timestamp": "",
    "latest_reporting_period": null,
    "financial_basis": "consolidated",
    "data_completeness": 0,
    "overall_confidence": 0,
    "data_gaps": []
  },
  "market_snapshot": {
    "current_price": null,
    "currency": "INR",
    "market_cap": null,
    "pe": null,
    "pb": null,
    "ev_ebitda": null,
    "52_week_high": null,
    "52_week_low": null,
    "price_timestamp": null,
    "source_id": null
  },
  "recommendation": {
    "action": "HOLD",
    "conviction": 0,
    "one_line_thesis": "",
    "top_three_reasons": [],
    "confidence": 0
  },
  "scores": {
    "fundamentals": 0,
    "management": 0,
    "valuation": 0,
    "technical": 0,
    "shareholding": 0,
    "risk_reward": 0,
    "overall": 0
  },
  "executive_summary": {
    "business_quality": "",
    "earnings_quality": "",
    "valuation_view": "",
    "technical_view": "",
    "key_risk": "",
    "key_catalyst": ""
  },
  "fundamentals": {
    "growth": {
      "revenue_growth": null,
      "profit_growth": null,
      "eps_growth": null,
      "trend": "",
      "confidence": 0
    },
    "profitability": {
      "ebitda_margin": null,
      "ebit_margin": null,
      "pat_margin": null,
      "margin_trend": "",
      "confidence": 0
    },
    "cash_flow": {
      "operating_cash_flow": null,
      "free_cash_flow": null,
      "cash_conversion": null,
      "pat_vs_ocf_assessment": "",
      "confidence": 0
    },
    "balance_sheet": {
      "debt": null,
      "net_debt": null,
      "debt_equity": null,
      "interest_coverage": null,
      "assessment": "",
      "confidence": 0
    },
    "returns": {
      "roe": null,
      "roce": null,
      "assessment": "",
      "confidence": 0
    },
    "accounting_quality": {
      "score": 0,
      "red_flags": [],
      "assessment": "",
      "confidence": 0
    },
    "verdict": "",
    "key_evidence": []
  },
  "management": {
    "score": 0,
    "credibility": "",
    "guidance_accuracy": "",
    "capital_allocation": "",
    "promoter_behavior": "",
    "positive_signals": [],
    "warning_signals": [],
    "key_evidence": [],
    "confidence": 0
  },
  "valuation": {
    "classification": "FAIRLY_VALUED",
    "pe": null,
    "ev_ebitda": null,
    "pb": null,
    "peg": null,
    "fcf_yield": null,
    "historical_comparison": "",
    "peer_comparison": "",
    "growth_adjusted_view": "",
    "assessment": "",
    "confidence": 0
  },
  "technical": {
    "market_phase": "BASE_SIDEWAYS",
    "primary_trend": "",
    "intermediate_trend": "",
    "price_vs_50_ema": "",
    "price_vs_200_ema": "",
    "ema_structure": "",
    "rsi": null,
    "rsi_assessment": "",
    "volume_assessment": "",
    "support_levels": [],
    "resistance_levels": [],
    "breakout_or_breakdown": null,
    "assessment": "",
    "confidence": 0,
    "source_id": null
  },
  "shareholding": {
    "reporting_period": null,
    "promoter_holding": null,
    "promoter_pledge": null,
    "fii_holding": null,
    "dii_holding": null,
    "retail_public_holding": null,
    "quarterly_changes": [],
    "assessment": "",
    "confidence": 0,
    "source_id": null
  },
  "risks": [
    {
      "rank": 1,
      "risk": "",
      "category": "company",
      "probability": "medium",
      "impact": "high",
      "early_warning_indicator": "",
      "priced_in": "unknown",
      "confidence": 0,
      "source_id": null
    }
  ],
  "news_sentiment": {
    "label": "INSUFFICIENT_DATA",
    "score": null,
    "headline_count": 0,
    "source_count": 0,
    "trend": "",
    "dominant_themes": [],
    "assessment": "",
    "confidence": 0,
    "key_evidence": []
  },
  "catalysts": [
    {
      "rank": 1,
      "catalyst": "",
      "timeframe": null,
      "confirmation_condition": "",
      "potential_impact": "",
      "confidence": 0,
      "source_id": null
    }
  ],
  "scenarios": {
    "bull": {
      "thesis": "",
      "assumptions": [],
      "confidence": 0
    },
    "base": {
      "thesis": "",
      "assumptions": [],
      "confidence": 0
    },
    "bear": {
      "thesis": "",
      "assumptions": [],
      "confidence": 0
    }
  },
  "contrarian_test": {
    "market_belief": "",
    "evidence_for": [],
    "evidence_against": [],
    "fragile_assumption": "",
    "what_could_make_analysis_wrong": "",
    "confidence": 0
  },
  "entry_zones": {
    "attractive": {
      "low": null,
      "high": null,
      "assumptions": []
    },
    "fair_value": {
      "low": null,
      "high": null,
      "assumptions": []
    },
    "overvaluation": {
      "low": null,
      "high": null,
      "assumptions": []
    }
  },
  "portfolio_action": {
    "existing_shareholder": "",
    "new_investor": "",
    "position_role": "",
    "investment_horizon": null,
    "thesis_invalidation": []
  },
  "what_would_change_my_mind": [],
  "sources": [
    {
      "source_id": "SRC-001",
      "source_name": "",
      "source_type": "annual_report",
      "url": "",
      "retrieved_at": null,
      "published_at": null,
      "reporting_period": null,
      "artifact_path": null,
      "notes": ""
    }
  ],
  "audit": {
    "facts_without_primary_source": [],
    "conflicts_detected": [],
    "calculations": [
      {
        "metric": "",
        "formula": "",
        "inputs": [],
        "calculation_note": ""
      }
    ]
  }
}
```

## Enum guidance

`recommendation.action`:

`STRONG BUY | BUY | ACCUMULATE | HOLD | REDUCE | SELL | STRONG SELL | AVOID`

`valuation.classification`:

`CHEAP | FAIRLY_VALUED | EXPENSIVE | EXTREMELY_EXPENSIVE`

`technical.market_phase`:

`ACCUMULATION | MARKUP | DISTRIBUTION | MARKDOWN | BASE_SIDEWAYS`

Scores are 0–10.

Confidence fields are 0–1.

Unavailable numbers must be `null`.
