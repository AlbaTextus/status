import { readFile, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPlatformProxy, unstable_readConfig } from "wrangler";
import { mutateDatabase } from "../src/lib/d1-store.ts";

const project = fileURLToPath(new URL("../", import.meta.url));
const [source, target] = process.argv.slice(2);
if (!source || !["--local", "--remote"].includes(target) || process.argv.length !== 4) {
  throw new Error("用法：npm run db:import -- <status.json 路径> --local|--remote（仅导入空数据库）");
}
const state = JSON.parse(await readFile(path.resolve(source), "utf8"));
if (state.version !== 1 || !Array.isArray(state.services) || !Array.isArray(state.incidents)) {
  throw new Error("不是有效的 version: 1 状态数据");
}
for (const collection of [state.services, state.incidents]) {
  const ids = new Set();
  for (const item of collection) {
    if (!item || typeof item.id !== "string" || !item.id || ids.has(item.id)) throw new Error("数据包含无效或重复 ID");
    if (Buffer.byteLength(JSON.stringify(item)) > 1_800_000) throw new Error("单项记录过大，无法导入 D1");
    ids.add(item.id);
  }
}
const config = unstable_readConfig({ config: path.join(project, "wrangler.jsonc") });
const binding = config.d1_databases.find(database => database.binding === "DB");
if (!binding) throw new Error("Wrangler 配置缺少 DB 绑定");
if (target === "--remote" && (!binding.database_id || binding.database_id.startsWith("00000000-"))) {
  throw new Error("请先在 wrangler.jsonc 填写真实 D1 database_id");
}
const temporaryRoot = path.resolve(project, "../temps/status");
await mkdir(temporaryRoot, { recursive: true });
const temporary = await mkdtemp(path.join(temporaryRoot, "import-"));
const configPath = path.join(temporary, "wrangler.json");
await writeFile(configPath, JSON.stringify({
  name: "status-data-import",
  compatibility_date: config.compatibility_date,
  d1_databases: [{ ...binding, migrations_dir: undefined, remote: target === "--remote" }],
}));
const proxy = await getPlatformProxy({
  configPath,
  persist: { path: path.join(temporaryRoot, "cloudflare-state/v3") },
  remoteBindings: target === "--remote",
});
try {
  await mutateDatabase(proxy.env.DB, current => {
    if (current.services.length || current.incidents.length) throw new Error("目标数据库非空，已停止导入；不会覆盖现有数据");
    current.services = state.services;
    current.incidents = state.incidents;
  });
  console.log(`已导入 ${state.services.length} 个服务、${state.incidents.length} 个事件（${target}）。原 JSON 文件未修改。`);
} finally {
  await proxy.dispose();
}
