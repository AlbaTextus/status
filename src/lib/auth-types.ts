export type AdminUser = { id: string; name: string };

export type AuthStatus = {
  authenticated: boolean;
  method: "oauth" | "token" | null;
  user: AdminUser | null;
  oauth: { name: string } | null;
  tokenEnabled: boolean;
  configurationError: string | null;
};

export const authErrorMessages = {
  configuration: "登录服务尚未完成配置，请联系管理员。",
  state: "登录请求已过期或无效，请重新登录。",
  denied: "你已取消授权，可以重新登录。",
  forbidden: "此账号没有后台管理权限，请联系管理员。",
  provider: "暂时无法完成登录，请稍后重试。",
} as const;

export type AuthErrorCode = keyof typeof authErrorMessages;
