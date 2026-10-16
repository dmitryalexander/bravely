(() => {
  'use strict';
  chrome.runtime.sendMessage({type:'pinfulPinterestContext'}).then(context=>{
    if(!context?.job)return;
    const started=Date.now(),images=new Map();let sending=false,sent=false,scrolls=0;
    function collect() {
      for(const img of document.querySelectorAll('img')) {
        const raw=img.currentSrc||img.src||'';let u;
        try{u=new URL(raw);}catch(_){continue;}
        if(u.protocol!=='https:'||u.hostname!=='i.pinimg.com'||!/\/(?:originals|\d+x(?:\d+)?)[/]/.test(u.pathname))continue;
        const signature=u.pathname.match(/\/([a-f0-9]{32})\.[a-z0-9]+$/i)?.[1];
        const width=img.naturalWidth||img.width,height=img.naturalHeight||img.height;
        if(!signature||Math.max(width,height)<120||Math.min(width,height)<70)continue;
        const link=img.closest('a[href*="/pin/"]');
        const pin=img.closest('[data-test-pin-id]')?.getAttribute('data-test-pin-id');
        const page=link?.href||(/^\d+$/.test(pin||'')?'https://www.pinterest.com/pin/'+pin+'/':'');
        // A close-up image has no wrapping link; its source is this helper page.
        const row={image:u.href,page,title:img.alt||'',width,height};
        if(images.size<48||images.has(signature))images.set(signature,row);
      }
    }
    const timer=setInterval(async()=>{
      if(sent||sending)return;
      collect();const elapsed=Date.now()-started;
      if(elapsed>2000&&scrolls<3&&images.size<24){window.scrollBy(0,Math.min(window.innerHeight||800,800));scrolls++;}
      if((images.size>=6&&elapsed>8000)||elapsed>20000) {
        sending=true;
        try {
          const result=await chrome.runtime.sendMessage({type:'pinfulPinterestResults',pins:[...images.values()]});
          if(result?.ok){sent=true;clearInterval(timer);}
        }catch(_){}finally{sending=false;}
      }
    },1000);
    window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
  }).catch(()=>{});
})();
