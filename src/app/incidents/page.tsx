import type { Metadata } from "next";
import { publicState } from "@/lib/store";
import { IncidentsIndexPage } from "@/components/incidents-index-page";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "事件动态与公告 · AlbaTextus Status",
  description: "查看 AlbaTextus 各服务的受影响组件、故障排查进度与事件更新时间线。",
};

type Props = {
  searchParams: Promise<{ id?: string }>;
};

export default async function Page({ searchParams }: Props) {
  const { id } = await searchParams;
  const data = await publicState();
  return <IncidentsIndexPage data={data} initialSelectedId={id} />;
}