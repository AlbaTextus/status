import { AdminError, adminAction, authorize } from "@/lib/admin";
import { readStore } from "@/lib/store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
function fail(error: unknown) { if (error instanceof AdminError) return reply({ error: error.message }, error.status); console.error("Admin request failed", error); return reply({error:"操作失败，请检查服务端日志和数据目录权限"},500); }
export async function GET(request: Request) { try { authorize(request); return reply(await readStore()); } catch(error) { return fail(error); } }
export async function POST(request: Request) {
  try {
    authorize(request);
    if (!request.headers.get("content-type")?.includes("application/json")) throw new AdminError("需要 JSON 请求",415);
    if (Number(request.headers.get("content-length")) > 600000) throw new AdminError("内容过大",413);
    const body = await request.text();
    if (Buffer.byteLength(body) > 600000) throw new AdminError("内容过大",413);
    let data: unknown; try { data = JSON.parse(body); } catch { throw new AdminError("JSON 格式无效"); }
    await adminAction(data);
    return reply(await readStore());
  } catch(error) { return fail(error); }
}
