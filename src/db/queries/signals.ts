/**
 * Signal & trigger event queries.
 * Signals track buying intent: new hires, funding, tech adoption, etc.
 */

import { getSupabaseClient } from '../client.js';

export interface SignalRow {
  id: string;
  company_id: string | null;
  contact_id: string | null;
  signal_type: string;
  title: string;
  description: string | null;
  source: string | null;
  source_url: string | null;
  strength: number;
  signal_date: string;
  expires_at: string | null;
  raw_data: Record<string, unknown>;
  detected_at: string;
  detected_by: string | null;
}

export interface CreateSignalInput {
  companyId?: string;
  contactId?: string;
  signalType: string;
  title: string;
  description?: string;
  source?: string;
  sourceUrl?: string;
  strength?: number;
  signalDate?: string;
  expiresAt?: string;
  rawData?: Record<string, unknown>;
  detectedBy?: string;
}

export async function createSignal(input: CreateSignalInput): Promise<SignalRow> {
  const db = getSupabaseClient();
  const { data, error } = await db
    .from('signals')
    .insert({
      company_id: input.companyId ?? null,
      contact_id: input.contactId ?? null,
      signal_type: input.signalType,
      title: input.title,
      description: input.description ?? null,
      source: input.source ?? null,
      source_url: input.sourceUrl ?? null,
      strength: input.strength ?? 0.5,
      signal_date: input.signalDate ?? new Date().toISOString(),
      expires_at: input.expiresAt ?? null,
      raw_data: input.rawData ?? {},
      detected_by: input.detectedBy ?? 'system',
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create signal: ${error.message}`);
  return data as SignalRow;
}

/**
 * Get active signals for a company (not expired).
 */
export async function getCompanySignals(companyId: string): Promise<SignalRow[]> {
  const db = getSupabaseClient();
  const { data, error } = await db
    .from('signals')
    .select()
    .eq('company_id', companyId)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order('signal_date', { ascending: false });

  if (error) throw new Error(`Failed to get signals: ${error.message}`);
  return data as SignalRow[];
}

/**
 * Get strong signals across all companies (for prospecting prioritisation).
 */
export async function getStrongSignals(options: {
  minStrength?: number;
  signalTypes?: string[];
  limit?: number;
} = {}): Promise<Array<SignalRow & { company_name?: string }>> {
  const db = getSupabaseClient();
  let query = db
    .from('signals')
    .select(`
      *,
      companies (name, domain, industry)
    `)
    .gte('strength', options.minStrength ?? 0.7)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order('strength', { ascending: false })
    .order('signal_date', { ascending: false });

  if (options.signalTypes && options.signalTypes.length > 0) {
    query = query.in('signal_type', options.signalTypes);
  }

  query = query.limit(options.limit ?? 100);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to get strong signals: ${error.message}`);
  return data as Array<SignalRow & { company_name?: string }>;
}

/**
 * Get signals for companies in a specific campaign.
 */
export async function getCampaignSignals(campaignId: string): Promise<SignalRow[]> {
  const db = getSupabaseClient();
  const { data: campaignCompanies } = await db
    .from('campaign_companies')
    .select('company_id')
    .eq('campaign_id', campaignId)
    .eq('included', true);

  if (!campaignCompanies || campaignCompanies.length === 0) return [];

  const companyIds = campaignCompanies.map(cc => cc.company_id);
  const { data, error } = await db
    .from('signals')
    .select()
    .in('company_id', companyIds)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order('strength', { ascending: false });

  if (error) throw new Error(`Failed to get campaign signals: ${error.message}`);
  return data as SignalRow[];
}
