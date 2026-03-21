/**
 * ICP Challenge logic.
 *
 * This module provides the scoring and refinement framework.
 * The actual website/client-base analysis is performed by Claude
 * using WebFetch/WebSearch tools — this module structures the results.
 */

import { getSupabaseClient } from '../db/client.js';
import type {
  ICPDefinition,
  WebsiteAnalysis,
  ClientBaseAnalysis,
  ICPRefinement,
} from './types.js';

/**
 * Score alignment between a stated ICP dimension and observed evidence.
 * Returns 0 (no alignment) to 1 (perfect alignment).
 */
export function scoreAlignment(
  stated: string[],
  observed: string[],
): number {
  if (stated.length === 0 || observed.length === 0) return 0;

  const statedSet = new Set(stated.map(s => s.toLowerCase()));
  const observedSet = new Set(observed.map(s => s.toLowerCase()));

  let overlap = 0;
  for (const item of observedSet) {
    if (statedSet.has(item)) overlap++;
  }

  // Jaccard similarity
  const union = new Set([...statedSet, ...observedSet]);
  return overlap / union.size;
}

/**
 * Generate refinements based on website and client-base analysis.
 */
export function generateRefinements(
  originalICP: ICPDefinition,
  websiteAnalysis: WebsiteAnalysis,
  clientBaseAnalysis: ClientBaseAnalysis,
): ICPRefinement[] {
  const refinements: ICPRefinement[] = [];

  // 1. Check pricing/size alignment
  if (websiteAnalysis.pricingSignals !== 'unknown') {
    const sizeSignal = websiteAnalysis.pricingSignals;
    const statedMin = originalICP.companySizeMin ?? 0;
    const statedMax = originalICP.companySizeMax ?? Infinity;

    if (sizeSignal === 'enterprise' && statedMax < 500) {
      refinements.push({
        dimension: 'company_size',
        observation: `Website pricing signals "enterprise" but ICP max size is ${statedMax} employees`,
        recommendation: 'Consider raising company_size_max to 1000+ to match enterprise positioning',
        confidence: 0.7,
        type: 'expand',
      });
    }
    if (sizeSignal === 'smb' && statedMin > 200) {
      refinements.push({
        dimension: 'company_size',
        observation: `Website pricing signals "SMB" but ICP minimum is ${statedMin} employees`,
        recommendation: 'Consider lowering company_size_min to capture SMB market the product serves',
        confidence: 0.7,
        type: 'narrow',
      });
    }
  }

  // 2. Check industry alignment
  const observedIndustries = clientBaseAnalysis.commonIndustries.map(i => i.industry);
  const industryAlignment = scoreAlignment(originalICP.industries, observedIndustries);

  if (industryAlignment < 0.3 && observedIndustries.length > 0) {
    const missingIndustries = observedIndustries.filter(
      i => !originalICP.industries.map(x => x.toLowerCase()).includes(i.toLowerCase()),
    );
    if (missingIndustries.length > 0) {
      refinements.push({
        dimension: 'industries',
        observation: `Existing client base includes ${missingIndustries.join(', ')} but these are not in the ICP`,
        recommendation: `Consider adding: ${missingIndustries.join(', ')}`,
        confidence: 0.8,
        type: 'expand',
      });
    }
  }

  // 3. Check geographic alignment
  const observedGeos = clientBaseAnalysis.geographicConcentration.map(g => g.country);
  const geoAlignment = scoreAlignment(originalICP.geographies, observedGeos);

  if (geoAlignment < 0.3 && observedGeos.length > 0) {
    refinements.push({
      dimension: 'geographies',
      observation: `Client base concentrated in ${observedGeos.slice(0, 5).join(', ')} but ICP targets ${originalICP.geographies.join(', ')}`,
      recommendation: 'Consider aligning geographies with where existing clients are concentrated',
      confidence: 0.6,
      type: 'contradict',
    });
  }

  // If ICP says "global" but clients are concentrated
  if (
    originalICP.geographies.some(g => g.toLowerCase() === 'global') &&
    observedGeos.length > 0 && observedGeos.length <= 5
  ) {
    refinements.push({
      dimension: 'geographies',
      observation: `ICP says "global" but existing clients are concentrated in ${observedGeos.join(', ')}`,
      recommendation: `Consider starting with ${observedGeos.join(', ')} for higher conversion probability`,
      confidence: 0.7,
      type: 'narrow',
    });
  }

  // 4. Technology signals from website
  if (websiteAnalysis.technologyIndicators.length > 0) {
    const techOverlap = scoreAlignment(
      originalICP.technologySignals ?? [],
      websiteAnalysis.technologyIndicators,
    );
    if (techOverlap < 0.2 && websiteAnalysis.technologyIndicators.length > 0) {
      refinements.push({
        dimension: 'technology_signals',
        observation: `Website indicates tech stack includes: ${websiteAnalysis.technologyIndicators.join(', ')}`,
        recommendation: 'Add these as technology signals to target companies using compatible tech',
        confidence: 0.5,
        type: 'expand',
      });
    }
  }

  // 5. Customer logo analysis
  if (websiteAnalysis.customerLogos.length > 0) {
    refinements.push({
      dimension: 'validation',
      observation: `Found ${websiteAnalysis.customerLogos.length} customer logos on website: ${websiteAnalysis.customerLogos.slice(0, 10).join(', ')}`,
      recommendation: 'Analyze these customers to validate ICP dimensions (size, industry, geography)',
      confidence: 0.9,
      type: 'confirm',
    });
  }

  return refinements;
}

