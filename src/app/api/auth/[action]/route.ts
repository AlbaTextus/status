import { authFailureResponse, handleAuthRequest } from "@/lib/auth";
import { getStatusEnv } from "@/lib/cloudflare";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ action: string }> };

async function handle(request: Request, context: Context) {
  const { action } = await context.params;
  if (action !== "session" && action !== "login" && action !== "callback" && action !== "logout") {
    return Response.json({ error: "接口不存在" }, { status: 404 });
  }
  const method = action === "logout" ? "POST" : "GET";
  if (request.method !== method) {
    return Response.json({ error: "请求方式不支持" }, { status: 405, headers: { Allow: method } });
  }
  try {
    return await handleAuthRequest(request, await getStatusEnv(), action);
  } catch (error) {
    return authFailureResponse(request, error, action === "login" || action === "callback");
  }
}

export const GET = handle;
export const POST = handle;
