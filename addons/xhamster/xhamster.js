// @name        xHamster
// @id          org.plexo.js.xhamster
// @version     2.4.0
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
//   channel(url)        name, picture, banner, subscribers, video count and about text of a channel
//   shorts(page, q)     short clips for Plexo's Shorts tab (pick the add-on in Settings → Shorts → Shorts from)
//   related(url)        videos the site recommends under the video (ready for a future Plexo version)
//   search("debug")     test mode: shows what the add-on reads from the site instead of videos
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
  var creatorAvatar = "";
  if (land && typeof land === "object") {
    creator = str(land.name || land.title);
    creatorUrl = str(land.link || land.pageURL || land.url);
    var lg = land.logo || land.avatar || land.avatarURL || land.avatarUrl || land.thumbURL || land.image || "";
    if (lg && typeof lg === "object") lg = lg.url || lg.src || "";
    creatorAvatar = str(lg);
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
    creatorAvatar: /^https?:|^\/\//.test(creatorAvatar) ? absUrl(base, creatorAvatar) : "",
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
    // H.264 plays on every phone. AV1 (often where 4K lives) is added too, marked "(AV1)",
    // only for qualities H.264 doesn't have.
    var std = sources.standard || sources.mp4 || {};
    var got = {};
    var codecs = ["h264", "h265", "av1"];
    for (var c = 0; c < codecs.length; c++) {
      var arr = std[codecs[c]];
      if (!Array.isArray(arr)) continue;
      var tag = codecs[c] === "av1" ? " (AV1)" : "";
      for (var i = 0; i < arr.length; i++) {
        var e = arr[i] || {};
        var q = heightOf(e.quality || e.label || "") || heightOf(e.url || "");
        if (q && tag && got[q]) continue;
        if (q) got[q] = true;
        var ql = str(e.quality || e.label || "");
        if (!q && /^(auto|adaptive|hls)$/i.test(ql)) add("Auto" + tag, e.url, e.fallback);
        else add(q ? q + "p" + tag : (ql || "MP4") + tag, e.url, e.fallback);
      }
    }
    var hls = sources.hls || {};
    if (hls.h264 && (hls.h264.url || hls.h264.fallback)) add("Auto", hls.h264.url, hls.h264.fallback);
    else if (hls.h265 && (hls.h265.url || hls.h265.fallback)) add("Auto", hls.h265.url, hls.h265.fallback);
    if (typeof hls.url === "string") add("Auto", hls.url, hls.fallback);
    if (hls.av1 && (hls.av1.url || hls.av1.fallback)) add("Auto (AV1)", hls.av1.url, hls.av1.fallback);
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

  var headers = { "Referer": res.url, "Origin": res.base };
  for (var n = 0; n < list.length; n++) if (/^auto\b/i.test(list[n].label)) list[n].label = list[n].label.replace(/^auto/i, "Auto");
  var auto = list.filter(function (s) { return s.label === "Auto" || s.label === "Auto (AV1)"; });

  // Every quality inside the HLS playlists, so 1440p and 4K show up when the video has them.
  // One small playlist download; if it fails, the qualities found above are still used.
  var have = {};
  for (var a = 0; a < list.length; a++) if (list[a].label.indexOf("Auto") !== 0) have[list[a].label] = true;
  for (var m = 0; m < auto.length; m++) {
    var vars = [];
    try { vars = hlsVariants(auto[m].url, headers); } catch (e) { vars = []; }
    var av1 = auto[m].label.indexOf("AV1") !== -1;
    for (var v = 0; v < vars.length; v++) {
      if (!vars[v].h) continue;
      var lbl = vars[v].h + "p" + (av1 ? " (AV1)" : "");
      if (have[lbl] || (av1 && have[vars[v].h + "p"])) continue;
      have[lbl] = true;
      list.push({ label: lbl, url: vars[v].url, hls: true });
    }
  }

  // Best quality first, then Auto (HLS) last. At the same height, H.264 comes before AV1.
  var direct = list.filter(function (s) { return s.label.indexOf("Auto") !== 0; });
  direct.sort(function (a, b) {
    return heightOf(b.label) - heightOf(a.label) || (a.label.indexOf("AV1") !== -1 ? 1 : 0) - (b.label.indexOf("AV1") !== -1 ? 1 : 0);
  });
  auto = auto.filter(function (s) { return s.label === "Auto"; }).concat(auto.filter(function (s) { return s.label !== "Auto"; }));
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
  if (/^debug\b/i.test(q)) return p > 1 ? [] : debugReport(q.replace(/^debug\s*:?\s*/i, ""));
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
  // Videos on a channel page belong to that channel, even when the page doesn't say so on each card.
  var ch = channelFrom(res.html, res.base, url);
  for (var i = 0; i < list.length; i++) {
    if (!list[i].creator && ch.name) {
      list[i].creator = ch.name;
      list[i].creatorUrl = ch.url;
    }
    if (ch.avatar && list[i].creator === ch.name) list[i].creatorAvatar = ch.avatar;
  }
  return list;
}

// ---------- Channel header ----------

