import { test, expect } from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getPlatformProxy, type PlatformProxy } from "wrangler";
import { authorizeAdmin, getAdminSession, getOAuthConfig, handleAuthRequest } from "../../src/lib/auth";
import type { StatusEnv } from "../../src/lib/cloudflare";

type Grant = {
  challenge: string;
  profile: unknown;
  redirectUri: string;
  authMethod?: "client_secret_basic" | "client_secret_post";
  failure?: "token" | "token-redirect" | "profile-redirect" | "profile-json";
};
type Flow = { cookie: string; authorization: URL; env: StatusEnv };

let platform: PlatformProxy<StatusEnv>;
let provider: Server;
let providerOrigin: string;
let tokenRequests = 0;
let followedRedirects = 0;
const grants = new Map<string, Grant>();
const accessTokens = new Map<string, Grant>();

function settings(overrides: Partial<StatusEnv> = {}): StatusEnv {
  return {
    DB: platform.env.DB,
    STATUS_OAUTH_NAME: "测试统一账号",
    STATUS_OAUTH_CLIENT_ID: "status-test-client",
    STATUS_OAUTH_CLIENT_SECRET: "status-test-secret",
    STATUS_OAUTH_AUTHORIZATION_URL: `${providerOrigin}/authorize`,
    STATUS_OAUTH_TOKEN_URL: `${providerOrigin}/token`,
    STATUS_OAUTH_USERINFO_URL: `${providerOrigin}/userinfo`,
    STATUS_OAUTH_REDIRECT_URI: "http://127.0.0.1:3100/api/auth/callback",
    STATUS_OAUTH_ALLOWED_USER_IDS: "admin-1,42",
    ...overrides,
  };
}

function roleSettings(overrides: Partial<StatusEnv> = {}): StatusEnv {
  return settings({
    STATUS_OAUTH_ALLOWED_USER_IDS: undefined,
    STATUS_OAUTH_ALLOWED_ROLES: "ADMIN, SUPER_ADMIN",
    ...overrides,
  });
}

function cookieFrom(response: Response, kind: "session" | "flow") {
  const cookie = response.headers.getSetCookie().find(value => value.includes(`status-${kind}=`) && !value.includes("Max-Age=0"));
  expect(cookie).toBeDefined();
  return cookie!.split(";", 1)[0];
}

async function start(env = settings()): Promise<Flow> {
  const response = await handleAuthRequest(new Request(new URL("/api/auth/login", env.STATUS_OAUTH_REDIRECT_URI)), env, "login");
  expect(response.status).toBe(303);
  expect(response.headers.get("cache-control")).toBe("no-store");
  return { cookie: cookieFrom(response, "flow"), authorization: new URL(response.headers.get("location")!), env };
}

function callbackRequest(flow: Flow, grant: Partial<Grant> = {}, previousCookie?: string) {
  const code = randomUUID();
  grants.set(code, {
    challenge: flow.authorization.searchParams.get("code_challenge")!,
    redirectUri: flow.env.STATUS_OAUTH_REDIRECT_URI!,
    profile: { sub: "admin-1", name: "测试管理员" },
    ...grant,
  });
  const target = new URL(flow.env.STATUS_OAUTH_REDIRECT_URI!);
  target.searchParams.set("state", flow.authorization.searchParams.get("state")!);
  target.searchParams.set("code", code);
  return new Request(target, { headers: { cookie: [flow.cookie, previousCookie].filter(Boolean).join("; ") } });
}

async function signIn(env = settings(), grant: Partial<Grant> = {}, previousCookie?: string) {
  const flow = await start(env);
  const request = callbackRequest(flow, grant, previousCookie);
  const response = await handleAuthRequest(request, env, "callback");
  expect(response.headers.get("location")).toBe(new URL("/admin", env.STATUS_OAUTH_REDIRECT_URI).href);
  return { cookie: cookieFrom(response, "session"), response, request, flow };
}

