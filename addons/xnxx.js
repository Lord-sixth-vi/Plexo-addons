// @name XNXX
// @id org.plexo.js.xnxx
// @version 1.0.0
// @domains xnxx.com, www.xnxx.com, xnxx-cdn.com
// @category Adult
// @description Search and stream from xnxx.com (adults only, 18+)
//
// Written from how the site is known to work. If it stops working after a site
// change, only this file needs fixing.

var BASE = "https://www.xnxx.com";

function listFromRaw(html) {
  var out = tubeList(html, BASE);
  if (out.length === 0) throw new Error("No results found (or the page layout changed)");
  return out;
}

function enc(q) {
  return encodeURIComponent(q).replace(/%20/g, "+");
}

function home(page) {
  page = page || 1;
  return listFrom(getPage(BASE + "/" + (page > 1 ? "todays-selection/" + page : "")));
}

function search(query, page) {
  page = page || 1;
  var q = (query || "").trim();
  if (!q) return home(page);
  return listFrom(getPage(BASE + "/search/" + enc(q) + (page > 1 ? "/" + (page - 1) : "")));
}

function getStreamRaw(url) {
  return tubeStreams(getPage(url));
}

function getStream(url) {
  return finalizeStreams(getStreamRaw(url));
}

function listFrom(html) {
  return attachExtras(listFromRaw(html), html, BASE);
}

function browse(url, page) {
  return listFrom(getPage(withPage(url, page)));
}
