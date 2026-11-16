// @name RedTube
// @id org.plexo.js.redtube
// @version 1.0.0
// @domains redtube.com, www.redtube.com, rdtcdn.com, redtubefiles.com
// @category Adult
// @description Search and stream from redtube.com (adults only, 18+)
//
// Written from how the site is known to work, not tested against the live site.
// If it stops working after a site change, only this file needs fixing.

var BASE = "https://www.redtube.com";
var HEADERS = {
  "Cookie": "age_verified=1; platform=pc"
};

function listFromRaw(html) {
  var out = anchorList(html, BASE, /^\/\d{4,}(?:[\/?#]|$)/);
  if (out.length === 0) throw new Error("No results found (or the page layout changed)");
  return out;
}

function enc(q) {
  return encodeURIComponent(q).replace(/%20/g, "+");
}

function home(page) {
  page = page || 1;
  return listFrom(getPage(BASE + "/hot" + (page > 1 ? "?page=" + page : ""), HEADERS));
}

function search(query, page) {
  page = page || 1;
  var q = (query || "").trim();
  if (!q) return home(page);
  return listFrom(getPage(BASE + "/?search=" + enc(q) + (page > 1 ? "&page=" + page : ""), HEADERS));
}

function getStreamRaw(url) {
  var html = getPage(url, HEADERS);
  var out = mediaDefinitionStreams(html, BASE, HEADERS);
  return out.length ? out : anyStreams(html);
}

function getStream(url) {
  return finalizeStreams(getStreamRaw(url));
}

function listFrom(html) {
  return attachExtras(listFromRaw(html), html, BASE);
}

function browse(url, page) {
  return listFrom(getPage(withPage(url, page), HEADERS));
}
