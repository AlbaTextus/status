import type { D1Database, D1PreparedStatement } from "@cloudflare/workers-types";
import type { Store } from "./types";

type RecordRow = { kind: "service" | "incident"; id: string; data: string };
type RevisionRow = { revision: number };

async function snapshot(db: D1Database) {
  // D1 batch gives the revision and records a consistent transactional snapshot.
  const [metadata, records] = await db.batch([
    db.prepare("SELECT revision FROM status_meta WHERE id = 1"),
    db.prepare("SELECT kind, id, data FROM status_records ORDER BY kind, position, id"),
  ]);
  const revision = (metadata.results[0] as RevisionRow | undefined)?.revision;
  if (revision === undefined) throw new Error("D1 尚未初始化，请运行 db:migrate:local 或 db:migrate:remote");
  const state: Store = { version: 1, services: [], incidents: [] };
  for (const row of records.results as RecordRow[]) {
    if (row.kind === "service") state.services.push(JSON.parse(row.data));
    else state.incidents.push(JSON.parse(row.data));
  }
  return { state, revision };
}

export async function readDatabase(db: D1Database): Promise<Store> {
  return (await snapshot(db)).state;
}

function rows(state: Store) {
  return [
    ...state.services.map((value, position) => ({ kind: "service", id: value.id, data: JSON.stringify(value), position })),
    ...state.incidents.map((value, position) => ({ kind: "incident", id: value.id, data: JSON.stringify(value), position })),
  ];
}

// A synchronous callback may be replayed on conflict; no external side effects inside it.
export async function mutateDatabase<T>(db: D1Database, change: (state: Store) => T): Promise<T> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const { state, revision } = await snapshot(db);
    const previous = new Map(rows(state).map(row => [`${row.kind}:${row.id}`, row]));
    const result = change(state);
    const next = rows(state);
    const statements: D1PreparedStatement[] = [];
    for (const row of next) {
      const key = `${row.kind}:${row.id}`;
      const old = previous.get(key);
      previous.delete(key);
      if (old?.data === row.data && old.position === row.position) continue;
      statements.push(db.prepare(`INSERT INTO status_records (kind, id, data, position)
        SELECT ?, ?, ?, ? WHERE (SELECT revision FROM status_meta WHERE id = 1) = ?
        ON CONFLICT(kind, id) DO UPDATE SET data = excluded.data, position = excluded.position`)
        .bind(row.kind, row.id, row.data, row.position, revision));
    }
    for (const row of previous.values()) {
      statements.push(db.prepare(`DELETE FROM status_records WHERE kind = ? AND id = ?
        AND (SELECT revision FROM status_meta WHERE id = 1) = ?`).bind(row.kind, row.id, revision));
    }
    // All writes, including the final CAS, are guarded by the same revision.
    // D1's atomic batch either applies against this snapshot or makes no changes.
    statements.push(db.prepare("UPDATE status_meta SET revision = revision + 1 WHERE id = 1 AND revision = ?").bind(revision));
    const committed = await db.batch(statements);
    if (committed[committed.length - 1].meta.changes === 1) return result;
    await new Promise(resolve => setTimeout(resolve, 10 + Math.random() * 30 * (attempt + 1)));
  }
  throw new Error("数据库正在处理其他写入，请重试");
}