function num(v) {
  if (typeof v === "number") return v;
  var s = str(v).replace(/,/g, "").trim();
  var m = s.match(/^([\d.]+)\s*([kKmMbB])?/);
  if (!m) return 0;
  var n = parseFloat(m[1]);
  var mul = { k: 1e3, m: 1e6, b: 1e9 }[(m[2] || "").toLowerCase()] || 1;
  return Math.round(n * mul);
}

function metaOf(html, prop) {
  var re = new RegExp('<meta[^>]+(?:property|name)="' + prop + '"[^>]*>', "i");
  var tag = (html.match(re) || [""])[0];
  return attr(tag, "content");
}

// Name, picture, banner, subscriber and video counts, and description of a channel / creator / pornstar page.
function channelFrom(html, base, url) {
  var out = { name: "", url: absUrl(base, pathOf(url)), avatar: "", banner: "", subscribers: 0, videos: 0, description: "" };
  var slug = pathOf(url).split("/").filter(function (x) { return x && !/^\d+$/.test(x); });
  var slugName = slug.length > 1 ? decodeURIComponent(slug[1]) : "";
  var data = initialsOf(html);
  if (data) {
    var best = null, bestScore = 0;
    walk(data, function (o) {
      if (o.pageURL && o.title && isVideoUrl(o.pageURL)) return false; // a video card, not the channel
      var name = str(o.displayName || o.name || o.title);
      if (!name || name.length > 80) return true;
      var score = 0;
      if (o.avatarURL || o.avatarUrl || o.avatar || o.logo || o.thumbURL) score += 2;
      if (o.subscribersCount != null || o.subscriberCount != null || o.subscribers != null || o.followersCount != null) score += 3;
      if (o.videoCount != null || o.videosCount != null || o.videos != null) score += 1;
      if (o.coverURL || o.coverUrl || o.bannerURL || o.banner || o.cover) score += 2;
      if (o.about || o.description || o.bio) score += 1;
      if (slugName && name.toLowerCase().replace(/[\s_]+/g, "-") === slugName.toLowerCase().replace(/[\s_]+/g, "-")) score += 4;
      if (score > bestScore) { bestScore = score; best = o; }
      return true;
    }, 30000);
    if (best && bestScore >= 3) {
      out.name = decodeHtml(str(best.displayName || best.name || best.title)).trim();
      var av = str(best.avatarURL || best.avatarUrl || (typeof best.avatar === "string" ? best.avatar : best.avatar && best.avatar.url) || best.logo || best.thumbURL);
      if (av) out.avatar = absUrl(base, av);
      var bn = str(best.coverURL || best.coverUrl || best.bannerURL || (typeof best.banner === "string" ? best.banner : "") || (typeof best.cover === "string" ? best.cover : best.cover && best.cover.url));
      if (bn) out.banner = absUrl(base, bn);
      out.subscribers = num(best.subscribersCount != null ? best.subscribersCount : (best.subscriberCount != null ? best.subscriberCount : (best.followersCount != null ? best.followersCount : best.subscribers)));
      out.videos = num(best.videoCount != null ? best.videoCount : (best.videosCount != null ? best.videosCount : (typeof best.videos === "number" ? best.videos : 0)));
      out.description = textOf(str(best.about || best.description || best.bio)).slice(0, 2000);
    }
  }
  // Fallbacks: the page's own title, picture and description tags.
  if (!out.name) {
    var t = metaOf(html, "og:title") || ((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || "");
    out.name = textOf(t).replace(/\s*[|:\-–]\s*xHamster.*$/i, "").replace(/['’]s\s+(?:Videos|Profile|Channel).*$/i, "").replace(/\s+(?:Porn\s+)?Videos?.*$/i, "").trim() || slugName.replace(/[-_]+/g, " ");
  }
  if (!out.avatar) {
    var img = metaOf(html, "og:image");
    if (img && !/\/(?:videos?|thumbs?)\//i.test(img)) out.avatar = absUrl(base, img);
  }
  if (!out.description) out.description = textOf(metaOf(html, "og:description") || metaOf(html, "description")).slice(0, 2000);
  if (!out.subscribers) {
    var sm = textOf(html.slice(0, 200000)).match(/([\d.,]+\s*[KkMm]?)\s+(?:subscribers|followers)/);
    if (sm) out.subscribers = num(sm[1]);
  }
  return out;
}

// Used by Plexo for the top of the channel page.
function channel(url) {
  var res = fetchAny(url);
  return channelFrom(res.html, res.base, url);
}

function related(url) {
  var res = __videoPages[url] || fetchAny(url);
  return cardsFrom(res.html, res.base, url).slice(0, 40);
}

function comments(url) {
  return [];
}

// ---------- Test mode ----------
// Search "debug" (tests the first home video and its channel) or "debug: <video or channel link>".
// Each result card is one finding, so a screenshot shows exactly what the site sends.

function debugReport(target) {
  var lines = [];
  function line(t) { lines.push(String(t).replace(/\s+/g, " ").slice(0, 150)); }
  function short(v) {
    if (v == null) return "null";
    if (typeof v === "string") return '"' + (v.length > 70 ? v.slice(0, 70) + "…" : v) + '"';
    if (Array.isArray(v)) return "[" + v.length + " items]";
    if (typeof v === "object") return "{" + Object.keys(v).slice(0, 8).join(",") + "}";
    return String(v);
  }
  function keyHits(data, re, max) {
    var hits = [];
    (function w(o, path, depth) {
      if (!o || typeof o !== "object" || depth > 10 || hits.length >= max) return;
      var ks = Object.keys(o);
      for (var i = 0; i < ks.length && hits.length < max; i++) {
        var v = o[ks[i]];
        var pth = path + "." + ks[i];
        if (re.test(ks[i])) hits.push(pth.replace(/^\./, "") + " = " + short(v));
        if (v && typeof v === "object") w(v, pth, depth + 1);
      }
    })(data, "", 0);
    return hits;
  }
  function pageReport(url, kind) {
    var res;
    try { res = fetchAny(url); } catch (e) { line(kind + ": could not load: " + e.message); return null; }
    line(kind + ": " + res.url + " (" + res.html.length + " chars)");
    var data = initialsOf(res.html);
    line(kind + " page data: " + (data ? "found, keys: " + Object.keys(data).slice(0, 20).join(", ") : "NOT FOUND"));
    if (!data) {
      var scripts = res.html.match(/window\.[A-Za-z_$]+\s*=/g) || [];
      line("page scripts set: " + (scripts.slice(0, 12).join(" ") || "none"));
      line("og:image = " + (metaOf(res.html, "og:image") || "none"));
    }
    return { res: res, data: data };
  }

  var videoUrl = "", channelUrl = "";
  if (!target) {
    var h = [];
    try { h = home(1); } catch (e) { line("home failed: " + e.message); }
    line("home: " + h.length + " videos, mirror " + (__goodMirror || "none"));
    if (h.length) {
      videoUrl = h[0].url;
      for (var i = 0; i < h.length; i++) if (h[i].creatorUrl) { channelUrl = h[i].creatorUrl; break; }
    }
  } else if (isVideoUrl(target)) videoUrl = target;
  else channelUrl = target;

  if (videoUrl) {
    var vp = pageReport(videoUrl, "VIDEO");
    if (vp) {
      __videoPages[videoUrl] = vp.res;
      var st = [];
      try { st = getStream(videoUrl); } catch (e) { line("getStream failed: " + e.message); }
      line("qualities found: " + (st.map(function (x) { return x.label; }).join(", ") || "none"));
      if (vp.data) {
        var srcHits = keyHits(vp.data, /^(sources|hls|standard|mp4|h264|h265|av1|quality|url|fallback)$/i, 25);
        for (var a = 0; a < srcHits.length; a++) if (/sources/i.test(srcHits[a])) line(srcHits[a]);
      }
      var media = findMediaUrls(vp.res.html);
      line("plain video links in page: " + media.length + (media.length ? " e.g. " + media[0].slice(0, 90) : ""));
      try { var inf = getInfo(videoUrl); line("getInfo: creator=" + inf.creator + " url=" + inf.creatorUrl); if (!channelUrl) channelUrl = inf.creatorUrl; } catch (e) { line("getInfo failed: " + e.message); }
    }
  }

  if (channelUrl) {
    var cpg = pageReport(channelUrl, "CHANNEL");
    if (cpg) {
      var ch = channelFrom(cpg.res.html, cpg.res.base, channelUrl);
      line("channel(): name=" + ch.name + " subs=" + ch.subscribers + " videos=" + ch.videos);
      line("channel(): avatar=" + (ch.avatar || "NONE"));
      line("channel(): banner=" + (ch.banner || "NONE"));
      if (cpg.data) {
        var chHits = keyHits(cpg.data, /avatar|subscri|follower|cover|banner|displayName|videoCount|about|image|photo|logo|thumb/i, 30);
        for (var c = 0; c < chHits.length; c++) line(chHits[c]);
      }
      line("og:image = " + (metaOf(cpg.res.html, "og:image") || "none"));
    }
  }

  var out = [];
  for (var n = 0; n < lines.length; n++) {
    out.push({ id: "debug" + n, url: "https://xhamster.desi/#debug-" + n, title: (n + 1) + ". " + lines[n], thumb: "", duration: 0, creator: "Test mode" });
  }
  return out;
}

// ---------- Shorts tab ----------
// Short clips for Plexo's Shorts tab: the site's own short-video page when it has one,
// otherwise the shortest videos from the normal lists.

function shortOnly(list) {
  var s = list.filter(function (v) { return v.duration > 0 && v.duration <= 600; });
  return s.length ? s : list;
}

function shorts(page, query) {
  var p = page && page > 1 ? page : 1;
  if (query) return shortOnly(search(query, p));
  var paths = p === 1 ? ["/moments", "/shorts"] : ["/moments/" + p, "/shorts/" + p];
  for (var i = 0; i < paths.length; i++) {
    try {
      var res = fetchAny(paths[i]);
      var list = cardsFrom(res.html, res.base);
      if (list.length >= 4) return list;
    } catch (e) {}
  }
  return shortOnly(home(p));
}