function adminRequest(cookie: string, init: RequestInit = {}, env = settings()) {
  const headers = new Headers(init.headers);
  headers.set("cookie", cookie);
  return new Request(new URL("/api/admin", env.STATUS_OAUTH_REDIRECT_URI), { ...init, headers });
}

function errorCode(response: Response) {
  return new URL(response.headers.get("location")!).searchParams.get("auth_error");
}

test.beforeAll(async () => {
  const outputDir = path.resolve("temp/output/auth-runtime");
  await mkdir(outputDir, { recursive: true });
  const configPath = path.join(outputDir, "wrangler.jsonc");
  await writeFile(configPath, JSON.stringify({
    name: "status-auth-tests",
    compatibility_date: "2026-09-01",
    d1_databases: [{ binding: "DB", database_name: "status-auth-tests", database_id: "00000000-0000-0000-0000-000000000001" }],
  }));
  platform = await getPlatformProxy<StatusEnv>({ configPath, persist: false, remoteBindings: false, envFiles: [] });
  for (const name of ["0003_auth.sql", "0004_auth_roles.sql"]) {
    const migration = await readFile(path.resolve("migrations", name), "utf8");
    await platform.env.DB.batch(migration.split(";").map(sql => sql.trim()).filter(Boolean).map(sql => platform.env.DB.prepare(sql)));
  }

  provider = createServer(async (request, response) => {
    const url = new URL(request.url!, providerOrigin);
    const send = (value: unknown, status = 200) => {
      response.writeHead(status, { "Content-Type": "application/json" });
      response.end(JSON.stringify(value));
    };
    if (url.pathname === "/token") {
      tokenRequests += 1;
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const body = new URLSearchParams(Buffer.concat(chunks).toString());
      const grant = grants.get(body.get("code") ?? "");
      if (!grant) return send({ error: "invalid_grant" }, 400);
      grants.delete(body.get("code")!);
      const basic = Buffer.from(request.headers.authorization?.replace(/^Basic /i, "") ?? "", "base64").toString();
      const [basicId, basicSecret] = basic.split(":").map(value => decodeURIComponent(value.replace(/\+/g, " ")));
      const validClient = grant.authMethod === "client_secret_post"
        ? body.get("client_id") === "status-test-client" && body.get("client_secret") === "status-test-secret"
        : basicId === "status-test-client" && basicSecret === "status-test-secret";
      const challenge = createHash("sha256").update(body.get("code_verifier") ?? "").digest("base64url");
      if (!validClient || body.get("grant_type") !== "authorization_code" || body.get("redirect_uri") !== grant.redirectUri || challenge !== grant.challenge) {
        return send({ error: "invalid_request" }, 400);
      }
      if (grant.failure === "token") return send({ error: "invalid_grant", error_description: "provider-private-detail" }, 400);
      if (grant.failure === "token-redirect") {
        response.writeHead(302, { Location: `${providerOrigin}/must-not-follow` });
        return response.end();
      }
      const token = randomUUID();
      accessTokens.set(token, grant);
      return send({ access_token: token, token_type: "Bearer", expires_in: 3600 });
    }
    if (url.pathname === "/userinfo") {
      const token = request.headers.authorization?.replace(/^Bearer /i, "");
      const grant = token && accessTokens.get(token);
      if (!grant) return send({ error: "invalid_token" }, 401);
      if (grant.failure === "profile-redirect") {
        response.writeHead(302, { Location: `${providerOrigin}/must-not-follow` });
        return response.end();
      }
      if (grant.failure === "profile-json") {
        response.writeHead(200, { "Content-Type": "text/html" });
        return response.end("provider-private-detail");
      }
      return send(grant.profile);
    }
    if (url.pathname === "/must-not-follow") followedRedirects += 1;
    send({ error: "not_found" }, 404);
  });
  await new Promise<void>(resolve => provider.listen(0, "127.0.0.1", resolve));
  const address = provider.address();
  if (!address || typeof address === "string") throw new Error("Mock provider did not start");
  providerOrigin = `http://127.0.0.1:${address.port}`;
});

