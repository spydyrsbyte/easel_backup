const direct = /^https:\/\/(api\.scryfall\.com|cards\.scryfall\.io)\//;
export const proxied = (url) =>
  !/^https?:\/\//.test(url) || direct.test(url)
    ? url
    : "/api/fetch?url=" + encodeURIComponent(url);
export const fetchText = async (url, accept = "*/*") => {
  const response = await fetch(proxied(url), {
    headers: { Accept: accept },
    credentials: "same-origin",
  });
  const body = await response.text();
  if (!response.ok) {
    let message = "The site answered with an error.";
    try {
      message = JSON.parse(body).error || message;
    } catch {}
    throw new Error(message + " (" + url + ")");
  }
  return body;
};
export const fetchJson = async (url) =>
  JSON.parse(await fetchText(url, "application/json"));
