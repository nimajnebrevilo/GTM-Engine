/**
 * ICP (Ideal Customer Profile) data structures.
 */

export interface ICPDefinition {
  companySizeMin?: number;
  companySizeMax?: number;
  revenueMinUsd?: number;
  revenueMaxUsd?: number;
  geographies: string[];
  industries: string[];
  companyTypes?: string[];
  keywords: string[];
  exclusionKeywords?: string[];
  technologySignals?: string[];
}

export interface WebsiteAnalysis {
  valueProposition: string;
  targetPersonas: string[];
  pricingSignals: 'enterprise' | 'mid-market' | 'smb' | 'mixed' | 'unknown';
  customerLogos: string[];
  caseStudies: string[];
  technologyIndicators: string[];
  productDescription: string;
}

export interface ClientBaseAnalysis {
  commonIndustries: Array<{ industry: string; frequency: number }>;
  sizeDistribution: Array<{ band: string; count: number }>;
  geographicConcentration: Array<{ country: string; count: number }>;
  technologyCommonalities: string[];
  patterns: string[];
}

export interface ICPRefinement {
  dimension: string;
  observation: string;
  recommendation: string;
  confidence: number;   // 0-1
  type: 'expand' | 'narrow' | 'contradict' | 'confirm';
}

export interface ICPChallengeResult {
  originalICP: ICPDefinition;
  websiteAnalysis: WebsiteAnalysis;
  clientBaseAnalysis: ClientBaseAnalysis;
  refinements: ICPRefinement[];
  refinedICP: ICPDefinition;
  challengeSummary: string;
}
