"use client";

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { LoaderCircle, LogIn, LogOut, ShieldCheck } from "lucide-react";
import { authErrorMessages, type AdminUser, type AuthErrorCode, type AuthStatus } from "@/lib/auth-types";
import { notifyAdminAuthChanged, readAdminAuthStatus as readStatus, savedAdminToken as savedToken } from "@/lib/auth-client";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { Button } from "./ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";
import { Separator } from "./ui/separator";

export type AdminIdentity = { token: string; user: AdminUser | null };

export function AdminAccess({ children }: {
  children: (identity: AdminIdentity, onUnauthorized: () => void, sessionPanel: ReactNode) => ReactNode;
}) {
  const [identity, setIdentity] = useState<AdminIdentity | null>(null);
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [checking, setChecking] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [tokenInput, setTokenInput] = useState("");
  const [tokenInvalid, setTokenInvalid] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const url = new URL(window.location.href);
    const code = url.searchParams.get("auth_error");
    const callbackError = code && Object.hasOwn(authErrorMessages, code) ? authErrorMessages[code as AuthErrorCode] : "";
    const token = savedToken();
    readStatus(token, controller.signal).then(value => {
      if (!active) return;
      if (code) {
        url.searchParams.delete("auth_error");
        window.history.replaceState(window.history.state, "", url);
      }
      setStatus(value);
      setError(callbackError);
      if (value.authenticated) {
        setIdentity({ token: value.method === "token" ? token : "", user: value.user });
        if (value.method === "oauth") savedToken("");
      } else {
        savedToken("");
      }
    }).catch(error => {
      if (active && error.name !== "AbortError") setError(error instanceof Error ? error.message : "无法连接登录服务。");
    }).finally(() => {
      if (active) setChecking(false);
    });
    return () => { active = false; controller.abort(); };
  }, [attempt]);

  const lock = useCallback(() => {
    savedToken("");
    setIdentity(null);
    setTokenInput("");
    setError("登录已失效，请重新验证身份。");
    notifyAdminAuthChanged();
  }, []);

  async function loginWithToken(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setTokenInvalid(false);
    try {
      const value = await readStatus(tokenInput);
      setStatus(value);
      if (!value.authenticated || value.method !== "token") {
        setTokenInvalid(true);
        throw new Error("管理密钥无效，请重新输入。");
      }
      savedToken(tokenInput);
      setIdentity({ token: tokenInput, user: null });
      setTokenInput("");
      notifyAdminAuthChanged();
    } catch (error) {
      setError(error instanceof Error ? error.message : "登录失败，请重试。");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) {
        const value = await response.json();
        throw new Error(value.error || "退出失败，请重试。");
      }
      savedToken("");
      setIdentity(null);
      setTokenInput("");
      setTokenInvalid(false);
      notifyAdminAuthChanged();
    } catch (error) {
      setError(error instanceof Error ? error.message : "退出失败，请重试。");
    } finally {
      setBusy(false);
    }
  }

  const errorAlert = error && <Alert variant="destructive"><AlertTitle>身份验证提示</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>;

  if (identity) {
    const sessionPanel = <div className="mb-5 flex flex-col gap-4">
      {errorAlert}
      <section className="system-panel flex flex-wrap items-center justify-between gap-3 p-4" aria-label="当前登录身份">
        <div className="flex min-w-0 items-center gap-2">
          <ShieldCheck className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate text-sm">{identity.user ? `已登录 · ${identity.user.name}` : "已通过管理密钥验证"}</span>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={logout} disabled={busy}>
          {busy ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : <LogOut data-icon="inline-start" />}
          退出登录
        </Button>
      </section>
    </div>;
    return children(identity, lock, sessionPanel);
  }

  const tokenForm = <form onSubmit={loginWithToken}>
    <FieldGroup>
      <Field data-invalid={tokenInvalid}>
        <FieldLabel htmlFor="admin-token">管理密钥</FieldLabel>
        <Input id="admin-token" type="password" value={tokenInput} onChange={event => { setTokenInput(event.target.value); setTokenInvalid(false); }} required autoComplete="current-password" disabled={busy} aria-invalid={tokenInvalid} />
        <FieldDescription>使用管理员提供的管理密钥验证身份。</FieldDescription>
      </Field>
      <Button type="submit" disabled={busy}>
        {busy && <LoaderCircle data-icon="inline-start" className="animate-spin" />}
        进入后台
      </Button>
    </FieldGroup>
  </form>;

  return <div className="status-shell admin-shell"><main>
    {checking ? <p className="loading-state" role="status"><LoaderCircle className="size-4 animate-spin" />正在验证登录状态…</p> :
      <section className="system-panel access-panel" aria-labelledby="admin-login-title">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <h2 id="admin-login-title" className="text-base font-medium">登录管理后台</h2>
            <p className="text-sm text-muted-foreground">使用获准的账号管理服务状态与公告。</p>
          </div>
          {errorAlert}
          {status?.configurationError && <Alert><AlertTitle>登录服务暂不可用</AlertTitle><AlertDescription>{status.configurationError}</AlertDescription></Alert>}
          {status?.oauth && <form action="/api/auth/login" method="get" onSubmit={() => savedToken("")}>
            <Button type="submit" size="lg" className="w-full"><LogIn data-icon="inline-start" />使用 {status.oauth.name} 登录</Button>
          </form>}
          {status?.tokenEnabled && (status.oauth ? <>
            <Separator />
            <details><summary className="cursor-pointer text-sm text-muted-foreground">使用管理密钥</summary><div className="mt-4">{tokenForm}</div></details>
          </> : tokenForm)}
          {status && !status.oauth && !status.tokenEnabled && !status.configurationError && <p className="text-sm text-muted-foreground">后台尚未开放登录，请联系管理员完成配置。</p>}
          {!status && <Button variant="outline" onClick={() => { setChecking(true); setError(""); setAttempt(value => value + 1); }}>重新连接</Button>}
        </div>
      </section>}
  </main></div>;
}
