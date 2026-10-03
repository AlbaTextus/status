import { publicState } from "@/lib/store";
import { StatusDashboard } from "@/components/status-dashboard";

export const dynamic = "force-dynamic";
export default async function StatusPage() {
  return <StatusDashboard initial={await publicState()} />;
}
