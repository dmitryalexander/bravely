const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
let code = fs.readFileSync(require('node:path').join(__dirname, '../pinterest.js'),'utf8');
code = code.replace(/\}\)\(\);\s*$/, 'globalThis.test = {cropSource, okImg, pinLink, ov, place};})();');
const handlers = {}, nodes = new Map(), assigned = [], opened = [], storage = new Map();
let hovered = null, icon = null, clicks = 0;
function node() {return {style:{},setAttribute(){},append(){},addEventListener(){},matches(){return false},contains(){return false},isConnected:true};}
const document = {createElement:node,body:{appendChild(el){if(el.id) nodes.set(el.id,el)}},documentElement:node(),getElementById:id=>nodes.get(id),querySelectorAll:()=>icon?[icon]:[],elementsFromPoint:()=>hovered?[hovered]:[],addEventListener:(name,fn)=>handlers[name]=fn};
const ctx = {document,location:{pathname:'/pin/123/visual-search/',href:'https://pt.pinterest.com/pin/123/visual-search/',origin:'https://pt.pinterest.com',assign:u=>assigned.push(u)},window:{addEventListener(){},open:u=>opened.push(u)},sessionStorage:{getItem:k=>storage.get(k)||null,removeItem:k=>storage.delete(k),setItem:(k,v)=>storage.set(k,v)},MutationObserver:class{observe(){}},requestAnimationFrame:()=>1,setTimeout:()=>1,clearTimeout(){},URL,Date};
vm.runInNewContext(code,ctx);
function img(pin) {return {tagName:'IMG',src:'https://i.pinimg.com/736x/test.jpg',isConnected:true,getAttribute:()=>null,getBoundingClientRect:()=>({left:0,top:0,right:500,bottom:600,width:500,height:600}),closest:s=>s==='a[href]'&&pin?{href:`https://pt.pinterest.com/pin/${pin}/`}:null};}
const source=img(),linkedSource=img('123'),result=img('456');
assert.equal(ctx.test.okImg(source),false); assert.equal(ctx.test.okImg(linkedSource),false); assert.equal(ctx.test.okImg(result),true);
ctx.location.pathname='/pin/123/'; assert.equal(ctx.test.okImg(source),true);
function key(target={}){handlers.keydown({ctrlKey:true,shiftKey:true,code:'KeyZ',composedPath:()=>[target],preventDefault(){},stopPropagation(){}})}
key({isContentEditable:true}); assert.equal(clicks,0);
// Delayed magnifier detection and timeout behavior are covered in check-two-step-search.cjs.
assert.equal(opened.length,0);
ctx.location.pathname='/pin/123/visual-search/';key();assert.equal(assigned.pop(),'/pin/123/');
ctx.location.pathname='/search/pins/';hovered=result;key();assert.equal(assigned.pop(),'https://pt.pinterest.com/pin/456/');assert.equal(JSON.parse(storage.get('pw-pinterest-visual-search')).path,'/pin/456/');assert.equal(opened.length,0);
console.log('PASS: crop source excluded, related results enabled, regular pin restored, typing guard, crop exit, regional hovered-pin navigation.');
