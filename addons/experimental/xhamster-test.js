// @name        xHamster OTT Test (Experimental)
// @id          org.plexo.js.xhamster_test
// @version     0.1.4
// @author      Plexo add-ons
// @domains     xhamster.com, www.xhamster.com, m.xhamster.com, xhamster.desi, www.xhamster.desi
// @category    18+
// @description Public-page playback and OTT metadata compatibility test; mirrors are tried only when accessible

var XH_HOSTS=["https://xhamster.com","https://www.xhamster.com","https://m.xhamster.com","https://xhamster.desi"];
function xhPath(url) {
  var m=String(url||"").match(/^https?:\/\/(?:www\.|m\.)?xhamster\.(?:com|desi)(\/[^#]*)/i);
  if(!m)throw new Error("Unsupported xHamster URL");
  return m[1];
}
function xhFetch(path) {
  var errors=[];
  for(var i=0;i<XH_HOSTS.length;i++){
    try{
      var base=XH_HOSTS[i],html=getPage(base+path);
      if(!html||html.length<500||/captcha|access denied|not available in your country/i.test(html.slice(0,2000)))throw new Error("Blocked or empty response");
      return {html:html,base:base};
    }catch(e){errors.push(base+": "+String(e.message||e));}
  }
  throw new Error("No accessible xHamster host. "+errors.join(" | ").slice(0,450));
}
function xhText(s){return decodeHtml(String(s||"").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim());}
function xhCards(html,base) {
  var out=[],seen={},re=/<a\b[^>]*href=["']([^"']*\/videos\/[^"']+)["'][^>]*>/gi,m;
  while((m=re.exec(html))&&out.length<35){
    var url=absUrl(base,m[1]);if(seen[url])continue;\n    if(!/^https?:\\/\\/(?:www\\.|m\\.)?xhamster\\.(?:com|desi)\\/videos\\/[^?#]+/i.test(url))continue;
    var chunk=html.slice(m.index,Math.min(html.length,m.index+1600));
    var img=(chunk.match(/<img\b[^>]*>/i)||[""])[0];
    var title=attr(m[0],"title")||attr(img,"alt")||attr(img,"title");
    if(!title){var t=chunk.match(/(?:title|video-title)[^>]*>([^<]{4,160})</i);title=t?xhText(t[1]):"";}
    if(!title)continue;
    seen[url]=true;
    var dm=chunk.match(/\b(?:\d{1,2}:)?\d{1,2}:\d{2}\b/);
    var creatorMatch=chunk.match(/<a[^>]+href=["']([^"']*\/(?:users|channels|creators)\/[^"']+)["'][^>]*>([^<]+)</i);
    out.push({id:url,url:url,title:xhText(title),thumb:findThumb(chunk,base),duration:dm?toSeconds(dm[0]):0,creator:creatorMatch?xhText(creatorMatch[2]):"xHamster",creatorUrl:creatorMatch?absUrl(base,creatorMatch[1]):"",creatorThumb:""});
  }
  return out;
}
function xhList(path){var p=xhFetch(path);return xhCards(p.html,p.base);}
function home(page){return xhList("/"+(page>1?"?page="+page:""));}
function search(query,page){return xhList("/search/"+encodeURIComponent(String(query||"").trim())+(page>1?"?page="+page:""));}
function browse(url,page){var path=xhPath(url);return xhList(path+(page>1?(path.indexOf("?")<0?"?":"&")+"page="+page:""));}
function getStream(url) {
  var p = xhFetch(xhPath(url));
  var html = p.html;
  var streams = [];
  var seen = {};
  function add(u, label) {
    u = decodeHtml(String(u || ""));
    u = u.split("\\\\/").join("/");
    u = u.split("\\u0026").join("&");
    if (u.indexOf("https://") !== 0 && u.indexOf("http://") !== 0) return;
    if (u.indexOf(".mp4") < 0 && u.indexOf(".m3u8") < 0 && u.indexOf(".mpd") < 0) return;
    var lower = u.toLowerCase();
    if (lower.indexOf("preview") >= 0 || lower.indexOf("trailer") >= 0 ||
        lower.indexOf("sprite") >= 0 || lower.indexOf("thumb") >= 0 ||
        lower.indexOf("sample") >= 0) return;
    if (seen[u]) return;
    seen[u] = true;
    streams.push({label: label || "Auto", url: u, headers: {Referer: p.base + "/"}});
  }
  var config = jsonAfter(html, /(?:videoSources|playerConfig|sources)[ ]*[:=][ ]*/);
  if (config) {
    var sourceList = Array.isArray(config) ? config : (config.sources || config.videoSources || config.streams || []);
    if (Array.isArray(sourceList)) {
      for (var i = 0; i < sourceList.length; i++) {
        var v = sourceList[i];
        if (v && typeof v === "object") add(v.url || v.src || v.file, v.label || v.quality || "Auto");
      }
    }
  }
  if (!streams.length) throw new Error("No verified full-length streams in player source list");
  return streams;
}
function getInfo(url){
  var p=xhFetch(xhPath(url)),html=p.html;
  var m=html.match(/<a[^>]+href=["']([^"']*\/(?:users|channels|creators)\/[^"']+)["'][^>]*>([^<]+)</i);
  return {creator:m?xhText(m[2]):"xHamster",creatorUrl:m?absUrl(p.base,m[1]):"",actors:[]};
}
function getComments(url,page){return [];}
function getFeatured(page){return home(page);}
function getHomeSections(page){
  return [{id:"trending",title:"Trending",items:home(page)},{id:"new",title:"Recently Added",items:xhList("/newest/"+(page>1?"?page="+page:""))}];
}
function getRecommendations(url,page){return []; /* No verified related-video extraction yet */}
function getChannel(url){
  var p=xhFetch(xhPath(url)),t=(p.html.match(/<title[^>]*>([^<]+)</i)||[])[1]||"Channel";
  return {name:xhText(t),url:url,description:"Public xHamster channel page",avatar:"",banner:""};
}
function getPlaylists(url,page){return [];}
function getPlaylist(url,page){return {title:"",items:[]};}
function getCategories(){return [{id:"trending",name:"Trending"},{id:"newest",name:"Newest"}];}
function getFilters(){return [];}
