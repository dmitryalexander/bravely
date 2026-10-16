(() => {
  'use strict';
  // Only collect inside a helper registered by Pinful, never ordinary searches.
  chrome.runtime.sendMessage({type:'pinfulLensContext'}).then(context=>{
    if(!context?.job || (context.stage && context.stage!=='google')) return;
    const started=Date.now(), matches=new Map(), redirects=new Set(), readLength=new WeakMap();
    let sent=false, sending=false;
    function add(page,image='') {
      try {
        const u=new URL(page);
        if(u.protocol!=='https:'||!/^([a-z]+\.)?pinterest\.(com|co\.uk|jp|de|fr|ca|com\.au)$/.test(u.hostname)||u.username||u.password||u.port) return;
        if(!/^\/pin\/(?:[^/]*--)?\d+\/?$/.test(u.pathname)&&!/^\/[^/]+\/[^/]+\/?$/.test(u.pathname)) return;
        if(matches.size<100||matches.has(u.href)) matches.set(u.href,{page:u.href,image:image||matches.get(u.href)?.image||''});
      }catch(_){}
    }
    function arrayEnd(text,start) {
      let depth=0,string=false;
      for(let i=start;i<Math.min(text.length,start+30000);i++) {
        const c=text[i];
        if(string){if(c==='\\')i++;else if(c==='"')string=false;continue;}
        if(c==='"')string=true;
        else if(c==='['||c==='{')depth++;
        else if((c===']'||c==='}')&&--depth===0)return i+1;
      }
      return -1;
    }
    function scan() {
      for(const tile of document.querySelectorAll('.lw-tile')) add(tile.querySelector('.lw-open')?.href,tile.querySelector('.lw-dl')?.href||tile.querySelector('img')?.src||'');
      for(const script of document.scripts||[]) {
        const text=script.textContent||'';
        if(readLength.get(script)===text.length)continue;
        readLength.set(script,text.length);
        if(!text.includes('"2003":['))continue;
        const re=/"([\w-]{6,80})":\[0,"/g;let m;
        while((m=re.exec(text))) {
          const start=m.index+m[0].length-4,end=arrayEnd(text,start);
          if(end<0)continue;
          re.lastIndex=end;
          try {
            const row=JSON.parse(text.slice(start,end));
            const meta=row.find(x=>x&&typeof x==='object'&&!Array.isArray(x)&&Array.isArray(x['2003']));
            for(const value of meta?.['2003']||[])if(typeof value==='string')add(value,row[3]?.[0]||row[2]?.[0]||'');
          }catch(_){}
        }
      }
      for(const link of document.querySelectorAll('a[href]')) {
        let page=link.href;
        try {const u=new URL(page);if(/pinterest/i.test(link.textContent||'')&&u.origin==='https://www.google.com'&&u.pathname==='/goto'&&redirects.size<3)redirects.add(u.href);}catch(_){}
        try {const u=new URL(page);if(u.hostname==='www.google.com'&&u.pathname==='/url')page=u.searchParams.get('q')||u.searchParams.get('url');}catch(_){}
        add(page,link.querySelector('img')?.src||'');
      }
    }
    const timer=setInterval(async()=>{
      if(sent||sending||document.querySelector('#captcha,form[action*="sorry"]'))return;
      scan();
      if(((matches.size||redirects.size)&&Date.now()-started>8000)||Date.now()-started>60000) {
        sending=true;
        try {
          const results=[...matches.values()].sort((a,b)=>Number(b.page.includes('/pin/'))-Number(a.page.includes('/pin/'))).slice(0,24);
          const response=await chrome.runtime.sendMessage({type:'pinfulLensResults',results,redirects:[...redirects]});
          if(response?.ok){sent=true;clearInterval(timer);}
        }catch(_){}finally{sending=false;}
      }
    },1000);
    window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
  }).catch(()=>{});
})();
