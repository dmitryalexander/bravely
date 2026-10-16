/* Pinful helper: Lens -> Pinterest's rendered image wall -> local callback. */
(() => {
  const validJob = value => /^[a-f0-9]{48}$/.test(value || '');
  function origin(value) {
    try {const u=new URL(value);return u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname)&&!u.username&&!u.password&&u.origin===value?value:null;}catch(_){return null;}
  }
  function google(value) {
    try {const u=new URL(value);return u.protocol==='https:'&&['www.google.com','lens.google.com'].includes(u.hostname);}catch(_){return false;}
  }
  function pinterest(value) {
    try {
      const u=new URL(value);
      if(u.protocol!=='https:'||u.username||u.password||u.port||!/^([a-z]{2}\.|www\.)?pinterest\.(com|co\.uk|jp|de|fr|ca|com\.au)$/.test(u.hostname))return false;
      return /^\/pin\/(?:[^/]*--)?\d+\/?$/.test(u.pathname)||(!/^\/(pin|ideas|search|login|settings)\//.test(u.pathname)&&/^\/[^/]+\/[^/]+\/?$/.test(u.pathname));
    }catch(_){return false;}
  }
  function googleRedirect(value) {
    try {const u=new URL(value);return google(value)&&u.hostname==='www.google.com'&&u.pathname==='/goto'&&!!u.searchParams.get('url')&&value.length<2048;}catch(_){return false;}
  }
  function publicImage(value) {
    try{const u=new URL(value);return u.protocol==='https:'&&u.host==='i.pinimg.com'&&!u.username&&!u.password&&/\/[a-f0-9]{32}\.[a-z0-9]+$/i.test(u.pathname);}catch(_){return false;}
  }
  async function finish(tabId,key,stored,pins=[],page='') {
    const results=stored.results||[];
    if(pinterest(page)&&!results.some(r=>r.page===page))results.unshift({page,image:''});
    const payload={job:stored.job,popup:stored.popup,results:results.slice(0,12),pins,page};
    await chrome.tabs.update(tabId,{url:stored.origin+'/lens-return#'+encodeURIComponent(JSON.stringify(payload))});
    await chrome.storage.session.remove(key);
    return {ok:true,count:pins.length};
  }
  chrome.runtime.onMessage.addListener((message,sender,reply)=>{
    if(!message?.type?.startsWith('pinful'))return;
    const tabId=sender.tab?.id??(message.type==='pinfulLensStart'?message.tabId:null);
    if(!Number.isInteger(tabId))return;
    const key='pinful-lens-job:'+tabId;
    (async()=>{
      if(message.type==='pinfulLensStart') {
        const page=new URL(sender.url);
        if(page.protocol!=='chrome-extension:'||page.hostname!==chrome.runtime.id||page.pathname!=='/submit.html'||!validJob(message.job)||!origin(message.origin))return {error:'Invalid Lens job'};
        await chrome.storage.session.set({[key]:{job:message.job,origin:message.origin,popup:message.popup===true,stage:'google',expires:Date.now()+10*60*1000}});
        return {ok:true};
      }
      if(!google(sender.url)&&!pinterest(sender.url))return {};
      const stored=(await chrome.storage.session.get(key))[key];
      if(!stored||stored.expires<Date.now()){await chrome.storage.session.remove(key);return {};}
      if(message.type==='pinfulLensContext')return google(sender.url)?{job:stored.job,stage:stored.stage}:{};
      if(message.type==='pinfulPinterestContext')return pinterest(sender.url)&&stored.stage==='pinterest'?{job:stored.job}:{};
      if(message.type==='pinfulLensResults'&&google(sender.url)&&stored.stage==='google'&&Array.isArray(message.results)) {
        const results=[];let bytes=0;
        for(const r of message.results.slice(0,24)) {
          if(!pinterest(r.page))continue;
          const row={page:r.page,image:publicImage(r.image)?r.image:''};
          bytes+=JSON.stringify(row).length;if(bytes>4000)break;results.push(row);
        }
        const redirects=Array.isArray(message.redirects)?message.redirects.filter(googleRedirect).slice(0,3):[];
        const queue=[...new Set([...results.map(r=>r.page),...redirects])].slice(0,3);
        if(!queue.length)return finish(tabId,key,{...stored,results});
        await chrome.storage.session.set({[key]:{...stored,results,stage:'pinterest',queue:queue.slice(1)}});
        await chrome.tabs.update(tabId,{url:queue[0]});
        return {ok:true,count:results.length};
      }
      if(message.type==='pinfulPinterestResults'&&pinterest(sender.url)&&stored.stage==='pinterest'&&Array.isArray(message.pins)) {
        const pins=[];let bytes=0;
        for(const p of message.pins.slice(0,48)) {
          if(!publicImage(p.image)||p.image.length>2048)continue;
          const row={image:p.image,page:pinterest(p.page)?p.page:'',title:typeof p.title==='string'?p.title.slice(0,500):'',width:Number(p.width)||0,height:Number(p.height)||0};
          bytes+=JSON.stringify(row).length;if(bytes>22000)break;pins.push(row);
        }
        if(!pins.length&&stored.queue?.length) {
          const [next,...queue]=stored.queue;
          await chrome.storage.session.set({[key]:{...stored,queue}});
          await chrome.tabs.update(tabId,{url:next});
          return {ok:true,count:0};
        }
        return finish(tabId,key,stored,pins,sender.url);
      }
      return {};
    })().then(reply).catch(()=>reply({error:'Could not return Pinterest images'}));
    return true;
  });
})();
