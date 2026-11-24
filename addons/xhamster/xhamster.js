// @name        xHamster
// @id          org.plexo.js.xhamster
// @version     2.0.0
// @author      Plexo add-ons
// @domains     xhamster.desi, xhamster.com, xhamster2.com, xhamster3.com, xhamster19.com, xhamster43.desi, xhopen.com, xhaccess.com, xhamster.one, xhcdn.com, xhpingcdn.com, xhmstr.com
// @category    18+
// @description 18+ only. Browse, search and stream xHamster through xhamster.desi, with automatic mirror fallback
//
// What it gives Plexo
//   home(page)          trending videos
//   search(q, page)     search results
//   browse(url, page)   a channel, creator or pornstar page (the "channel")
//   getStream(url)      every quality (best first) plus an Auto HLS entry, with the Referer the CDN needs
//   getInfo(url)        channel and cast of the video that was just opened
//   related(url)        videos the site recommends under the video (ready for a future Plexo version)
//   comments(url)       not offered: Plexo can't show add-on comments yet, so always []
//
// Fallbacks
//   1. Mirrors: xhamster.desi first (works in India), then the other mirrors in order.
//      The first mirror that answers with a real page is remembered for the rest of the session.
//   2. Video links: the player settings in the page, then any plain mp4/m3u8 link in the page,
//      then the HLS preload link.
//   3. Scrambled links: xHamster sometimes scrambles its video links; they are unscrambled here.
//      If that fails, the plain links from step 2 are used.
//   4. Lists: the page's data, then a plain scan of the page's video links.
//
// Written from how the site is known to work; not tested against the live site.
// If it stops working after a site change, only this file needs fixing.

var MIRRORS = [
  "https://xhamster.desi",
  "https://xhamster43.desi",
  "https://xhamster.com",
  "https://xhamster2.com",
  "https://xhamster3.com",
  "https://xhamster19.com",
  "https://xhopen.com",
  "https://xhaccess.com",
  "https://xhamster.one"
];
var __goodMirror = "";
var __videoPages = {};

// ---------- Fetching with mirror fallback ----------

function looksBlocked(html) {
  var s = String(html || "");
  if (s.length < 500) return true;
  var head = s.slice(0, 8000);
  if (/cf-chl|challenge-platform|verify you are human|Just a moment/i.test(head)) return true;
  if (/not available in your (country|region)|blocked by (your )?(isp|government)|court order|DoT|Department of Telecommunications/i.test(head)) return true;
  return false;
}

function pathOf(u) {
  var s = String(u || "");
  if (s.indexOf("http") === 0) return s.replace(/^https?:\/\/[^\/]+/, "") || "/";
  return s.charAt(0) === "/" ? s : "/" + s;
}

function hostOf(u) {
  var m = String(u || "").match(/^(https?:\/\/[^\/]+)/);
  return m ? m[1] : "";
}

function fetchAny(u) {
  var path = pathOf(u);
  var order = [];
  if (__goodMirror) order.push(__goodMirror);
  var h = hostOf(u);
  if (h && MIRRORS.indexOf(h) !== -1 && order.indexOf(h) === -1) order.push(h);
  for (var i = 0; i < MIRRORS.length; i++) if (order.indexOf(MIRRORS[i]) === -1) order.push(MIRRORS[i]);

  var errors = [];
  for (var j = 0; j < order.length; j++) {
    var target = order[j] + path;
    try {
      var html = getPage(target, { "Referer": order[j] + "/", "Cookie": "parental-control=yes; video_titles_translation=0" });
      if (looksBlocked(html)) throw new Error("blocked");
      __goodMirror = order[j];
      return { base: order[j], url: target, html: html };
    } catch (e) {
      errors.push(order[j].replace("https://", "") + ": " + (e && e.message ? e.message : "error"));
      if (__goodMirror === order[j]) __goodMirror = "";
    }
  }
  throw new Error("xHamster couldn't be reached on any mirror (" + errors.slice(0, 3).join("; ") + ")");
}

// ---------- Page data ----------

function initialsOf(html) {
  return jsonAfter(html, /window\.initials\s*=\s*/) ||
         jsonAfter(html, /window\.__INITIAL_STATE__\s*=\s*/) || null;
}

