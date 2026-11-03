import "server-only";

import { z } from "zod";

const configSchema = z.object({
  PROWLARR_URL: z.url({ protocol: /^https?$/ }),
  PROWLARR_API_KEY: z.string().min(16),
});

export type AppConfig = z.output<typeof configSchema>;

// Lido por chamada para que o build não exija segredos.
export function getConfig(): AppConfig {
  const parsed = configSchema.safeParse(process.env);

  if (!parsed.success) {
    const names = [...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))];
    throw new Error(`Configuração inválida: ${names.join(", ")}`);
  }

  return parsed.data;
}
