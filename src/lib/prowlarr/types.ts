import { z } from "zod";

// Somente os campos usados pela aplicação; o restante da resposta upstream é descartado no parse.

const upstreamCategorySchema = z.object({
  id: z.number(),
  name: z.string().nullish(),
});

export const systemStatusSchema = z.object({
  version: z.string(),
});

export const indexerSchema = z.object({
  id: z.number(),
  name: z.string(),
  enable: z.boolean(),
  protocol: z.string(),
  capabilities: z.object({ categories: z.array(upstreamCategorySchema).nullish() }).nullish(),
});

export const indexerStatusSchema = z.object({
  indexerId: z.number(),
  disabledTill: z.string().nullish(),
});

export const searchResultSchema = z.object({
  guid: z.string().nullish(),
  title: z.string().nullish(),
  indexerId: z.number(),
  indexer: z.string().nullish(),
  size: z.number().nullish(),
  seeders: z.number().nullish(),
  leechers: z.number().nullish(),
  publishDate: z.string().nullish(),
  categories: z.array(upstreamCategorySchema).nullish(),
  downloadUrl: z.string().nullish(),
  magnetUrl: z.string().nullish(),
  infoUrl: z.string().nullish(),
  infoHash: z.string().nullish(),
  grabs: z.number().nullish(),
  files: z.number().nullish(),
  imdbId: z.number().nullish(),
});

export type UpstreamCategory = z.output<typeof upstreamCategorySchema>;
export type UpstreamIndexer = z.output<typeof indexerSchema>;
export type UpstreamIndexerStatus = z.output<typeof indexerStatusSchema>;
export type UpstreamSearchResult = z.output<typeof searchResultSchema>;
