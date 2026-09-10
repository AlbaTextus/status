import type { HealthDay, HealthResult, HealthSlice, HealthStatus } from "./types";

const DAY = 86_400_000;
export function beijingDate(value: string | number): string {
  return new Date(new Date(value).getTime() + 8 * 3_600_000).toISOString().slice(0, 10);
}
export function shiftDate(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
}
export function recordHealth(history: HealthDay[], result: HealthResult): HealthDay[] {
  if (!result.checkedAt || result.status === "unknown") return history;
  const date = beijingDate(result.checkedAt);
  const retained = history.filter(day => day.date >= shiftDate(date, -729));
  let day = retained.find(item => item.date === date);
  if (!day) {
    day = { date, operational: 0, maintenance: 0, error: 0 };
    retained.push(day);
  }
  day[result.status] += 1;
  return retained.sort((a, b) => a.date.localeCompare(b.date));
}
const SLICE_MS = 16 * 60_000;
export function timelineKey(value: string | number): string {
  return new Date(Math.floor(new Date(value).getTime() / SLICE_MS) * SLICE_MS).toISOString();
}
export function shiftTimelineSlot(slot: string, slices: number): string {
  return new Date(Date.parse(slot) + slices * SLICE_MS).toISOString();
}
export function recordTimelineHealth(history: HealthSlice[], result: HealthResult): HealthSlice[] {
  if (!result.checkedAt || result.status === "unknown") return history;
  const slot = timelineKey(result.checkedAt);
  const retained = history.filter(item => item.slot >= shiftTimelineSlot(slot, -179));
  let bucket = retained.find(item => item.slot === slot);
  if (!bucket) {
    bucket = { slot, operational: 0, maintenance: 0, error: 0 };
    retained.push(bucket);
  }
  bucket[result.status] += 1;
  return retained.sort((a, b) => a.slot.localeCompare(b.slot));
}
export function dayStatus(day?: HealthDay): HealthStatus {
  return !day ? "unknown" : day.error ? "error" : day.maintenance ? "maintenance" : day.operational ? "operational" : "unknown";
}
export function timelineStatus(slice?: HealthSlice): HealthStatus {
  return !slice ? "unknown" : slice.error ? "error" : slice.maintenance ? "maintenance" : slice.operational ? "operational" : "unknown";
}
export function availability(buckets: Array<HealthDay | HealthSlice>): string | null {
  const normal = buckets.reduce((sum, bucket) => sum + bucket.operational, 0);
  const total = buckets.reduce((sum, bucket) => sum + bucket.operational + bucket.maintenance + bucket.error, 0);
  return total ? `${Number((normal / total * 100).toFixed(2))}%` : null;
}
