/**
 * CRUD operations for clients and campaigns tables.
 *
 * Replaces the old "projects" concept:
 *   - clients = agency client accounts
 *   - campaigns = specific prospecting engagements for a client
 */

import { getSupabaseClient } from '../client.js';

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

export interface Client {
  id: string;
  name: string;
  website: string | null;
  industry: string | null;
  notes: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface CreateClientInput {
  name: string;
  website?: string;
  industry?: string;
  notes?: string;
}

export async function createClient(input: CreateClientInput): Promise<Client> {
  const db = getSupabaseClient();
  const { data, error } = await db
    .from('clients')
    .insert({
      name: input.name,
      website: input.website ?? null,
      industry: input.industry ?? null,
      notes: input.notes ?? null,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create client: ${error.message}`);
  return data as Client;
}

export async function getClient(id: string): Promise<Client> {
  const db = getSupabaseClient();
  const { data, error } = await db
    .from('clients')
    .select()
    .eq('id', id)
    .single();

  if (error) throw new Error(`Failed to get client: ${error.message}`);
  return data as Client;
}

export async function listClients(): Promise<Client[]> {
  const db = getSupabaseClient();
  const { data, error } = await db
    .from('clients')
    .select()
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to list clients: ${error.message}`);
  return data as Client[];
}

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------

export interface Campaign {
  id: string;
  client_id: string;
  name: string;
  brief: string | null;
  target_geographies: string[];
  target_industries: string[];
  target_company_sizes: string[];
  target_keywords: string[];
  exclusion_keywords: string[];
  status: string;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateCampaignInput {
  clientId: string;
  name: string;
  brief?: string;
  targetGeographies?: string[];
  targetIndustries?: string[];
  targetCompanySizes?: string[];
  targetKeywords?: string[];
  exclusionKeywords?: string[];
}

export async function createCampaign(input: CreateCampaignInput): Promise<Campaign> {
  const db = getSupabaseClient();
  const { data, error } = await db
    .from('campaigns')
    .insert({
      client_id: input.clientId,
      name: input.name,
      brief: input.brief ?? null,
      target_geographies: input.targetGeographies ?? [],
      target_industries: input.targetIndustries ?? [],
      target_company_sizes: input.targetCompanySizes ?? [],
      target_keywords: input.targetKeywords ?? [],
      exclusion_keywords: input.exclusionKeywords ?? [],
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create campaign: ${error.message}`);
  return data as Campaign;
}

export async function getCampaign(id: string): Promise<Campaign> {
  const db = getSupabaseClient();
  const { data, error } = await db
    .from('campaigns')
    .select()
    .eq('id', id)
    .single();

  if (error) throw new Error(`Failed to get campaign: ${error.message}`);
  return data as Campaign;
}

export async function updateCampaignStatus(id: string, status: string): Promise<void> {
  const db = getSupabaseClient();
  const { error } = await db
    .from('campaigns')
    .update({ status })
    .eq('id', id);

  if (error) throw new Error(`Failed to update campaign status: ${error.message}`);
}

export async function listCampaigns(clientId?: string): Promise<Campaign[]> {
  const db = getSupabaseClient();
  let query = db
    .from('campaigns')
    .select()
    .order('created_at', { ascending: false });

  if (clientId) {
    query = query.eq('client_id', clientId);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to list campaigns: ${error.message}`);
  return data as Campaign[];
}

// ---------------------------------------------------------------------------
// Client Suppressions
// ---------------------------------------------------------------------------

/**
 * Suppress a company for a specific client.
 */
export async function suppressCompanyForClient(
  clientId: string,
  companyId: string,
  reason: string = 'client_request',
  notes?: string,
): Promise<void> {
  const db = getSupabaseClient();
  const { error } = await db
    .from('client_suppressions')
    .upsert({
      client_id: clientId,
      company_id: companyId,
      contact_id: null,
      reason,
      notes: notes ?? null,
    });

  if (error) throw new Error(`Failed to suppress company: ${error.message}`);
}

/**
 * Suppress a contact for a specific client.
 */
export async function suppressContactForClient(
  clientId: string,
  contactId: string,
  reason: string = 'client_request',
  notes?: string,
): Promise<void> {
  const db = getSupabaseClient();
  const { error } = await db
    .from('client_suppressions')
    .upsert({
      client_id: clientId,
      company_id: null,
      contact_id: contactId,
      reason,
      notes: notes ?? null,
    });

  if (error) throw new Error(`Failed to suppress contact: ${error.message}`);
}

export async function unsuppressCompanyForClient(
  clientId: string,
  companyId: string,
): Promise<void> {
  const db = getSupabaseClient();
  const { error } = await db
    .from('client_suppressions')
    .delete()
    .eq('client_id', clientId)
    .eq('company_id', companyId);

  if (error) throw new Error(`Failed to unsuppress company: ${error.message}`);
}

export async function unsuppressContactForClient(
  clientId: string,
  contactId: string,
): Promise<void> {
  const db = getSupabaseClient();
  const { error } = await db
    .from('client_suppressions')
    .delete()
    .eq('client_id', clientId)
    .eq('contact_id', contactId);

  if (error) throw new Error(`Failed to unsuppress contact: ${error.message}`);
}

export async function getClientSuppressions(clientId: string): Promise<Array<{
  companyId: string | null;
  contactId: string | null;
  companyName: string | null;
  contactName: string | null;
  reason: string;
  notes: string | null;
  suppressedAt: string;
}>> {
  const db = getSupabaseClient();
  const { data, error } = await db
    .from('client_suppressions')
    .select(`
      company_id,
      contact_id,
      reason,
      notes,
      suppressed_at,
      companies (name),
      contacts (first_name, last_name)
    `)
    .eq('client_id', clientId)
    .order('suppressed_at', { ascending: false });

  if (error) throw new Error(`Failed to get suppressions: ${error.message}`);

  return (data ?? []).map(row => {
    const company = (row as Record<string, unknown>).companies as Record<string, unknown> | null;
    const contact = (row as Record<string, unknown>).contacts as Record<string, unknown> | null;
    return {
      companyId: row.company_id,
      contactId: row.contact_id,
      companyName: (company?.name as string) ?? null,
      contactName: contact ? `${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim() : null,
      reason: row.reason,
      notes: row.notes,
      suppressedAt: row.suppressed_at,
    };
  });
}

export async function isCompanySuppressedForClient(
  clientId: string,
  companyId: string,
): Promise<boolean> {
  const db = getSupabaseClient();
  const { data } = await db
    .from('client_suppressions')
    .select('id')
    .eq('client_id', clientId)
    .eq('company_id', companyId)
    .maybeSingle();

  return data !== null;
}

export async function isContactSuppressedForClient(
  clientId: string,
  contactId: string,
): Promise<boolean> {
  const db = getSupabaseClient();

  // Check direct contact suppression
  const { data: contactSuppression } = await db
    .from('client_suppressions')
    .select('id')
    .eq('client_id', clientId)
    .eq('contact_id', contactId)
    .maybeSingle();

  if (contactSuppression) return true;

  // Check if their company is suppressed
  const { data: contact } = await db
    .from('contacts')
    .select('company_id')
    .eq('id', contactId)
    .maybeSingle();

  if (contact?.company_id) {
    return isCompanySuppressedForClient(clientId, contact.company_id);
  }

  return false;
}

