import { CheckCircle2, CircleHelp, CircleX, Wrench } from "lucide-react";
import { statusLabels, type HealthResult } from "@/lib/types";
export function HealthLabel({result}: {result: HealthResult}) {
  const Icon = {operational:CheckCircle2,maintenance:Wrench,error:CircleX,unknown:CircleHelp}[result.status];
  return <span className={`health-label health-${result.status}`}><Icon aria-hidden="true" /><span>{statusLabels[result.status]}</span></span>;
}
export function DisplayTime({value}: {value: string | null}) {
  return value ? <time dateTime={value}>{new Date(value).toLocaleString("zh-CN",{timeZone:"Asia/Shanghai",hour12:false})}</time> : <>尚未检测</>;
}
