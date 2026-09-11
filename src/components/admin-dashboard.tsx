"use client";

import { useEffect, useState, useSyncExternalStore, type FormEvent } from "react";
import Link from "next/link";
import { motion, MotionConfig } from "framer-motion";
import { ArrowUpRight, CheckCircle2, ChevronLeft, ChevronRight, FileText, LoaderCircle, Pencil, Plus, RefreshCw, RotateCcw, Server, Trash2 } from "lucide-react";
import { DisplayTime, HealthLabel } from "./health-label";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "./ui/field";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "./ui/empty";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Separator } from "./ui/separator";
import { defaultAutoPublishRules, type AutoPublishRules, type Incident, type Service, type Store, type UpdateStatusKind } from "@/lib/types";

type ServiceDraft = {
  id?: string;
  name: string;
  url: string;
  useCustomRules: boolean;
  rules: AutoPublishRules;
};
type EventDraft = {id?:string;title:string;color?:"red"|"yellow";serviceId:string;resolved:boolean;published:boolean;updates:{id:string;label:string;message:string;status?:UpdateStatusKind}[]};
type DeleteTarget = {kind:"Service"|"Incident";id:string;name:string};

let currentCachedNow = Date.now();
function subscribeNow(callback: () => void) {
  const timer = setInterval(() => {
    currentCachedNow = Date.now();
    callback();
  }, 10000);
  return () => clearInterval(timer);
}
const getNowSnapshot = () => currentCachedNow;
const getNowServerSnapshot = () => 0;
const INCIDENTS_PER_PAGE = 10;

function getPaginationItems(currentPage: number, totalPages: number): (number | "ellipsis")[] {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const items: (number | "ellipsis")[] = [1];
  if (currentPage > 3) {
    items.push("ellipsis");
  }
  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);
  for (let i = start; i <= end; i++) {
    items.push(i);
  }
  if (currentPage < totalPages - 2) {
    items.push("ellipsis");
  }
  items.push(totalPages);
  return items;
}

