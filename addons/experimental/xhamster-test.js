// @name        xHamster OTT Test (Experimental)
// @id          org.plexo.js.xhamster_test
// @version     0.1.2
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
function getStream(url){
  var p=xhFetch(xhPath(url)),html=p.html,streams=[],seen={};
  function add(u,label){
    u=decodeHtml(String(u||"").replace(/\\u0026/g,"&").replace(/\\\//g,"/"));
    if(!/^https?:\/\//i.test(u)||!/[.](?:mp4|m3u8|mpd)(?:[?#]|$)/i.test(u)||seen[u])return;
    // Never use preview/trailer clips as the main playback stream.
    if(/(?:preview|trailer|teaser|thumb|sprite|sample|_6s|6sec)/i.test(u))return;
    seen[u]=true;
    streams.push({label:label||"Auto",url:u,headers:{Referer:p.base+"/"}});
  }
  // Prefer player configuration media rather than arbitrary URLs embedded in page markup.
  var config=jsonAfter(html,/\b(?:videoModel|videoSources|playerConfig|sources)\s*[:=]\s*/);
  function walk(value,depth,label){
    if(depth>5||value==null)return;
    if(typeof value==="string"){add(value,label);return;}
    if(Array.isArray(value)){for(var i=0;i<value.length;i++)walk(value[i],depth+1,label);return;}
    if(typeof value==="object"){
      if(value.url||value.src||value.file)add(value.url||value.src||value.file,value.label||value.quality||label);
      for(var key in value)if(Object.prototype.hasOwnProperty.call(value,key)&&key!=="url"&&key!=="src"&&key!=="file")walk(value[key],depth+1,/^(?:2160|1440|1080|720|480|360)p?$/i.test(key)?key:value.label||label);
    }
  }
  if(config)walk(config,0,"Auto");
  // A standalone HLS master is acceptable; do not treat arbitrary page video URLs as full videos.
  if(!streams.length){
    var masters=html.match(/https?:[^"'\s<>]+(?:master|playlist)[^"'\s<>]*\.m3u8(?:\?[^"'\s<>]*)?/gi)||[];
    for(var j=0;j<masters.length;j++)add(masters[j],"Auto HLS");
  }
  if(!streams.length)throw new Error("Full-length stream not verified; refusing to play a preview clip");
  streams.sort(function(a,b){return (/m3u8/i.test(a.url)?1:0)-(/m3u8/i.test(b.url)?1:0);});
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
