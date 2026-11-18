
// @name        WebseriesDesk
// @id          org.plexo.js.webseriesdesk
// @version     1.0.0
// @author      Plexo add-ons
// @domains     webseriesdesk.store, vidara.to, lplaygo.com, lulustream.com, img.lulustream.co, mxzhxco8dft.com, ey43.com
// @category    18+
// @description Browse authorised WebseriesDesk videos, search titles and open available streams

var MIRRORS = ["https://webseriesdesk.store"];
var ALLOWED_HOSTS = ["webseriesdesk.store", "vidara.to", "lplaygo.com", "lulustream.com", "img.lulustream.co", "mxzhxco8dft.com", "ey43.com"];

function hostOf(url) {
  var m = String(url || "").match(/^https?:\/\/([^\/:?#]+)/i);
  return m ? m[1].toLowerCase() : "";
}

function allowedUrl(url) {
  var h = hostOf(url);
  for (var i = 0; i < ALLOWED_HOSTS.length; i++) {
    if (h === ALLOWED_HOSTS[i] || h.slice(-(ALLOWED_HOSTS[i].length + 1)) === "." + ALLOWED_HOSTS[i]) return true;
  }
  return false;
}

function looksBlocked(html) {
  if (!html || html.length < 700) return true;
  return /not available in your country|unavailable in your region|access denied|legal notice|court order|site blocked by|isp block/i.test(html);
}

function fetchAny(path, headers) {
  var lastErr;
  for (var i = 0; i < MIRRORS.length && i < 3; i++) {
    var url = MIRRORS[i] + (path.charAt(0) === "/" ? path : "/" + path);
    try {
      var html = getPage(url, headers);
      if (looksBlocked(html)) throw new Error("blocked page");
      return { base: MIRRORS[i], html: html, url: url };
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error("WebseriesDesk is unavailable (" + (lastErr && lastErr.message ? lastErr.message : "connection failed") + ")");
}

function pagePath(path, page) {
  page = parseInt(page, 10) || 1;
  if (page <= 1) return path;
  if (path.indexOf("?") >= 0) return path + "&paged=" + page;
  return path.replace(/\/$/, "") + "/page/" + page + "/";
}

function cleanText(s) {
  return textOf(String(s || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " "));
}

function cardList(html, base) {
  var out = [], seen = {};
  var re = /<a\b[^>]*href="([^"]*\/webseries\/[^"?#]+)"[^>]*>/gi, m;

  while ((m = re.exec(html)) !== null) {
    var url = absUrl(base, m[1]);
    if (seen[url]) continue;

    var start = Math.max(0, m.index - 900);
    var end = Math.min(html.length, m.index + 3200);
    var chunk = html.slice(start, end);
    var tag = m[0];
    var img = (chunk.match(/<img\b[^>]*>/i) || [""])[0];

    var title = attr(tag, "title") || attr(img, "alt") || attr(img, "title");

    if (!title) {
      var tm = chunk.match(/class="[^"]*(?:entry-title|video-title|title)[^"]*"[^>]*>([\s\S]{0,500}?)<\//i);
      if (tm) title = cleanText(tm[1]);
    }

    if (!title) {
      var h = chunk.match(/<h[2-4]\b[^>]*>([\s\S]{0,400}?)<\/h[2-4]>/i);
      if (h) title = cleanText(h[1]);
    }

    title = decodeHtml(String(title || "")).trim();
    if (!title || title.length > 240) continue;

    var thumb = findThumb(chunk, base);
    var dm = chunk.match(/(?:class="[^"]*(?:duration|time)[^"]*"[^>]*>\s*|>\s*)((?:\d{1,2}:)?\d{1,2}:\d{2})\s*</i);
    var c = creatorFromChunk(chunk, base);

    var card = {
      id: url,
      url: url,
      title: title,
      thumb: thumb,
      duration: dm ? toSeconds(dm[1]) : 0
    };

    if (c.name) {
      card.creator = c.name;
      card.creatorUrl = c.url;
    }

    var pv = previewIn(chunk, base);
    if (pv) card.preview = pv;

    out.push(card);
    seen[url] = true;
  }

  return out;
}

function creatorFromChunk(chunk, base) {
  var re = /<a\b[^>]*href="([^"]*\/platform\/[^"?#]+)"[^>]*>([\s\S]{0,250}?)<\/a>/i;
  var m = re.exec(chunk);

  if (!m) return { name: "", url: "" };

  var name = attr(m[0], "title") || cleanText(m[2]);
  name = name.replace(/\s+/g, " ").trim();

  return {
    name: name,
    url: absUrl(base, m[1])
  };
}

function attachSiteExtras(cards, html, base) {
  for (var i = 0; i < cards.length; i++) {
    var path = cards[i].url.replace(/^https?:\/\/[^/]+/, "");
    var idx = html.indexOf(path);

    if (idx < 0) continue;

    var c = creatorFromChunk(
      html.slice(Math.max(0, idx - 500), idx + 2800),
      base
    );

    if (!cards[i].creator && c.name) {
      cards[i].creator = c.name;
      cards[i].creatorUrl = c.url;
    }
  }

  return cards;
}

function home(page) {
  var p = parseInt(page, 10) || 1;
  var path = p <= 1 ? "/" : "/page/" + p + "/";
  var r = fetchAny(path);

  return attachSiteExtras(cardList(r.html, r.base), r.html, r.base);
}

function search(query, page) {
  var q = encodeURIComponent(String(query || "").trim());
  if (!q) return home(page);

  var p = parseInt(page, 10) || 1;
  var path = "/?s=" + q + (p > 1 ? "&paged=" + p : "");
  var r = fetchAny(path);

  return attachSiteExtras(cardList(r.html, r.base), r.html, r.base);
}

function browse(url, page) {
  if (!url || !/^https?:\/\//i.test(url) || !allowedUrl(url)) {
    throw new Error("Invalid channel address");
  }

  var base = hostOf(url) === "webseriesdesk.store" ? "https://webseriesdesk.store" : "";

  if (!base) throw new Error("Unsupported channel address");

  var path = url.replace(base, "");
  var r = fetchAny(pagePath(path, page));

  return attachSiteExtras(cardList(r.html, r.base), r.html, r.base);
}

function pageUrlForVideo(url) {
  if (!url || !/^https?:\/\//i.test(url) || !allowedUrl(url)) {
    throw new Error("Invalid video address");
  }

  var path = url.replace(/^https?:\/\/[^/]+/, "") || "/";
  return fetchAny(path);
}

function extractFrames(html, base) {
  var out = [], re = /<iframe\b[^>]*>/gi, m, seen = {};

  while ((m = re.exec(html)) !== null && out.length < 3) {
    var src = attr(m[0], "src");
    if (!src) continue;

    src = absUrl(base, src);

    if (!allowedUrl(src) || seen[src]) continue;

    seen[src] = true;
    out.push(src);
  }

  return out;
}

function extractSourceTags(html, base) {
  var out = [], re = /<(?:source|video)\b[^>]*>/gi, m;

  while ((m = re.exec(html)) !== null) {
    var u = attr(m[0], "src") || attr(m[0], "data-src") || attr(m[0], "data-file");

    if (!u) continue;

    u = absUrl(base, u);

    if (/\.(?:mp4|m3u8|webm|mpd)(?:[?#]|$)/i.test(u)) {
      out.push({
        label: heightOf(u) ? heightOf(u) + "p" : "Auto",
        url: u
      });
    }
  }

  var props = html.match(/(?:file|src|source|hls|dash)\s*[:=]\s*["'](https?:[^"']+\.(?:mp4|m3u8|webm|mpd)(?:\?[^"']*)?)["']/gi) || [];

  for (var i = 0; i < props.length; i++) {
    var mm = props[i].match(/["'](https?:[^"']+)["']/i);

    if (mm) {
      out.push({
        label: heightOf(mm[1]) ? heightOf(mm[1]) + "p" : "Auto",
        url: decodeHtml(mm[1])
      });
    }
  }

  return out;
}

function getStream(url) {
  var r = pageUrlForVideo(url);
  var html = r.html;

  if (/widevine|playready|drmProtected|drm_protected|licenseServer|license_server/i.test(html)) {
    throw new Error("DRM-protected video cannot play in Plexo");
  }

  var list = extractSourceTags(html, r.base);
  var direct = findMediaUrls(html);

  for (var i = 0; i < direct.length; i++) {
    list.push({
      label: heightOf(direct[i]) ? heightOf(direct[i]) + "p" : "Auto",
      url: direct[i]
    });
  }

  var frames = extractFrames(html, r.base);

  for (var f = 0; f < frames.length && f < 2; f++) {
    try {
      var fh = getPage(frames[f], { Referer: r.url });

      if (/widevine|playready|drmProtected|licenseServer/i.test(fh)) {
        throw new Error("DRM-protected video cannot play in Plexo");
      }

      var frameBase = frames[f].replace(/(https?:\/\/[^/]+).*/, "$1");
      var more = extractSourceTags(fh, frameBase);
      var urls = findMediaUrls(fh);

      for (var j = 0; j < urls.length; j++) {
        more.push({
          label: heightOf(urls[j]) ? heightOf(urls[j]) + "p" : "Auto",
          url: urls[j]
        });
      }

      for (var k = 0; k < more.length; k++) {
        more[k].headers = { Referer: frames[f] };
        list.push(more[k]);
      }

    } catch (e) {
      if (String(e.message || e).indexOf("DRM-protected") >= 0) throw e;
    }
  }

  if (!list.length) {
    try {
      list = anyStreams(html);
    } catch (e2) {}
  }

  if (!list.length) {
    throw new Error("No playable stream exposed by the site's video player");
  }

  var dash = [];

  for (var d = 0; d < list.length; d++) {
    if (/\.mpd(?:[?#]|$)/i.test(list[d].url)) {
      dash.push({
        label: heightOf(list[d].url) ? heightOf(list[d].url) + "p DASH" : "DASH",
        url: list[d].url,
        headers: list[d].headers
      });
    }
  }

  var playable = list.filter(function (x) {
    return !/\.mpd(?:[?#]|$)/i.test(x.url);
  });

  var finalList = playable.length ? finalizeStreams(playable) : [];

  for (var x = 0; x < dash.length; x++) {
    finalList.push(dash[x]);
  }

  return finalList;
}

function getInfo(url) {
  var r = pageUrlForVideo(url);
  var info = pageInfo(r.url);
  var c = creatorFromChunk(r.html, r.base);

  if (!info.creator && c.name) {
    info.creator = c.name;
    info.creatorUrl = c.url;
  }

  if (!info.creatorUrl && c.url) {
    info.creatorUrl = c.url;
  }

  return info;
}

function getComments(url, page) {
  var r = pageUrlForVideo(url);
  var out = [], seen = {};

  var blocks = r.html.match(/<li\b[^>]*class="[^"]*comment[^\"]*"[\s\S]*?<\/li>/gi) || [];

  for (var i = 0; i < blocks.length; i++) {
    var b = blocks[i];
    var author = "";

    var am = b.match(/class="[^"]*(?:comment-author|fn)[^"]*"[^>]*>([\s\S]*?)<\//i);
    if (am) author = cleanText(am[1]);

    var tm = b.match(/class="[^"]*(?:comment-content|comment-text)[^"]*"[^>]*>([\s\S]*?)<\//i);
    var body = tm ? cleanText(tm[1]) : "";

    if (!body || seen[body]) continue;

    var im = b.match(/<img\b[^>]*>/i);
    var date = b.match(/<time\b[^>]*datetime="([^"]+)"/i);

    out.push({
      author: author,
      authorThumb: im ? absUrl(r.base, attr(im[0], "src")) : "",
      text: body,
      likes: 0,
      date: date ? date[1] : "",
      replies: []
    });

    seen[body] = true;
  }

  return out;
  }
  
