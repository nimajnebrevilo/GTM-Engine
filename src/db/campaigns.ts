import { getSupabaseClient } from "./client.js";
import type {
  Campaign,
  CampaignInsert,
  CampaignUpdate,
  CampaignContact,
  CampaignContactInsert,
  CampaignContactUpdate,
  CampaignStatus,
  OutreachStatus,
} from "./types.js";

// ----- Campaigns -----

export async function createCampaign(
  campaign: CampaignInsert
): Promise<Campaign> {
  const { data, error } = await getSupabaseClient()
    .from("campaigns")
    .insert(campaign as never)
    .select()
    .single();

  if (error) throw error;
  return data as Campaign;
}

export async function getCampaignById(
  id: string
): Promise<Campaign | null> {
  const { data, error } = await getSupabaseClient()
    .from("campaigns")
    .select()
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data as Campaign | null;
}

export async function updateCampaign(
  id: string,
  updates: CampaignUpdate
): Promise<Campaign> {
  const { data, error } = await getSupabaseClient()
    .from("campaigns")
    .update(updates as never)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as Campaign;
}

export async function listCampaigns(opts?: {
  status?: CampaignStatus;
  limit?: number;
  offset?: number;
}): Promise<Campaign[]> {
  let query = getSupabaseClient().from("campaigns").select();

  if (opts?.status) query = query.eq("status", opts.status);

  const limit = opts?.limit ?? 100;
  const offset = opts?.offset ?? 0;
  query = query
    .range(offset, offset + limit - 1)
    .order("created_at", { ascending: false });

  const { data, error } = await query;
  if (error) throw error;
  return data as Campaign[];
}

// ----- Campaign ↔ Contact assignments -----

export async function addContactsToCampaign(
  campaignId: string,
  contactIds: string[]
): Promise<CampaignContact[]> {
  const rows: CampaignContactInsert[] = contactIds.map((contactId) => ({
    campaign_id: campaignId,
    contact_id: contactId,
    status: "pending" as const,
    sent_at: null,
    opened_at: null,
    replied_at: null,
  }));

  const { data, error } = await getSupabaseClient()
    .from("campaign_contacts")
    .upsert(rows as never, {
      onConflict: "campaign_id,contact_id",
    })
    .select();

  if (error) throw error;
  return data as CampaignContact[];
}

export async function updateCampaignContactStatus(
  campaignId: string,
  contactId: string,
  status: OutreachStatus,
  timestamps?: Partial<
    Pick<CampaignContact, "sent_at" | "opened_at" | "replied_at">
  >
): Promise<CampaignContact> {
  const updates: CampaignContactUpdate = { status, ...timestamps };

  const { data, error } = await getSupabaseClient()
    .from("campaign_contacts")
    .update(updates as never)
    .eq("campaign_id", campaignId)
    .eq("contact_id", contactId)
    .select()
    .single();

  if (error) throw error;
  return data as CampaignContact;
}

export async function listCampaignContacts(
  campaignId: string,
  opts?: { status?: OutreachStatus }
): Promise<CampaignContact[]> {
  let query = getSupabaseClient()
    .from("campaign_contacts")
    .select()
    .eq("campaign_id", campaignId);

  if (opts?.status) query = query.eq("status", opts.status);

  const { data, error } = await query;
  if (error) throw error;
  return data as CampaignContact[];
}
