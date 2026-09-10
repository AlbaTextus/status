import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { D1Database } from "@cloudflare/workers-types";

export interface StatusEnv {
  DB: D1Database;
  STATUS_ADMIN_TOKEN?: string;
}

export async function getStatusEnv(): Promise<StatusEnv> {
  const { env } = await getCloudflareContext({ async: true });
  const bindings = env as unknown as StatusEnv;
  if (!bindings.DB) throw new Error("缺少 Cloudflare D1 绑定 DB，请检查 Wrangler 配置");
  return bindings;
}

export async function getDatabase(): Promise<D1Database> {
  return (await getStatusEnv()).DB;
}
