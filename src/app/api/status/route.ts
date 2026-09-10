import { publicState } from "@/lib/store";
import { checkServices } from "@/lib/monitor";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (new URL(request.url).searchParams.get("refresh") === "1") await checkServices();
  return Response.json(await publicState(),{headers:{"Cache-Control":"no-store"}});
}
