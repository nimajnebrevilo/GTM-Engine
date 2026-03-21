/**
 * Contact CRUD and search queries.
 * Contacts are people at companies — the actual outreach targets.
 */

import { getSupabaseClient } from '../client.js';

export interface ContactRow {
  id: string;
  company_id: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  email_status: string | null;
  title: string | null;
  seniority: string | null;
  department: string | null;
  linkedin_url: string | null;
  phone: string | null;
  phone_status: string | null;
  apollo_id: string | null;
  status: string;
  original_source: string | null;
  raw_data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CreateContactInput {
  companyId?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  emailStatus?: string;
  title?: string;
  seniority?: string;
  department?: string;
  linkedinUrl?: string;
  phone?: string;
  apolloId?: string;
  originalSource?: string;
  rawData?: Record<string, unknown>;
}

export async function createContact(input: CreateContactInput): Promise<ContactRow> {
  const db = getSupabaseClient();
  const { data, error } = await db
    .from('contacts')
    .insert({
      company_id: input.companyId ?? null,
      first_name: input.firstName ?? null,
      last_name: input.lastName ?? null,
      email: input.email ?? null,
      email_status: input.emailStatus ?? null,
      title: input.title ?? null,
      seniority: input.seniority ?? null,
      department: input.department ?? null,
      linkedin_url: input.linkedinUrl ?? null,
      phone: input.phone ?? null,
      apollo_id: input.apolloId ?? null,
      original_source: input.originalSource ?? null,
      raw_data: input.rawData ?? {},
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create contact: ${error.message}`);
  return data as ContactRow;
}

export async function getContact(id: string): Promise<ContactRow> {
  const db = getSupabaseClient();
  const { data, error } = await db
    .from('contacts')
    .select()
    .eq('id', id)
    .single();

  if (error) throw new Error(`Failed to get contact: ${error.message}`);
  return data as ContactRow;
}

export async function getContactsByCompany(companyId: string): Promise<ContactRow[]> {
  const db = getSupabaseClient();
  const { data, error } = await db
    .from('contacts')
    .select()
    .eq('company_id', companyId)
    .neq('status', 'do_not_contact')
    .order('seniority', { ascending: true });

  if (error) throw new Error(`Failed to get contacts: ${error.message}`);
  return data as ContactRow[];
}

/**
 * Find contacts by email (for dedup on import).
 */
export async function findContactByEmail(email: string): Promise<ContactRow | null> {
  const db = getSupabaseClient();
  const { data, error } = await db
    .from('contacts')
    .select()
    .eq('email', email.toLowerCase())
    .maybeSingle();

  if (error) throw new Error(`Failed to find contact: ${error.message}`);
  return data as ContactRow | null;
}

/**
 * Find contact by Apollo ID (for enrichment dedup).
 */
export async function findContactByApolloId(apolloId: string): Promise<ContactRow | null> {
  const db = getSupabaseClient();
  const { data, error } = await db
    .from('contacts')
    .select()
    .eq('apollo_id', apolloId)
    .maybeSingle();

  if (error) throw new Error(`Failed to find contact: ${error.message}`);
  return data as ContactRow | null;
}

/**
 * Batch upsert contacts (dedup by email).
 */
export async function batchUpsertContacts(
  contacts: CreateContactInput[],
): Promise<{ inserted: number; updated: number; errors: number }> {
  let inserted = 0;
  let updated = 0;
  let errors = 0;

  for (const contact of contacts) {
    try {
      if (contact.email) {
        const existing = await findContactByEmail(contact.email);
        if (existing) {
          const db = getSupabaseClient();
          const updates: Record<string, unknown> = {};
          if (contact.title && !existing.title) updates.title = contact.title;
          if (contact.phone && !existing.phone) updates.phone = contact.phone;
          if (contact.linkedinUrl && !existing.linkedin_url) updates.linkedin_url = contact.linkedinUrl;
          if (contact.seniority && !existing.seniority) updates.seniority = contact.seniority;
          if (contact.department && !existing.department) updates.department = contact.department;
          if (contact.apolloId && !existing.apollo_id) updates.apollo_id = contact.apolloId;
          if (contact.companyId && !existing.company_id) updates.company_id = contact.companyId;

          if (Object.keys(updates).length > 0) {
            await db.from('contacts').update(updates).eq('id', existing.id);
          }
          updated++;
          continue;
        }
      }
      await createContact(contact);
      inserted++;
    } catch {
      errors++;
    }
  }

  return { inserted, updated, errors };
}

/**
 * Search contacts with filters.
 */
export async function searchContacts(filters: {
  companyId?: string;
  seniority?: string;
  department?: string;
  status?: string;
  limit?: number;
}): Promise<ContactRow[]> {
  const db = getSupabaseClient();
  let query = db.from('contacts').select();

  if (filters.companyId) query = query.eq('company_id', filters.companyId);
  if (filters.seniority) query = query.eq('seniority', filters.seniority);
  if (filters.department) query = query.eq('department', filters.department);
  if (filters.status) query = query.eq('status', filters.status);

  query = query.order('created_at', { ascending: false });
  if (filters.limit) query = query.limit(filters.limit);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to search contacts: ${error.message}`);
  return data as ContactRow[];
}
