import { getSupabaseClient } from "./client.js";
import type { Organization, OrganizationInsert, OrganizationUpdate } from "./types.js";

const TABLE = "organizations";

export async function upsertOrganization(
  org: OrganizationInsert
): Promise<Organization> {
  const { data, error } = await getSupabaseClient()
    .from(TABLE)
    .upsert(org as never, { onConflict: "apollo_id" })
    .select()
    .single();

  if (error) throw error;
  return data as Organization;
}

export async function upsertOrganizations(
  orgs: OrganizationInsert[]
): Promise<Organization[]> {
  const { data, error } = await getSupabaseClient()
    .from(TABLE)
    .upsert(orgs as never, { onConflict: "apollo_id" })
    .select();

  if (error) throw error;
  return data as Organization[];
}

export async function getOrganizationById(
  id: string
): Promise<Organization | null> {
  const { data, error } = await getSupabaseClient()
    .from(TABLE)
    .select()
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data as Organization | null;
}

export async function getOrganizationByDomain(
  domain: string
): Promise<Organization | null> {
  const { data, error } = await getSupabaseClient()
    .from(TABLE)
    .select()
    .eq("domain", domain)
    .maybeSingle();

  if (error) throw error;
  return data as Organization | null;
}

export async function updateOrganization(
  id: string,
  updates: OrganizationUpdate
): Promise<Organization> {
  const { data, error } = await getSupabaseClient()
    .from(TABLE)
    .update(updates as never)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as Organization;
}

export async function listOrganizations(opts?: {
  industry?: string;
  limit?: number;
  offset?: number;
}): Promise<Organization[]> {
  let query = getSupabaseClient().from(TABLE).select();

  if (opts?.industry) query = query.eq("industry", opts.industry);

  const limit = opts?.limit ?? 100;
  const offset = opts?.offset ?? 0;
  query = query.range(offset, offset + limit - 1).order("created_at", { ascending: false });

  const { data, error } = await query;
  if (error) throw error;
  return data as Organization[];
}
