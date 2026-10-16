const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const code = fs.readFileSync(require('node:path').join(__dirname, '../pinterest-pin.js'), 'utf8');
function scenario({signedIn = true, host = 'in.pinterest.com', mediaWidth = 456, count = 8, pin = true} = {}) {
  const attrs = new Set(), vars = new Map(), queue = [], observers = [];
  let enabled = true, updates = 0, resets = 0;
  const root = {classList: {contains: () => enabled}, hasAttribute: k => attrs.has(k), setAttribute: k => attrs.add(k), removeAttribute: k => attrs.delete(k), style: {getPropertyValue: k => vars.get(k), setProperty: (k,v) => vars.set(k,v), removeProperty: k => vars.delete(k)}};
  const media = {getBoundingClientRect: () => ({width: vars.has('--pw-solo-w') ? parseFloat(vars.get('--pw-solo-w')) : mediaWidth})};
  const closeup = {querySelector: s => s === '[data-test-id="closeup-media-container"]' ? (signedIn ? media : null) : null, closest: () => item, getBoundingClientRect: () => ({height: 800})};
  const inner = {getBoundingClientRect: () => ({width: item.getBoundingClientRect().width + 12, height: 788})};
  const item = {style: {width:'936px'}, firstElementChild: inner, getBoundingClientRect: () => ({width: parseFloat(item.style.width), top:176})};
  const related = Array.from({length:count}, (_, i) => ({hasAttribute: () => true, getBoundingClientRect: () => ({width:222,left:i*238})}));
  item.parentElement = {children:[item,...related], style:{width:`${count*238-16}px`}, getBoundingClientRect: () => ({width:count*238-16})};
  class Wall {render() {} forceUpdate() {updates++; item.style.width = `${this.props.getColumnSpanConfig(this.props.items[0])*238-16}px`;} reflow() {updates++;}}
  const wall = new Wall();
  wall.props = {items:[{type:'closeup_module'}, {type:'pin'}], getColumnSpanConfig: () => Math.min(4,count)};
  wall.state = {measurementStore:new Map()}; wall.positionStore = {reset: () => resets++};
  item.__reactFiber$test = {stateNode:wall};
  const context = {document:{documentElement:root, querySelector: s => pin && s.includes(signedIn ? 'closeup-body-style' : 'CloseupMainPin') ? closeup : null, addEventListener(){}}, location:{pathname:'/pin/416442296820817115/',hostname:host}, innerWidth:1917,innerHeight:1075,scrollY:0, MutationObserver:class {constructor(cb) {observers.push(cb)} observe(){}},addEventListener(){},queueMicrotask: cb=>queue.push(cb),setTimeout:()=>1};
  vm.runInNewContext(code,context);
  const flush = () => {let n=0; while(queue.length) {assert.ok(++n < 10,'must settle'); queue.shift()();}};
  flush();
  const notify = () => {observers.forEach(cb=>cb()); flush();};
  return {attrs,vars,wall,notify,context,get updates(){return updates},get resets(){return resets},disable(){enabled=false;notify()},enable(){enabled=true;notify()}};
}
for(const host of ['in.pinterest.com','www.pinterest.com','uk.pinterest.com']) {
  const s=scenario({host});
  assert.ok(s.attrs.has('data-pw-solo'));
  assert.equal(s.wall.props.getColumnSpanConfig(s.wall.props.items[0]),2);
  assert.equal(s.wall.props.getColumnSpanConfig(s.wall.props.items[1]),4);
  assert.equal(s.vars.get('--pw-solo-w'),'472.0px');
  s.notify(); const updates=s.updates; s.notify();
  assert.equal(s.updates,updates,'remeasurement must settle without growing the pin');
  s.disable(); assert.ok(!s.attrs.has('data-pw-solo')); assert.equal(s.vars.size,0);
  assert.equal(s.wall.props.getColumnSpanConfig(s.wall.props.items[0]),4);
}
const old=scenario({signedIn:false}); assert.equal(old.wall.props.getColumnSpanConfig(old.wall.props.items[0]),2);
const small=scenario({count:1,mediaWidth:220}); assert.equal(small.wall.props.getColumnSpanConfig(small.wall.props.items[0]),1);
const nav=scenario(); nav.context.location.pathname='/search/pins/'; nav.notify(); assert.equal(nav.vars.size,0); assert.ok(!nav.attrs.has('data-pw-solo'));
const manifest=JSON.parse(fs.readFileSync(require('node:path').join(__dirname, '../manifest.json'),'utf8')); assert.match(manifest.version,/^\d+\.\d+\.\d+$/);
assert.ok(manifest.content_scripts.find(s=>s.js.includes('pinterest-pin.js')).matches.includes('https://*.pinterest.com/*'));
console.log('PASS: signed-in and legacy layouts, regional hosts, stable remeasurement, one-column screen, toggle-off cleanup, navigation cleanup, manifest.');
