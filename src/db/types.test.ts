import { describe, it, expect, expectTypeOf } from "vitest";
import type {
  OrganizationRow,
  OrganizationInsert,
  OrganizationUpdate,
  ContactRow,
  ContactInsert,
  CampaignRow,
  CampaignInsert,
  CampaignContactRow,
  CampaignContactInsert,
  EnrichmentLogRow,
  EnrichmentLogInsert,
} from "./types.js";
import { TABLES } from "./types.js";

describe("type correctness", () => {
  it("OrganizationRow has expected shape", () => {
    expectTypeOf<OrganizationRow>().toHaveProperty("id");
    expectTypeOf<OrganizationRow>().toHaveProperty("name");
    expectTypeOf<OrganizationRow>().toHaveProperty("domain");
    expectTypeOf<OrganizationRow>().toHaveProperty("raw_data");
    expectTypeOf<OrganizationRow>().toHaveProperty("created_at");
  });

  it("OrganizationInsert makes id optional, name required", () => {
    expectTypeOf<OrganizationInsert>().toHaveProperty("name");
    expectTypeOf<OrganizationInsert>().toHaveProperty("id");
  });

  it("OrganizationUpdate makes all fields optional", () => {
    expectTypeOf<OrganizationUpdate>().toMatchTypeOf<{ name?: string }>();
  });

  it("ContactRow has status and email fields", () => {
    expectTypeOf<ContactRow>().toHaveProperty("status");
    expectTypeOf<ContactRow>().toHaveProperty("email");
    expectTypeOf<ContactRow>().toHaveProperty("organization_id");
  });

  it("ContactInsert has optional status with default", () => {
    expectTypeOf<ContactInsert>().toHaveProperty("email");
    expectTypeOf<ContactInsert>().toHaveProperty("status");
  });

  it("CampaignRow has channel and status", () => {
    expectTypeOf<CampaignRow>().toHaveProperty("channel");
    expectTypeOf<CampaignRow>().toHaveProperty("status");
  });

  it("CampaignInsert requires name and channel", () => {
    expectTypeOf<CampaignInsert>().toHaveProperty("name");
    expectTypeOf<CampaignInsert>().toHaveProperty("channel");
  });

  it("CampaignContactRow links campaign to contact", () => {
    expectTypeOf<CampaignContactRow>().toHaveProperty("campaign_id");
    expectTypeOf<CampaignContactRow>().toHaveProperty("contact_id");
    expectTypeOf<CampaignContactRow>().toHaveProperty("status");
  });

  it("CampaignContactInsert requires campaign_id and contact_id", () => {
    expectTypeOf<CampaignContactInsert>().toHaveProperty("campaign_id");
    expectTypeOf<CampaignContactInsert>().toHaveProperty("contact_id");
  });

  it("EnrichmentLogRow tracks source and entity", () => {
    expectTypeOf<EnrichmentLogRow>().toHaveProperty("source");
    expectTypeOf<EnrichmentLogRow>().toHaveProperty("entity_type");
    expectTypeOf<EnrichmentLogRow>().toHaveProperty("entity_id");
    expectTypeOf<EnrichmentLogRow>().toHaveProperty("success");
  });

  it("EnrichmentLogInsert requires source and entity fields", () => {
    expectTypeOf<EnrichmentLogInsert>().toHaveProperty("source");
    expectTypeOf<EnrichmentLogInsert>().toHaveProperty("entity_type");
    expectTypeOf<EnrichmentLogInsert>().toHaveProperty("entity_id");
  });
});

describe("TABLES constants", () => {
  it("has all table names", () => {
    expect(TABLES.organizations).toBe("organizations");
    expect(TABLES.contacts).toBe("contacts");
    expect(TABLES.campaigns).toBe("campaigns");
    expect(TABLES.campaign_contacts).toBe("campaign_contacts");
    expect(TABLES.enrichment_log).toBe("enrichment_log");
  });
});
