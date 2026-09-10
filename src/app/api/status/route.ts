import { publicState } from "@/lib/store";
export const dynamic = "force-dynamic";
export async function GET() {
  return Response.json(await publicState(),{headers:{"Cache-Control":"no-store"}});
}
