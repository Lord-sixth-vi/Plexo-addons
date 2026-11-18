// @name Eporner
// @id org.plexo.js.eporner
// @version 1.0.0
// @domains eporner.com, www.eporner.com
// @category 18+
// @description Search and stream from eporner.com (adults only, 18+)
//
// Written from how the site is known to work, not tested against the live site.
// If it stops working after a site change, only this file needs fixing.

var BASE = "https://www.eporner.com";
var HEADERS = {
  "Cookie": "age_verified=1"
};

function listFromRaw(html) {
  var out = anchorList(html, BASE, /^\/video-[A-Za-z0-9]+\//);
  if (out.length === 0) throw new Error("No results found (or the page layout changed)");
  return out;
}

function enc(q) {
  return encodeURIComponent(q).replace(/%20/g, "+");
}

function home(page) {
  page = page || 1;
  return listFrom(getPage(BASE + "/" + (page > 1 ? page + "/" : ""), HEADERS));
}

function search(query, page) {
  page = page || 1;
  var q = (query || "").trim();
  if (!q) return home(page);
  return listFrom(getPage(BASE + "/search/" + enc(q) + "/" + (page > 1 ? page + "/" : ""), HEADERS));
}

function getStreamRaw(url) {
  var html = getPage(url, HEADERS);
  return anyStreams(html);
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
