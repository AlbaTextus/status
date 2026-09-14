"use client";

import type { AuthStatus } from "./auth-types";

export const ADMIN_AUTH_CHANGED_EVENT = "status-admin-auth-changed";

export function savedAdminToken(value?: string): string {
  try {
    if (value === "") sessionStorage.removeItem("status-admin-token");
    else if (value !== undefined) sessionStorage.setItem("status-admin-token", value);
    return sessionStorage.getItem("status-admin-token") ?? "";
  } catch {
    return "";
  }
}

export async function readAdminAuthStatus(token: string, signal?: AbortSignal): Promise<AuthStatus> {
  const response = await fetch("/api/auth/session", {
    headers: token ? { "x-admin-token": token } : undefined,
    cache: "no-store",
    signal,
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || "无法连接登录服务，请稍后重试。");
  return value;
}

export function notifyAdminAuthChanged() {
  window.dispatchEvent(new Event(ADMIN_AUTH_CHANGED_EVENT));
}
