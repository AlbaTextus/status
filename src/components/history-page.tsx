"use client";
import { useState, useMemo } from "react";

import Link from "next/link";
import { CalendarIcon, CheckCircle2, ChevronDown, FileText } from "lucide-react";
import { Button } from "./ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Calendar } from "./ui/calendar";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "./ui/empty";
import { beijingDate } from "@/lib/history";
import type { PublicState, Incident } from "@/lib/types";
import { zhCN } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { resolveIncidentColor } from "@/lib/incident-status";
import { cn } from "cn";

type HistoryDayEntry = {
  type: "day";
  date: string;
  dayNum: string;
  weekday: string;
  items: Incident[];
};

type HistoryRangeEntry = {
  type: "range";
  key: string;
  startDate: string;
  endDate: string;
  startDayNum: string;
  endDayNum: string;
  daysCount: number;
  days: {
    date: string;
    dayNum: string;
    weekday: string;
  }[];
};

type HistoryEntry = HistoryDayEntry | HistoryRangeEntry;

function groupMonthDays(days: Map<string, Incident[]>): HistoryEntry[] {
  const entries: HistoryEntry[] = [];
  const entriesList = [...days.entries()];

  let emptyRun: { date: string; dayNum: string; weekday: string }[] = [];

  const flushEmptyRun = () => {
    if (emptyRun.length === 0) return;
    if (emptyRun.length >= 7) {
      const latest = emptyRun[0];
      const earliest = emptyRun[emptyRun.length - 1];
      entries.push({
        type: "range",
        key: `${earliest.date}_${latest.date}`,
        startDate: earliest.date,
        endDate: latest.date,
        startDayNum: earliest.dayNum,
        endDayNum: latest.dayNum,
        daysCount: emptyRun.length,
        days: [...emptyRun],
      });
    } else {
      for (const day of emptyRun) {
        entries.push({
          type: "day",
          date: day.date,
          dayNum: day.dayNum,
          weekday: day.weekday,
          items: [],
        });
      }
    }
    emptyRun = [];
  };

  for (const [date, items] of entriesList) {
    const dt = new Date(`${date}T12:00:00Z`);
    const dayNum = date.slice(8);
    const weekday = dt.toLocaleDateString("zh-CN", { weekday: "short", timeZone: "UTC" });

    if (items.length > 0) {
      flushEmptyRun();
      entries.push({
        type: "day",
        date,
        dayNum,
        weekday,
        items,
      });
    } else {
      emptyRun.push({
        date,
        dayNum,
        weekday,
      });
    }
  }

  flushEmptyRun();
  return entries;
}

