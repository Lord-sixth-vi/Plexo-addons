// @name XVideos
// @id org.plexo.js.xvideos
// @version 1.0.0
// @domains xvideos.com, www.xvideos.com, xvideos-cdn.com
// @category Adult
// @description Search and stream from xvideos.com (adults only, 18+)
//
// Written from how the site is known to work. If it stops working after a site
// change, only this file needs fixing.

var BASE = "https://www.xvideos.com";

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
  return listFrom(getPage(BASE + "/" + (page > 1 ? "new/" + (page - 1) : "")));
}

function search(query, page) {
  page = page || 1;
  var q = (query || "").trim();
  if (!q) return home(page);
  return listFrom(getPage(BASE + "/?k=" + enc(q) + (page > 1 ? "&p=" + (page - 1) : "")));
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
