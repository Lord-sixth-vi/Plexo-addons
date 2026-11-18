// @name        xHamster
// @id          org.plexo.js.xhamster
// @version     1.0.0
// @author      Plexo add-ons
// @domains     xhamster.com, xhamster.desi, xhvid.com, xhamster2.com, xhms.pro, xhamster.one, xhcdn.com, ahcdn.com
// @category    18+
// @description Free adult video streaming, search, and channel browsing

var MIRRORS = [
  "https://xhamster.com",
  "https://xhamster.desi",
  "https://xhvid.com",
  "https://xhamster2.com"
];

var HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
};

// Ensure relative playlist filenames in HLS manifests inherit the full directory path
var _origAbsUrl = absUrl;
absUrl = function(base, u) {
  if (u && u.indexOf("http") !== 0 && u.indexOf("//") !== 0 && u.charAt(0) !== "/" && base && base.indexOf(".m3u8") !== -1) {
    return base.substring(0, base.lastIndexOf("/") + 1) + u;
  }
  return _origAbsUrl(base, u);
};

function looksBlocked(html) {
  if (!html || html.length < 1000) return true;
  if (html.indexOf("window.initials") !== -1 || html.indexOf("xplayer") !== -1) return false;
  var low = html.toLowerCase();
  if (low.indexOf("not available in your country") !== -1) return true;
  if (low.indexOf("<title>access denied") !== -1) return true;
  if (low.indexOf("<title>403") !== -1 || low.indexOf("<title>451") !== -1) return true;
  if (low.indexOf("blocked pursuant to") !== -1 || low.indexOf("court order") !== -1) return true;
  return false;
}

