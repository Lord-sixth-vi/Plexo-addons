// @name OK.XXX
// @id org.plexo.js.okxxx
// @version 1.0.0
// @domains ok.xxx
// @category 18+
// @description Search and stream from ok.xxx: models, channels, up to 4K where offered (adults only, 18+)
//
// Written from how the site is known to work (same engine as pornhat.com, ok.porn and
// perfectgirls.xxx). If it stops working after a site change, only this file needs fixing.

var BASE = "https://ok.xxx";
var HDR = { Referer: BASE + "/" };

// ---------------------------------------------------------------- lists

function cardsFrom(html) {
  var out = [];
  var seen = {};
  var parts = html.split(/<div class="thumb(?: thumb-video)?\s*">|class="item\s{2}"|<div class="item thumb[^"]*">/);
  for (var i = 1; i < parts.length; i++) {
    var chunk = parts[i].slice(0, 3000);
    var a = chunk.match(/<a\b[^>]*href="([^"]+)"[^>]*>/);
    if (!a) continue;
    var href = attr(a[0], "href");
    if (!href || /\/(?:channels?|models?|pornstars?|categories|tags?|search)\//.test(href)) continue;
    var url = absUrl(BASE, href);
    if (seen[url]) continue;
    var img = (chunk.match(/<img\b[^>]*>/) || [""])[0];
    var title = attr(a[0], "title") || attr(img, "alt") || attr(img, "title");
    if (!title) {
      var t = chunk.match(/class="[^"]*(?:title|name)[^"]*"[^>]*>\s*(?:<a[^>]*>)?\s*([^<]{3,})</);
      title = t ? decodeHtml(t[1]).trim() : "";
    }
    if (!title) continue;
    var thumb = absUrl(BASE, attr(img, "data-original") || attr(img, "data-src") || attr(img, "src"));
    if (!thumb || thumb.indexOf("data:") === 0) thumb = findThumb(chunk, BASE);
    var dm = chunk.match(/(?:duration_item|duration|time)[^>]*>\s*(?:<[^>]+>\s*)*([\d:]{4,8}|\d+\s*min)/i) ||
             chunk.match(/fa-clock-o"><\/i>\s*<span>([^<]+)/);
    var creator = creatorIn(chunk, BASE);
    seen[url] = true;
    out.push({
      id: url,
      url: url,
      title: title,
      thumb: thumb,
      duration: dm ? toSeconds(dm[1]) : 0,
      creator: creator.name || undefined,
      creatorUrl: creator.url || undefined,
      preview: previewIn(chunk, BASE) || undefined
    });
  }
  // Fallback if the result blocks are built differently: any link that looks like a video page.
  if (out.length === 0) out = anchorList(html, BASE, /\/(?:videos?|v)\/[^\/?#]+/);
  return out;
}

function listFrom(html) {
  return attachExtras(cardsFrom(html), html, BASE);
}

// Page N of any listing on this site: /something/N/
function pageUrl(url, page) {
  var u = url.split("#")[0];
  var q = "";
  var qi = u.indexOf("?");
  if (qi !== -1) { q = u.slice(qi); u = u.slice(0, qi); }
  if (u.charAt(u.length - 1) !== "/") u += "/";
  return u + page + "/" + q;
}

// Opens page N, trying the usual address first and then the site's own "Next" link pattern.
function pagedList(url, page) {
  if (!page || page <= 1) {
    var first = listFrom(getPage(url, HDR));
    if (first.length === 0) throw new Error("No videos found (or the page layout changed)");
    return first;
  }
  try {
    var direct = listFrom(getPage(pageUrl(url, page), HDR));
    if (direct.length) return direct;
  } catch (e) {}
  var html = getPage(url, HDR);
  var path = url.replace(/^https?:\/\/[^\/]+/, "").split("?")[0];
  var re = /href="([^"]*?)\b2\b([^"]*)"[^>]*>\s*(?:2|Next|&raquo;|»)/gi;
  var m = null;
  var cand;
  while ((cand = re.exec(html)) !== null) {
    var link = cand[1].replace(/^https?:\/\/[^\/]+/, "");
    // Only a link to page 2 of this same listing, not of some other list on the page.
    if (link.indexOf(path) === 0 || (path === "/" && /^\/?$/.test(link)) || link.charAt(0) === "?") { m = cand; break; }
  }
  if (!m) return [];
  try {
    var next = m[1] + page + m[2];
    next = next.charAt(0) === "?" ? url.split("?")[0] + next : absUrl(BASE, next);
    return listFrom(getPage(next, HDR));
  } catch (e) {
    return [];
  }
}

function slugOf(q) {
  return q.trim().split(/\s+/).map(function (w) { return encodeURIComponent(w); }).join("-");
}

function home(page) {
  return pagedList(BASE + "/", page || 1);
}

function search(query, page) {
  var q = (query || "").trim();
  if (!q) return home(page);
  return pagedList(BASE + "/search/" + slugOf(q) + "/", page || 1);
}

function browse(url, page) {
  return pagedList(url, page || 1);
}

// ---------------------------------------------------------------- streams

function heightFromLabel(label, url) {
  var l = String(label || "").toLowerCase();
  if (l.indexOf("4k") !== -1 || l.indexOf("2160") !== -1) return 2160;
  if (l.indexOf("2k") !== -1 || l.indexOf("1440") !== -1) return 1440;
  var m = l.match(/(\d{3,4})/);
  if (m) return parseInt(m[1], 10);
  return heightOf(url);
}

// KVS players hide the file link as function/0/<url>; this undoes it with the page's license code.
function kvsLicenseToken(code) {
  code = String(code).replace(/\$/g, "");
  var values = code.split("").map(function (c) { return parseInt(c, 10); });
  var mod = code.replace(/0/g, "1");
  var center = Math.floor(mod.length / 2);
  var front = parseInt(mod.slice(0, center + 1), 10);
  var back = parseInt(mod.slice(center), 10);
  mod = String(4 * Math.abs(front - back)).slice(0, center + 1);
  var out = [];
  for (var i = 0; i < mod.length; i++) {
    for (var o = 0; o < 4; o++) out.push((values[i + o] + parseInt(mod.charAt(i), 10)) % 10);
  }
  return out;
}

function kvsRealUrl(videoUrl, license) {
  if (videoUrl.indexOf("function/0/") !== 0) return videoUrl;
  var u = videoUrl.slice("function/0/".length);
  var m = u.match(/^(https?:\/\/[^\/]+)(\/[^?#]*)(.*)$/);
  if (!m || !license) return u;
  var parts = m[2].split("/");
  if (!parts[3] || parts[3].length < 32) return u;
  var token = kvsLicenseToken(license);
  var hash = parts[3].slice(0, 32);
  var idx = [];
  for (var i = 0; i < 32; i++) idx.push(i);
  var acc = 0;
  for (var src = 31; src >= 0; src--) {
    acc += token[src];
    var dest = (src + acc) % 32;
    var tmp = idx[src]; idx[src] = idx[dest]; idx[dest] = tmp;
  }
  parts[3] = idx.map(function (k) { return hash.charAt(k); }).join("") + parts[3].slice(32);
  return m[1] + parts.join("/") + m[3];
}

function kvsStreams(html, pageUrl) {
  var fv = html.match(/var\s+flashvars\s*=\s*\{([\s\S]*?)\};/);
  if (!fv) return [];
  var body = fv[1];
  function val(key) {
    var r = body.match(new RegExp("\\b" + key + "\\s*:\\s*'([^']*)'")) ||
            body.match(new RegExp("\\b" + key + "\\s*:\\s*\"([^\"]*)\""));
    return r ? r[1] : "";
  }
  var license = val("license_code");
  var out = [];
  var keys = ["video_url", "video_alt_url", "video_alt_url2", "video_alt_url3", "video_alt_url4", "video_alt_url5"];
  for (var i = 0; i < keys.length; i++) {
    var raw = val(keys[i]);
    if (!raw || raw.indexOf("/get_file/") === -1) continue;
    var real = absUrl(pageUrl, kvsRealUrl(raw, license));
    var label = val(keys[i] + "_text");
    var h = heightFromLabel(label, real);
    out.push({ label: h ? h + "p" : (label || "MP4"), url: real });
  }
  return out;
}

function sourceTagStreams(html, pageUrl) {
  var out = [];
  var re = /<source\b[^>]*>/gi;
  var m;
  while ((m = re.exec(html)) !== null) {
    var src = attr(m[0], "src");
    if (!src) continue;
    var label = attr(m[0], "label") || attr(m[0], "title") || attr(m[0], "size") || attr(m[0], "res") || attr(m[0], "data-res");
    if (String(label).toLowerCase() === "auto") continue;
    var url = absUrl(pageUrl, src);
    var h = heightFromLabel(label, url);
    out.push({ label: h ? h + "p" : (label || "MP4"), url: url });
  }
  return out;
}

function getStreamRaw(url) {
  var html = getPage(url, HDR);
  var list = sourceTagStreams(html, url);
  if (list.length === 0) list = kvsStreams(html, url);
  if (list.length === 0) list = anyStreams(html);
  return list;
}

function getStream(url) {
  var list = finalizeStreams(getStreamRaw(url));
  for (var i = 0; i < list.length; i++) list[i].headers = { Referer: url };
  return list;
}
