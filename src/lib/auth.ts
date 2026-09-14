import { createHash, timingSafeEqual } from "node:crypto";
import * as oauth from "oauth4webapi";
import type { StatusEnv } from "./cloudflare";
import { authErrorMessages, type AdminUser, type AuthErrorCode, type AuthStatus } from "./auth-types";

const FLOW_TTL = 10 * 60;
const SESSION_TTL = 8 * 60 * 60;
const CALLBACK_PATH = "/api/auth/callback";
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const responseHeaders = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", Vary: "Cookie" };

export class AuthError extends Error {
  constructor(message: string, public status = 401, public code: AuthErrorCode = "provider") {
    super(message);
  }
}

type OAuthConfig = {
  server: oauth.AuthorizationServer;
  client: oauth.Client;
  clientSecret: string;
  authMethod: "client_secret_basic" | "client_secret_post";
  redirectUri: string;
  userInfoUrl: URL;
  scopes: string;
  name: string;
  userIdClaim: string;
  allowedUserIds: Set<string>;
  providerKey: string;
};

type StoredSession = { user_id: string; display_name: string };
type StoredFlow = { code_verifier: string };

const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const nowSeconds = () => Math.floor(Date.now() / 1000);
const configurationError = () => new AuthError(authErrorMessages.configuration, 503, "configuration");

function requestUrl(request: Request): URL {
  const url = new URL(request.url);
  // NextRequest normalizes 127.0.0.1 and ::1 to localhost. Restore only these
  // loopback aliases from Host; arbitrary forwarded hosts remain untrusted.
  const host = request.headers.get("host");
  if (url.hostname === "localhost" && host && /^(127\.0\.0\.1|\[::1\])(:\d{1,5})?$/.test(host)) {
    const original = new URL(`${url.protocol}//${host}`);
    if (original.port === url.port) url.hostname = original.hostname;
  }
  return url;
}

function endpoint(value: string): URL {
  let url: URL;
  try { url = new URL(value); } catch { throw configurationError(); }
  const loopback = LOOPBACK_HOSTS.has(url.hostname);
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) || url.username || url.password || url.hash) {
    throw configurationError();
  }
  return url;
}

export function getOAuthConfig(env: StatusEnv): OAuthConfig | null {
  const required = [
    env.STATUS_OAUTH_CLIENT_ID, env.STATUS_OAUTH_CLIENT_SECRET,
    env.STATUS_OAUTH_AUTHORIZATION_URL, env.STATUS_OAUTH_TOKEN_URL,
    env.STATUS_OAUTH_USERINFO_URL, env.STATUS_OAUTH_REDIRECT_URI,
    env.STATUS_OAUTH_ALLOWED_USER_IDS,
  ];
  if (!required.some(value => value?.trim())) return null;
  if (!required.every(value => value?.trim())) throw configurationError();

  const authorizationUrl = endpoint(env.STATUS_OAUTH_AUTHORIZATION_URL!.trim());
  const tokenUrl = endpoint(env.STATUS_OAUTH_TOKEN_URL!.trim());
  const userInfoUrl = endpoint(env.STATUS_OAUTH_USERINFO_URL!.trim());
  const redirectUrl = endpoint(env.STATUS_OAUTH_REDIRECT_URI!.trim());
  if (redirectUrl.pathname !== CALLBACK_PATH || redirectUrl.search) throw configurationError();

  const issuer = env.STATUS_OAUTH_ISSUER?.trim() || authorizationUrl.origin;
  if (endpoint(issuer).search) throw configurationError();
  const authMethod = env.STATUS_OAUTH_TOKEN_AUTH_METHOD?.trim() || "client_secret_basic";
  if (authMethod !== "client_secret_basic" && authMethod !== "client_secret_post") throw configurationError();
  const userIdClaim = env.STATUS_OAUTH_USER_ID_CLAIM?.trim() || "sub";
  if (!/^[A-Za-z_][\w]*(\.[A-Za-z_][\w]*)*$/.test(userIdClaim)) throw configurationError();
  const allowedUserIds = new Set(env.STATUS_OAUTH_ALLOWED_USER_IDS!.split(",").map(value => value.trim()).filter(Boolean));
  if (!allowedUserIds.size || allowedUserIds.has("*") || [...allowedUserIds].some(id => id.length > 256)) throw configurationError();

  const clientId = env.STATUS_OAUTH_CLIENT_ID!.trim();
  const clientSecret = env.STATUS_OAUTH_CLIENT_SECRET!;
  const providerKey = digest(JSON.stringify([issuer, authorizationUrl.href, tokenUrl.href, userInfoUrl.href, clientId, clientSecret, redirectUrl.href, userIdClaim]));
  return {
    server: { issuer, authorization_endpoint: authorizationUrl.href, token_endpoint: tokenUrl.href },
    client: { client_id: clientId },
    clientSecret, authMethod, redirectUri: redirectUrl.href, userInfoUrl,
    scopes: env.STATUS_OAUTH_SCOPES?.trim() ?? "profile",
    name: env.STATUS_OAUTH_NAME?.trim().slice(0, 80) || "OAuth2",
    userIdClaim, allowedUserIds, providerKey,
  };
}