function fetchAny(path, customHeaders) {
  var h = customHeaders || HEADERS;
  var lastErr;
  var cleanPath = path.charAt(0) === "/" ? path : "/" + path;
  for (var i = 0; i < MIRRORS.length; i++) {
    try {
      var fullUrl = MIRRORS[i] + cleanPath;
      var html = getPage(fullUrl, h);
      if (looksBlocked(html)) throw new Error("blocked page");
      return { base: MIRRORS[i], html: html };
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error("Site unreachable from your region (" + (lastErr && lastErr.message) + ")");
}

// ByteGenerator for deciphering encrypted format URLs
function int32(n) {
  return n | 0;
}

function ByteGenerator(algoId, seed) {
  this.algoId = algoId;
  this.s = int32(seed);
}

ByteGenerator.prototype.next = function() {
  var s = this.s;
  var res = 0;
  switch (this.algoId) {
    case 1:
      // LCG (a=1664525, c=1013904223, m=2^32)
      s = this.s = int32(Math.imul(s, 1664525) + 1013904223);
      res = s;
      break;
    case 2:
      // xorshift32
      s = int32(s ^ (s << 13));
      s = int32(s ^ (s >>> 17));
      s = this.s = int32(s ^ (s << 5));
      res = s;
      break;
    case 3:
      // Weyl Sequence + MurmurHash3 fmix32
      s = this.s = int32(s + 0x9e3779b9);
      s = int32(s ^ (s >>> 16));
      s = int32(Math.imul(s, 0x85ebca77));
      s = int32(s ^ (s >>> 13));
      s = int32(Math.imul(s, 0xc2b2ae3d));
      res = int32(s ^ (s >>> 16));
      break;
    case 4:
      // Scrambling with ROL 7
      s = this.s = int32(s + 0x6d2b79f5);
      s = int32((s << 7) | (s >>> 25));
      s = int32(s + 0x9e3779b9);
      s = int32(s ^ (s >>> 11));
      res = int32(Math.imul(s, 0x27d4eb2d));
      break;
    case 5:
      // xorshift variant
      s = int32(s ^ (s << 7));
      s = int32(s ^ (s >>> 9));
      s = int32(s ^ (s << 8));
      s = this.s = int32(s + 0xa5a5a5a5);
      res = s;
      break;
    case 6:
      // LCG with variable right shift
      s = this.s = int32(Math.imul(s, 0x2c9277b5) + 0xac564b05);
      var s2 = int32(s ^ (s >>> 18));
      var shift = (s >>> 27) & 31;
      res = int32(s2 >>> shift);
      break;
    case 7:
      // Weyl + custom multiply-xor-shift
      s = this.s = int32(s + 0x9e3779b9);
      var e = int32(s ^ (s << 5));
      e = int32(Math.imul(e, 0x7feb352d));
      e = int32(e ^ (e >>> 15));
      res = int32(Math.imul(e, 0x846ca68b));
      break;
    default:
      return 0;
  }
  return res & 0xFF;
};

function decipherHexString(hexStr) {
  if (!hexStr || typeof hexStr !== "string" || hexStr.length < 12) return null;
  var bytes = [];
  for (var i = 0; i < hexStr.length; i += 2) {
    bytes.push(parseInt(hexStr.substr(i, 2), 16));
  }
  var algoId = bytes[0];
  var seed = bytes[1] | (bytes[2] << 8) | (bytes[3] << 16) | (bytes[4] << 24);
  var gen = new ByteGenerator(algoId, seed);
  var out = [];
  for (var j = 5; j < bytes.length; j++) {
    var b = bytes[j] ^ gen.next();
    out.push(String.fromCharCode(b));
  }
  return out.join("");
}

function decipherFormatUrl(urlOrHex) {
  if (!urlOrHex || typeof urlOrHex !== "string") return null;
  if (/^[0-9a-fA-F]{12,}$/.test(urlOrHex)) {
    return decipherHexString(urlOrHex);
  }
  var m = urlOrHex.match(/^([a-z]+:\/\/[^\/]+)\/([0-9a-fA-F]{12,})(\/.*)$/);
  if (m) {
    var dec = decipherHexString(m[2]);
    if (dec) return m[1] + "/" + dec + m[3];
  }
  return urlOrHex;
}

function parseVideoCards(html, base) {
  var cards = [];
  var seen = {};

  var parts = html.split(/data-video-id=["'](\d+)["']/);
  if (parts.length > 2) {
    for (var i = 1; i < parts.length; i += 2) {
      var vidId = parts[i];
      var chunk = parts[i + 1].slice(0, 3500);

      var mHref = chunk.match(/href=["'](https?:\/\/[^\/]+\/videos\/[^"']+|\/videos\/[^"']+)["']/);
      if (!mHref) continue;
      var url = absUrl(base, mHref[1]);
      if (seen[url]) continue;
      seen[url] = true;

      var title = "";
      var mTitle = chunk.match(/aria-label="([^"]{3,})"/) ||
                  chunk.match(/title="([^"]{3,})"/) ||
                  chunk.match(/aria-label='([^']{3,})'/) ||
                  chunk.match(/title='([^']{3,})'/) ||
                  chunk.match(/alt="([^"]{3,})"/) ||
                  chunk.match(/alt='([^']{3,})'/);
      if (mTitle) {
        title = decodeHtml(mTitle[1]).trim();
      } else {
        var t = chunk.match(/class=["'][^"']*(?:mobile-video-thumb__name|video-thumb-info__name)[^"']*["'][^>]*>([\s\S]*?)<\/a>/);
        if (t) title = textOf(t[1]);
      }
      if (!title) continue;

      var thumb = "";
      var mImg = chunk.match(/<img\b[^>]*>/);
      if (mImg) {
        var imgTag = mImg[0];
        thumb = attr(imgTag, "src") || attr(imgTag, "data-src");
        if (thumb && thumb.indexOf("blank") !== -1) thumb = "";
        if (thumb) thumb = absUrl(base, thumb);
      }
      if (!thumb) thumb = findThumb(chunk, base);

      var dur = 0;
      var mTime = chunk.match(/<time\b[^>]*datetime=["']([^"']+)["']/) ||
                  chunk.match(/<time\b[^>]*>([\s\S]*?)<\/time>/) ||
                  chunk.match(/data-role=["']video-duration["'][^>]*>([\s\S]*?)<\/div>/) ||
                  chunk.match(/class=["'][^"']*duration[^"']*["'][^>]*>([\s\S]*?)<\/div>/);
      if (mTime) {
        dur = toSeconds(textOf(mTime[1]));
      }

      var preview = "";
      var mPrev = chunk.match(/data-previewvideo(?:-fallback)?=["'](https?:[^"']+\.(?:mp4|webm)[^"']*)["']/i);
      if (mPrev) {
        preview = mPrev[1];
      } else {
        preview = previewIn(chunk, base);
      }

      var creator = "";
      var creatorUrl = "";
      var mUser = chunk.match(/class=["'][^"']*video-uploader__name[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i) ||
                  chunk.match(/<a\b[^>]*href=["']([^"']*\/(?:channels|users|creators)\/[^"'#?]+[^"']*)["'][^>]*>([\s\S]*?)<\/a>/i);
      if (mUser) {
        creatorUrl = absUrl(base, mUser[1]);
        creator = textOf(mUser[2]).replace(/\s*\(?\d[\d.,kKmM]*\s*(?:videos?|subscribers?)?\)?\s*$/i, "").trim();
      }

      cards.push({
        id: vidId || url,
        url: url,
        title: title,
        thumb: thumb,
        duration: dur,
        creator: creator,
        creatorUrl: creatorUrl,
        preview: preview
      });
    }
  }

  // Fallback to generic anchorList if no data-video-id cards found
  if (cards.length === 0) {
    cards = anchorList(html, base, /\/videos\/[a-zA-Z0-9_\-]+/);
    cards = attachExtras(cards, html, base);
  }

  return cards;
}

// 1. Home feed
function home(page) {
  var p = parseInt(page, 10) || 1;
  var path = p > 1 ? "/?page=" + p : "/";
  var res = fetchAny(path);
  return parseVideoCards(res.html, res.base);
}

// 2. Search videos
function search(query, page) {
  var p = parseInt(page, 10) || 1;
  var q = encodeURIComponent(String(query || "").trim());
  var path = "/search/" + q + (p > 1 ? "?page=" + p : "");
  var res = fetchAny(path);
  return parseVideoCards(res.html, res.base);
}

// 3. Channel, creator, or actor page
function browse(url, page) {
  var p = parseInt(page, 10) || 1;
  var targetUrl = withPage(url, p);
  var html = "";
  try {
    html = getPage(targetUrl, HEADERS);
  } catch (e) {
    var path = targetUrl.replace(/^https?:\/\/[^\/]+/, "");
    var res = fetchAny(path);
    html = res.html;
    targetUrl = res.base + path;
  }
  var base = (targetUrl.match(/^https?:\/\/[^\/]+/) || ["https://xhamster.com"])[0];
  return parseVideoCards(html, base);
}

// 4. Video streams and playback
function getStream(url) {
  var html = "";
  var base = (url.match(/^https?:\/\/[^\/]+/) || ["https://xhamster.com"])[0];
  try {
    html = getPage(url, HEADERS);
  } catch (e) {
    var path = url.replace(/^https?:\/\/[^\/]+/, "");
    var res = fetchAny(path);
    html = res.html;
    base = res.base;
  }

  var streams = [];
  var seenUrl = {};

  function addStream(label, streamUrl) {
    if (!streamUrl || seenUrl[streamUrl]) return;
    seenUrl[streamUrl] = true;
    streams.push({
      label: label,
      url: streamUrl,
      headers: {
        "Referer": base + "/"
      }
    });
  }

  var initials = jsonAfter(html, /window\.initials\s*=\s*/);
  if (initials && initials.xplayerSettings && initials.xplayerSettings.sources) {
    var src = initials.xplayerSettings.sources;

    // 1. Check HLS master playlists (provides all qualities up to 4K / 2160p)
    if (src.hls) {
      var hlsKeys = ["h264", "av1"];
      for (var k = 0; k < hlsKeys.length; k++) {
        var hlsObj = src.hls[hlsKeys[k]];
        if (!hlsObj) continue;
        var hlsCandidates = [hlsObj.url, hlsObj.fallback];
        for (var c = 0; c < hlsCandidates.length; c++) {
          var cand = hlsCandidates[c];
          if (!cand) continue;
          var decHls = decipherFormatUrl(cand);
          if (decHls && decHls.indexOf(".m3u8") !== -1) {
            addStream("Auto (HLS)", decHls);
          }
        }
      }
    }

    // 2. If no HLS streams found, check standard formats
    if (streams.length === 0 && src.standard) {
      var stdKeys = ["h264", "av1"];
      for (var s = 0; s < stdKeys.length; s++) {
        var fmtList = src.standard[stdKeys[s]];
        if (!Array.isArray(fmtList)) continue;
        for (var f = 0; f < fmtList.length; f++) {
          var item = fmtList[f];
          if (!item) continue;
          var itemCands = [item.url, item.fallback];
          var qLabel = item.quality || item.label || "";
          for (var ic = 0; ic < itemCands.length; ic++) {
            var rawUrl = itemCands[ic];
            if (!rawUrl) continue;
            var decUrl = decipherFormatUrl(rawUrl);
            if (!decUrl) continue;
            if (decUrl.indexOf(".m3u8") !== -1) {
              addStream("Auto (HLS)", decUrl);
            } else {
              var lbl = qLabel ? (heightOf(qLabel) ? heightOf(qLabel) + "p" : qLabel) : "MP4";
              addStream(lbl, decUrl);
            }
          }
        }
      }
    }
  }

  // Also check videoModel sources if present
  if (initials && initials.videoModel && initials.videoModel.sources) {
    var vSources = initials.videoModel.sources;
    for (var vsKey in vSources) {
      if (vsKey === "download") continue;
      var vsObj = vSources[vsKey];
      if (vsObj && typeof vsObj === "object") {
        for (var qKey in vsObj) {
          var fUrl = vsObj[qKey];
          if (typeof fUrl === "string" && fUrl.indexOf("http") === 0) {
            addStream(qKey, fUrl);
          }
        }
      }
    }
  }

  // Fallback to mediaDefinitionStreams or anyStreams
  if (streams.length === 0) {
    var defs = mediaDefinitionStreams(html, base, HEADERS);
    for (var d = 0; d < defs.length; d++) {
      addStream(defs[d].label, defs[d].url);
    }
  }

  if (streams.length === 0) {
    var fallbackAny = anyStreams(html);
    for (var a = 0; a < fallbackAny.length; a++) {
      addStream(fallbackAny[a].label, fallbackAny[a].url);
    }
  }

  return finalizeStreams(streams);
}

// 5. Video info (channel, actors)
function getInfo(url) {
  var html = __pages[url] || "";
  var base = (url.match(/^https?:\/\/[^\/]+/) || ["https://xhamster.com"])[0];
  if (!html) {
    try {
      html = getPage(url, HEADERS);
    } catch (e) {}
  }

  var out = { creator: "", creatorUrl: "", actors: [] };
  var initials = jsonAfter(html, /window\.initials\s*=\s*/);

  if (initials && initials.videoModel) {
    var vm = initials.videoModel;
    if (vm.author) {
      out.creator = vm.author.name || "";
      out.creatorUrl = vm.author.pageURL ? absUrl(base, vm.author.pageURL) : "";
    } else if (vm.channelModel) {
      out.creator = vm.channelModel.name || "";
      out.creatorUrl = vm.channelModel.pageURL ? absUrl(base, vm.channelModel.pageURL) : "";
    }
  }

  if (initials && initials.videoTagsComponent && Array.isArray(initials.videoTagsComponent.tags)) {
    var tags = initials.videoTagsComponent.tags;
    var seenActors = {};
    for (var t = 0; t < tags.length; t++) {
      var tag = tags[t];
      if (tag && (tag.isPornstar || tag.isCreator || tag.isCeleb)) {
        var aName = tag.name || tag.nameEn;
        if (aName && !seenActors[aName.toLowerCase()]) {
          seenActors[aName.toLowerCase()] = true;
          out.actors.push({
            name: aName,
            url: tag.url ? absUrl(base, tag.url) : ""
          });
        }
      }
    }
  }

  if (!out.creator || out.actors.length === 0) {
    var fallbackInfo = pageInfo(url);
    if (!out.creator) {
      out.creator = fallbackInfo.creator;
      out.creatorUrl = fallbackInfo.creatorUrl;
    }
    if (out.actors.length === 0 && fallbackInfo.actors) {
      out.actors = fallbackInfo.actors;
    }
  }

  return out;
}

// 6. Comments (structured for future Plexo app update)
function getComments(url, page) {
  var p = parseInt(page, 10) || 1;
  if (p > 1) return [];

  var html = __pages[url] || "";
  if (!html) {
    try {
      html = getPage(url, HEADERS);
    } catch (e) {
      return [];
    }
  }

  var comments = [];
  var initials = jsonAfter(html, /window\.initials\s*=\s*/);
  if (initials && initials.comments && initials.comments.commentsList && Array.isArray(initials.comments.commentsList.items)) {
    var items = initials.comments.commentsList.items;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!it) continue;
      comments.push({
        author: it.author ? it.author.name || "" : "",
        authorThumb: it.author ? it.author.thumbUrl || "" : "",
        text: it.text || "",
        likes: it.likesCount || 0,
        date: it.createdAgo || "",
        replies: []
      });
    }
  }
  return comments;
                     }
