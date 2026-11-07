function withOriginMetadata(response, origin) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) return response;

  return response.text().then((html) => {
    const headers = new Headers(response.headers);
    headers.delete("content-length");
    return new Response(html.replaceAll("__SITE_ORIGIN__", origin), {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    let response = await env.ASSETS.fetch(request);

    if (response.status === 404 && !url.pathname.includes(".")) {
      // /docs のようなディレクトリは、その index.html を先に探す。
      const directoryIndex = `${url.pathname.replace(/\/+$/, "")}/index.html`;
      response = await env.ASSETS.fetch(
        new Request(new URL(directoryIndex, url), request),
      );

      // ページ内の相対パスは末尾の "/" を前提にしているため、
      // 実体があるディレクトリは /docs/ へ寄せる。
      if (response.ok && !url.pathname.endsWith("/")) {
        return Response.redirect(`${url.origin}${url.pathname}/${url.search}`, 301);
      }
    }

    if (response.status === 404 && !url.pathname.includes(".")) {
      response = await env.ASSETS.fetch(
        new Request(new URL("/index.html", url), request),
      );
    }

    return withOriginMetadata(response, url.origin);
  },
};