export function assertSameOrigin(request: Request, requireOrigin = false) {
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  if ((origin !== null && origin !== requestUrl(request).origin) || site === "cross-site" || site === "same-site" || (requireOrigin && !origin)) {
    throw new AuthError("不允许跨站管理请求", 403);
  }
}

function assertCallbackOrigin(request: Request, config: OAuthConfig) {
  if (requestUrl(request).origin !== new URL(config.redirectUri).origin) {
    throw new AuthError(authErrorMessages.origin, 400, "origin");
  }
}

function cookieName(request: Request, kind: "session" | "flow") {
  return `${requestUrl(request).protocol === "https:" ? "__Host-" : ""}status-${kind}`;
}

function readCookie(request: Request, kind: "session" | "flow"): string | null {
  const name = cookieName(request, kind);
  const values = (request.headers.get("cookie") ?? "").split(";").map(part => part.trim()).filter(part => part.startsWith(`${name}=`));
  if (values.length !== 1) return null;
  const value = values[0].slice(name.length + 1);
  return TOKEN_PATTERN.test(value) ? value : null;
}

function setCookie(response: Response, request: Request, kind: "session" | "flow", value: string, maxAge: number) {
  const secure = requestUrl(request).protocol === "https:" ? "; Secure" : "";
  response.headers.append("Set-Cookie", `${cookieName(request, kind)}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`);
}

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: responseHeaders });
}

function redirect(url: URL) {
  return new Response(null, { status: 303, headers: { ...responseHeaders, Location: url.href } });
}

export function hasAdminToken(request: Request, env: StatusEnv) {
  const configured = env.STATUS_ADMIN_TOKEN;
  const supplied = request.headers.get("x-admin-token");
  return !!configured && !!supplied && timingSafeEqual(Buffer.from(digest(configured), "hex"), Buffer.from(digest(supplied), "hex"));
}

export async function getAdminSession(request: Request, env: StatusEnv, config = getOAuthConfig(env)): Promise<AdminUser | null> {
  const token = readCookie(request, "session");
  if (!token || !config) return null;
  assertCallbackOrigin(request, config);
  const row = await env.DB.prepare(
    "SELECT user_id, display_name FROM auth_sessions WHERE token_hash = ? AND provider_key = ? AND expires_at > ?",
  ).bind(digest(token), config.providerKey, nowSeconds()).first<StoredSession>();
  if (!row || !config.allowedUserIds.has(row.user_id)) return null;
  return { id: row.user_id, name: row.display_name };
}

export async function authorizeAdmin(request: Request, env: StatusEnv) {
  assertSameOrigin(request);
  if (hasAdminToken(request, env)) return;
  if (await getAdminSession(request, env)) {
    assertSameOrigin(request, !["GET", "HEAD"].includes(request.method));
    return;
  }
  throw new AuthError("请先登录管理后台", 401);
}

async function sessionResponse(request: Request, env: StatusEnv) {
  assertSameOrigin(request);
  let config: OAuthConfig | null = null;
  let configError: string | null = null;
  try { config = getOAuthConfig(env); } catch (error) {
    if (!(error instanceof AuthError)) throw error;
    configError = error.message;
  }
  const tokenAuthenticated = hasAdminToken(request, env);
  const user = tokenAuthenticated ? null : await getAdminSession(request, env, config);
  const status: AuthStatus = {
    authenticated: tokenAuthenticated || !!user,
    method: tokenAuthenticated ? "token" : user ? "oauth" : null,
    user,
    oauth: config ? { name: config.name } : null,
    tokenEnabled: !!env.STATUS_ADMIN_TOKEN,
    configurationError: configError,
  };
  return json(status);
}

