export function serviceWebsiteUrl(healthUrl: string): string | undefined {
  try {
    const url = new URL(healthUrl);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return undefined;
    url.pathname = url.pathname.replace(/\/healthz\/?$/, "/");
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
}
