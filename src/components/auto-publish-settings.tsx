"use client";

import { AlertCircle, CheckCircle2, LoaderCircle, RotateCcw, Wrench } from "lucide-react";
import type { AutoPublishRules } from "@/lib/types";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";
import { Separator } from "./ui/separator";
import { Switch } from "./ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Textarea } from "./ui/textarea";

const ruleTypes = [
  { id: "error", label: "服务异常", action: "发布异常事件", description: "连续异常后，发布红色预警。", threshold: "errorThresholdMinutes", template: "errorMessageTemplate", icon: AlertCircle, tone: "health-error" },
  { id: "maintenance", label: "服务维护", action: "发布维护事件", description: "连续维护后，发布维护通知。", threshold: "maintenanceThresholdMinutes", template: "maintenanceMessageTemplate", icon: Wrench, tone: "health-maintenance" },
  { id: "recovery", label: "恢复正常", action: "解除进行中的事件", description: "持续正常后，自动结束相关事件。", threshold: "recoveryThresholdMinutes", template: "recoveryMessageTemplate", icon: CheckCircle2, tone: "health-operational" },
] as const;

type Props = {
  rules: AutoPublishRules;
  busy: boolean;
  dirty: boolean;
  onChange: (rules: AutoPublishRules) => void;
  onSave: () => void;
  onReset: () => void;
};

export function AutoPublishSettings({ rules, busy, dirty, onChange, onSave, onReset }: Props) {
  return (
    <section className="system-panel admin-section auto-publish-settings" aria-labelledby="auto-publish-title">
      <div className="admin-section-heading">
        <div>
          <h2 id="auto-publish-title">自动发布规则</h2>
          <p>设置事件触发时间与通知文案，自动跟进服务状态。</p>
        </div>
        <Badge variant="secondary">全局规则</Badge>
      </div>
      <Separator className="h-px w-full" />
      <AutoPublishRuleFields rules={rules} busy={busy} onChange={onChange} />
      <Separator className="h-px w-full" />
      <div className="rules-settings-footer">
        <p role="status">{dirty ? "有未保存的修改" : "独立设置规则的服务不受全局规则影响"}</p>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onReset}><RotateCcw data-icon="inline-start" />恢复默认</Button>
          <Button type="button" size="sm" disabled={busy || !dirty} onClick={onSave}>{busy && <LoaderCircle data-icon="inline-start" className="animate-spin" />}保存规则</Button>
        </div>
      </div>
    </section>
  );
}

export function AutoPublishRuleFields({ rules, busy, onChange, idPrefix = "rule" }: Pick<Props, "rules" | "busy" | "onChange"> & { idPrefix?: string }) {
  return (
      <div className="rules-settings-body">
        <FieldGroup>
          <Field orientation="horizontal" className="pr-3" data-disabled={busy || undefined}>
            <FieldContent>
              <FieldLabel htmlFor={`${idPrefix}-enabled`}>自动发布与解除</FieldLabel>
              <FieldDescription id={`${idPrefix}-enabled-description`}>
                {rules.enabled ? "达到下方时间后，自动发布或结束事件。" : "已停用自动发布与解除，服务健康检测继续运行。"}
              </FieldDescription>
            </FieldContent>
            <Switch id={`${idPrefix}-enabled`} checked={rules.enabled} disabled={busy} aria-describedby={`${idPrefix}-enabled-description`} onCheckedChange={enabled => onChange({ ...rules, enabled })} />
          </Field>
        </FieldGroup>
        <Separator className="h-px w-full" />
        <section aria-labelledby={`${idPrefix}-threshold-title`} className="rules-settings-section">
          <div className="rules-section-caption">
            <h3 id={`${idPrefix}-threshold-title`}>触发时间</h3>
            <p>状态需连续保持 · 单位：分钟</p>
          </div>
          <FieldGroup className="rules-thresholds">
            {ruleTypes.map(rule => (
              <Field key={rule.id} data-disabled={busy || undefined}>
                <FieldLabel htmlFor={`${idPrefix}-${rule.id}-threshold`}>
                  <rule.icon aria-hidden="true" className={rule.tone} />{rule.label}
                </FieldLabel>
                <Input id={`${idPrefix}-${rule.id}-threshold`} type="number" min={1} max={1440} step={1} disabled={busy} aria-describedby={`${idPrefix}-${rule.id}-hint`} value={rules[rule.threshold]} onChange={event => onChange({ ...rules, [rule.threshold]: Math.min(1440, Math.max(1, parseInt(event.target.value, 10) || 1)) })} />
                <FieldDescription id={`${idPrefix}-${rule.id}-hint`}>{rule.description}</FieldDescription>
              </Field>
            ))}
          </FieldGroup>
        </section>
      <Separator className="h-px w-full" />
        <section aria-labelledby={`${idPrefix}-template-title`} className="rules-settings-section">
          <div className="rules-section-caption">
            <h3 id={`${idPrefix}-template-title`}>通知文案</h3>
            <p>选择事件类型，编辑对应说明</p>
          </div>
          <Tabs defaultValue="error" className="gap-4">
            <TabsList aria-label="通知文案类型" className="w-full sm:w-fit">
              {ruleTypes.map(rule => <TabsTrigger key={rule.id} value={rule.id}>{rule.label}</TabsTrigger>)}
            </TabsList>
            {ruleTypes.map(rule => (
              <TabsContent key={rule.id} value={rule.id}>
                <FieldGroup>
                  <Field data-disabled={busy || undefined}>
                    <div className="rules-template-label">
                      <FieldLabel htmlFor={`${idPrefix}-${rule.id}-template`}>{rule.action}时的说明</FieldLabel>
                      <span>{rules[rule.template].length} / 500</span>
                    </div>
                    <Textarea id={`${idPrefix}-${rule.id}-template`} rows={3} className="min-h-24 resize-y" maxLength={500} disabled={busy} value={rules[rule.template]} aria-describedby={`${idPrefix}-${rule.id}-variables`} onChange={event => onChange({ ...rules, [rule.template]: event.target.value })} />
                    <FieldDescription id={`${idPrefix}-${rule.id}-variables`} className="rules-template-variables">
                      <span>自动替换：</span>
                      <span><code>{"{service}"}</code> 服务名称</span>
                      <span><code>{"{minutes}"}</code> 持续分钟</span>
                      {rule.id === "error" && <span><code>{"{reason}"}</code> 异常原因</span>}
                    </FieldDescription>
                  </Field>
                </FieldGroup>
              </TabsContent>
            ))}
          </Tabs>
        </section>
      </div>
  );
}
