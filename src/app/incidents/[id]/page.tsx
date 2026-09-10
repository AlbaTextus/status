import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { publicState } from "@/lib/store";
import { IncidentPage } from "@/components/incident-page";
type Props = {params:Promise<{id:string}>};
export const dynamic = "force-dynamic";
export async function generateMetadata({params}:Props):Promise<Metadata> {const {id}=await params;const {incidents}=await publicState();return {title:`${incidents.find(i=>i.id===id)?.title??"事件不存在"} · AlbaTextus Status`};}
export default async function Page({params}:Props){const {id}=await params;const data=await publicState();const incident=data.incidents.find(i=>i.id===id);if(!incident)notFound();return <IncidentPage incident={incident} service={data.services.find(s=>s.id===incident.serviceId)}/>;}