async function loginResponse(request: Request, env: StatusEnv) {
  // Top-level GET navigation also covers the hop from a local hostname alias.
  // The callback still requires the browser-bound, single-use state and PKCE.
  const navigation = request.method === "GET" && request.headers.get("sec-fetch-mode") === "navigate" && request.headers.get("sec-fetch-dest") === "document";
  if (!navigation) assertSameOrigin(request);
  const config = getOAuthConfig(env);
  if (!config) throw configurationError();
  const currentUrl = requestUrl(request);
  const callbackUrl = new URL(config.redirectUri);
  if (currentUrl.origin !== callbackUrl.origin && currentUrl.protocol === callbackUrl.protocol && currentUrl.port === callbackUrl.port && LOOPBACK_HOSTS.has(currentUrl.hostname) && LOOPBACK_HOSTS.has(callbackUrl.hostname)) {
    // Create no state or cookies until the browser reaches the callback's host.
    return redirect(new URL("/api/auth/login", callbackUrl));
  }
  assertCallbackOrigin(request, config);
  const state = oauth.generateRandomState();
  const browserToken = oauth.generateRandomState();
  const verifier = oauth.generateRandomCodeVerifier();
  const authorizationUrl = new URL(config.server.authorization_endpoint!);
  const params = {
    response_type: "code", response_mode: "query", client_id: config.client.client_id,
    redirect_uri: config.redirectUri, state, code_challenge: await oauth.calculatePKCECodeChallenge(verifier),
    code_challenge_method: "S256",
  };
  for (const [key, value] of Object.entries(params)) authorizationUrl.searchParams.set(key, value);
  if (config.scopes) authorizationUrl.searchParams.set("scope", config.scopes);
  else authorizationUrl.searchParams.delete("scope");

  const previousFlow = readCookie(request, "flow");
  const now = nowSeconds();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM auth_flows WHERE expires_at <= ? OR browser_hash = ?").bind(now, previousFlow ? digest(previousFlow) : ""),
    env.DB.prepare("DELETE FROM auth_sessions WHERE expires_at <= ?").bind(now),
    env.DB.prepare("INSERT INTO auth_flows (state_hash, browser_hash, provider_key, code_verifier, expires_at) VALUES (?, ?, ?, ?, ?)")
      .bind(digest(state), digest(browserToken), config.providerKey, verifier, now + FLOW_TTL),
  ]);
  const response = redirect(authorizationUrl);
  setCookie(response, request, "flow", browserToken, FLOW_TTL);
  return response;
}

