// @name        xHamster
// @id          org.plexo.js.xhamster
// @version     1.0.0
// @author      Plexo add-ons
// @domains     xhamster.com, www.xhamster.com, xhamster3.com, www.xhamster3.com, xhamster19.com, www.xhamster19.com, xhamster.desi, www.xhamster.desi, xhopen.com, www.xhopen.com
// @category    18+
// @description Browse, search, and stream videos from xHamster with mirror fallback

var MIRRORS = [
  "https://xhamster.com",
  "https://xhamster3.com",
  "https://xhamster19.com",
  "https://xhamster.desi",
  "https://xhopen.com"
];

function looksBlocked(html) {
  var s = String(html || "").trim();
  if (!s || s.length < 300) return true;
  if (/not available in your country|access denied|this site can't be reached|blocked by your isp|court order|legal notice/i.test(s)) {
    return true;
  }
  return false;
}

function fetchAny(pathOrUrl, headers) {
  var raw = String(pathOrUrl || "");
  var path = raw.indexOf("http") === 0 ? raw.replace(/^https?:\/\/[^\/]+/, "") || "/" : (raw.charAt(0) === "/" ? raw : "/" + raw);
  var order = [];

  if (raw.indexOf("http") === 0) {
    var m = raw.match(/^(https?:\/\/[^\/]+)/);
    if (m && MIRRORS.indexOf(m[1]) !== -1) order.push(m[1]);
  }
  for (var i = 0; i < MIRRORS.length && order.length < 3; i++) {
    if (order.indexOf(MIRRORS[i]) === -1) order.push(MIRRORS[i]);
  }

  var lastErr;
  for (var j = 0; j < order.length; j++) {
    try {
      var target = order[j] + path;
      var html = getPage(target, headers);
      if (looksBlocked(html)) throw new Error("blocked page");
      return { base: order[j], url: target, html: html };
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error("Site unreachable from your region (" + (lastErr && lastErr.message ? lastErr.message : "network error") + ")");
}

function buildCards(html, base) {
  var items = [];
  var seen = {};

  var state = jsonAfter(html, /window\.__INITIAL_STATE__\s*=/);
  if (state) {
    var queue = [state];
    var steps = 0;
    while (queue.length > 0 && steps < 400) {
      steps++;
      var cur = queue.shift();
      if (!cur || typeof cur !== "object") continue;
      if (Array.isArray(cur)) {
        for (var a = 0; a < cur.length; a++) queue.push(cur[a]);
        continue;
      }
      var vUrl = cur.pageURL || cur.url || cur.videoUrl || "";
      var vTitle = cur.title || cur.name || "";
      if (typeof vUrl === "string" && typeof vTitle === "string" && vTitle.trim() && /\/videos?\//.test(vUrl)) {
        var fullUrl = absUrl(base, vUrl);
        if (!seen[fullUrl]) {
          seen[fullUrl] = true;
          var authorObj = cur.author || cur.channel || cur.uploader || {};
          var cName = typeof authorObj === "string" ? authorObj : (authorObj.name || cur.channelName || cur.creator || "");
          var cUrlRaw = typeof authorObj === "object" ? (authorObj.url || authorObj.pageURL || "") : (cur.channelUrl || "");
          items.push({
            id: String(cur.id || cur.videoId || fullUrl),
            url: fullUrl,
            title: decodeHtml(String(vTitle)).trim(),
            thumb: absUrl(base, cur.thumbURL || cur.thumb || cur.image || cur.poster || ""),
            duration: toSeconds(cur.duration || cur.length || 0),
            creator: decodeHtml(String(cName || "")).trim(),
            creatorUrl: cUrlRaw ? absUrl(base, cUrlRaw) : "",
            preview: absUrl(base, cur.previewURL || cur.preview || cur.trailerURL || "")
          });
        }
      }
      var keys = Object.keys(cur);
      for (var k = 0; k < keys.length; k++) {
        var val = cur[keys[k]];
        if (val && typeof val === "object") queue.push(val);
      }
    }
  }

  if (items.length === 0) {
    var fallbackList = anchorList(html, base, /\/videos?\/[^"'#?]+/i);
    for (var i = 0; i < fallbackList.length; i++) {
      var it = fallbackList[i];
      if (!seen[it.url]) {
        seen[it.url] = true;
        items.push(it);
      }
    }
  }

  return attachExtras(items, html, base);
}

function home(page) {
  var p = page && page > 0 ? page : 1;
  var path = p === 1 ? "/" : "/?page=" + p;
  var res = fetchAny(path);
  return buildCards(res.html, res.base);
}

function search(query, page) {
  var q = encodeURIComponent(String(query || "").trim());
  if (!q) return [];
  var p = page && page > 0 ? page : 1;
  var path = "/search/" + q + (p > 1 ? "?page=" + p : "");
  var res = fetchAny(path);
  return buildCards(res.html, res.base);
}

function browse(url, page) {
  var p = page && page > 0 ? page : 1;
  var target = withPage(url, p);
  var res = fetchAny(target);
  return buildCards(res.html, res.base);
}

function extractStreamEntries(html, base, referer) {
  var list = [];
  var seen = {};
  var hdrs = { Referer: referer };

  function pushStream(label, u) {
    if (!u) return;
    var full = absUrl(base, u);
    if (seen[full]) return;
    seen[full] = true;
    list.push({ label: label || "Stream", url: full, headers: hdrs });
  }

  var playerState = jsonAfter(html, /window\.initials\s*=|window\.__INITIAL_STATE__\s*=/);
  if (playerState) {
    var q = [playerState];
    var steps = 0;
    while (q.length > 0 && steps < 500) {
      steps++;
      var node = q.shift();
      if (!node || typeof node !== "object") continue;
      if (Array.isArray(node)) {
        for (var i = 0; i < node.length; i++) q.push(node[i]);
        continue;
      }
      var ks = Object.keys(node);
      for (var j = 0; j < ks.length; j++) {
        var key = ks[j];
        var v = node[key];
        if (typeof v === "string" && /^https?:\/\//i.test(v) && /\.(m3u8|mp4|webm|mpd)(\?|$)/i.test(v)) {
          var h = heightOf(key) || heightOf(v);
          pushStream(h ? h + "p" : (/\.m3u8/i.test(v) ? "Auto" : "MP4"), v);
        } else if (v && typeof v === "object") {
          q.push(v);
        }
      }
    }
  }

  var foundMedia = findMediaUrls(html);
  for (var m = 0; m < foundMedia.length; m++) {
    var h2 = heightOf(foundMedia[m]);
    pushStream(h2 ? h2 + "p" : (/\.m3u8/i.test(foundMedia[m]) ? "Auto" : "MP4"), foundMedia[m]);
  }

  var finalized = finalizeStreams(list);
  for (var f = 0; f < finalized.length; f++) {
    finalized[f].headers = hdrs;
  }

  var dashMatches = html.match(/https?:\/\/[^"'\s<>\\]+?\.mpd(?:\?[^"'\s<>\\]*)?/gi) || [];
  for (var d = 0; d < dashMatches.length; d++) {
    var dUrl = decodeHtml(dashMatches[d]).replace(/\\\//g, "/");
    var dh = heightOf(dUrl);
    finalized.push({
      label: dh ? dh + "p (DASH)" : "DASH",
      url: dUrl,
      headers: hdrs
    });
  }

  return finalized;
}

function getStream(url) {
  var res = fetchAny(url);
  if (/widevine|playready|fairplay|application\/dash\+xml.*cenc/i.test(res.html) && findMediaUrls(res.html).length === 0) {
    throw new Error("Video is DRM-protected and not supported");
  }
  try {
    return extractStreamEntries(res.html, res.base, res.url);
  } catch (e) {
    var any = anyStreams(res.html);
    for (var i = 0; i < any.length; i++) {
      any[i].headers = { Referer: res.url };
    }
    return any;
  }
}

function getInfo(url) {
  return pageInfo(url);
}

function getComments(url, page) {
  return [];
}
  
