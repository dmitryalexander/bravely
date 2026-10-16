const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const code=fs.readFileSync(require('node:path').join(__dirname, '../pinterest.js'),'utf8');
const saved=new Map();
function setup(path,withIcon=false){
 const handlers={},nodes=new Map(),assigned=[],timers=new Map();let hovered=null,icon=null,clicks=0,clock=1000,id=0;
 function node(){return {style:{},setAttribute(){},append(){},addEventListener(){},matches(){return false},contains(){return false},isConnected:true};}
 function addIcon(label='Search similar'){
  const button={click(){clicks++},getAttribute(){return null}};
  icon={getClientRects:()=>[{}],getAttribute:name=>name==='aria-label'?label:null,closest:selector=>selector==='.pw-ov'?null:button};
 }
 if(withIcon)addIcon();
 const document={createElement:node,body:{appendChild(el){if(el.id)nodes.set(el.id,el)}},documentElement:node(),getElementById:id=>nodes.get(id),querySelector:()=>null,querySelectorAll:()=>icon?[icon]:[],elementsFromPoint:()=>hovered?[hovered]:[],addEventListener:(n,f)=>handlers[n]=f};
 const ctx={document,location:{pathname:path,href:'https://www.pinterest.com'+path,origin:'https://www.pinterest.com',assign:u=>assigned.push(u)},window:{addEventListener(){},open(){throw Error('Must stay on Pinterest')}},sessionStorage:{getItem:k=>saved.get(k)||null,removeItem:k=>saved.delete(k),setItem:(k,v)=>saved.set(k,v)},MutationObserver:class{observe(){}},requestAnimationFrame:()=>1,setTimeout:(fn,ms)=>{timers.set(++id,{fn,time:clock+ms});return id},clearTimeout:i=>timers.delete(i),URL,Date:{now:()=>clock}};
 vm.runInNewContext(code,ctx);
 return {assigned,addIcon,get clicks(){return clicks},get notice(){return nodes.get('pw-search-notice')?.textContent},
  hover(pin){hovered={tagName:'IMG',src:'https://i.pinimg.com/736x/test.jpg',getAttribute:()=>null,getBoundingClientRect:()=>({left:0,top:0,right:500,bottom:600,width:500,height:600}),closest:s=>s==='a[href]'&&pin?{href:'https://www.pinterest.com/pin/'+pin+'/'}:null};},
  key(typing=false){handlers.keydown({ctrlKey:true,shiftKey:true,code:'KeyZ',composedPath:()=>[{isContentEditable:typing}],preventDefault(){},stopPropagation(){}})},
  tick(ms){clock+=ms;for(const [i,t]of [...timers])if(t.time<=clock){timers.delete(i);t.fn()}},
  navigate(path){ctx.location.pathname=path;}
 };
}
let page=setup('/pin/123/',true);page.hover('456');page.key();assert.equal(page.clicks,0);assert.equal(page.assigned[0],'https://www.pinterest.com/pin/456/');
page=setup('/pin/456/');assert.equal(page.clicks,0);page.addIcon();page.tick(250);assert.equal(page.clicks,1);assert.equal(saved.size,0);
page=setup('/search/pins/');page.hover('789');page.key();assert.equal(page.assigned[0],'https://www.pinterest.com/pin/789/');
page=setup('/pin/789/',true);assert.equal(page.clicks,1);
page=setup('/pin/123/',true);page.key(true);assert.equal(page.clicks,0);page.key();assert.equal(page.clicks,1);
page=setup('/pin/123/');page.key();page.navigate('/pin/999/');page.addIcon();page.tick(250);assert.equal(page.clicks,0);
page=setup('/pin/123/');page.key();page.tick(13000);assert.match(page.notice,/Could not find/);
page=setup('/pin/123/visual-search/');page.key();assert.equal(page.assigned[0],'/pin/123/');
page=setup('/pin/123/visual-search/');page.hover('456');page.key();assert.equal(page.assigned[0],'https://www.pinterest.com/pin/456/');
console.log('PASS: hovered related pin overrides current pin; search-grid navigation; delayed second step; semantic magnifier detection; typing guard; navigation cancellation; honest timeout; crop exit and related-result navigation.');