function claim(profile: unknown, path: string): unknown {
  let value = profile;
  for (const key of path.split(".")) {
    if (!value || typeof value !== "object" || !Object.hasOwn(value, key)) return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}

function userFromProfile(profile: unknown, config: OAuthConfig): AdminUser {
  const rawId = claim(profile, config.userIdClaim);
  const id = typeof rawId === "string" ? rawId : typeof rawId === "number" && Number.isSafeInteger(rawId) ? String(rawId) : "";
  if (!id || id.length > 256) throw new AuthError(authErrorMessages.provider, 502);
  if (!config.allowedUserIds.has(id)) throw new AuthError(authErrorMessages.forbidden, 403, "forbidden");
  const parent = config.userIdClaim.split(".").slice(0, -1);
  const name = ["name", "display_name", "preferred_username", "username", "login"]
    .map(key => claim(profile, [...parent, key].join(".")))
    .find(value => typeof value === "string" && value.trim());
  return { id, name: typeof name === "string" ? name.trim().slice(0, 120) : id };
}

async function callbackResponse(request: Request, env: StatusEnv) {
  const config = getOAuthConfig(env);
  if (!config) throw configurationError();
  assertCallbackOrigin(request, config);
  const callbackUrl = requestUrl(request);
  const state = callbackUrl.searchParams.get("state");
  const browserToken = readCookie(request, "flow");
  if (!state || !TOKEN_PATTERN.test(state) || !browserToken || callbackUrl.searchParams.getAll("state").length !== 1) {
    throw new AuthError(authErrorMessages.state, 400, "state");
  }

  // DELETE ... RETURNING atomically consumes the browser-bound flow, including on provider errors.
  const flow = await env.DB.prepare(
    "DELETE FROM auth_flows WHERE state_hash = ? AND browser_hash = ? AND provider_key = ? AND expires_at > ? RETURNING code_verifier",
  ).bind(digest(state), digest(browserToken), config.providerKey, nowSeconds()).first<StoredFlow>();
  if (!flow) throw new AuthError(authErrorMessages.state, 400, "state");

  let parameters: URLSearchParams;
  try { parameters = oauth.validateAuthResponse(config.server, config.client, callbackUrl, state); } catch (error) {
    if (error instanceof oauth.AuthorizationResponseError && error.error === "access_denied") {
      throw new AuthError(authErrorMessages.denied, 400, "denied");
    }
    throw new AuthError(authErrorMessages.provider, 400);
  }
  const clientAuth = config.authMethod === "client_secret_post" ? oauth.ClientSecretPost(config.clientSecret) : oauth.ClientSecretBasic(config.clientSecret);
  // HTTP is accepted only for loopback endpoints validated by getOAuthConfig.
  const tokenResponse = await oauth.authorizationCodeGrantRequest(config.server, config.client, clientAuth, parameters, config.redirectUri, flow.code_verifier, {
    signal: AbortSignal.timeout(10_000),
    [oauth.allowInsecureRequests]: true,
  });
  const tokens = await oauth.processAuthorizationCodeResponse(config.server, config.client, tokenResponse);
  if (tokens.token_type.toLowerCase() !== "bearer") throw new AuthError(authErrorMessages.provider, 502);
  const profileResponse = await oauth.protectedResourceRequest(tokens.access_token, "GET", config.userInfoUrl, new Headers({ Accept: "application/json" }), undefined, {
    signal: AbortSignal.timeout(10_000),
    [oauth.allowInsecureRequests]: true,
  });
  if (!profileResponse.ok || !profileResponse.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    throw new AuthError(authErrorMessages.provider, 502);
  }
  const profile: unknown = await profileResponse.json();
  const idTokenClaims = oauth.getValidatedIdTokenClaims(tokens);
  if (idTokenClaims && claim(profile, "sub") !== idTokenClaims.sub) throw new AuthError(authErrorMessages.provider, 502);
  const user = userFromProfile(profile, config);
  const sessionToken = oauth.generateRandomState();
  const oldToken = readCookie(request, "session");
  await env.DB.batch([
    env.DB.prepare("DELETE FROM auth_sessions WHERE token_hash = ?").bind(oldToken ? digest(oldToken) : ""),
    env.DB.prepare("INSERT INTO auth_sessions (token_hash, provider_key, user_id, display_name, expires_at) VALUES (?, ?, ?, ?, ?)")
      .bind(digest(sessionToken), config.providerKey, user.id, user.name, nowSeconds() + SESSION_TTL),
  ]);
  const response = redirect(new URL("/admin", config.redirectUri));
  setCookie(response, request, "flow", "", 0);
  setCookie(response, request, "session", sessionToken, SESSION_TTL);
  return response;
}

async function logoutResponse(request: Request, env: StatusEnv) {
  assertSameOrigin(request, true);
  const token = readCookie(request, "session");
  const flow = readCookie(request, "flow");
  if (token) await env.DB.prepare("DELETE FROM auth_sessions WHERE token_hash = ?").bind(digest(token)).run();
  if (flow) await env.DB.prepare("DELETE FROM auth_flows WHERE browser_hash = ?").bind(digest(flow)).run();
  const response = json({ ok: true });
  setCookie(response, request, "session", "", 0);
  setCookie(response, request, "flow", "", 0);
  return response;
}

export function authFailureResponse(request: Request, error: unknown, redirectToLogin: boolean) {
  const code = error instanceof AuthError ? error.code : "provider";
  // OAuth library errors can contain token responses; never log the error object or callback URL.
  if (!(error instanceof AuthError)) console.error("Authentication request failed", error instanceof Error ? error.name : "UnknownError");
  if (!redirectToLogin) return json({ error: error instanceof AuthError ? error.message : authErrorMessages.provider }, error instanceof AuthError ? error.status : 503);
  const target = new URL("/admin", requestUrl(request));
  target.searchParams.set("auth_error", code);
  const response = redirect(target);
  setCookie(response, request, "flow", "", 0);
  return response;
}

export async function handleAuthRequest(request: Request, env: StatusEnv, action: "session" | "login" | "callback" | "logout") {
  try {
    switch (action) {
      case "session": return await sessionResponse(request, env);
      case "login": return await loginResponse(request, env);
      case "callback": return await callbackResponse(request, env);
      case "logout": return await logoutResponse(request, env);
    }
  } catch (error) {
    return authFailureResponse(request, error, action === "login" || action === "callback");
  }
}
