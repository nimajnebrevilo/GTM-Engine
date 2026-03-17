import { getSupabaseClient } from "./client.js";
import type { Contact, ContactInsert, ContactUpdate, ContactStatus } from "./types.js";

const TABLE = "contacts";

export async function upsertContact(contact: ContactInsert): Promise<Contact> {
  const { data, error } = await getSupabaseClient()
    .from(TABLE)
    .upsert(contact as never, { onConflict: "apollo_id" })
    .select()
    .single();

  if (error) throw error;
  return data as Contact;
}

export async function upsertContacts(
  contacts: ContactInsert[]
): Promise<Contact[]> {
  const { data, error } = await getSupabaseClient()
    .from(TABLE)
    .upsert(contacts as never, { onConflict: "apollo_id" })
    .select();

  if (error) throw error;
  return data as Contact[];
}

export async function getContactById(id: string): Promise<Contact | null> {
  const { data, error } = await getSupabaseClient()
    .from(TABLE)
    .select()
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data as Contact | null;
}

export async function getContactByEmail(
  email: string
): Promise<Contact | null> {
  const { data, error } = await getSupabaseClient()
    .from(TABLE)
    .select()
    .eq("email", email)
    .maybeSingle();

  if (error) throw error;
  return data as Contact | null;
}

export async function updateContact(
  id: string,
  updates: ContactUpdate
): Promise<Contact> {
  const { data, error } = await getSupabaseClient()
    .from(TABLE)
    .update(updates as never)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as Contact;
}

export async function updateContactStatus(
  id: string,
  status: ContactStatus
): Promise<Contact> {
  return updateContact(id, { status });
}

export async function listContacts(opts?: {
  organization_id?: string;
  status?: ContactStatus;
  limit?: number;
  offset?: number;
}): Promise<Contact[]> {
  let query = getSupabaseClient().from(TABLE).select();

  if (opts?.organization_id)
    query = query.eq("organization_id", opts.organization_id);
  if (opts?.status) query = query.eq("status", opts.status);

  const limit = opts?.limit ?? 100;
  const offset = opts?.offset ?? 0;
  query = query
    .range(offset, offset + limit - 1)
    .order("created_at", { ascending: false });

  const { data, error } = await query;
  if (error) throw error;
  return data as Contact[];
}

export async function listContactsReadyForVerification(
  limit = 100
): Promise<Contact[]> {
  const { data, error } = await getSupabaseClient()
    .from(TABLE)
    .select()
    .eq("status", "enriched")
    .not("email", "is", null)
    .limit(limit)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data as Contact[];
}

export async function listContactsReadyForOutreach(
  limit = 100
): Promise<Contact[]> {
  const { data, error } = await getSupabaseClient()
    .from(TABLE)
    .select()
    .eq("status", "verified")
    .eq("email_status", "ok")
    .limit(limit)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data as Contact[];
}
