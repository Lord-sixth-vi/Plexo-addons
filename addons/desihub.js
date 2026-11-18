// @name        Desihub
// @id          org.plexo.js.desihub
// @version     1.0.0
// @author      Plexo add-ons
// @domains     desihub.sh, www.desihub.sh, cdn.desihub.sh
// @category    18+
// @description Show home feed, search, and playback for Desihub videos
// @login       https://desihub.sh/

var MIRRORS = ["https://desihub.sh"];

function fetchAny(path, headers) {
  var lastErr;
  for (var i = 0; i < MIRRORS.length; i++) {
    try {
      var html = getPage(MIRRORS[i] + path, headers);
      return { base: MIRRORS[i], html: html };
    } catch (e) { lastErr = e; }
  }
  throw new Error("Site unreachable from your region (" + (lastErr && lastErr.message) + ")");
}

function parseCards(html, base) {
  var out = [];
  var seen = {};
  var parts = html.split('<article');
  if (parts.length <= 1) {
    parts = html.split('<div class="');
  }
  for (var i = 1; i < parts.length; i++) {
    var chunk = parts[i].slice(0, 4000);
    var a = chunk.match(/<a\s+href="([^"#]+)"[^>]*>/);
    if (!a) continue;
    var url = absUrl(base, a[1]);
    if (seen[url] || url.indexOf("/tag/") !== -1 || url.indexOf("/category/") !== -1) continue;
    
    var title = "";
    var tm = chunk.match(/title="([^"]+)"/);
    if (tm) {
      title = decodeHtml(tm[1]);
    } else {
      var hm = chunk.match(/<h[234][^>]*>([\s\S]*?)<\/h[234]>/);
      if (hm) title = textOf(hm[1]);
    }
    if (!title) continue;
    
    seen[url] = true;
    var thumb = findThumb(chunk, base);
    var dur = 0;
    var dm = chunk.match(/(?:\d{1,2}:)?\d{1,2}:\d{2}/);
    if (dm) dur = toSeconds(dm[0]);
    
    var creatorData = creatorIn(chunk, base);
    
    out.push({
      id: url,
      title: title,
      thumb: thumb,
      duration: dur,
      url: url,
      creator: creatorData.name,
      creatorUrl: creatorData.url,
      preview: previewIn(chunk, base)
    });
  }
  return out;
}

function home(page) {
  var path = page > 1 ? "/page/" + page + "/" : "/";
  var res = fetchAny(path);
  return parseCards(res.html, res.base);
}

function search(query, page) {
  var path = "/search/" + encodeURIComponent(query) + (page > 1 ? "/" + page : "") + "/";
  try {
    var res = fetchAny(path);
    return parseCards(res.html, res.base);
  } catch (e) {
    var resAlt = fetchAny("/?s=" + encodeURIComponent(query) + (page > 1 ? "&paged=" + page : ""));
    return parseCards(resAlt.html, resAlt.base);
  }
}

function browse(url, page) {
  var targetUrl = withPage(url, page);
  var base = (targetUrl.match(/^https?:\/\/[^\/]+/) || [""])[0];
  var path = targetUrl.replace(base, "");
  var res = fetchAny(path);
  return parseCards(res.html, res.base);
}

function getStream(url) {
  var base = (url.match(/^https?:\/\/[^\/]+/) || [""])[0];
  var path = url.replace(base, "");
  var res = fetchAny(path);
  var html = res.html;
  
  var streams = [];
  var mediaDefs = mediaDefinitionStreams(html, base);
  for (var i = 0; i < mediaDefs.length; i++) {
    streams.push(mediaDefs[i]);
  }
  
  var direct = findMediaUrls(html);
  for (var j = 0; j < direct.length; j++) {
    streams.push({ label: heightOf(direct[j]) ? heightOf(direct[j]) + "p" : "MP4", url: direct[j] });
  }
  
  return finalizeStreams(streams);
}

function getInfo(url) {
  return pageInfo(url);
}

function getComments(url, page) {
  return [];
}