export function AdminDashboard(){
  const [data,setData]=useState<Store|null>(null);
  const [token,setToken]=useState("");
  const [tokenInput,setTokenInput]=useState("");
  const [locked,setLocked]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [busy,setBusy]=useState(false);
  const [incidentPage,setIncidentPage]=useState(1);
  const [serviceDraft,setServiceDraft]=useState<ServiceDraft|null>(null);
  const [eventDraft,setEventDraft]=useState<EventDraft|null>(null);
  const [deleteTarget,setDeleteTarget]=useState<DeleteTarget|null>(null);
  const [preview,setPreview]=useState(false);
  const [formError,setFormError]=useState("");
  const [rulesDraft,setRulesDraft]=useState<AutoPublishRules|null>(null);
  const nowMs = useSyncExternalStore(subscribeNow, getNowSnapshot, getNowServerSnapshot);
  const activeRules = rulesDraft ?? data?.rules ?? defaultAutoPublishRules;

  const incidents = data?.incidents ?? [];
  const totalIncidents = incidents.length;
  const totalPages = Math.max(1, Math.ceil(totalIncidents / INCIDENTS_PER_PAGE));
  const safeIncidentPage = Math.min(Math.max(1, incidentPage), totalPages);
  const paginatedIncidents = incidents.slice((safeIncidentPage - 1) * INCIDENTS_PER_PAGE, safeIncidentPage * INCIDENTS_PER_PAGE);


  async function load(secret = token) {
    try {
      const response = await fetch("/api/admin", {
        headers: { "x-admin-token": secret },
        cache: "no-store",
      });
      const value = await response.json();
      if (!response.ok) {
        if (response.status === 401) setLocked(true);
        throw new Error(value.error);
      }
      setData(value);
      setLocked(false);
      setError("");
      setToken(secret);
    } catch (e) {
      setError(e instanceof Error ? e.message : "无法加载后台");
    }
  }

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const secret = sessionStorage.getItem("status-admin-token") ?? "";
    if (!secret) {
      Promise.resolve().then(() => {
        if (active) setLocked(true);
      });
      return;
    }
    fetch("/api/admin", {
      headers: { "x-admin-token": secret },
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async response => {
        const value = await response.json();
        if (!active) return;
        if (response.status === 401) {
          setLocked(true);
          return;
        }
        if (!response.ok) throw new Error(value.error);
        setToken(secret);
        setData(value);
        setLocked(false);
      })
      .catch(e => {
        if (active && e.name !== "AbortError") {
          setError(e instanceof Error ? e.message : "无法加载后台");
        }
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, []);
  const ready = data !== null;
  useEffect(()=>{
    if(!ready||busy||locked)return;
    let active=true;const controller=new AbortController();
    const timer=setInterval(async()=>{try{const response=await fetch("/api/admin",{headers:{"x-admin-token":token},cache:"no-store",signal:controller.signal});const value=await response.json();if(!active)return;if(response.status===401)setLocked(true);if(!response.ok)throw new Error(value.error);setData(value);}catch(e){if(active)setError(e instanceof Error?e.message:"状态刷新失败");}},10000);
    return()=>{active=false;controller.abort();clearInterval(timer);};
  },[ready,busy,locked,token]);

  async function act(body:Record<string,unknown>,success:string){setBusy(true);setFormError("");setError("");setNotice("");try{const response=await fetch("/api/admin",{method:"POST",headers:{"Content-Type":"application/json","x-admin-token":token},body:JSON.stringify(body)});const value=await response.json();if(!response.ok)throw new Error(value.error);setData(value);setNotice(success);return true;}catch(e){const message=e instanceof Error?e.message:"操作失败";setError(message);setFormError(message);return false;}finally{setBusy(false);}}
  function editService(service?:Service){
    setFormError("");
    setServiceDraft(service ? {
      id: service.id,
      name: service.name,
      url: service.url,
      useCustomRules: !!service.rules,
      rules: service.rules ? { ...service.rules } : { ...activeRules },
    } : {
      name: "",
      url: "",
      useCustomRules: false,
      rules: { ...activeRules },
    });
  }
  function editEvent(incident?:Incident){setFormError("");setPreview(false);setEventDraft(incident?{...incident,serviceId:incident.serviceId??"",updates:incident.updates.map(update=>({...update}))}:{title:"",serviceId:"",resolved:false,published:false,updates:[{id:crypto.randomUUID(),label:"",message:""}]});}
  async function saveService(event:FormEvent){
    event.preventDefault();
    if(serviceDraft){
      const payload = {
        id: serviceDraft.id,
        name: serviceDraft.name,
        url: serviceDraft.url,
        rules: serviceDraft.useCustomRules ? serviceDraft.rules : null,
      };
      if(await act({action:"saveService", ...payload},"服务已保存并完成检测")){
        setServiceDraft(null);
      }
    }
  }

  async function saveEvent(published:boolean){if(eventDraft&&await act({action:"saveIncident",...eventDraft,published},published?"事件已发布，状态页可见":"草稿已保存，仅后台可见")){setEventDraft(null);setIncidentPage(1);}}
  function updateEntry(index:number,key:"label"|"message"|"status",value:string){setEventDraft(current=>current?{...current,updates:current.updates.map((entry,i)=>i===index?{...entry,[key]:value||undefined}:entry)}:null);}
  async function resolveAndEndEvent(){
    if(!eventDraft)return;
    let nextUpdates=[...eventDraft.updates];
    const first=nextUpdates[0];
    if(!first||first.message.trim()===""){
      const recoveryUpdate={
        id:first?.id??crypto.randomUUID(),
        label:first?.label?.trim()||"已恢复",
        message:first?.message?.trim()||"相关问题已解决，受影响服务已全部恢复正常运行。",
        status:"resolved" as const,
      };
      nextUpdates=[recoveryUpdate,...nextUpdates.slice(first?1:0)];
    }else if(first.status!=="resolved"&&!first.label.includes("恢复")&&!first.label.includes("解决")){
      const recoveryUpdate={
        id:crypto.randomUUID(),
        label:"已恢复",
        message:"相关问题已解决，受影响服务已全部恢复正常运行。",
        status:"resolved" as const,
      };
      nextUpdates=[recoveryUpdate,...nextUpdates];
    }else{
      nextUpdates[0]={
        ...first,
        label:first.label||"已恢复",
        status:"resolved" as const,
      };
    }
    const finalDraft={
      ...eventDraft,
      resolved:true,
      published:true,
      updates:nextUpdates,
    };
    if(await act({action:"saveIncident",...finalDraft,published:true},"事件已结束并恢复正常"))setEventDraft(null);
  }

  async function quickResolveIncident(incident:Incident){
    let nextUpdates=[...incident.updates];
    const first=nextUpdates[0];
    if(!first||(!first.label.includes("恢复")&&!first.label.includes("解决")&&first.status!=="resolved")){
      nextUpdates=[{
        id:crypto.randomUUID(),
        label:"已恢复",
        message:"相关问题已解决，受影响服务已全部恢复正常运行。",
        status:"resolved",
        createdAt:new Date().toISOString(),
      },...nextUpdates];
    }else{
      nextUpdates[0]={...first,status:"resolved",label:first.label||"已恢复"};
    }
    await act({
      action:"saveIncident",
      ...incident,
      resolved:true,
      published:true,
      updates:nextUpdates,
    },`${incident.title} 已结束并恢复正常`);
  }

  async function saveRules(){
    if(await act({action:"saveRules",...activeRules},"自动发布规则已成功保存")){
      setRulesDraft(null);
    }
  }

  async function resetRules(){
    if(await act({action:"resetRules"},"自动发布规则已恢复默认设置")){
      setRulesDraft(null);
    }
  }
  const currentNow = nowMs;

  return <MotionConfig reducedMotion="user"><div className="status-shell admin-shell"><main>
    <div className="page-heading"><div><span className="page-eyebrow">ALBATEXTUS / STATUS</span><h1>后台管理</h1><p>管理服务检测，手动编写并发布事件更新。</p></div><Button variant="outline" nativeButton={false} render={<Link href="/"/>}>查看状态页<ArrowUpRight data-icon="inline-end"/></Button></div>
    {error&&<Alert variant="destructive" className="mb-5"><AlertTitle>操作未完成</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
    {notice&&<p className="save-notice" role="status">{notice}</p>}
    {locked&&<section className="system-panel access-panel"><h2>管理验证</h2><form onSubmit={async event=>{event.preventDefault();sessionStorage.setItem("status-admin-token",tokenInput);await load(tokenInput);}}><FieldGroup><Field><FieldLabel htmlFor="admin-token">管理密钥</FieldLabel><Input id="admin-token" type="password" value={tokenInput} onChange={e=>setTokenInput(e.target.value)} required autoComplete="current-password"/><FieldDescription>填写服务器配置的 STATUS_ADMIN_TOKEN。</FieldDescription></Field><Button type="submit">进入后台</Button></FieldGroup></form></section>}
    {!data&&!locked&&!error&&<p className="loading-state"><LoaderCircle className="size-4 animate-spin"/>正在加载…</p>}
    {!data&&!locked&&error&&<Button variant="outline" onClick={()=>load()}>重试</Button>}
    {data&&(
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
      <section className="system-panel admin-section"><div className="admin-section-heading"><div><h2>服务管理 <span>{data.services.length}</span></h2><p>每项服务独立检测，不划分子组件。</p></div><div className="flex gap-2"><Button variant="outline" disabled={busy||!data.services.length} onClick={()=>act({action:"check"},"已完成全部服务检测")}><RefreshCw data-icon="inline-start" className={busy?"animate-spin":undefined}/>全部检测</Button><Button disabled={busy} onClick={()=>editService()}><Plus data-icon="inline-start"/>添加服务</Button></div></div><Separator/>
        {data.services.length ? (
          data.services.map(service => {
            const srvRules = service.rules ?? activeRules;
            const srvErrorMs = (srvRules.errorThresholdMinutes || 5) * 60000;
            const srvMaintMs = (srvRules.maintenanceThresholdMinutes || 5) * 60000;
            const srvRecovMs = (srvRules.recoveryThresholdMinutes || 5) * 60000;

            return (
              <div className="admin-service-row" key={service.id}>
                <div className="admin-service-copy">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <h3>{service.name}</h3>
                    {service.rules ? (
                      <Badge variant="outline" className="text-xs font-normal border-primary/40 text-primary">
                        独立规则 ({service.rules.errorThresholdMinutes}m/{service.rules.maintenanceThresholdMinutes}m/{service.rules.recoveryThresholdMinutes}m)
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs font-normal text-muted-foreground">
                        跟随全局
                      </Badge>
                    )}
                  </div>
                  <p>{service.url}</p>
                  <span>
                    最近检测：<DisplayTime value={service.result.checkedAt} />
                    {service.result.code !== null && ` · HTTP ${service.result.code}`}
                    {service.result.status === "error" && service.failingSince && (
                      <span className="text-red-500 font-medium ml-1">
                        {" "}· 连续异常 {Math.max(1, Math.round((currentNow - new Date(service.failingSince).getTime()) / 60000))} 分钟
                        {!srvRules.enabled
                          ? " (自动发布已停用)"
                          : currentNow - new Date(service.failingSince).getTime() >= srvErrorMs
                          ? " (已自动发布红色预警)"
                          : ` (连续满 ${srvRules.errorThresholdMinutes} 分钟将自动发布红色事态)`}
                      </span>
                    )}
                    {service.result.status === "maintenance" && service.maintenanceSince && (
                      <span className="text-amber-500 font-medium ml-1">
                        {" "}· 维护中 {Math.max(1, Math.round((currentNow - new Date(service.maintenanceSince).getTime()) / 60000))} 分钟
                        {!srvRules.enabled
                          ? " (自动发布已停用)"
                          : currentNow - new Date(service.maintenanceSince).getTime() >= srvMaintMs
                          ? " (已自动发布维护事态)"
                          : ` (连续满 ${srvRules.maintenanceThresholdMinutes} 分钟将自动发布维护事态)`}
                      </span>
                    )}
                    {service.result.status === "operational" && service.maintenanceRecoveringSince && (
                      <span className="text-emerald-500 font-medium ml-1">
                        {" "}· 恢复正常 {Math.max(1, Math.round((currentNow - new Date(service.maintenanceRecoveringSince).getTime()) / 60000))} 分钟
                        {!srvRules.enabled
                          ? " (自动发布已停用)"
                          : currentNow - new Date(service.maintenanceRecoveringSince).getTime() >= srvRecovMs
                          ? ` (已满 ${srvRules.recoveryThresholdMinutes} 分钟，等待检测确认结束事态)`
                          : ` (连续满 ${srvRules.recoveryThresholdMinutes} 分钟将自动结束事态)`}
                      </span>
                    )}
                  </span>
                </div>
                <HealthLabel result={service.result} />
                <div className="row-actions">
                  <Button variant="ghost" size="icon" disabled={busy} aria-label={`检测 ${service.name}`} onClick={() => act({ action: "check", id: service.id }, `${service.name} 检测完成`)}>
                    <RefreshCw />
                  </Button>
                  <Button variant="ghost" size="icon" disabled={busy} aria-label={`编辑 ${service.name}`} onClick={() => editService(service)}>
                    <Pencil />
                  </Button>
                  <Button variant="ghost" size="icon" disabled={busy} aria-label={`删除 ${service.name}`} onClick={() => setDeleteTarget({ kind: "Service", id: service.id, name: service.name })}>
                    <Trash2 />
                  </Button>
                </div>
              </div>
            );
          })
        ) : (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon"><Server /></EmptyMedia>
              <EmptyTitle>从你的第一个服务开始</EmptyTitle>
              <EmptyDescription>填写服务名称与地址，后台会请求它的 /healthz 接口。</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        <div className="admin-rule"><span className="health-operational">200 · 正常</span><span className="health-maintenance">433 · 维护中</span><span className="health-error">其他 / 连接失败 · 异常</span><span>每分钟自动检测</span></div>
      </section>

      <section className="system-panel admin-section">
        <div className="admin-section-heading">
          <div>
            <h2>自动发布规则</h2>
            <p>自定义服务异常与维护事件的自动发布时间阈值与通告说明文案。</p>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={resetRules}>
              <RotateCcw data-icon="inline-start" className="size-3.5"/>重置默认
            </Button>
            <Button type="button" size="sm" disabled={busy} onClick={saveRules}>
              {busy&&<LoaderCircle data-icon="inline-start" className="animate-spin size-3.5"/>}保存规则
            </Button>
          </div>
        </div>
        <Separator/>
        <div className="p-5 flex flex-col gap-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <Field>
              <FieldLabel htmlFor="rule-enabled">自动发布状态</FieldLabel>
              <Select id="rule-enabled" value={activeRules.enabled?"true":"false"} onValueChange={val=>setRulesDraft(d=>({...(d??activeRules),enabled:val==="true"}))}>
                <SelectTrigger id="rule-enabled" className="w-full"><SelectValue/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="true" label="启用 (自动发布)">启用 · 达到阈值自动发布与解除</SelectItem>
                  <SelectItem value="false" label="停用 (不自动发布)">停用 · 仅记录健康状态不自动发布</SelectItem>
                </SelectContent>
              </Select>
              <FieldDescription>是否在达到阈值时自动创建或解除事态</FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="rule-error-threshold">异常发布时间 (分钟)</FieldLabel>
              <Input id="rule-error-threshold" type="number" min={1} max={1440} value={activeRules.errorThresholdMinutes} onChange={e=>setRulesDraft(d=>({...(d??activeRules),errorThresholdMinutes:Math.max(1,parseInt(e.target.value)||1)}))}/>
              <FieldDescription>连续故障达到此时间自动发布红色预警</FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="rule-maintenance-threshold">维护发布时间 (分钟)</FieldLabel>
              <Input id="rule-maintenance-threshold" type="number" min={1} max={1440} value={activeRules.maintenanceThresholdMinutes} onChange={e=>setRulesDraft(d=>({...(d??activeRules),maintenanceThresholdMinutes:Math.max(1,parseInt(e.target.value)||1)}))}/>
              <FieldDescription>连续维护达到此时间自动发布维护事态</FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="rule-recovery-threshold">恢复解除时间 (分钟)</FieldLabel>
              <Input id="rule-recovery-threshold" type="number" min={1} max={1440} value={activeRules.recoveryThresholdMinutes} onChange={e=>setRulesDraft(d=>({...(d??activeRules),recoveryThresholdMinutes:Math.max(1,parseInt(e.target.value)||1)}))}/>
              <FieldDescription>连续正常达到此时间自动取消事态</FieldDescription>
            </Field>
          </div>

          <div className="flex flex-col gap-4">
            <Field>
              <FieldLabel htmlFor="rule-error-template">异常事件发布说明模板</FieldLabel>
              <Textarea id="rule-error-template" rows={2} maxLength={500} value={activeRules.errorMessageTemplate} onChange={e=>setRulesDraft(d=>({...(d??activeRules),errorMessageTemplate:e.target.value}))} placeholder="例如：检测到 {service} 持续异常已超过 {minutes} 分钟（{reason}），系统已自动发布红色预警事态。"/>
              <FieldDescription>
                可用占位变量：<code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">&#123;service&#125;</code> 服务名称、<code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">&#123;minutes&#125;</code> 持续分钟、<code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">&#123;reason&#125;</code> 检测状态说明
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="rule-maintenance-template">维护事件发布说明模板</FieldLabel>
              <Textarea id="rule-maintenance-template" rows={2} maxLength={500} value={activeRules.maintenanceMessageTemplate} onChange={e=>setRulesDraft(d=>({...(d??activeRules),maintenanceMessageTemplate:e.target.value}))} placeholder="例如：检测到 {service} 进入维护状态已持续超过 {minutes} 分钟，系统已自动发布维护事态。"/>
              <FieldDescription>
                可用占位变量：<code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">&#123;service&#125;</code> 服务名称、<code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">&#123;minutes&#125;</code> 持续分钟
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="rule-recovery-template">恢复正常解除说明模板</FieldLabel>
              <Textarea id="rule-recovery-template" rows={2} maxLength={500} value={activeRules.recoveryMessageTemplate} onChange={e=>setRulesDraft(d=>({...(d??activeRules),recoveryMessageTemplate:e.target.value}))} placeholder="例如：检测到 {service} 服务已持续恢复正常运行满 {minutes} 分钟，相关事态已自动取消并恢复。"/>
              <FieldDescription>
                可用占位变量：<code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">&#123;service&#125;</code> 服务名称、<code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">&#123;minutes&#125;</code> 持续分钟
              </FieldDescription>
            </Field>
          </div>
        </div>
      </section>


      <section className="system-panel admin-section">
        <div className="admin-section-heading">
          <div>
            <h2>公告与事件 <span>{totalIncidents}</span></h2>
            <p>文案、状态名称和更新记录由你编写。</p>
          </div>
          <Button disabled={busy} onClick={()=>editEvent()}>
            <Plus data-icon="inline-start"/>新建事件
          </Button>
        </div>
        <Separator/>
        {totalIncidents ? (
          <>
            <motion.div
              key={safeIncidentPage}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              {paginatedIncidents.map(incident => (
                <div className="admin-event-row" key={incident.id}>
                  <div className="admin-event-copy">
                    <h3>{incident.title}</h3>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={incident.published ? "secondary" : "outline"}>
                        {incident.published ? "已发布" : "草稿"}
                      </Badge>
                      <span>
                        {incident.resolved ? "已结束" : "进行中"} · {incident.updates.length} 条更新 · <DisplayTime value={incident.updatedAt}/>
                      </span>
                    </div>
                  </div>
                  <div className="row-actions">
                    {!incident.resolved && incident.published && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        className="border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-400 dark:hover:bg-emerald-500/20 text-xs h-8 px-2.5"
                        onClick={() => quickResolveIncident(incident)}
                      >
                        <CheckCircle2 data-icon="inline-start" className="size-3.5"/>
                        结束恢复
                      </Button>
                    )}
                    {incident.published && (
                      <Button
                        variant="ghost"
                        size="icon"
                        nativeButton={false}
                        aria-label={`查看 ${incident.title}`}
                        render={<Link href={`/incidents/${incident.id}`}/>}
                      >
                        <ArrowUpRight/>
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={busy}
                      aria-label={`编辑 ${incident.title}`}
                      onClick={() => editEvent(incident)}
                    >
                      <Pencil/>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={busy}
                      aria-label={`删除 ${incident.title}`}
                      onClick={() => setDeleteTarget({kind:"Incident",id:incident.id,name:incident.title})}
                    >
                      <Trash2/>
                    </Button>
                  </div>
                </div>
              ))}
            </motion.div>

            <div className="admin-pagination">
              <div className="admin-pagination-info text-muted-foreground">
                {totalPages > 1 ? (
                  <>
                    第 <span className="font-medium text-foreground">{safeIncidentPage}</span> / {totalPages} 页
                    <span className="mx-2 opacity-40">·</span>
                    显示第 {(safeIncidentPage - 1) * INCIDENTS_PER_PAGE + 1} - {Math.min(safeIncidentPage * INCIDENTS_PER_PAGE, totalIncidents)} 条，共 {totalIncidents} 条
                  </>
                ) : (
                  <span>共 {totalIncidents} 条记录（单页最多展示 10 条）</span>
                )}
              </div>
              <div className="admin-pagination-controls">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2.5 text-xs gap-1"
                  disabled={safeIncidentPage <= 1 || busy}
                  onClick={() => setIncidentPage(p => Math.max(1, p - 1))}
                  aria-label="上一页"
                >
                  <ChevronLeft data-icon="inline-start" className="size-3.5" />
                  <span>上一页</span>
                </Button>

                <div className="flex items-center gap-1">
                  {getPaginationItems(safeIncidentPage, totalPages).map((item, idx) =>
                    item === "ellipsis" ? (
                      <span key={`ellipsis-${idx}`} className="px-1.5 text-xs text-muted-foreground select-none">
                        …
                      </span>
                    ) : (
                      <Button
                        key={item}
                        variant={item === safeIncidentPage ? "default" : "outline"}
                        size="sm"
                        className="size-8 p-0 text-xs font-medium"
                        disabled={busy}
                        onClick={() => setIncidentPage(item)}
                        aria-label={`第 ${item} 页`}
                        aria-current={item === safeIncidentPage ? "page" : undefined}
                      >
                        {item}
                      </Button>
                    )
                  )}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2.5 text-xs gap-1"
                  disabled={safeIncidentPage >= totalPages || busy}
                  onClick={() => setIncidentPage(p => Math.min(totalPages, p + 1))}
                  aria-label="下一页"
                >
                  <span>下一页</span>
                  <ChevronRight data-icon="inline-end" className="size-3.5" />
                </Button>
              </div>
            </div>
          </>
        ) : (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon"><FileText/></EmptyMedia>
              <EmptyTitle>还没有事件或公告</EmptyTitle>
              <EmptyDescription>需要说明维护或故障时，再创建事件并发布更新。</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </section>
      </motion.div>
    )}
  </main></div>

  <Dialog open={serviceDraft!==null} onOpenChange={open=>{if(!open&&!busy)setServiceDraft(null);}}><DialogContent className="service-editor-dialog sm:max-w-xl"><DialogHeader><DialogTitle>{serviceDraft?.id?"编辑服务":"添加服务"}</DialogTitle><DialogDescription>配置服务的基础检测地址与独立自动发布规则。</DialogDescription></DialogHeader>{serviceDraft&&<form onSubmit={saveService} className="editor-body flex flex-col gap-4"><FieldGroup><Field><FieldLabel htmlFor="service-name">服务名称</FieldLabel><Input id="service-name" value={serviceDraft.name} onChange={e=>setServiceDraft({...serviceDraft,name:e.target.value})} maxLength={80} required placeholder="填写服务名称"/></Field><Field><FieldLabel htmlFor="service-url">服务地址</FieldLabel><Input id="service-url" value={serviceDraft.url} onChange={e=>setServiceDraft({...serviceDraft,url:e.target.value})} type="url" required placeholder="https://你的服务域名/healthz"/><FieldDescription>填写完整地址；没有 /healthz 时会自动补全。</FieldDescription></Field>
  <Separator className="my-1"/>
  <Field><FieldLabel htmlFor="service-rule-mode">自动发布规则模式</FieldLabel><Select id="service-rule-mode" value={serviceDraft.useCustomRules?"custom":"global"} onValueChange={val=>setServiceDraft({...serviceDraft,useCustomRules:val==="custom",rules:serviceDraft.rules?{...serviceDraft.rules}:{...activeRules}})}><SelectTrigger id="service-rule-mode" className="w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="global" label="跟随全局默认规则">跟随全局默认规则 (继承全局配置)</SelectItem><SelectItem value="custom" label="为此服务独立自定义">此服务独立自定义规则 (单独配置阈值与文案)</SelectItem></SelectContent></Select><FieldDescription>{serviceDraft.useCustomRules?"此服务将使用独立参数，不再跟随全局规则变动。":`当前跟随全局默认规则：异常 ${activeRules.errorThresholdMinutes}m / 维护 ${activeRules.maintenanceThresholdMinutes}m / 恢复 ${activeRules.recoveryThresholdMinutes}m。`}</FieldDescription></Field>
  {serviceDraft.useCustomRules&&<div className="rounded-lg border bg-muted/40 p-4 flex flex-col gap-4"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><span className="text-sm font-medium">独立规则参数</span><Badge variant="outline" className="text-xs border-primary/40 text-primary">独立生效</Badge></div><Button type="button" variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={()=>setServiceDraft({...serviceDraft,rules:{...activeRules}})}><RotateCcw data-icon="inline-start" className="size-3"/>载入全局当前值</Button></div>
  <Field><FieldLabel htmlFor="service-rule-enabled">自动发布状态</FieldLabel><Select id="service-rule-enabled" value={serviceDraft.rules.enabled?"true":"false"} onValueChange={val=>setServiceDraft({...serviceDraft,rules:{...serviceDraft.rules,enabled:val==="true"}})}><SelectTrigger id="service-rule-enabled" className="w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="true" label="启用 (自动发布)">启用 · 达到设定阈值时自动发布与解除</SelectItem><SelectItem value="false" label="停用 (不发布)">停用 · 仅监控健康状态，不自动发布事件</SelectItem></SelectContent></Select></Field>
  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
    <Field><FieldLabel htmlFor="service-rule-error">异常阈值 (分钟)</FieldLabel><Input id="service-rule-error" type="number" min={1} max={1440} value={serviceDraft.rules.errorThresholdMinutes} onChange={e=>setServiceDraft({...serviceDraft,rules:{...serviceDraft.rules,errorThresholdMinutes:Math.max(1,parseInt(e.target.value)||1)}})}/><FieldDescription>连续故障发布红色事态</FieldDescription></Field>
    <Field><FieldLabel htmlFor="service-rule-maintenance">维护阈值 (分钟)</FieldLabel><Input id="service-rule-maintenance" type="number" min={1} max={1440} value={serviceDraft.rules.maintenanceThresholdMinutes} onChange={e=>setServiceDraft({...serviceDraft,rules:{...serviceDraft.rules,maintenanceThresholdMinutes:Math.max(1,parseInt(e.target.value)||1)}})}/><FieldDescription>连续维护发布维护事态</FieldDescription></Field>
    <Field><FieldLabel htmlFor="service-rule-recovery">解除阈值 (分钟)</FieldLabel><Input id="service-rule-recovery" type="number" min={1} max={1440} value={serviceDraft.rules.recoveryThresholdMinutes} onChange={e=>setServiceDraft({...serviceDraft,rules:{...serviceDraft.rules,recoveryThresholdMinutes:Math.max(1,parseInt(e.target.value)||1)}})}/><FieldDescription>恢复正常后自动解除事态</FieldDescription></Field>
  </div>
  <Field><FieldLabel htmlFor="service-rule-error-tpl">独立异常事件说明模板</FieldLabel><Textarea id="service-rule-error-tpl" rows={2} maxLength={500} value={serviceDraft.rules.errorMessageTemplate} onChange={e=>setServiceDraft({...serviceDraft,rules:{...serviceDraft.rules,errorMessageTemplate:e.target.value}})} placeholder="例如：检测到 {service} 持续异常已超过 {minutes} 分钟（{reason}）..."/><FieldDescription>占位符：<code className="text-xs bg-muted px-1 py-0.5 rounded font-mono">&#123;service&#125;</code> 服务名、<code className="text-xs bg-muted px-1 py-0.5 rounded font-mono">&#123;minutes&#125;</code> 分钟、<code className="text-xs bg-muted px-1 py-0.5 rounded font-mono">&#123;reason&#125;</code> 原因</FieldDescription></Field>
  <Field><FieldLabel htmlFor="service-rule-maint-tpl">独立维护事件说明模板</FieldLabel><Textarea id="service-rule-maint-tpl" rows={2} maxLength={500} value={serviceDraft.rules.maintenanceMessageTemplate} onChange={e=>setServiceDraft({...serviceDraft,rules:{...serviceDraft.rules,maintenanceMessageTemplate:e.target.value}})} placeholder="例如：检测到 {service} 进入维护状态已持续超过 {minutes} 分钟..."/><FieldDescription>占位符：<code className="text-xs bg-muted px-1 py-0.5 rounded font-mono">&#123;service&#125;</code> 服务名、<code className="text-xs bg-muted px-1 py-0.5 rounded font-mono">&#123;minutes&#125;</code> 分钟</FieldDescription></Field>
  <Field><FieldLabel htmlFor="service-rule-recov-tpl">独立恢复正常说明模板</FieldLabel><Textarea id="service-rule-recov-tpl" rows={2} maxLength={500} value={serviceDraft.rules.recoveryMessageTemplate} onChange={e=>setServiceDraft({...serviceDraft,rules:{...serviceDraft.rules,recoveryMessageTemplate:e.target.value}})} placeholder="例如：检测到 {service} 服务已持续恢复正常运行满 {minutes} 分钟..."/><FieldDescription>占位符：<code className="text-xs bg-muted px-1 py-0.5 rounded font-mono">&#123;service&#125;</code> 服务名、<code className="text-xs bg-muted px-1 py-0.5 rounded font-mono">&#123;minutes&#125;</code> 分钟</FieldDescription></Field>
  </div>}
  {formError&&<p className="form-error" role="alert">{formError}</p>}</FieldGroup><DialogFooter className="mt-2"><Button type="button" variant="outline" disabled={busy} onClick={()=>setServiceDraft(null)}>取消</Button><Button disabled={busy} type="submit">{busy&&<LoaderCircle data-icon="inline-start" className="animate-spin"/>}{busy?"保存并检测中…":"保存服务配置"}</Button></DialogFooter></form>}</DialogContent></Dialog>

  <Dialog open={eventDraft!==null} onOpenChange={open=>{if(!open&&!busy)setEventDraft(null);}}><DialogContent className="event-editor-dialog sm:max-w-2xl"><DialogHeader><DialogTitle>{eventDraft?.id?"编辑事件":"新建事件"}</DialogTitle><DialogDescription>保存草稿后仅自己可见，发布后会出现在状态页。</DialogDescription></DialogHeader>{eventDraft&&<><div className="editor-body"><FieldGroup><Field><FieldLabel htmlFor="event-title">事件标题</FieldLabel><Input id="event-title" maxLength={160} value={eventDraft.title} onChange={e=>setEventDraft({...eventDraft,title:e.target.value})} placeholder="填写公告或事件标题"/></Field><div className="editor-options"><Field><FieldLabel htmlFor="event-service">关联服务</FieldLabel><Select id="event-service" value={eventDraft.serviceId||"none"} onValueChange={val=>setEventDraft({...eventDraft,serviceId:val==="none"?"":(val??"")})}><SelectTrigger id="event-service" className="w-full"><SelectValue placeholder="全站公告 / 不关联服务"/></SelectTrigger><SelectContent><SelectItem value="none">全站公告 / 不关联服务</SelectItem>{data?.services.map(service=><SelectItem value={service.id} key={service.id}>{service.name}</SelectItem>)}</SelectContent></Select></Field><Field><FieldLabel htmlFor="event-resolved">事件进度</FieldLabel><Select id="event-resolved" value={eventDraft.resolved?"resolved":"active"} onValueChange={val=>setEventDraft({...eventDraft,resolved:val==="resolved"})}><SelectTrigger id="event-resolved" className="w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="active">进行中</SelectItem><SelectItem value="resolved">已结束</SelectItem></SelectContent></Select></Field></div></FieldGroup>
      <Field className="mt-5"><FieldLabel htmlFor="event-color">公告颜色</FieldLabel><Select id="event-color" value={eventDraft.color??"yellow"} onValueChange={val=>setEventDraft({...eventDraft,color:(val as "red"|"yellow")??"yellow"})}><SelectTrigger id="event-color" className="w-full sm:w-80"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="yellow">黄色 · 提醒 / 维护</SelectItem><SelectItem value="red">红色 · 故障 / 异常</SelectItem></SelectContent></Select><FieldDescription>进行中的已发布事件会常驻首页上方；结束或撤回后移出顶部。</FieldDescription></Field>
      <div className={`announcement-color-preview announcement-${eventDraft.color??"yellow"}`}>首页公告：{eventDraft.color==="red"?"红色":"黄色"}</div>
      <div className="updates-editor-heading"><h3>更新记录</h3><div className="flex items-center gap-2">{!eventDraft.resolved&&<Button type="button" variant="outline" size="sm" className="border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-400 dark:hover:bg-emerald-500/20 text-xs h-8" onClick={()=>{setEventDraft({...eventDraft,resolved:true,updates:[{id:crypto.randomUUID(),label:"已恢复",message:"相关问题已解决，受影响服务已全部恢复正常运行。",status:"resolved"},...eventDraft.updates]});}}><CheckCircle2 data-icon="inline-start" className="size-3.5"/>填入恢复更新</Button>}<Button variant="outline" size="sm" disabled={eventDraft.updates.length>=50} onClick={()=>setEventDraft({...eventDraft,updates:[{id:crypto.randomUUID(),label:"",message:""},...eventDraft.updates]})}><Plus data-icon="inline-start"/>添加更新</Button></div></div>
      <div className="updates-editor">{eventDraft.updates.map((update,index)=><section className="update-editor" key={update.id}><div className="update-editor-index"><span>{index===0?"最新更新":`更新 ${eventDraft.updates.length-index}`}</span>{eventDraft.updates.length>1&&<Button variant="ghost" size="icon-sm" aria-label={`移除更新 ${index+1}`} onClick={()=>setEventDraft({...eventDraft,updates:eventDraft.updates.filter((_,i)=>i!==index)})}><Trash2/></Button>}</div><FieldGroup><div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-2"><Field><FieldLabel htmlFor={`update-label-${index}`}>状态名称</FieldLabel><Input id={`update-label-${index}`} maxLength={80} value={update.label} onChange={e=>updateEntry(index,"label",e.target.value)} placeholder="自行填写，例如：已解决 / 监控中"/></Field><Field><FieldLabel htmlFor={`update-status-${index}`}>节点阶段与颜色</FieldLabel><Select id={`update-status-${index}`} value={update.status??"auto"} onValueChange={val=>updateEntry(index,"status",!val||val==="auto"?"":(val as UpdateStatusKind))}><SelectTrigger id={`update-status-${index}`} className="w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="auto">自动根据位置与词义推断</SelectItem><SelectItem value="outage">🔴 故障中 / 调查排查 (红色)</SelectItem><SelectItem value="monitoring">🟡 观察中 / 恢复阶段 (黄色)</SelectItem><SelectItem value="resolved">🟢 已恢复 / 解决阶段 (绿色)</SelectItem><SelectItem value="neutral">⚪ 普通进展 / 说明公告 (灰色)</SelectItem></SelectContent></Select></Field></div><Field><FieldLabel htmlFor={`update-message-${index}`}>更新内容</FieldLabel><Textarea id={`update-message-${index}`} maxLength={10000} value={update.message} onChange={e=>updateEntry(index,"message",e.target.value)} placeholder="编写本次进展、维护说明或恢复情况…"/></Field></FieldGroup></section>)}</div>
      <Button variant="ghost" onClick={()=>setPreview(!preview)}>{preview?"收起预览":"预览发布内容"}</Button>{preview&&<div className="event-preview"><h3>{eventDraft.title||"未填写标题"}</h3>{eventDraft.updates.map(update=><div key={update.id}><strong>{update.label||"未填写状态"}</strong><p>{update.message||"未填写内容"}</p></div>)}</div>}
      {formError&&<p className="form-error" role="alert">{formError}</p>}</div><DialogFooter className="flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5"><Button variant="outline" disabled={busy} onClick={()=>saveEvent(false)}>{eventDraft.published?"撤回为草稿":"保存草稿"}</Button><div className="flex flex-wrap items-center gap-2">{!eventDraft.resolved&&<Button type="button" variant="outline" className="border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-700 dark:border-emerald-500/30 dark:text-emerald-400 dark:hover:bg-emerald-500/20" disabled={busy} onClick={resolveAndEndEvent}><CheckCircle2 data-icon="inline-start" className="size-4"/>{busy&&<LoaderCircle data-icon="inline-start" className="animate-spin"/>}结束事件（恢复正常）</Button>}<Button disabled={busy} onClick={()=>saveEvent(true)}>{busy&&<LoaderCircle data-icon="inline-start" className="animate-spin"/>}{eventDraft.published?"保存并更新发布":"发布事件"}</Button></div></DialogFooter></>}</DialogContent></Dialog>

  <Dialog open={deleteTarget!==null} onOpenChange={open=>{if(!open&&!busy)setDeleteTarget(null);}}><DialogContent><DialogHeader><DialogTitle>删除{deleteTarget?.kind==="Service"?"服务":"事件"}</DialogTitle><DialogDescription>确定删除「{deleteTarget?.name}」？{deleteTarget?.kind==="Service"?"已发布的事件会保留，服务关联将解除。":"该事件及其更新记录将一并删除。"}</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" disabled={busy} onClick={()=>setDeleteTarget(null)}>取消</Button><Button variant="destructive" disabled={busy} onClick={async()=>{if(deleteTarget&&await act({action:`delete${deleteTarget.kind}`,id:deleteTarget.id},"已删除"))setDeleteTarget(null);}}>确认删除</Button></DialogFooter></DialogContent></Dialog>
  </MotionConfig>;
}
