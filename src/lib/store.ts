import { getDatabase } from "./cloudflare";
import { readDatabase, mutateDatabase } from "./d1-store";
import type { D1Database } from "@cloudflare/workers-types";
import type { PublicState, Store } from "./types";

export async function readStore(database?: D1Database): Promise<Store> {
  return readDatabase(database ?? await getDatabase());
}

export async function mutateStore<T>(change: (state: Store) => T, database?: D1Database): Promise<T> {
  return mutateDatabase(database ?? await getDatabase(), change);
}

export async function publicState(): Promise<PublicState> {
  const state = await readStore();
  return {
    services: state.services.map(({ id, name, result, history, timeline }) => ({ id, name, history: history ?? [], timeline: timeline ?? [], result: result.checkedAt && Date.now() - Date.parse(result.checkedAt) > 180000 ? { ...result, status: "unknown", message: "检测结果已过期，等待重新检测" } : result })),
    incidents: state.incidents.filter(incident => incident.published).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    generatedAt: new Date().toISOString(), intervalSeconds: 60,
  };
}