function parseYMD(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function formatToYMD(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatChineseDate(date: Date): string {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function subDays(date: Date, days: number): Date {
  const res = new Date(date);
  res.setDate(res.getDate() - days);
  return res;
}

export function HistoryPage({ data }: { data: PublicState }) {
  const [service, setService] = useState("all");
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [expandedRanges, setExpandedRanges] = useState<Set<string>>(() => new Set());

  const toggleRange = (key: string) => {
    setExpandedRanges((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const today = useMemo(() => parseYMD(beijingDate(data.generatedAt)), [data.generatedAt]);

  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    const t = parseYMD(beijingDate(data.generatedAt));
    return {
      from: subDays(t, 89),
      to: t,
    };
  });

  const published = useMemo(() => data.incidents.filter((item) => item.published), [data.incidents]);
  const dateOf = (item: Incident) => beijingDate(item.publishedAt ?? item.updatedAt);
  const earliest = useMemo(() => published.map(dateOf).sort()[0], [published]);

  const { start, end, label } = useMemo(() => {
    if (dateRange?.from && dateRange?.to) {
      const from = dateRange.from <= dateRange.to ? dateRange.from : dateRange.to;
      const to = dateRange.from <= dateRange.to ? dateRange.to : dateRange.from;
      const s = formatToYMD(from);
      const e = formatToYMD(to);
      return {
        start: s,
        end: e,
        label: s === e ? formatChineseDate(from) : `${formatChineseDate(from)} - ${formatChineseDate(to)}`,
      };
    }
    if (dateRange?.from) {
      const s = formatToYMD(dateRange.from);
      return {
        start: s,
        end: s,
        label: formatChineseDate(dateRange.from),
      };
    }
    return {
      start: earliest ?? "1970-01-01",
      end: "2099-12-31",
      label: "全部时间",
    };
  }, [dateRange, earliest]);

  const visibleIncidents = useMemo(() => {
    return published.filter((item) => {
      const d = dateOf(item);
      const inRange = d >= start && d <= end;
      const inService = service === "all" || (service === "global" ? !item.serviceId : item.serviceId === service);
      return inRange && inService;
    });
  }, [published, start, end, service]);

  const incidentsByDate = useMemo(() => {
    const map = new Map<string, Incident[]>();
    for (const item of visibleIncidents) {
      const d = dateOf(item);
      if (!map.has(d)) {
        map.set(d, []);
      }
      map.get(d)!.push(item);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (b.publishedAt ?? b.updatedAt).localeCompare(a.publishedAt ?? a.updatedAt));
    }
    return map;
  }, [visibleIncidents]);

  const months = useMemo(() => {
    const todayStr = formatToYMD(today);
    const effectiveEnd = end > todayStr ? todayStr : end;
    let effectiveStart = start;
    if (!dateRange || (!dateRange.from && !dateRange.to)) {
      const fallbackStart = formatToYMD(subDays(today, 29));
      effectiveStart = earliest ? (earliest < fallbackStart ? earliest : fallbackStart) : fallbackStart;
    }
    if (effectiveStart > effectiveEnd) {
      effectiveStart = effectiveEnd;
    }

    const res = new Map<string, Map<string, Incident[]>>();
    let curr = parseYMD(effectiveEnd);
    const minDate = parseYMD(effectiveStart);

    let count = 0;
    while (curr >= minDate && count < 366) {
      count++;
      const dStr = formatToYMD(curr);
      const mStr = dStr.slice(0, 7);
      if (!res.has(mStr)) {
        res.set(mStr, new Map());
      }
      const monthDays = res.get(mStr)!;
      monthDays.set(dStr, incidentsByDate.get(dStr) ?? []);

      curr = new Date(curr.getFullYear(), curr.getMonth(), curr.getDate() - 1);
    }

    return res;
  }, [end, today, start, dateRange, earliest, incidentsByDate]);

  const isPresetDays = (days: number) => {
    if (!dateRange?.from || !dateRange?.to) return false;
    return (
      formatToYMD(dateRange.to) === formatToYMD(today) &&
      formatToYMD(dateRange.from) === formatToYMD(subDays(today, days - 1))
    );
  };

  const isPresetThisMonth = () => {
    if (!dateRange?.from || !dateRange?.to) return false;
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    return (
      formatToYMD(dateRange.to) === formatToYMD(today) &&
      formatToYMD(dateRange.from) === formatToYMD(firstDay)
    );
  };

  const isAllTime = !dateRange || (!dateRange.from && !dateRange.to);

  const setPreset = (days: number) => {
    setDateRange({
      from: subDays(today, days - 1),
      to: today,
    });
  };

  const setMonthPreset = () => {
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    setDateRange({
      from: firstDay,
      to: today,
    });
  };

  const handleSelect = (nextRange: DateRange | undefined, selectedDay: Date) => {
    if (dateRange?.from && dateRange?.to) {
      setDateRange({ from: selectedDay, to: undefined });
    } else {
      setDateRange(nextRange);
    }
  };

  return (
    <div className="status-shell">
        <main>
          <div className="archive-toolbar">
            <div className="archive-period">
              <h1>历史记录</h1>
              <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                <PopoverTrigger
                  render={
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5 px-3 text-xs sm:text-sm font-normal border-border bg-background hover:bg-muted cursor-pointer"
                    />
                  }
                >
                  <CalendarIcon className="size-3.5 text-muted-foreground" />
                  <span className="truncate max-w-[220px] sm:max-w-none">{label}</span>
                  <ChevronDown className="size-3 text-muted-foreground opacity-60 ml-0.5" />
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  side="bottom"
                  sideOffset={6}
                  className="w-[340px] p-0 border border-border shadow-2xl rounded-xl bg-popover overflow-hidden text-popover-foreground"
                >
                  {/* 快捷范围预设 */}
                  <div className="flex items-center justify-between gap-1 px-3 py-2 border-b border-border/70 bg-muted/30">
                    <Button
                      type="button"
                      variant={isPresetDays(7) ? "secondary" : "ghost"}
                      size="xs"
                      className="text-xs font-normal"
                      onClick={() => setPreset(7)}
                    >
                      最近 7 天
                    </Button>
                    <Button
                      type="button"
                      variant={isPresetDays(30) ? "secondary" : "ghost"}
                      size="xs"
                      className="text-xs font-normal"
                      onClick={() => setPreset(30)}
                    >
                      最近 30 天
                    </Button>
                    <Button
                      type="button"
                      variant={isPresetDays(90) ? "secondary" : "ghost"}
                      size="xs"
                      className="text-xs font-normal"
                      onClick={() => setPreset(90)}
                    >
                      最近 90 天
                    </Button>
                    <Button
                      type="button"
                      variant={isPresetThisMonth() ? "secondary" : "ghost"}
                      size="xs"
                      className="text-xs font-normal"
                      onClick={setMonthPreset}
                    >
                      本月
                    </Button>
                    <Button
                      type="button"
                      variant={isAllTime ? "secondary" : "ghost"}
                      size="xs"
                      className="text-xs font-normal"
                      onClick={() => setDateRange(undefined)}
                    >
                      全部
                    </Button>
                  </div>

                  {/* 日历 */}
                  <div className="p-2.5 flex justify-center">
                    <Calendar
                      mode="range"
                      selected={dateRange}
                      onSelect={handleSelect}
                      locale={zhCN}
                      numberOfMonths={1}
                    />
                  </div>

                  {/* 底部信息与操作 */}
                  <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-t border-border/70 bg-muted/20 text-xs text-muted-foreground">
                    <span className="truncate" title={label}>{label}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={() => setDateRange(undefined)}
                      >
                        重置
                      </Button>
                      <Button
                        type="button"
                        variant="default"
                        size="xs"
                        onClick={() => setPopoverOpen(false)}
                      >
                        确定
                      </Button>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <div className="w-[180px]">
              <Select aria-label="筛选服务" value={service} onValueChange={(val) => setService(val ?? "all")}>
                <SelectTrigger className="w-full h-8 text-xs sm:text-sm">
                  <SelectValue placeholder="全部服务" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部服务</SelectItem>
                  <SelectItem value="global">全站公告</SelectItem>
                  {data.services.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {months.size ? (
            [...months].map(([month, days]) => {
              const entries = groupMonthDays(days);
              return (
                <section className="archive-month" key={month}>
                  <h2>
                    {new Date(`${month}-01T12:00:00Z`).toLocaleDateString("zh-CN", {
                      year: "numeric",
                      month: "long",
                      timeZone: "UTC",
                    })}
                  </h2>
                  {entries.map((entry) => {
                    if (entry.type === "range") {
                      const isExpanded = expandedRanges.has(entry.key);
                      return (
                        <div className="archive-day archive-day-range" key={entry.key}>
                          <div className="archive-date">
                            <strong>
                              {entry.startDayNum} - {entry.endDayNum}
                            </strong>
                            <span>{entry.daysCount}天</span>
                          </div>
                          <div className="archive-events">
                            <div
                              role="button"
                              tabIndex={0}
                              onClick={() => toggleRange(entry.key)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  toggleRange(entry.key);
                                }
                              }}
                              className="archive-event archive-operational archive-collapsed-trigger cursor-pointer select-none group/range hover:bg-muted/40 transition-colors rounded-sm"
                              aria-expanded={isExpanded}
                              aria-label={`${entry.startDayNum}至${entry.endDayNum}日共${entry.daysCount}天无事态，点击${isExpanded ? "收起" : "展开"}`}
                            >
                              <div className="archive-event-heading">
                                <span className="archive-operational-text font-normal text-muted-foreground group-hover/range:text-foreground transition-colors">
                                  无事态
                                </span>
                                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground group-hover/range:text-foreground transition-colors">
                                  <span>{isExpanded ? "收起" : "展开"}</span>
                                  <ChevronDown
                                    className={cn(
                                      "size-3.5 transition-transform duration-200",
                                      isExpanded && "rotate-180"
                                    )}
                                  />
                                </span>
                              </div>
                            </div>
                            {isExpanded && (
                              <div className="archive-expanded-list">
                                {entry.days.map((day) => (
                                  <div key={day.date} className="archive-expanded-item">
                                    <div className="archive-expanded-date">
                                      <strong>{day.dayNum}</strong>
                                      <span>{day.weekday}</span>
                                    </div>
                                    <span className="archive-expanded-status">无事态</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div className="archive-day" key={entry.date}>
                        <div className="archive-date">
                          <strong>{entry.dayNum}</strong>
                          <span>{entry.weekday}</span>
                        </div>
                        <div className="archive-events">
                          {entry.items.length > 0 ? (
                            entry.items.map((item) => {
                              const eventColor = resolveIncidentColor(item);
                              return (
                                <Link
                                  key={item.id}
                                  href={`/incidents/${item.id}`}
                                  className={`archive-event archive-${eventColor}`}
                                >
                                  <div className="archive-event-heading">
                                    <h3>{item.title}</h3>
                                    <div className="archive-event-time">
                                      {item.resolved ? (
                                        <span title="已恢复" className="inline-flex items-center">
                                          <CheckCircle2
                                            className="archive-resolved-icon"
                                            aria-hidden="true"
                                          />
                                        </span>
                                      ) : (
                                        <span className="archive-resolved-spacer" aria-hidden="true" />
                                      )}
                                      <time dateTime={item.publishedAt ?? item.updatedAt}>
                                        {new Date(item.publishedAt ?? item.updatedAt).toLocaleTimeString(
                                          "zh-CN",
                                          {
                                            hour: "2-digit",
                                            minute: "2-digit",
                                            hour12: false,
                                            timeZone: "Asia/Shanghai",
                                          }
                                        )}
                                      </time>
                                    </div>
                                  </div>
                                </Link>
                              );
                            })
                          ) : (
                            <div className="archive-event archive-operational">
                              <div className="archive-event-heading">
                                <span className="archive-operational-text">无事态</span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </section>
              );
            })
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FileText />
                </EmptyMedia>
                <EmptyTitle>此时段暂无事件</EmptyTitle>
                <EmptyDescription>所选时段和服务下没有已发布的公告或事件。</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </main>
      </div>
  );
}
