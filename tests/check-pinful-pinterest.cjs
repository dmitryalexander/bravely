const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
async function scenario(active){
 let now=0,tick,cleared=false,scrolls=0,calls=[];
 const images=Array.from({length:6},(_,n)=>({src:'https://i.pinimg.com/236x/'+String(n+1).padStart(32,'0')+'.jpg',naturalWidth:236,naturalHeight:300,alt:'Wall '+n,closest:s=>s.startsWith('a[')?{href:'https://www.pinterest.com/pin/'+(100+n)+'/'}:null}));
 images.push({src:'https://i.pinimg.com/75x75_RS/ffffffffffffffffffffffffffffffff.jpg',naturalWidth:75,naturalHeight:75,closest:()=>null});
 const chrome={runtime:{sendMessage:async m=>{calls.push(m);return m.type==='pinfulPinterestContext'?(active?{job:'a'.repeat(48)}:{}):{ok:true};}}};
 vm.runInNewContext(fs.readFileSync('pinful-pinterest-bridge.js','utf8').replace(/^\uFEFF/,''),{chrome,URL,Date:{now:()=>now},document:{querySelectorAll:()=>images},window:{scrollBy(){scrolls++;},innerHeight:700,addEventListener(){}},setInterval:fn=>{tick=fn;return 1;},clearInterval:()=>cleared=true});
 await Promise.resolve();
 if(!active){assert.equal(tick,undefined);return;}
 now=9000;await tick();
 const returned=calls.find(c=>c.type==='pinfulPinterestResults');assert.equal(returned.pins.length,6);assert.equal(returned.pins[0].page,'https://www.pinterest.com/pin/100/');assert.equal(scrolls,1);assert.equal(cleared,true);
}
(async()=>{await scenario(false);await scenario(true);console.log('PASS: registered Pinterest helpers collect grid images/links, skip avatars, load more and return without recommendations API.');})().catch(e=>{console.error(e);process.exit(1);});
