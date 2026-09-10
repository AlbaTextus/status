import { publicState } from "@/lib/store";
import { StatusDashboard } from "@/components/status-dashboard";
export const dynamic = "force-dynamic";
export default async function Home() { return <StatusDashboard initial={await publicState()} />; }