test.beforeEach(async () => {
  await platform.env.DB.batch([
    platform.env.DB.prepare("DELETE FROM auth_flows"),
    platform.env.DB.prepare("DELETE FROM auth_sessions"),
  ]);
  grants.clear();
  accessTokens.clear();
  tokenRequests = 0;
  followedRedirects = 0;
});

test.afterAll(async () => {
  if (provider?.listening) {
    provider.closeAllConnections();
    await new Promise<void>(resolve => provider.close(() => resolve()));
  }
  await platform?.dispose();
});

test("complete OAuth2 login exchanges a PKCE code and authorizes the D1 session", async () => {
  const env = settings();
  const { cookie, flow, response } = await signIn(env);
  expect(flow.authorization.searchParams.get("response_type")).toBe("code");
  expect(flow.authorization.searchParams.get("response_mode")).toBe("query");
  expect(flow.authorization.searchParams.get("code_challenge_method")).toBe("S256");
  expect(flow.authorization.searchParams.get("scope")).toBe("profile");
  expect(flow.authorization.searchParams.has("client_secret")).toBe(false);
  expect(tokenRequests).toBe(1);
  await expect(authorizeAdmin(adminRequest(cookie), env)).resolves.toBeUndefined();
  await expect(getAdminSession(adminRequest(cookie), env)).resolves.toEqual({ id: "admin-1", name: "测试管理员" });
  expect(response.headers.getSetCookie().some(value => value.includes("status-flow=") && value.includes("Max-Age=0"))).toBe(true);
  const row = await env.DB.prepare("SELECT * FROM auth_sessions").first();
  expect(JSON.stringify(row)).not.toContain(cookie.split("=")[1]);
  expect(Object.keys(row!)).not.toContain("access_token");
});

test("session information exposes only public login options and the current identity", async () => {
  const env = settings();
  const request = new Request("http://127.0.0.1:3100/api/auth/session");
  const response = await handleAuthRequest(request, env, "session");
  const value = await response.json();
  expect(value).toMatchObject({ authenticated: false, oauth: { name: "测试统一账号" }, tokenEnabled: false });
  expect(JSON.stringify(value)).not.toMatch(/status-test-secret|status-test-client|admin-1|allowedUserIds/);
  expect(response.headers.get("cache-control")).toBe("no-store");
  const { cookie } = await signIn(env);
  const loggedIn = await handleAuthRequest(new Request(request, { headers: { cookie } }), env, "session");
  expect(await loggedIn.json()).toMatchObject({ authenticated: true, method: "oauth", user: { id: "admin-1" } });
});

test("rejects an account outside the administrator allowlist", async () => {
  const flow = await start();
  const response = await handleAuthRequest(callbackRequest(flow, { profile: { sub: "ordinary-user", name: "Visitor" } }), flow.env, "callback");
  expect(errorCode(response)).toBe("forbidden");
  expect(await flow.env.DB.prepare("SELECT COUNT(*) AS count FROM auth_sessions").first("count")).toBe(0);
});

test("supports nested numeric user IDs and client_secret_post", async () => {
  const env = settings({ STATUS_OAUTH_USER_ID_CLAIM: "data.id", STATUS_OAUTH_TOKEN_AUTH_METHOD: "client_secret_post", STATUS_OAUTH_SCOPES: "read:user profile" });
  const { cookie, flow } = await signIn(env, { profile: { data: { id: 42, username: "nested-admin" } }, authMethod: "client_secret_post" });
  expect(flow.authorization.searchParams.get("scope")).toBe("read:user profile");
  await expect(getAdminSession(adminRequest(cookie), env)).resolves.toEqual({ id: "42", name: "nested-admin" });
});

