import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { PublicState, Store } from "./types";

const file = path.resolve(process.env.STATUS_DATA_DIR || path.join(process.cwd(), "data"), "status.json");
const globals = globalThis as typeof globalThis & { statusWriteQueue?: Promise<unknown> };

async function readRaw(): Promise<Store> {
  try {
    const state = JSON.parse(await readFile(file, "utf8")) as Store;
    if (state.version !== 1 || !Array.isArray(state.services) || !Array.isArray(state.incidents)) throw new Error("状态数据格式无效");
    return state;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, services: [], incidents: [] };
    throw error;
  }
}

export async function readStore(): Promise<Store> {
  await globals.statusWriteQueue;
  return readRaw();
}

export function mutateStore<T>(change: (state: Store) => T): Promise<T> {
  const operation = (globals.statusWriteQueue ?? Promise.resolve()).then(async () => {
    const state = await readRaw();
    const result = change(state);
    await mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(state, null, 2), { encoding: "utf8", mode: 0o600 });
    await rename(temporary, file);
    return result;
  });
  globals.statusWriteQueue = operation.catch(() => undefined);
  return operation;
}

export async function publicState(): Promise<PublicState> {
  const state = await readStore();
  return {
    services: state.services.map(({ id, name, result, history, timeline }) => ({ id, name, history: history ?? [], timeline: timeline ?? [], result: result.checkedAt && Date.now() - Date.parse(result.checkedAt) > 90000 ? { ...result, status: "unknown", message: "检测结果已过期，等待重新检测" } : result })),
    incidents: state.incidents.filter(incident => incident.published).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    generatedAt: new Date().toISOString(), intervalSeconds: 30,
  };
}
