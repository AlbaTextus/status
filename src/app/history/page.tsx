import type { Metadata } from "next";
import { publicState } from "@/lib/store";
import { HistoryPage } from "@/components/history-page";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "历史记录 · AlbaTextus Status" };
export default async function Page() { return <HistoryPage data={await publicState()} />; }