test("Connect profile claims retain the administrator UUID and display name", async () => {
  const id = "b3d1db2c-8b91-4ad7-8e67-ea15af670890";
  const env = settings({ STATUS_OAUTH_NAME: "ALBATEXTUS Connect", STATUS_OAUTH_ALLOWED_USER_IDS: id, STATUS_OAUTH_TOKEN_AUTH_METHOD: "client_secret_post" });
  const { cookie } = await signIn(env, {
    authMethod: "client_secret_post",
    profile: { id, sub: id, display_name: "Connect 管理员", role: "SUPER_ADMIN", avatar_url: "" },
  });
  await expect(getAdminSession(adminRequest(cookie), env)).resolves.toEqual({ id, name: "Connect 管理员" });
});

for (const role of ["ADMIN", "SUPER_ADMIN"]) {
  test(`Connect ${role} accounts can sign in without an owner UUID allowlist`, async () => {
    const env = roleSettings({ STATUS_OAUTH_TOKEN_AUTH_METHOD: "client_secret_post" });
    for (const id of [randomUUID(), randomUUID()]) {
      const { cookie } = await signIn(env, {
        authMethod: "client_secret_post",
        profile: { id, sub: id, display_name: "Connect 管理员", role },
      });
      await expect(authorizeAdmin(adminRequest(cookie), env)).resolves.toBeUndefined();
      await expect(getAdminSession(adminRequest(cookie), env)).resolves.toEqual({ id, name: "Connect 管理员" });
      const response = await handleAuthRequest(adminRequest(cookie), env, "session");
      expect(await response.json()).toMatchObject({ authenticated: true, method: "oauth", user: { id } });
    }
  });
}

test("role access rejects ordinary, missing, unknown and malformed userinfo roles", async () => {
  const env = roleSettings();
  for (const role of ["USER", "unknown", undefined, null, "super_admin", "*", "ADMIN,SUPER_ADMIN", 4, ["SUPER_ADMIN"], { role: "SUPER_ADMIN" }]) {
    const flow = await start(env);
    const response = await handleAuthRequest(callbackRequest(flow, { profile: { sub: "admin-1", role } }), env, "callback");
    expect(errorCode(response)).toBe("forbidden");
    expect(response.headers.getSetCookie().some(value => value.includes("status-session="))).toBe(false);
  }
  expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM auth_sessions").first("count")).toBe(0);
});

test("explicit user IDs further restrict access when roles are also configured", async () => {
  const env = roleSettings({ STATUS_OAUTH_ALLOWED_USER_IDS: "admin-1" });
  for (const profile of [{ sub: "another-admin", role: "SUPER_ADMIN" }, { sub: "admin-1", role: "USER" }, { sub: "admin-1" }]) {
    const flow = await start(env);
    expect(errorCode(await handleAuthRequest(callbackRequest(flow, { profile }), env, "callback"))).toBe("forbidden");
  }
  const { cookie } = await signIn(env, { profile: { sub: "admin-1", role: "SUPER_ADMIN" } });
  await expect(authorizeAdmin(adminRequest(cookie), env)).resolves.toBeUndefined();
  await expect(getAdminSession(adminRequest(cookie), { ...env, STATUS_OAUTH_ALLOWED_USER_IDS: "another-admin" })).resolves.toBeNull();
});

test("role authorization uses only the configured nested userinfo claim", async () => {
  const env = roleSettings({ STATUS_OAUTH_USER_ID_CLAIM: "data.id", STATUS_OAUTH_ROLE_CLAIM: "data.access.role" });
  const { cookie } = await signIn(env, { profile: { data: { id: 42, username: "nested-admin", access: { role: "SUPER_ADMIN" } } } });
  await expect(getAdminSession(adminRequest(cookie), env)).resolves.toEqual({ id: "42", name: "nested-admin" });
  for (const data of [{ id: 42 }, { id: 42, access: { role: "USER" } }]) {
    const flow = await start(env);
    const response = await handleAuthRequest(callbackRequest(flow, { profile: { role: "SUPER_ADMIN", data } }), env, "callback");
    expect(errorCode(response)).toBe("forbidden");
  }
});