/**
 * Apply refinements to produce a refined ICP.
 */
export function applyRefinements(
  original: ICPDefinition,
  refinements: ICPRefinement[],
): ICPDefinition {
  const refined = { ...original };

  for (const ref of refinements) {
    if (ref.confidence < 0.5) continue; // Only apply high-confidence refinements

    switch (ref.dimension) {
      case 'company_size':
        if (ref.type === 'expand' && (refined.companySizeMax ?? 0) < 1000) {
          refined.companySizeMax = 1000;
        }
        if (ref.type === 'narrow' && (refined.companySizeMin ?? 0) > 50) {
          refined.companySizeMin = 50;
        }
        break;

      case 'industries':
        if (ref.type === 'expand') {
          // Extract industries from recommendation
          const match = ref.recommendation.match(/Consider adding: (.+)/);
          if (match) {
            const newIndustries = match[1].split(', ');
            refined.industries = [...new Set([...refined.industries, ...newIndustries])];
          }
        }
        break;

      case 'technology_signals':
        if (ref.type === 'expand') {
          const match = ref.observation.match(/includes: (.+)/);
          if (match) {
            const newTech = match[1].split(', ');
            refined.technologySignals = [...new Set([...(refined.technologySignals ?? []), ...newTech])];
          }
        }
        break;
    }
  }

  return refined;
}

/**
 * Save ICP criteria to a campaign.
 */
export async function saveICP(
  campaignId: string,
  icp: ICPDefinition,
): Promise<void> {
  const db = getSupabaseClient();

  const { error } = await db
    .from('campaigns')
    .update({
      target_geographies: icp.geographies,
      target_industries: icp.industries,
      target_company_sizes: icp.companyTypes ?? [],
      target_keywords: icp.keywords,
      exclusion_keywords: icp.exclusionKeywords ?? [],
    })
    .eq('id', campaignId);

  if (error) throw new Error(`Failed to save ICP to campaign: ${error.message}`);
}

/**
 * Get ICP criteria from a campaign.
 */
export async function getActiveICP(campaignId: string): Promise<ICPDefinition | null> {
  const db = getSupabaseClient();
  const { data, error } = await db
    .from('campaigns')
    .select('target_geographies, target_industries, target_company_sizes, target_keywords, exclusion_keywords')
    .eq('id', campaignId)
    .maybeSingle();

  if (error) throw new Error(`Failed to get ICP: ${error.message}`);
  if (!data) return null;

  return {
    geographies: data.target_geographies ?? [],
    industries: data.target_industries ?? [],
    companyTypes: data.target_company_sizes ?? [],
    keywords: data.target_keywords ?? [],
    exclusionKeywords: data.exclusion_keywords ?? [],
  };
}
