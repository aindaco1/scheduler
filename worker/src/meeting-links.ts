// Stable public links intentionally omit picker state and guest information.
export function meetingUrl(
  origin: string,
  path: string,
  typeId?: string,
): string {
  const url = new URL(path, origin);
  url.search = "";
  url.hash = "";
  if (typeId) url.searchParams.set("type", typeId);
  return url.href;
}
