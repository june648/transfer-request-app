// People often paste links without "https://"; add it so the link opens
export function normalizeLink(link: string): string {
  const t = link.trim();
  if (!t) return "";
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `https://${t}`;
}
