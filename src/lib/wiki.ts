/** Public address of the standalone ALBATEXTUS Wiki. Inlined at build time; rebuild after changing it. */
const wikiOrigin = (process.env.NEXT_PUBLIC_WIKI_URL || "http://localhost:3200").replace(/\/+$/, "")

export function wikiUrl(path = "/") {
  return wikiOrigin + (path.startsWith("/") ? path : `/${path}`)
}
