// Only presentation shells need this preference. Hashed assets bypass the owner
// entirely; the small SQLite read runs alongside the static asset fetch.
export function isPresentationPath(path: string, slug: string): boolean {
  const english = path.replace(/^\/es(?=\/)/, "").replace(/\/$/, "");
  return ["/" + slug, "/admin", "/manage", "/privacy", "/sitemap.xml"].includes(
    english,
  );
}
export async function localizedAsset(
  request: Request,
  assets: Fetcher,
  enabled: PromiseLike<boolean>,
): Promise<Response> {
  // A shell's ETag cannot validate a different runtime language preference.
  const headers = new Headers(request.headers);
  headers.delete("If-None-Match");
  headers.delete("If-Modified-Since");
  const [asset, spanishEnabled] = await Promise.all([
    assets.fetch(new Request(request, { headers })),
    enabled,
  ]);
  const url = new URL(request.url);
  if (!spanishEnabled && url.pathname.startsWith("/es/")) {
    url.pathname = url.pathname.slice(3);
    // Temporary redirect: re-enabling Spanish restores existing links. Browsers
    // retain booking fragments because Location does not supply a new fragment.
    return new Response(null, {
      status: 302,
      headers: { Location: url.href, "Cache-Control": "private, no-store" },
    });
  }
  let response = new Response(asset.body, asset);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.delete("ETag");
  response.headers.delete("Last-Modified");
  if (
    !spanishEnabled &&
    response.headers.get("Content-Type")?.includes("text/html")
  ) {
    response = new HTMLRewriter()
      .on("#language-link", {
        element(el) {
          el.setAttribute("hidden", "");
        },
      })
      .on('link[rel="alternate"][hreflang="es"]', {
        element(el) {
          el.remove();
        },
      })
      .transform(response);
  } else if (
    !spanishEnabled &&
    url.pathname === "/sitemap.xml" &&
    request.method !== "HEAD"
  ) {
    const xml = (await response.text()).replace(
      /<url>\s*<loc>[^<]+<\/loc>\s*<\/url>/g,
      (entry) => {
        const location = entry.match(/<loc>([^<]+)<\/loc>/)?.[1];
        return location && new URL(location).pathname.startsWith("/es/")
          ? ""
          : entry;
      },
    );
    response.headers.delete("Content-Length");
    response = new Response(xml, response);
  }
  return response;
}
