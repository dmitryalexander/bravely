const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('content.js','utf8');
const controls={};let root,tick;
function element(tag){return {tag,children:[],style:{},hidden:false,attributes:{},append(...nodes){for(const n of nodes){n.parentElement=this;this.children.push(n);}},
 contains(node){for(let p=node;p;p=p.parentElement)if(p===this)return true;return false;},
 getAttribute(name){return this.attributes[name]||null;},setAttribute(name,value){this.attributes[name]=value;},addEventListener(){},
 querySelector(selector){if(this===root)return controls[selector]||null;return null;},querySelectorAll(selector){return selector==='img'?this.children.filter(n=>n.tag==='img'):[];},
 closest(selector){if(selector==='a[href]'){for(let p=this;p;p=p.parentElement)if(p.tag==='a')return p;}return null;}};}
const body=element('body'),html=element('html');
const shared='https://example.org/post/123';
function picture(src,linked=true){const img=element('img');Object.assign(img,{src,currentSrc:src,width:240,height:320,naturalWidth:240,naturalHeight:320,alt:'Result'});const card=element(linked?'a':'div');if(linked)card.attributes.href=shared;card.append(img);card.parentElement=body;return img;}
const first=picture('https://images.example/one.jpg'),second=picture('https://images.example/two.jpg'),missing=picture('https://images.example/three.jpg',false);
// The unlinked result shares a larger container with its neighbor. Its link
// must not be attributed to that neighbor when source metadata is unavailable.
const group=element('div');group.append(first.parentElement,missing.parentElement);group.parentElement=body;group.querySelectorAll=s=>s==='img'?[first,missing]:s==='a[href]'?[first.parentElement]:[];
const grid=element('div');grid.scrollHeight=2000;controls['#lw-grid']=grid;for(const name of ['#lw-status','#lw-google','#lw-crop-go'])controls[name]=element('button');
const document={body,documentElement:html,images:[first,second,missing],scripts:[],createElement:tag=>{const e=element(tag);if(!root)root=e;return e;},querySelectorAll:()=>[],addEventListener(){}};
vm.runInNewContext(source,{document,location:{hostname:'www.google.com',search:'?udm=44&vsrid=test',href:'https://www.google.com/search?udm=44&vsrid=test'},URL,URLSearchParams,
 chrome:{storage:{sync:{get:(v,cb)=>cb(v)}},runtime:{getManifest:()=>({version:'test'})}},sessionStorage:{getItem:()=>null,setItem(){}},window:{scrollTo(){}},setInterval:fn=>tick=fn,setTimeout(){},MutationObserver:class{observe(){}}});
tick();
assert.equal(grid.children.length,3,'keep different images from the same page and visible thumbnails without extracted links');
assert.deepEqual(grid.children.map(tile=>tile.children[0].src),[first.src,second.src,missing.src]);
const open=grid.children[2].children.find(c=>c.className?.startsWith('lw-act lw-open'));
assert.equal(open.href,'https://www.google.com/search?udm=44&vsrid=test','unlinked image must not borrow a neighboring source');
tick();assert.equal(grid.children.length,3,'repeated scans must not duplicate the same image');
console.log('PASS: Google wall retains distinct images from one source and unlinked thumbnails, avoids neighboring source links, and deduplicates rescans.');
