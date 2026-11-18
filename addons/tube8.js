// @name Tube8
// @id org.plexo.js.tube8
// @version 1.0.0
// @domains tube8.com, www.tube8.com, t8cdn.com
// @category 18+
// @description Search and stream from tube8.com (adults only, 18+)
//
// Written from how the site is known to work, not tested against the live site.
// If it stops working after a site change, only this file needs fixing.

var BASE = "https://www.tube8.com";
var HEADERS = {
  "Cookie": "age_verified=1; platform=pc"
};

function listFromRaw(html) {
  var out = anchorList(html, BASE, /\/porn-video\/\d+|\/[a-z0-9-]+\/[a-z0-9-]+\/\d{5,}\/?$/);
  if (out.length === 0) throw new Error("No results found (or the page layout changed)");
  return out;
}

function enc(q) {
  return encodeURIComponent(q).replace(/%20/g, "+");
}

function home(page) {
  page = page || 1;
  return listFrom(getPage(BASE + "/newest" + (page > 1 ? "/page/" + page + "/" : ".html"), HEADERS));
}

function search(query, page) {
  page = page || 1;
  var q = (query || "").trim();
  if (!q) return home(page);
  return listFrom(getPage(BASE + "/searches.html?q=" + enc(q) + (page > 1 ? "&page=" + page : ""), HEADERS));
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
