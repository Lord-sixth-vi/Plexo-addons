// @name Pornhub
// @id org.plexo.js.pornhub
// @version 1.0.0
// @domains pornhub.com, www.pornhub.com, phncdn.com
// @category Adult
// @description Search and stream from pornhub.com (adults only, 18+)
//
// Contract: search(query) -> [{id,title,thumb,url,duration}]
//           home()        -> same list
//           getStream(url)-> [{label,url}] best first
// Written from how the site is known to work. If it stops working after a site
// change, only this file needs fixing.

var BASE = "https://www.pornhub.com";
var COOKIES = {
  "Cookie": "age_verified=1; accessAgeDisclaimerPH=1; accessAgeDisclaimerUK=1; accessPH=1; platform=pc"
};

function makeItem(key, chunk) {
  var linkTag = (chunk.match(/<a\b[^>]*viewkey=[^>]*>/) || [""])[0];
  var imgTag = (chunk.match(/<img\b[^>]*>/) || [""])[0];
  var title = attr(linkTag, "title") || attr(imgTag, "title") || attr(imgTag, "alt");
  if (!title) return null;
  var dm = chunk.match(/class="[^"]*duration[^"]*"[^>]*>\s*([0-9:]+)\s*</);
  return {
    id: key,
    title: title,
    thumb: findThumb(chunk, BASE),
    duration: dm ? toSeconds(dm[1]) : 0,
    url: BASE + "/view_video.php?viewkey=" + key
  };
}

function listFromRaw(html) {
  var results = [];
  var seen = {};

  // Main way: each result sits in a block marked data-video-vkey="KEY"
  var parts = html.split('data-video-vkey="');
  for (var i = 1; i < parts.length; i++) {
    var key = (parts[i].match(/^([A-Za-z0-9]+)"/) || [])[1];
    if (!key || seen[key]) continue;
    var item = makeItem(key, parts[i].slice(0, 3000));
    if (item) {
      seen[key] = true;
      results.push(item);
    }
  }

  // Backup way: links containing viewkey=KEY
  if (results.length === 0) {
    var re = /<a\b[^>]*viewkey=([A-Za-z0-9]+)[^>]*>/g;
    var m;
    while ((m = re.exec(html)) !== null) {
      var k = m[1];
      if (seen[k]) continue;
      var it = makeItem(k, html.slice(Math.max(0, m.index - 300), m.index + 2500));
      if (it) {
        seen[k] = true;
        results.push(it);
      }
    }
  }
  if (results.length === 0) {
    throw new Error("No results found (or the page layout changed)");
  }
  return results;
}

function enc(q) {
  return encodeURIComponent(q).replace(/%20/g, "+");
}

function home(page) {
  page = page || 1;
  return listFrom(getPage(BASE + "/video" + (page > 1 ? "?page=" + page : ""), COOKIES));
}

function search(query, page) {
  page = page || 1;
  var q = (query || "").trim();
  if (!q) return home(page);
  return listFrom(getPage(BASE + "/video/search?search=" + enc(q) + (page > 1 ? "&page=" + page : ""), COOKIES));
}

function guessFormat(u) {
  if (u.indexOf(".m3u8") !== -1) return "hls";
  if (u.indexOf(".mp4") !== -1) return "mp4";
  return "other";
}

function qualityNumber(q) {
  if (Array.isArray(q)) q = q[0];
  return parseInt(q, 10) || 0;
}

function getStreamRaw(url) {
  var html = getPage(url, COOKIES);
  var m = html.match(/var\s+flashvars_\d+\s*=\s*(\{.+?\});/);
  if (!m) {
    throw new Error("No video data found (removed, premium-only, or blocked)");
  }
  var data = JSON.parse(m[1]);
  var defs = data.mediaDefinitions || [];
  var cands = [];

  for (var i = 0; i < defs.length; i++) {
    var d = defs[i];
    if (!d.videoUrl) continue;
    var link = absUrl(BASE, d.videoUrl);
    if (d.remote || link.indexOf("/video/get_media") !== -1) {
      // This entry points to a second link that returns a list of qualities
      try {
        var list = JSON.parse(getPage(link, COOKIES));
        for (var j = 0; j < list.length; j++) {
          if (!list[j].videoUrl) continue;
          cands.push({
            url: list[j].videoUrl,
            q: qualityNumber(list[j].quality),
            fmt: list[j].format || guessFormat(list[j].videoUrl)
          });
        }
      } catch (e) {}
    } else {
      cands.push({
        url: link,
        q: qualityNumber(d.quality),
        fmt: d.format || guessFormat(link)
      });
    }
  }
  if (cands.length === 0) {
    throw new Error("No playable links found for this video");
  }

  var mp4 = cands.filter(function (c) { return c.fmt === "mp4"; })
    .sort(function (a, b) { return b.q - a.q; });
  var hls = cands.filter(function (c) { return c.fmt === "hls"; })
    .sort(function (a, b) { return b.q - a.q; });

  var out = [];
  mp4.forEach(function (c) { out.push({ label: (c.q ? c.q + "p" : "MP4"), url: c.url }); });
  if (hls.length) out.push({ label: "Auto (HLS)", url: hls[0].url });
  if (out.length === 0) out.push({ label: "Stream", url: cands[0].url });
  return out;
}

function getStream(url) {
  return finalizeStreams(getStreamRaw(url));
}

function listFrom(html) {
  return attachExtras(listFromRaw(html), html, BASE);
}

function browse(url, page) {
  return listFrom(getPage(withPage(url, page), COOKIES));
}
