const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('pinful-bridge.js','utf8');
async function scenario(active, raw=true, retry=false){
 let now=0,tick,cleared=false,calls=[];
 const pin='https://www.pinterest.com/pin/art--123456789/';
 const row=[0,'resultid',['https://thumb.example/image.jpg',20,30],['https://i.pinimg.com/originals/test.jpg',200,300],null,0,{'2003':[null,'id',pin,'Artwork']}];
 const scripts=raw?[{textContent:'{"resultkey":'+JSON.stringify(row)+'}'}]:[];
 const link={href:'https://www.google.com/url?q='+encodeURIComponent(pin),querySelector:()=>null};
 const document={scripts,querySelector:()=>null,querySelectorAll:s=>s==='a[href]'?[link]:[]};
 const chrome={runtime:{sendMessage:async m=>{calls.push(m);if(m.type==='pinfulLensContext')return active?{job:'a'.repeat(48)}:{};return {ok:!(retry&&calls.filter(c=>c.type==='pinfulLensResults').length===1)};}}};
 vm.runInNewContext(source,{chrome,document,URL,Date:{now:()=>now},setInterval:fn=>{tick=fn;return 1;},clearInterval:()=>cleared=true,window:{addEventListener(){}}});
 await Promise.resolve();
 if(!active){assert.equal(tick,undefined);return;}
 now=9000;await tick();
 if(retry){assert.equal(cleared,false);await tick();}
 const result=calls.find(c=>c.type==='pinfulLensResults');assert.equal(result.results.length,1);assert.equal(result.results[0].page,pin);
 if(raw)assert.equal(result.results[0].image,'https://i.pinimg.com/originals/test.jpg');
 assert.equal(cleared,true);
}
(async()=>{await scenario(false);await scenario(true);await scenario(true,false);await scenario(true,true,true);console.log('PASS: scoped Lens collection from Google data without custom wall, standard links and retry after callback failure.');})().catch(e=>{console.error(e);process.exit(1);});
