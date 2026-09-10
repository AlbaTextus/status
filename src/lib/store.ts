import { getDatabase } from "./cloudflare";
import { readDatabase, mutateDatabase } from "./d1-store";
import type { D1Database } from "@cloudflare/workers-types";
import type { PublicState, Store } from "./types";
import { startInternalScheduler } from "./scheduler";

export async function readStore(database?: D1Database): Promise<Store> {
  if (typeof process !== "undefined" && process.env.NEXT_RUNTIME === "nodejs") {
    startInternalScheduler(60_000);
  }
  return readDatabase(database ?? await getDatabase());
}

export async function mutateStore<T>(change: (state: Store) => T, database?: D1Database): Promise<T> {
  return mutateDatabase(database ?? await getDatabase(), change);
}

let checking = false;
async function autoRefresh(db: D1Database) {
  if (checking) return;
  checking = true;
  try {
    const { checkServices } = await import("./monitor");
    await checkServices(undefined, db);
  } catch (e) {
    console.error("Auto refresh health check error:", e);
  } finally {
    checking = false;
  }
}

export async function publicState(): Promise<PublicState> {
  const db = await getDatabase();
  const state = await readStore(db);
  const isStale = state.services.some(s => !s.result.checkedAt || Date.now() - Date.parse(s.result.checkedAt) > 45000);
  if (isStale) {
    autoRefresh(db).catch(() => {});
  }
  return {
    services: state.services.map(({ id, name, result, history, timeline, failingSince, lastAutoIncidentAt }) => ({
      id,
      name,
      history: history ?? [],
      timeline: timeline ?? [],
      failingSince: failingSince ?? null,
      lastAutoIncidentAt: lastAutoIncidentAt ?? null,
      result: result.checkedAt && Date.now() - Date.parse(result.checkedAt) > 180000
        ? { ...result, status: "unknown", message: "检测结果已过期，等待重新检测" }
        : result,
    })),
    incidents: state.incidents.filter(incident => incident.published).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    generatedAt: new Date().toISOString(),
    intervalSeconds: 60,
  };
}

