// @name        SpankBang (Experimental)
// @id          org.plexo.js.spankbang
// @version     0.1.0
// @author      Plexo add-ons
// @domains     spankbang.com, www.spankbang.com, m.spankbang.com
// @category    18+
// @description Experimental public browsing, search filters, channel pages and 4K stream discovery; playback unverified
// @login       https://spankbang.com/login
//
// Public pages only. No unofficial mirrors, proxies, DRM or paid-content bypass.
// Plexo exposes search(query,page), not native filter controls. Use syntax:
//   cats sort:new quality:4k duration:long period:week
//   sort:trending|new|popular|top|featured quality:all|hd|4k
//   duration:short|medium|long period:day|week|month|year|all
// Unknown options are ignored. Filters are best effort, subject to site changes.

var SB_ROOT = "https://spankbang.com";
var SB_HOSTS = ["https://spankbang.com", "https://www.spankbang.com", "https://m.spankbang.com"];
function sbBlocked(s) {
  return !s || s.length < 250 || /access denied|not available in your country|court order|blocked by|restricted in your region|error 403|captcha required/i.test(s.slice(0,2500));
}
function sbFetch(path, preferred) {
  var hosts = preferred ? [preferred] : [];
  for(var i=0;i<SB_HOSTS.length;i++) if(hosts.indexOf(SB_HOSTS[i])<0)hosts.push(SB_HOSTS[i]);
  var last;
  for(var j=0;j<hosts.length;j++){
    try {
      var h=getPage(hosts[j]+path);
      if(sbBlocked(h))throw new Error("Blocked or empty page");
      return {html:h,base:hosts[j]};
    } catch(e){last=e;}
  }
  throw new Error("SpankBang unavailable ("+(last&&last.message||"network error")+")");
}
function sbPath(url){
  var m=String(url||"").match(/^https?:\/\/(?:www\.|m\.)?spankbang\.com(\/[^#]*)/i);
  if(!m)throw new Error("Unsupported SpankBang URL");
  return m[1];
}
function sbHost(url){
  var m=String(url||"").match(/^https?:\/\/(?:www\.|m\.)?spankbang\.com/i);
  return m?m[0]:"";
}
function sbOpts(query){
  var s=String(query||""), o={sort:"",quality:"",duration:"",period:""};
  s=s.replace(/\b(sort|quality|duration|period):([a-z0-9_-]+)/gi,function(_,k,v){o[k.toLowerCase()]=v.toLowerCase();return " ";});
  o.query=s.replace(/\s+/g," ").trim();return o;
}
function sbFilters(o){
  var q=[];
  var sorts={new:"new",trending:"trending",popular:"popular",top:"top",featured:"featured"};
  var qualities={hd:"hd", "4k":"4k", "1080p":"1080p", "720p":"720p"};
  var lengths={short:"short",medium:"medium",long:"long"};
  var periods={day:"day",week:"week",month:"month",year:"year",all:"all"};
  if(sorts[o.sort])q.push("sort="+encodeURIComponent(sorts[o.sort]));
  if(qualities[o.quality])q.push("quality="+encodeURIComponent(qualities[o.quality]));
  if(lengths[o.duration])q.push("duration="+encodeURIComponent(lengths[o.duration]));
  if(periods[o.period])q.push("period="+encodeURIComponent(periods[o.period]));
  return q;
}
function sbPage(path,page){
  var n=Math.max(1,parseInt(page,10)||1);
  if(n>1)path+=(path.indexOf("?")<0?"?":"&")+"page="+n;
  return path;
}
function sbCards(html,base){
  var out=[],seen={}, re=/<a\b[^>]*href=["']([^"']*(?:\/[a-z0-9]+\/(?:video|play)\/|\/[a-z0-9]+-[a-z0-9]+\/playlist\/)[^"']*)["'][^>]*>/gi,m;
  while((m=re.exec(html))!==null && out.length<50){
    var tag=m[0],u=absUrl(base,m[1]);if(seen[u])continue;
    var chunk=html.slice(Math.max(0,m.index-500),Math.min(html.length,m.index+2200));
    var img=(chunk.match(/<img\b[^>]*>/i)||[""])[0];
    var title=attr(tag,"title")||attr(img,"alt")||attr(img,"title");
    if(!title){
      var t=chunk.match(/(?:class=["'][^"']*(?:title|name)[^"']*["'][^>]*>)([^<]{3,180})</i);
      title=t?textOf(t[1]):"";
    }
    if(!title)continue;
    var thumb=attr(img,"data-src")||attr(img,"data-original")||attr(img,"data-thumb")||attr(img,"src")||findThumb(chunk,base);
    thumb=absUrl(base,thumb);
    var durationMatch=chunk.match(/(?:\b\d{1,2}:)?\d{1,2}:\d{2}/);
    var creator=creatorIn(chunk,base);
    seen[u]=true;
    out.push({id:u,url:u,title:decodeHtml(title),thumb:thumb,duration:durationMatch?toSeconds(durationMatch[0]):0,creator:creator.name||"SpankBang",creatorUrl:creator.url||"",preview:previewIn(chunk,base)});
  }
  return out;
}
function sbList(path,page){
  var res=sbFetch(sbPage(path,page));
  var cards=sbCards(res.html,res.base);
  if(!cards.length && /<html/i.test(res.html))throw new Error("Site layout changed: no videos found");
  return cards;
}
function home(page){return sbList("/?sort=trending",page);}
function search(query,page){
  var o=sbOpts(query);
  var path=o.query?"/s/"+encodeURIComponent(o.query).replace(/%20/g,"+"):"/";
  var filters=sbFilters(o);
  if(filters.length)path+="?"+filters.join("&");
  return sbList(path,page);
}
function browse(url,page){return sbList(sbPath(url),page);}
function sbNormalize(u){return decodeHtml(String(u||"")).replace(/\\u0026/g,"&").replace(/\\\//g,"/");}
function sbMedia(html){
  var out=[],seen={};
  function add(u,label){
    u=sbNormalize(u);
    if(!/^https?:\/\//i.test(u)||!/\.(?:mp4|m3u8)(?:[?#]|$)/i.test(u)||seen[u])return;
    seen[u]=true;out.push({label:label||((heightOf(u)||"")+"p"),url:u,headers:{Referer:SB_ROOT+"/"}});
  }
  // Site player commonly publishes stream_data with quality-keyed URLs.
  var data=jsonAfter(html,/\bstream_data\s*[:=]\s*/);
  if(data && typeof data==="object"){
    for(var k in data)if(Object.prototype.hasOwnProperty.call(data,k)){
      var vals=Array.isArray(data[k])?data[k]:[data[k]];
      for(var i=0;i<vals.length;i++){
        if(typeof vals[i]==="string")add(vals[i],k);
        else if(vals[i]&&typeof vals[i]==="object")add(vals[i].url||vals[i].src,k);
      }
    }
  }
  var urls=findMediaUrls(html);
  for(var j=0;j<urls.length;j++)add(urls[j],heightOf(urls[j])?heightOf(urls[j])+"p":"Auto");
  return out;
}
function getStream(url){
  var res=sbFetch(sbPath(url),sbHost(url));
  var streams=sbMedia(res.html);
  if(!streams.length){
    try{streams=anyStreams(res.html);}catch(e){}
  }
  if(!streams.length)throw new Error("No public video streams found (blocked, removed or layout changed)");
  // Finalize resolves available HLS renditions; no 4K label unless a real 2160p source exists.
  var ready=finalizeStreams(streams);
  for(var i=0;i<ready.length;i++)ready[i].headers={Referer:res.base+"/"};
  return ready;
}
function getInfo(url){
  var res=sbFetch(sbPath(url),sbHost(url));
  var creator=creatorIn(res.html,res.base);
  var actors=linkMatches(res.html,ACTOR_PATH,12).map(function(x){return {name:x.name,url:absUrl(res.base,x.href)};});
  return {creator:creator.name||"",creatorUrl:creator.url||"",actors:actors};
}
function getComments(url,page){return [];}