test("tightening allowed roles revokes affected sessions on their next admin request", async () => {
  const env = roleSettings();
  const admin = await signIn(env, { profile: { sub: "admin-1", role: "ADMIN" } });
  const superAdmin = await signIn(env, { profile: { sub: "another-admin", role: "SUPER_ADMIN" } });
  const restricted = { ...env, STATUS_OAUTH_ALLOWED_ROLES: "SUPER_ADMIN" };
  await expect(authorizeAdmin(adminRequest(admin.cookie), restricted)).rejects.toMatchObject({ status: 401 });
  await expect(authorizeAdmin(adminRequest(superAdmin.cookie), restricted)).resolves.toBeUndefined();
  const response = await handleAuthRequest(adminRequest(admin.cookie), restricted, "session");
  expect(await response.json()).toMatchObject({ authenticated: false, user: null });
});

test("enabling role access or changing its claim requires a new verified login", async () => {
  const legacy = await signIn();
  const env = roleSettings();
  await expect(getAdminSession(adminRequest(legacy.cookie), env)).resolves.toBeNull();
  const { cookie } = await signIn(env, { profile: { sub: "admin-1", role: "SUPER_ADMIN" } });
  await expect(getAdminSession(adminRequest(cookie), { ...env, STATUS_OAUTH_ROLE_CLAIM: "data.role" })).resolves.toBeNull();
  await env.DB.prepare("UPDATE auth_sessions SET user_role = NULL").run();
  await expect(authorizeAdmin(adminRequest(cookie), env)).rejects.toMatchObject({ status: 401 });
});

test("missing or malformed browser binding and state never reach the token endpoint", async () => {
  const flow = await start();
  const valid = callbackRequest(flow);
  const badState = new URL(valid.url);
  badState.searchParams.set("state", "a".repeat(43));
  const duplicateState = new URL(valid.url);
  duplicateState.searchParams.append("state", "b".repeat(43));
  for (const request of [
    new Request(valid.url),
    new Request(valid.url, { headers: { cookie: `status-flow=${"c".repeat(43)}` } }),
    new Request(badState, { headers: { cookie: flow.cookie } }),
    new Request(duplicateState, { headers: { cookie: flow.cookie } }),
    new Request(valid.url, { headers: { cookie: `${flow.cookie}; ${flow.cookie}` } }),
  ]) {
    expect(errorCode(await handleAuthRequest(request, flow.env, "callback"))).toBe("state");
  }
  expect(tokenRequests).toBe(0);
});

test("expired login flows cannot create a session", async () => {
  const flow = await start();
  await flow.env.DB.prepare("UPDATE auth_flows SET expires_at = 0").run();
  expect(errorCode(await handleAuthRequest(callbackRequest(flow), flow.env, "callback"))).toBe("state");
  expect(tokenRequests).toBe(0);
});

test("a login callback can be consumed only once, including concurrent requests", async () => {
  const flow = await start();
  const request = callbackRequest(flow);
  const responses = await Promise.all([
    handleAuthRequest(request.clone(), flow.env, "callback"),
    handleAuthRequest(request.clone(), flow.env, "callback"),
  ]);
  expect(responses.map(errorCode).sort()).toEqual([null, "state"].sort());
  expect(tokenRequests).toBe(1);
  expect(errorCode(await handleAuthRequest(request, flow.env, "callback"))).toBe("state");
});

test("cancelling authorization consumes the flow and returns a safe error", async () => {
  const flow = await start();
  const target = new URL(flow.env.STATUS_OAUTH_REDIRECT_URI!);
  target.searchParams.set("state", flow.authorization.searchParams.get("state")!);
  target.searchParams.set("error", "access_denied");
  target.searchParams.set("error_description", "provider-private-detail");
  const request = new Request(target, { headers: { cookie: flow.cookie } });
  const response = await handleAuthRequest(request, flow.env, "callback");
  expect(errorCode(response)).toBe("denied");
  expect(response.headers.get("location")).not.toContain("provider-private-detail");
  expect(errorCode(await handleAuthRequest(request, flow.env, "callback"))).toBe("state");
});

