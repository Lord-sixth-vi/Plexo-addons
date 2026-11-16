// @name SpankBang
// @id org.plexo.js.spankbang
// @version 1.0.0
// @domains spankbang.com, www.spankbang.com, sb-cd.com
// @category Adult
// @description Search and stream from spankbang.com (adults only, 18+)
//
// Written from how the site is known to work, not tested against the live site.
// If it stops working after a site change, only this file needs fixing.

var BASE = "https://spankbang.com";
var HEADERS = {
  "Cookie": "age_verified=1"
};

function listFromRaw(html) {
  var out = anchorList(html, BASE, /^\/[a-z0-9]+\/video\//);
  if (out.length === 0) throw new Error("No results found (or the page layout changed)");
  return out;
}

function enc(q) {
  return encodeURIComponent(q).replace(/%20/g, "+");
}

function home(page) {
  page = page || 1;
  return listFrom(getPage(BASE + "/trending_videos/" + (page > 1 ? page + "/" : ""), HEADERS));
}

function search(query, page) {
  page = page || 1;
  var q = (query || "").trim();
  if (!q) return home(page);
  return listFrom(getPage(BASE + "/s/" + enc(q) + "/" + (page > 1 ? page + "/" : ""), HEADERS));
}

function getStreamRaw(url) {
  var html = getPage(url, HEADERS);
  // Pages carry: var stream_data = {"240p":["https://..mp4"], "720p":[...], "m3u8":[...]}
  var data = jsonAfter(html, /stream_data\s*=\s*/);
  var out = [];
  if (data) {
    var keys = Object.keys(data).filter(function (k) { return /^\d+p$/.test(k) && data[k] && data[k].length; });
    keys.sort(function (a, b) { return parseInt(b, 10) - parseInt(a, 10); });
    keys.forEach(function (k) { out.push({ label: k, url: data[k][0] }); });
    if (data.m3u8 && data.m3u8.length) out.push({ label: "Auto (HLS)", url: data.m3u8[0] });
  }
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
