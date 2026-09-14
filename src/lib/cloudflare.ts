import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { D1Database } from "@cloudflare/workers-types";

export interface StatusEnv {
  DB: D1Database;
  STATUS_ADMIN_TOKEN?: string;
  STATUS_OAUTH_NAME?: string;
  STATUS_OAUTH_CLIENT_ID?: string;
  STATUS_OAUTH_CLIENT_SECRET?: string;
  STATUS_OAUTH_AUTHORIZATION_URL?: string;
  STATUS_OAUTH_TOKEN_URL?: string;
  STATUS_OAUTH_USERINFO_URL?: string;
  STATUS_OAUTH_REDIRECT_URI?: string;
  STATUS_OAUTH_ISSUER?: string;
  STATUS_OAUTH_SCOPES?: string;
  STATUS_OAUTH_USER_ID_CLAIM?: string;
  STATUS_OAUTH_ALLOWED_USER_IDS?: string;
  STATUS_OAUTH_TOKEN_AUTH_METHOD?: string;
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