for (const failure of ["token", "token-redirect", "profile-redirect", "profile-json"] as const) {
  test(`provider failure ${failure} cannot authenticate or leak a token`, async () => {
    const flow = await start();
    const response = await handleAuthRequest(callbackRequest(flow, { failure }), flow.env, "callback");
    expect(errorCode(response)).toBe("provider");
    expect(tokenRequests).toBe(1);
    expect(accessTokens.size).toBe(failure.startsWith("profile") ? 1 : 0);
    expect(followedRedirects).toBe(0);
    expect(response.headers.get("location")).not.toMatch(/provider-private-detail|access_token|secret/);
    expect(await flow.env.DB.prepare("SELECT COUNT(*) AS count FROM auth_sessions").first("count")).toBe(0);
  });
}

test("cookie-authenticated writes require an exact matching Origin", async () => {
  const env = settings();
  const { cookie } = await signIn(env);
  await expect(authorizeAdmin(adminRequest(cookie, { method: "POST", headers: { Origin: "http://127.0.0.1:3100" } }), env)).resolves.toBeUndefined();
  for (const headers of [
    {}, { Origin: "null" }, { Origin: "https://127.0.0.1:3100" },
    { Origin: "http://attacker.example" }, { "Sec-Fetch-Site": "same-site" },
  ]) {
    await expect(authorizeAdmin(adminRequest(cookie, { method: "POST", headers }), env)).rejects.toMatchObject({ status: 403 });
  }
});

test("logout revokes the server session and rejects cross-site logout", async () => {
  const env = settings();
  const { cookie } = await signIn(env);
  const denied = await handleAuthRequest(new Request("http://127.0.0.1:3100/api/auth/logout", { method: "POST", headers: { cookie, Origin: "https://attacker.example" } }), env, "logout");
  expect(denied.status).toBe(403);
  expect(await getAdminSession(adminRequest(cookie), env)).not.toBeNull();
  const response = await handleAuthRequest(new Request("http://127.0.0.1:3100/api/auth/logout", { method: "POST", headers: { cookie, Origin: "http://127.0.0.1:3100" } }), env, "logout");
  expect(response.status).toBe(200);
  expect(response.headers.getSetCookie().every(value => value.includes("Max-Age=0"))).toBe(true);
  await expect(authorizeAdmin(adminRequest(cookie), env)).rejects.toMatchObject({ status: 401 });
});

test("expiry, allowlist changes and credential rotation invalidate existing sessions", async () => {
  const env = settings();
  const { cookie } = await signIn(env);
  expect(await getAdminSession(adminRequest(cookie), settings({ STATUS_OAUTH_ALLOWED_USER_IDS: "another-admin" }))).toBeNull();
  expect(await getAdminSession(adminRequest(cookie), settings({ STATUS_OAUTH_CLIENT_SECRET: "rotated-secret" }))).toBeNull();
  await env.DB.prepare("UPDATE auth_sessions SET expires_at = 0").run();
  await expect(authorizeAdmin(adminRequest(cookie), env)).rejects.toMatchObject({ status: 401 });
});

test("successful reauthentication rotates and revokes the previous session", async () => {
  const first = await signIn();
  const second = await signIn(settings(), {}, first.cookie);
  expect(second.cookie).not.toBe(first.cookie);
  expect(await getAdminSession(adminRequest(first.cookie), settings())).toBeNull();
  expect(await getAdminSession(adminRequest(second.cookie), settings())).not.toBeNull();
});

test("HTTPS uses secure host-only cookies and enforces the configured callback origin", async () => {
  const env = settings({ STATUS_OAUTH_REDIRECT_URI: "https://status.example.com/api/auth/callback" });
  const { cookie, response } = await signIn(env);
  expect(cookie.startsWith("__Host-status-session=")).toBe(true);
  const sessionCookie = response.headers.getSetCookie().find(value => value.startsWith("__Host-status-session="))!;
  for (const flag of ["Secure", "HttpOnly", "SameSite=Lax", "Path=/", "Max-Age=28800"]) expect(sessionCookie).toContain(flag);
  expect(sessionCookie).not.toContain("Domain=");
  const mismatch = await handleAuthRequest(new Request("https://other.example.com/api/auth/login"), env, "login");
  expect(errorCode(mismatch)).toBe("origin");
});

