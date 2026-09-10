import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { mutateStore } from "./store";
import { checkServices } from "./monitor";
import { unchecked, type IncidentUpdate } from "./types";
import { getStatusEnv } from "./cloudflare";

export class AdminError extends Error { constructor(message: string, public status = 400) { super(message); } }
export async function authorize(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && new URL(origin).host !== host) throw new AdminError("不允许跨站管理请求", 403);
  if (request.headers.get("sec-fetch-site") === "cross-site") throw new AdminError("不允许跨站管理请求", 403);
  const configured = (await getStatusEnv()).STATUS_ADMIN_TOKEN;
  if (configured) {
    const supplied = request.headers.get("x-admin-token") ?? "";
    const digest = (value: string) => createHash("sha256").update(value).digest();
    if (!timingSafeEqual(digest(configured), digest(supplied))) throw new AdminError("请输入管理密钥", 401);
  } else {
    throw new AdminError("请先配置 STATUS_ADMIN_TOKEN 管理密钥", 403);
  }
}
const object = (value: unknown): Record<string, unknown> => { if (!value || typeof value !== "object" || Array.isArray(value)) throw new AdminError("请求格式无效"); return value as Record<string, unknown>; };
function text(value: unknown, name: string, max = 160) { if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new AdminError(`${name}不能为空，且最多 ${max} 个字符`); return value.trim(); }
export function normalizeHealthUrl(value: unknown) {
  let url: URL;
  try { url = new URL(text(value, "服务地址", 2048)); } catch { throw new AdminError("请填写有效的 http:// 或 https:// 服务地址"); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new AdminError("服务地址只支持 HTTP/HTTPS，不能包含账号密码、查询参数或锚点");
  url.pathname = url.pathname.replace(/\/+$/, "");
  if (!url.pathname.endsWith("/healthz")) url.pathname += "/healthz";
  return url.toString();
}

export async function adminAction(input: unknown) {
  const data = object(input);
  switch (data.action) {
    case "saveService": {
      const name = text(data.name, "服务名称", 80);
      const url = normalizeHealthUrl(data.url);
      const id = typeof data.id === "string" ? data.id : randomUUID();
      await mutateStore(state => {
        const existing = state.services.find(service => service.id === id);
        if (data.id && !existing) throw new AdminError("服务不存在", 404);
        if (state.services.some(service => service.id !== id && (service.url === url || service.name === name))) throw new AdminError("服务名称或检测地址已存在");
        if (!existing && state.services.length >= 50) throw new AdminError("最多支持 50 个服务");
        const next = { id, name, url, revision: randomUUID(), result: existing?.url === url ? existing.result : { ...unchecked } };
        if (existing) Object.assign(existing, next); else state.services.push(next);
      });
      await checkServices([id]);
      break;
    }
    case "deleteService":
      await mutateStore(state => { const id = text(data.id, "服务 ID"); if (!state.services.some(item => item.id === id)) throw new AdminError("服务不存在", 404); state.services = state.services.filter(item => item.id !== id); state.incidents.forEach(incident => { if (incident.serviceId === id) incident.serviceId = null; }); }); break;
    case "check": {
      const id = typeof data.id === "string" ? data.id : undefined;
      await checkServices(id ? [id] : undefined); break;
    }
    case "saveIncident": {
      const title = text(data.title, "事件标题", 160);
      if (data.color !== undefined && data.color !== "red" && data.color !== "yellow") throw new AdminError("公告颜色仅支持红色或黄色");
      if (typeof data.published !== "boolean" || typeof data.resolved !== "boolean") throw new AdminError("发布状态无效");
      if (!Array.isArray(data.updates) || !data.updates.length || data.updates.length > 50) throw new AdminError("请至少填写一条更新，最多 50 条");
      const inputUpdates = data.updates.map(value => {
        const update = object(value);
        const status = typeof update.status === "string" && ["resolved", "monitoring", "outage", "neutral"].includes(update.status)
          ? (update.status as "resolved" | "monitoring" | "outage" | "neutral")
          : undefined;
        return {
          id: typeof update.id === "string" ? update.id : "",
          label: text(update.label, "更新状态", 80),
          message: text(update.message, "更新内容", 10000),
          status,
        };
      });
      await mutateStore(state => {
        const id = typeof data.id === "string" ? data.id : randomUUID();
        const existing = state.incidents.find(incident => incident.id === id);
        if (data.id && !existing) throw new AdminError("事件不存在", 404);
        const serviceId = typeof data.serviceId === "string" && data.serviceId ? data.serviceId : null;
        if (serviceId && !state.services.some(service => service.id === serviceId)) throw new AdminError("关联的服务不存在");
        const now = new Date().toISOString();
        const seen = new Set<string>();
        const updates: IncidentUpdate[] = inputUpdates.map(update => {
          const previous = existing?.updates.find(item => item.id === update.id);
          const updateId = previous?.id ?? randomUUID();
          if (seen.has(updateId)) throw new AdminError("重复的更新记录");
          seen.add(updateId);
          return {
            id: updateId,
            label: update.label,
            message: update.message,
            createdAt: previous?.createdAt ?? now,
            status: update.status ?? previous?.status,
          };
        });
        const color = (data.color ?? existing?.color ?? "yellow") as "red" | "yellow";
        const next = { id, title, color, serviceId, resolved: data.resolved as boolean, published: data.published as boolean, publishedAt: data.published ? existing?.publishedAt ?? now : null, updatedAt: now, updates };
        if (existing) Object.assign(existing, next); else state.incidents.unshift(next);
      }); break;
    }
    case "deleteIncident":
      await mutateStore(state => { const id = text(data.id, "事件 ID"); if (!state.incidents.some(item => item.id === id)) throw new AdminError("事件不存在", 404); state.incidents = state.incidents.filter(item => item.id !== id); }); break;
    default: throw new AdminError("未知操作");
  }
}
