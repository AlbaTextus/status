import {
  Activity, BookOpen, Boxes, Braces, Cloud, Database, FileText, FolderOpen,
  Globe2, HardDrive, Images, LayoutTemplate, Mail, MemoryStick, MessageSquare,
  Monitor, Navigation, Palette, Server, ShieldCheck, Timer, UserRound,
  WalletCards, type LucideIcon,
} from "lucide-react";

export type Position = [number, number];
export type NetworkNode = {
  id: string;
  name: string;
  icon: LucideIcon;
  graphic?: "files";
  serviceId?: string;
  tone: "muted" | "core" | "apps" | "data" | "docs";
  desktop: Position;
  mobile: Position;
};
export type NetworkEdge = { from: string; to: string; kind: "access" | "service" | "ui" | "component" };
type Part = { id: string; name: string; icon: LucideIcon; graphic?: "files"; layer: 1 | 2; from: string[] };

export const serviceNodes: NetworkNode[] = [
  { id: "user", name: "用户", icon: UserRound, tone: "muted", desktop: [80, 240], mobile: [65, 45] },
  { id: "oauth", name: "OAuth", icon: ShieldCheck, tone: "core", desktop: [340, 240], mobile: [275, 45] },
  { id: "forum", name: "Forum", icon: MessageSquare, tone: "apps", desktop: [660, 80], mobile: [65, 215] },
  { id: "credit", name: "Credit", icon: WalletCards, tone: "apps", desktop: [900, 80], mobile: [275, 215] },
  { id: "imgbed", name: "ImgBed", icon: Images, tone: "data", desktop: [660, 240], mobile: [65, 385] },
  { id: "athub", name: "ATHub", icon: Boxes, tone: "data", desktop: [900, 240], mobile: [275, 385] },
  { id: "wiki", name: "Wiki", icon: BookOpen, tone: "docs", desktop: [660, 400], mobile: [65, 555] },
  { id: "status", name: "Status", icon: Activity, tone: "docs", desktop: [900, 400], mobile: [275, 555] },
  { id: "ui", name: "UI", icon: Globe2, tone: "muted", desktop: [340, 540], mobile: [180, 725] },
];

const services = serviceNodes.filter(node => !["user", "ui"].includes(node.id));
export const serviceEdges: NetworkEdge[] = [
  { from: "user", to: "oauth", kind: "access" },
  ...services.filter(node => node.id !== "oauth").map(node => ({ from: "oauth", to: node.id, kind: "service" as const })),
  ...services.map(node => ({ from: "ui", to: node.id, kind: "ui" as const })),
];

