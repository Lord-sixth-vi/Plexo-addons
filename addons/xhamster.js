// @name xHamster
// @id org.plexo.js.xhamster
// @version 1.0.0
// @domains xhamster.com, xhamster2.com, xhamster3.com, xhamster.desi, xhamster.one, xhcdn.com
// @category 18+
// @description Search and stream from xhamster.com (adults only, 18+)
//
// Written from how the site is known to work. If it stops working after a site
// change, only this file needs fixing.

var BASE = "https://xhamster.com";

// xHamster puts all page data in one big JSON object called window.initials.
function readInitials(html) {
  var m = html.match(/window\.initials\s*=\s*([\s\S]+?);?\s*<\/script>/);
  if (!m) return null;
  try {
    return JSON.parse(m[1].replace(/;\s*$/, ""));
  } catch (e) {
    return null;
  }
}

// Walk the whole JSON and collect every object that looks like a video card.
function collectCards(node, out, seen, depth) {
  if (!node || typeof node !== "object" || depth > 12) return;
  if (Array.isArray(node)) {
    for (var i = 0; i < node.length; i++) collectCards(node[i], out, seen, depth + 1);
    return;
  }
  if (typeof node.pageURL === "string" && typeof node.title === "string" &&
      node.pageURL.indexOf("/videos/") !== -1) {
    var url = absUrl(BASE, node.pageURL);
    if (!seen[url]) {
      seen[url] = true;
      out.push({
        id: String(node.id || url),
        title: decodeHtml(node.title),
        thumb: absUrl(BASE, node.thumbURL || node.imageURL || node.previewThumbURL || ""),
        duration: toSeconds(node.duration || 0),
        creator: (node.landing && node.landing.name) || "",
        url: url
      });
    }
    return;
  }
  for (var k in node) {
    if (Object.prototype.hasOwnProperty.call(node, k)) collectCards(node[k], out, seen, depth + 1);
  }
}

// Backup way: plain links to /videos/ pages
function cardsFromLinks(html) {
  var out = [];
  var seen = {};
  var re = /<a\b[^>]*href="([^"]*\/videos\/[^"#]+)"[^>]*>/g;
  var m;
  while ((m = re.exec(html)) !== null) {
    var url = absUrl(BASE, m[1]);
    if (seen[url]) continue;
    var chunk = html.slice(m.index, m.index + 2500);
    var title = attr(m[0], "title") || attr((chunk.match(/<img\b[^>]*>/) || [""])[0], "alt");
    if (!title) continue;
    seen[url] = true;
    var dm = chunk.match(/>\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*</);
    out.push({
      id: url,
      title: title,
      thumb: findThumb(chunk, BASE),
      duration: dm ? toSeconds(dm[1]) : 0,
      url: url
    });
  }
  return out;
}

function listFromRaw(html) {
  var out = [];
  var init = readInitials(html);
  if (init) collectCards(init, out, {}, 0);
  if (out.length === 0) out = cardsFromLinks(html);
  if (out.length === 0) throw new Error("No results found (or the page layout changed)");
  return out;
}

function enc(q) {
  return encodeURIComponent(q).replace(/%20/g, "+");
}

function home(page) {
  page = page || 1;
  return listFrom(getPage(BASE + "/" + (page > 1 ? page : "")));
}

function search(query, page) {
  page = page || 1;
  var q = (query || "").trim();
  if (!q) return home(page);
  return listFrom(getPage(BASE + "/search/" + enc(q) + (page > 1 ? "?page=" + page : "")));
}

function getStreamRaw(url) {
  var html = getPage(url);
  var out = [];
  var seen = {};
  function add(label, u) {
    u = absUrl(BASE, u);
    if (u.indexOf("http") === 0 && !seen[u]) {
      seen[u] = true;
      out.push({ label: label, url: u });
    }
  }

  var init = readInitials(html);
  var sources = init && init.xplayerSettings && init.xplayerSettings.sources;
  if (sources) {
    // Direct MP4 links, grouped by codec
    var std = sources.standard || {};
    var mp4 = [];
    for (var codec in std) {
      if (codec !== "h264" || !(Array.isArray(std[codec]))) continue;
      std[codec].forEach(function (f) {
        if (f && f.url) mp4.push({ q: heightOf(f.quality || f.label), url: f.url });
      });
    }
    mp4.sort(function (a, b) { return b.q - a.q; });
    mp4.forEach(function (f) { add(f.q ? f.q + "p" : "MP4", f.url); });

    // Adaptive stream
    var hls = sources.hls;
    if (hls) {
      var h = hls.h264 || hls.av1 || hls;
      var hu = (h && h.url) || "";
      if (hu) add("Auto (HLS)", hu);
    }
  }

  // Last resort: any media link written in the page
  if (out.length === 0) {
    findMediaUrls(html).forEach(function (u) {
      add(u.indexOf(".m3u8") !== -1 ? "Auto (HLS)" : "MP4", u);
    });
  }
  if (out.length === 0) throw new Error("No video links found (removed, premium-only, or blocked)");
  return out;
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