// Walks every object in the page data once and calls visit(obj, key) on each.
function walk(root, visit, maxNodes) {
  var stack = [root];
  var n = 0;
  var limit = maxNodes || 40000;
  while (stack.length && n < limit) {
    var cur = stack.pop();
    n++;
    if (!cur || typeof cur !== "object") continue;
    if (Array.isArray(cur)) {
      for (var i = cur.length - 1; i >= 0; i--) if (cur[i] && typeof cur[i] === "object") stack.push(cur[i]);
      continue;
    }
    if (visit(cur) === false) continue;
    var keys = Object.keys(cur);
    for (var k = keys.length - 1; k >= 0; k--) {
      var v = cur[keys[k]];
      if (v && typeof v === "object") stack.push(v);
    }
  }
}

function str(v) { return v == null ? "" : String(v); }

function isVideoUrl(u) { return /\/videos\/[^\/?#]+-\d+|\/videos\/[^\/?#]*\d[^\/?#]*$/i.test(str(u)) || /\/videos\/[a-z0-9-]{6,}/i.test(str(u)); }

function cardFrom(o, base) {
  var url = str(o.pageURL || o.pageUrl || o.url || o.link);
  var title = str(o.title || o.name);
  if (!url || !title || !isVideoUrl(url)) return null;
  if (o.isAd || o.isPromo || /\/(ads?|promo)\//i.test(url)) return null;
  url = absUrl(base, url);
  var thumb = str(o.thumbURL || o.thumbUrl || o.imageURL || o.imageUrl || o.thumb || o.poster);
  var land = o.landing || o.author || o.channel || o.uploader || null;
  var creator = "", creatorUrl = "";
  if (land && typeof land === "object") {
    creator = str(land.name || land.title);
    creatorUrl = str(land.link || land.pageURL || land.url);
  }
  var preview = str(o.trailerURL || o.trailerUrl || o.trailerFallbackUrl || o.previewURL || "");
  if (preview && !/\.(mp4|webm)/i.test(preview)) preview = "";
  return {
    id: str(o.id || o.videoId || url),
    url: url,
    title: decodeHtml(title).trim(),
    thumb: thumb ? absUrl(base, thumb) : "",
    duration: toSeconds(o.duration || o.durationSeconds || 0),
    creator: decodeHtml(creator).trim(),
    creatorUrl: creatorUrl ? absUrl(base, creatorUrl) : "",
    preview: preview ? absUrl(base, preview) : ""
  };
}

function cardsFrom(html, base, skipUrl) {
  var out = [];
  var seen = {};
  if (skipUrl) seen[pathOf(skipUrl)] = true;
  var data = initialsOf(html);
  if (data) {
    walk(data, function (o) {
      if (!(o.pageURL || o.pageUrl) || !o.title) return true;
      var c = cardFrom(o, base);
      if (c && !seen[pathOf(c.url)]) {
        seen[pathOf(c.url)] = true;
        out.push(c);
      }
      return false;
    });
  }
  // Fallback: plain scan of the page's video links.
  if (out.length < 4) {
    var plain = anchorList(html, base, /\/videos\/[^"'#?]+/i);
    for (var i = 0; i < plain.length; i++) {
      var p = pathOf(plain[i].url);
      if (seen[p]) continue;
      seen[p] = true;
      out.push(plain[i]);
    }
    attachExtras(out, html, base);
  }
  return out;
}

// ---------- Unscrambling video links ----------

var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function b64decode(s) {
  s = String(s || "").replace(/[^A-Za-z0-9+\/]/g, "");
  var out = "", buf = 0, bits = 0;
  for (var i = 0; i < s.length; i++) {
    buf = (buf << 6) | B64.indexOf(s.charAt(i));
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out += String.fromCharCode((buf >> bits) & 0xff);
    }
  }
  return out;
}

function makeByteGen(algo, seed) {
  var st = seed | 0;
  var algos = {
    1: function () { st = (Math.imul(st, 1664525) + 1013904223) | 0; return st; },
    2: function () { var s = st; s = s ^ (s << 13); s = s ^ (s >>> 17); s = (s ^ (s << 5)) | 0; st = s; return s; },
    3: function () {
      st = (st + 0x9e3779b9) | 0; var s = st;
      s = s ^ (s >>> 16); s = Math.imul(s, 0x85ebca77); s = s ^ (s >>> 13); s = Math.imul(s, 0xc2b2ae3d);
      return s ^ (s >>> 16);
    },
    4: function () {
      st = (st + 0x6d2b79f5) | 0; var s = st;
      s = (s << 7) | (s >>> 25); s = (s + 0x9e3779b9) | 0; s = s ^ (s >>> 11);
      return Math.imul(s, 0x27d4eb2d);
    },
    5: function () { var s = st; s = s ^ (s << 7); s = s ^ (s >>> 9); s = s ^ (s << 8); s = (s + 0xa5a5a5a5) | 0; st = s; return s; },
    6: function () {
      st = (Math.imul(st, 0x2c9277b5) + 0xac564b05) | 0; var s = st;
      var s2 = s ^ (s >>> 18); var shift = (s >>> 27) & 31;
      return s2 >>> shift;
    },
    7: function () {
      st = (st + 0x9e3779b9) | 0; var s = st;
      var e = s ^ (s << 5); e = Math.imul(e, 0x7feb352d); e = e ^ (e >>> 15);
      return Math.imul(e, 0x846ca68b);
    }
  };
  var f = algos[algo];
  if (!f) return null;
  return function () { return f() & 0xff; };
}

function unscramble(u) {
  var s = str(u).trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s) || s.indexOf("//") === 0) return absUrl("https://xhamster.com", s);
  // Hex: [algorithm][4-byte seed][xor-ed bytes]
  if (/^[0-9a-fA-F]+$/.test(s) && s.length > 12 && s.length % 2 === 0) {
    var bytes = [];
    for (var i = 0; i < s.length; i += 2) bytes.push(parseInt(s.substr(i, 2), 16));
    var seed = bytes[1] | (bytes[2] << 8) | (bytes[3] << 16) | (bytes[4] << 24);
    var gen = makeByteGen(bytes[0], seed);
    if (!gen) return "";
    var out = "";
    for (var j = 5; j < bytes.length; j++) out += String.fromCharCode(bytes[j] ^ gen());
    return /^https?:\/\//.test(out) ? out : "";
  }
  // Base64: "xor_..." or "rot13_..."
  var dec = "";
  try { dec = b64decode(s); } catch (e) { return ""; }
  var cut = dec.indexOf("_");
  if (cut < 1) return "";
  var type = dec.slice(0, cut), body = dec.slice(cut + 1);
  var res = "";
  if (type === "xor") {
    var key = "xh7999";
    for (var k = 0; k < body.length; k++) res += String.fromCharCode(body.charCodeAt(k) ^ key.charCodeAt(k % key.length));
  } else if (type === "rot13") {
    res = body.replace(/[a-zA-Z]/g, function (c) {
      var b = c <= "Z" ? 65 : 97;
      return String.fromCharCode((c.charCodeAt(0) - b + 13) % 26 + b);
    });
  }
  return /^https?:\/\//.test(res) ? res : "";
}

// ---------- Streams ----------

function streamsFrom(html, base) {
  var list = [];
  var seen = {};
  function add(label, raw, fallback) {
    var u = unscramble(raw) || unscramble(fallback);
    if (!u || seen[u]) return;
    if (/preview|trailer|\.jpg|\.webp|sprite/i.test(u)) return;
    seen[u] = true;
    list.push({ label: label, url: u, hls: u.indexOf(".m3u8") !== -1 });
  }

  var data = initialsOf(html);
  var sources = null;
  if (data) {
    walk(data, function (o) {
      if (o.sources && typeof o.sources === "object" && (o.sources.hls || o.sources.standard || o.sources.mp4)) {
        sources = o.sources;
        return false;
      }
      return true;
    }, 20000);
  }
  if (sources) {
    // H.264 plays on every phone; AV1 only when nothing else is there.
    var codecs = ["h264", "h265", "av1"];
    var std = sources.standard || sources.mp4 || {};
    for (var c = 0; c < codecs.length; c++) {
      var arr = std[codecs[c]];
      if (!Array.isArray(arr)) continue;
      if (codecs[c] === "av1" && list.length) break;
      for (var i = 0; i < arr.length; i++) {
        var e = arr[i] || {};
        var q = heightOf(e.quality || e.label || "") || heightOf(e.url || "");
        add(q ? q + "p" : str(e.quality || "MP4"), e.url, e.fallback);
      }
    }
    var hls = sources.hls || {};
    for (var c2 = 0; c2 < codecs.length; c2++) {
      var hv = hls[codecs[c2]];
      if (hv && (hv.url || hv.fallback)) { add("Auto", hv.url, hv.fallback); break; }
    }
    if (typeof hls.url === "string") add("Auto", hls.url, hls.fallback);
  }

  // Fallback: plain links written in the page (preload, noscript video, etc.).
  if (!list.length) {
    var found = findMediaUrls(html);
    for (var f = 0; f < found.length; f++) {
      var h = heightOf(found[f]);
      add(found[f].indexOf(".m3u8") !== -1 && !h ? "Auto" : (h ? h + "p" : "MP4"), found[f]);
    }
  }
  return list;
}

function getStream(url) {
  var res = fetchAny(url);
  __videoPages[url] = res;
  __pages[url] = res.html;
  var list = streamsFrom(res.html, res.base);
  if (!list.length) throw new Error("No video links found (removed, private or premium-only)");

  // Best quality first, then Auto (HLS) last. No extra download here, so playback starts at once.
  var direct = list.filter(function (s) { return s.label !== "Auto"; });
  direct.sort(function (a, b) { return heightOf(b.label) - heightOf(a.label); });
  var auto = list.filter(function (s) { return s.label === "Auto"; });
  var headers = { "Referer": res.url, "Origin": res.base };
  var out = [];
  var labels = {};
  for (var i = 0; i < direct.length; i++) {
    if (labels[direct[i].label]) continue;
    labels[direct[i].label] = true;
    out.push({ label: direct[i].label, url: direct[i].url, headers: headers });
  }
  if (auto.length) out.push({ label: "Auto", url: auto[0].url, headers: headers });
  return out;
}

function getInfo(url) {
  var res = __videoPages[url] || fetchAny(url);
  __pages[url] = res.html;
  var info = pageInfo(url);
  var data = initialsOf(res.html);
  if (data) {
    var model = data.videoModel || data.videoEntity || null;
    var author = model && (model.author || model.channel || model.uploader);
    if (author && typeof author === "object" && (author.name || author.title)) {
      info.creator = decodeHtml(str(author.name || author.title));
      var link = str(author.pageURL || author.link || author.url);
      if (link) info.creatorUrl = absUrl(res.base, link);
    }
  }
  return info;
}

// ---------- Lists ----------

function home(page) {
  var p = page && page > 1 ? page : 1;
  var res = fetchAny(p === 1 ? "/" : "/" + p);
  var list = cardsFrom(res.html, res.base);
  if (!list.length) {
    res = fetchAny(p === 1 ? "/newest" : "/newest/" + p);
    list = cardsFrom(res.html, res.base);
  }
  return list;
}

function search(query, page) {
  var q = String(query || "").trim();
  if (!q) return [];
  var p = page && page > 1 ? page : 1;
  var slug = encodeURIComponent(q.replace(/\s+/g, "+")).replace(/%2B/g, "+");
  var res = fetchAny("/search/" + slug + (p > 1 ? "?page=" + p : ""));
  return cardsFrom(res.html, res.base);
}

// Channel / creator / pornstar pages page as /name/2, older ones as ?page=2.
function pageUrl(url, page) {
  var clean = String(url).replace(/[?#].*$/, "").replace(/\/\d+\/?$/, "").replace(/\/$/, "");
  return clean + "/" + page;
}

function browse(url, page) {
  var p = page && page > 1 ? page : 1;
  var res = fetchAny(p === 1 ? url : pageUrl(url, p));
  var list = cardsFrom(res.html, res.base);
  if (!list.length && p > 1) {
    res = fetchAny(String(url).replace(/[?#].*$/, "") + "?page=" + p);
    list = cardsFrom(res.html, res.base);
  }
  return list;
}

function related(url) {
  var res = __videoPages[url] || fetchAny(url);
  return cardsFrom(res.html, res.base, url).slice(0, 40);
}

function comments(url) {
  return [];
}