// Architecture from the services' README and deployment/storage guides.
// Components and supported dependencies, not live health checks.
const serviceParts: Record<string, Part[]> = {
  oauth: [
    { id: "web", name: "Next.js", icon: Monitor, layer: 1, from: ["root"] },
    { id: "api", name: "Go API", icon: Server, layer: 1, from: ["root", "web"] },
    { id: "database", name: "PostgreSQL", icon: Database, layer: 2, from: ["api"] },
    { id: "cache", name: "Redis · 可选", icon: MemoryStick, layer: 2, from: ["api"] },
    { id: "mail", name: "SMTP · 可选", icon: Mail, layer: 2, from: ["api"] },
  ],
  forum: [
    { id: "web", name: "Next.js", icon: Monitor, layer: 1, from: ["root"] },
    { id: "api", name: "Go API", icon: Server, layer: 1, from: ["root", "web"] },
    { id: "database", name: "PostgreSQL", icon: Database, layer: 2, from: ["api"] },
    { id: "uploads", name: "ImgBed · 可选", icon: Images, layer: 2, from: ["api"] },
  ],
  credit: [
    { id: "web", name: "Next.js", icon: Monitor, layer: 1, from: ["root"] },
    { id: "api", name: "Go API", icon: Server, layer: 1, from: ["root", "web"] },
    { id: "database", name: "PostgreSQL", icon: Database, layer: 2, from: ["api"] },
  ],
  imgbed: [
    { id: "web", name: "React", icon: Monitor, layer: 1, from: ["root"] },
    { id: "api", name: "Node.js API", icon: Server, layer: 1, from: ["root", "web"] },
    { id: "database", name: "SQLite", icon: Database, layer: 2, from: ["api"] },
    { id: "files", name: "本地文件", icon: HardDrive, graphic: "files", layer: 2, from: ["api"] },
    { id: "storage", name: "S3 / R2", icon: Cloud, layer: 2, from: ["api"] },
  ],
  athub: [
    { id: "web", name: "Next.js", icon: Monitor, layer: 1, from: ["root"] },
    { id: "api", name: "Go API", icon: Server, layer: 1, from: ["root", "web"] },
    { id: "s3", name: "S3", icon: Cloud, layer: 2, from: ["api"] },
    { id: "r2", name: "R2", icon: Cloud, layer: 2, from: ["api"] },
    { id: "b2", name: "B2", icon: Cloud, layer: 2, from: ["api"] },
    { id: "config", name: "加密配置", icon: FolderOpen, graphic: "files", layer: 2, from: ["api"] },
  ],
  wiki: [
    { id: "web", name: "Next.js", icon: Monitor, layer: 1, from: ["root"] },
    { id: "docs", name: "Nextra", icon: BookOpen, layer: 1, from: ["root", "web"] },
    { id: "content", name: "MDX", icon: FileText, graphic: "files", layer: 2, from: ["docs"] },
    { id: "public", name: "OAuth 公开数据", icon: ShieldCheck, layer: 2, from: ["web"] },
  ],
  status: [
    { id: "web", name: "Next.js / OpenNext", icon: Monitor, layer: 1, from: ["root"] },
    { id: "worker", name: "Workers", icon: Server, layer: 1, from: ["root", "web"] },
    { id: "cron", name: "Cron", icon: Timer, layer: 1, from: ["worker"] },
    { id: "database", name: "D1", icon: Database, layer: 2, from: ["worker", "cron"] },
    { id: "monitor", name: "健康检测", icon: Activity, layer: 2, from: ["cron"] },
  ],
  ui: [
    { id: "components", name: "React 组件", icon: Braces, layer: 1, from: ["root"] },
    { id: "styles", name: "共享样式", icon: Palette, layer: 1, from: ["root"] },
    { id: "navigation", name: "导航", icon: Navigation, layer: 2, from: ["components"] },
    { id: "footer", name: "页脚", icon: LayoutTemplate, layer: 2, from: ["components"] },
    { id: "theme", name: "主题", icon: Palette, layer: 2, from: ["styles"] },
    { id: "diagram", name: "架构图", icon: Boxes, layer: 2, from: ["styles"] },
  ],
};

export function serviceGraph() {
  const anchors: Record<string, Position> = {
    oauth: [400, 110], ui: [1648, 110],
    forum: [400, 580], credit: [1024, 580], imgbed: [1648, 580],
    athub: [400, 1080], wiki: [1024, 1080], status: [1648, 1080],
  };
  const nodes: NetworkNode[] = [];
  const edges = [...serviceEdges];
  let mobileTop = 180;
  for (const root of serviceNodes) {
    if (root.id === "user") {
      nodes.push({ ...root, desktop: [994, 80], mobile: [180, 30] });
      continue;
    }
    const parts = serviceParts[root.id];
    const [cx, cy] = anchors[root.id];
    nodes.push({ ...root, serviceId: root.id, desktop: [cx - 30, cy - 30], mobile: [180, mobileTop] });
    let mobileRows = 0;
    for (const layer of [1, 2] as const) {
      const row = parts.filter(part => part.layer === layer);
      row.forEach((part, index) => {
        const columns = Math.min(2, row.length - Math.floor(index / 2) * 2);
        const offset = part.graphic === "files" ? 24 : 0;
        nodes.push({
          id: `${root.id}-${part.id}`, serviceId: root.id, name: `${root.name} · ${part.name}`, icon: part.icon, graphic: part.graphic,
          tone: part.id === "database" ? "core" : part.graphic === "files" ? "apps" : layer === 2 ? "data" : "muted",
          desktop: [cx - 30 + (index - (row.length - 1) / 2) * 136 - offset, cy - 30 + layer * 140 - offset],
          mobile: [180 + ((index % 2) - (columns - 1) / 2) * 210 - offset, mobileTop + 150 + (mobileRows + Math.floor(index / 2)) * 140 - offset],
        });
      });
      mobileRows += Math.ceil(row.length / 2);
    }
    edges.push(...parts.flatMap(part => part.from.map(from => ({
      from: from === "root" ? root.id : `${root.id}-${from}`,
      to: `${root.id}-${part.id}`, kind: "component" as const,
    }))));
    mobileTop += mobileRows * 140 + 220;
  }
  return { nodes, edges, desktop: { width: 2048, height: 1536 }, mobile: { width: 420, height: mobileTop } };
}