test("legacy API tokens work without OAuth2 and with incomplete OAuth2 configuration", async () => {
  const env = { DB: platform.env.DB, STATUS_ADMIN_TOKEN: "legacy-secret" };
  const request = new Request("http://127.0.0.1:3100/api/admin", { method: "POST", headers: { "x-admin-token": "legacy-secret" } });
  await expect(authorizeAdmin(request, env)).resolves.toBeUndefined();
  await expect(authorizeAdmin(new Request(request.url), env)).rejects.toMatchObject({ status: 401 });
  const partial = { ...env, STATUS_OAUTH_CLIENT_ID: "partial" };
  await expect(authorizeAdmin(request, partial)).resolves.toBeUndefined();
  const response = await handleAuthRequest(request, partial, "session");
  expect(await response.json()).toMatchObject({ authenticated: true, method: "token", oauth: null, tokenEnabled: true, configurationError: expect.any(String) });
});

test("NextRequest loopback normalization preserves the browser origin throughout login and logout", async () => {
  const env = settings();
  const headers = { host: "127.0.0.1:3100", Origin: "http://127.0.0.1:3100" };
  const login = await handleAuthRequest(new Request("http://localhost:3100/api/auth/login", { headers }), env, "login");
  const flow = { env, cookie: cookieFrom(login, "flow"), authorization: new URL(login.headers.get("location")!) };
  const callback = callbackRequest(flow);
  const callbackUrl = new URL(callback.url);
  callbackUrl.hostname = "localhost";
  const callbackResponse = await handleAuthRequest(new Request(callbackUrl, { headers: { host: headers.host, cookie: flow.cookie } }), env, "callback");
  const cookie = cookieFrom(callbackResponse, "session");
  expect(callbackResponse.headers.get("location")).toBe("http://127.0.0.1:3100/admin");
  await expect(authorizeAdmin(new Request("http://localhost:3100/api/admin", { method: "POST", headers: { ...headers, cookie } }), env)).resolves.toBeUndefined();
  const logout = await handleAuthRequest(new Request("http://localhost:3100/api/auth/logout", { method: "POST", headers: { ...headers, cookie } }), env, "logout");
  expect(logout.status).toBe(200);
  const invalid = await handleAuthRequest(new Request("http://localhost:3100/api/auth/login", { headers: { host: "attacker.example", Origin: "http://attacker.example" } }), env, "login");
  expect(errorCode(invalid)).toBe("provider");
});

