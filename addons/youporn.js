// @name YouPorn
// @id org.plexo.js.youporn
// @version 1.0.0
// @domains youporn.com, www.youporn.com, ypncdn.com, youporngay.com
// @category Adult
// @description Search and stream from youporn.com (adults only, 18+)
//
// Written from how the site is known to work, not tested against the live site.
// If it stops working after a site change, only this file needs fixing.

var BASE = "https://www.youporn.com";
var HEADERS = {
  "Cookie": "age_verified=1; platform=pc"
};

function listFromRaw(html) {
  var out = anchorList(html, BASE, /^\/watch\/\d+/);
  if (out.length === 0) throw new Error("No results found (or the page layout changed)");
  return out;
}

function enc(q) {
  return encodeURIComponent(q).replace(/%20/g, "+");
}

function home(page) {
  page = page || 1;
  return listFrom(getPage(BASE + "/browse/time/" + (page > 1 ? "?page=" + page : ""), HEADERS));
}

function search(query, page) {
  page = page || 1;
  var q = (query || "").trim();
  if (!q) return home(page);
  return listFrom(getPage(BASE + "/search/?query=" + enc(q) + (page > 1 ? "&page=" + page : ""), HEADERS));
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
