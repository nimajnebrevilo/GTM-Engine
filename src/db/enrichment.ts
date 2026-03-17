import { getSupabaseClient } from "./client.js";
import type {
  EnrichmentLogEntry,
  EnrichmentLogInsert,
  EnrichmentSource,
} from "./types.js";

export async function logEnrichment(
  entry: EnrichmentLogInsert
): Promise<EnrichmentLogEntry> {
  const { data, error } = await getSupabaseClient()
    .from("enrichment_log")
    .insert(entry as never)
    .select()
    .single();

  if (error) throw error;
  return data as EnrichmentLogEntry;
}

export async function getEnrichmentHistory(
  entityType: string,
  entityId: string,
  source?: EnrichmentSource
): Promise<EnrichmentLogEntry[]> {
  let query = getSupabaseClient()
    .from("enrichment_log")
    .select()
    .eq("entity_type", entityType)
    .eq("entity_id", entityId);

  if (source) query = query.eq("source", source);

  query = query.order("created_at", { ascending: false });

  const { data, error } = await query;
  if (error) throw error;
  return data as EnrichmentLogEntry[];
}

export async function hasBeenEnriched(
  entityType: string,
  entityId: string,
  source: EnrichmentSource
): Promise<boolean> {
  const { count, error } = await getSupabaseClient()
    .from("enrichment_log")
    .select("id", { count: "exact", head: true })
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .eq("source", source)
    .eq("success", true);

  if (error) throw error;
  return (count ?? 0) > 0;
}