test("loopback aliases redirect to the registered host before creating a login flow", async () => {
  for (const [entryOrigin, callbackOrigin] of [
    ["http://localhost:3100", "http://127.0.0.1:3100"],
    ["http://127.0.0.1:3100", "http://localhost:3100"],
    ["http://[::1]:3100", "http://127.0.0.1:3100"],
    ["https://localhost:3100", "https://127.0.0.1:3100"],
  ]) {
    const env = settings({ STATUS_OAUTH_REDIRECT_URI: `${callbackOrigin}/api/auth/callback` });
    const request = new Request(`${entryOrigin}/api/auth/login?return_to=https://attacker.example`);
    const response = await handleAuthRequest(request, env, "login");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${callbackOrigin}/api/auth/login`);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.has("set-cookie")).toBe(false);
    expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM auth_flows").first("count")).toBe(0);
  }
});

test("cross-site navigation after the canonical hop completes a browser-bound OAuth2 login", async () => {
  const env = settings();
  const hop = await handleAuthRequest(new Request("http://localhost:3100/api/auth/login"), env, "login");
  const login = await handleAuthRequest(new Request(hop.headers.get("location")!, {
    headers: { "sec-fetch-site": "cross-site", "sec-fetch-mode": "navigate", "sec-fetch-dest": "document" },
  }), env, "login");
  const flow = { env, cookie: cookieFrom(login, "flow"), authorization: new URL(login.headers.get("location")!) };
  const callback = callbackRequest(flow);
  expect(errorCode(await handleAuthRequest(new Request(callback.url), env, "callback"))).toBe("state");
  expect(tokenRequests).toBe(0);
  const response = await handleAuthRequest(callback, env, "callback");
  expect(response.headers.get("location")).toBe("http://127.0.0.1:3100/admin");
  const cookie = cookieFrom(response, "session");
  await expect(authorizeAdmin(adminRequest(cookie), env)).resolves.toBeUndefined();
});

test("canonical login rejects different ports, protocols, public hosts and cross-site fetches", async () => {
  const env = settings();
  for (const origin of ["http://localhost:3101", "https://localhost:3100", "http://attacker.example:3100"]) {
    const response = await handleAuthRequest(new Request(`${origin}/api/auth/login`, {
      headers: { "sec-fetch-site": "cross-site", "sec-fetch-mode": "navigate", "sec-fetch-dest": "document" },
    }), env, "login");
    expect(errorCode(response)).toBe("origin");
  }
  for (const [mode, destination] of [["cors", "empty"], ["navigate", "iframe"]]) {
    const response = await handleAuthRequest(new Request("http://127.0.0.1:3100/api/auth/login", {
      headers: { "sec-fetch-site": "cross-site", "sec-fetch-mode": mode, "sec-fetch-dest": destination },
    }), env, "login");
    expect(errorCode(response)).toBe("provider");
  }
  expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM auth_flows").first("count")).toBe(0);
});

test("the OAuth2 callback remains restricted to the exact registered origin", async () => {
  const flow = await start();
  const valid = callbackRequest(flow);
  const alias = new URL(valid.url);
  alias.hostname = "localhost";
  const response = await handleAuthRequest(new Request(alias, { headers: { cookie: flow.cookie } }), flow.env, "callback");
  expect(errorCode(response)).toBe("origin");
  expect(tokenRequests).toBe(0);
  expect(await flow.env.DB.prepare("SELECT COUNT(*) AS count FROM auth_sessions").first("count")).toBe(0);
});

test("invalid configuration and unsafe identity values fail closed", async () => {
  for (const overrides of [
    { STATUS_OAUTH_ALLOWED_USER_IDS: "*" }, { STATUS_OAUTH_ALLOWED_USER_IDS: ", ," },
    { STATUS_OAUTH_ALLOWED_USER_IDS: undefined },
    { STATUS_OAUTH_ALLOWED_USER_IDS: "", STATUS_OAUTH_ALLOWED_ROLES: "" },
    { STATUS_OAUTH_ALLOWED_ROLES: "*" }, { STATUS_OAUTH_ALLOWED_ROLES: ", ," },
    { STATUS_OAUTH_ALLOWED_USER_IDS: ", ,", STATUS_OAUTH_ALLOWED_ROLES: "SUPER_ADMIN" },
    { STATUS_OAUTH_ALLOWED_ROLES: "a".repeat(257) },
    { STATUS_OAUTH_ROLE_CLAIM: "data..role", STATUS_OAUTH_ALLOWED_ROLES: "SUPER_ADMIN" },
    { STATUS_OAUTH_TOKEN_URL: "http://external.example/token" },
    { STATUS_OAUTH_USERINFO_URL: "https://user:password@example.com/profile" },
    { STATUS_OAUTH_REDIRECT_URI: "https://status.example/admin?redirect=evil" },
    { STATUS_OAUTH_TOKEN_AUTH_METHOD: "none" },
  ]) expect(() => getOAuthConfig(settings(overrides))).toThrow();
  const env = settings({ STATUS_OAUTH_USER_ID_CLAIM: "id", STATUS_OAUTH_ALLOWED_USER_IDS: "9007199254740992" });
  const flow = await start(env);
  const response = await handleAuthRequest(callbackRequest(flow, { profile: { id: 9007199254740992 } }), env, "callback");
  expect(errorCode(response)).toBe("provider");
});
