import {test} from 'node:test';
import assert from 'node:assert/strict';

import {createInterfaces,createComponents,createRuntime} from '../server/easel/modules/runtime.mjs';

class Element {
  children=[];
  parent=null;
  append(node){node.remove();this.children.push(node);node.parent=this;}
  remove(){if(this.parent){this.parent.children.splice(this.parent.children.indexOf(this),1);this.parent=null;}}
  contains(node){return this.children.some(c=>c===node||c.contains(node));}
  replaceChildren(){for(const child of [...this.children])child.remove();}
}
globalThis.Element=Element;
const definition={kind:'component',properties:{text:{type:'String',default:''}},events:{pressed:{payload:{}}},slots:{content:{}}};
function fixture(){
  const registry=createInterfaces(),instances=[];
  class Component {
    constructor(){this.element=new Element();this.slots={content:this.element};this.mounts=0;this.unmounts=0;this.disposed=false;instances.push(this);}
    update(props){this.props=props;}
    mount(){this.mounts++;}
    unmount(){this.unmounts++;}
    destroy(){this.disposed=true;}
  }
  registry.define('easel.test.panel@1',definition);
  registry.enter({host:'easel.test',implements:['easel.test.panel@1']});
  registry.api.register('easel.test','easel.test.panel@1',Component);
  registry.leave();
  const root=new Element();const manager=createComponents(registry,root);
  return {registry,instances,Component,root,manager,api:manager.api};
}

test('interface selection prefers declaring host, supports explicit host and exact versions',()=>{
  const r=createInterfaces();
  class Alternate{}class Original{}
  r.enter({host:'easel.alternate',implements:['easel.test.panel@1']});r.api.register('easel.alternate','easel.test.panel@1',Alternate);
  r.enter({host:'easel.test',implements:['easel.test.panel@1']});r.api.register('easel.test','easel.test.panel@1',Original);
  assert.ok(r.api.create('easel.test.panel@1') instanceof Original);
  assert.ok(r.api.create('easel.test.panel@1','easel.alternate') instanceof Alternate);
  assert.deepEqual(r.api.list('easel.test.panel').map(i=>i.host),['easel.test','easel.alternate']);
  assert.equal(r.api.supports('easel.test.panel@2'),0);
  assert.throws(()=>r.api.create('easel.test.panel'));
  assert.throws(()=>r.api.register('easel.test','easel.test.panel@1',Original),/Duplicate/);
  assert.throws(()=>r.api.register('easel.other','easel.test.panel@1',Original),/Unauthorized/);
  assert.throws(()=>r.api.register('easel.test','easel.test.missing@1',Original),/Unauthorized/);
  r.close([]);assert.throws(()=>r.api.register('easel.test','easel.test.panel@1',Original),/Unauthorized/);
});

test('missing promised implementations and conflicting definitions fail startup',()=>{
  const r=createInterfaces();r.define('easel.test.panel@1',definition);
  assert.throws(()=>r.define('easel.test.panel@1',{...definition,slots:{}}),/Conflicting/);
  assert.throws(()=>r.close([{id:'easel.test.kit',host:'easel.test',libraryEntry:'lib.mjs',implements:['easel.test.panel@1']}]),/missing interface/);
});

test('component moves preserve identity, subtree, properties/props, and local listeners',()=>{
  const {api,instances,root}=fixture();
  const a=api.create('easel.test.panel@1',{id:'a'}),b=api.create('easel.test.panel@1',{id:'b'}),child=api.create('easel.test.panel@1',{id:'child',props:{text:'hello'}});
  api.mountRoot(a);b.attach(a,'content');child.attach(a,'content');
  const original=instances[2];let pressed=0;child.on('pressed',()=>pressed++);
  child.attach(b,'content');assert.equal(instances[2],original);assert.equal(child.parent,b);assert.equal(child.id,'child');assert.equal(child.props.text,'hello');assert.equal(child.properties.text,'hello');
  original.onEvent('pressed',{});assert.equal(pressed,1);
  child.detach();assert.equal(child.parent,null);assert.equal(api.get('child'),child);assert.equal(original.disposed,false);
  child.attach(b,'content');child.setProperties({text:'updated'});assert.equal(original.props.text,'updated');
  child.setProps({text:'updated-props'});assert.equal(original.props.text,'updated-props');assert.equal(child.properties.text,'updated-props');
  assert.throws(()=>child.setProperties({text:3}),/expected String/);assert.equal(child.props.text,'updated-props');
  assert.throws(()=>a.attach(child,'content'),/cycle/);assert.throws(()=>child.attach(b,'missing'),/slot/);
  assert.throws(()=>api.create('easel.test.panel@1',{id:'child'}),/Duplicate/);
  a.destroy();assert.equal(root.children.length,0);assert.equal(api.get('child'),null);assert.ok(instances.every(i=>i.disposed));assert.throws(()=>child.setProps({text:'dead'}),/Invalid/);
});

test('detached parent retains its children and mounting initializes complete subtree',()=>{
  const {api,instances}=fixture();const p=api.create('easel.test.panel@1'),c=api.create('easel.test.panel@1');c.attach(p,'content');
  assert.equal(instances[1].mounts,0);api.mountRoot(p);assert.equal(instances[1].mounts,1);
  p.detach();assert.equal(c.parent,p);assert.equal(instances[1].unmounts,1);api.mountRoot(p);assert.equal(instances[1].mounts,2);
});

test('runtime cleanup disposes a parent and descendants exactly once',()=>{
  const {api,manager,instances,root}=fixture();const p=api.create('easel.test.panel@1'),c=api.create('easel.test.panel@1');c.attach(p,'content');api.mountRoot(p);
  assert.doesNotThrow(()=>manager.destroy());assert.ok(instances.every(i=>i.disposed));assert.equal(root.children.length,0);
  assert.doesNotThrow(()=>manager.destroy());
});

test('the game mounts inside the existing shell and disconnect preserves the shell',()=>{
  const {api,manager}=fixture();
  const shell=api.create('easel.test.panel@1',{id:'shell'}),session=api.create('easel.test.panel@1',{id:'session'});
  session.attach(shell,'content');api.mountRoot(shell);
  manager.setApplicationMount(session,'content');
  assert.equal(manager.hasRoot(),false);
  const app=api.create('easel.test.panel@1',{id:'app'}),child=api.create('easel.test.panel@1',{id:'child'});
  child.attach(app,'content');api.mountRoot(app);
  assert.equal(app.parent,session);assert.equal(manager.hasRoot(),true);
  manager.destroyApplication();
  assert.equal(api.get('app'),null);assert.equal(api.get('child'),null);
  assert.equal(api.get('shell'),shell);assert.equal(api.get('session'),session);
  assert.equal(session.parent,shell);assert.equal(manager.hasRoot(),false);
});

test('UI event validation rejects undeclared events and invalid payloads',()=>{
  const {api,instances}=fixture();const p=api.create('easel.test.panel@1');let count=0;const off=p.on('pressed',()=>count++);
  instances[0].onEvent('pressed',{});off();instances[0].onEvent('pressed',{});assert.equal(count,1);
  assert.throws(()=>instances[0].onEvent('pressed',{extra:true}),/undeclared/);assert.throws(()=>instances[0].onEvent('missing',{}),/Undeclared/);
});

test('a rejected handshake closes the connection and rejects startup',async()=>{
  const registry=fixture();
  class FakeSocket {
    readyState=1;
    constructor(){globalThis.lastSocket=this;queueMicrotask(()=>this.onopen());}
    close(){this.readyState=3;}
    send(data){const f=JSON.parse(data);if(f.type==='hello')queueMicrotask(()=>this.onmessage({data:JSON.stringify({type:'error',replyTo:f.id,code:'client.unsupported',message:'Unsupported client'})}));}
  }
  globalThis.WebSocket=FakeSocket;
  const runtime=createRuntime(registry.root);
  await assert.rejects(runtime.connect('ws://localhost'),/Unsupported client/);await runtime.closed;
  assert.equal(lastSocket.readyState,3);
});

test('bootstrap subscribes once per event, forwards receipts, and rejects pending work on disconnect',async()=>{
  const moduleSource="export function initialize(){class Panel{constructor(){this.element=new Element();this.slots={content:this.element};}update(){}destroy(){}}Easel.Interfaces.register('easel.test','easel.test.panel@1',Panel);}";
  const appSource="export function initialize(){Easel.Components.mountRoot(Easel.Components.create('easel.test.panel@1'));globalThis.deliveries=0;globalThis.offFirst=Application.events.on('changed',()=>globalThis.deliveries++);globalThis.offSecond=Application.events.on('changed',()=>globalThis.deliveries++);}";
  const uri=text=>'data:text/javascript;base64,'+Buffer.from(text).toString('base64');
  const pkg={id:'easel.test.app',host:'easel.test',interfaces:[{name:'easel.test.panel@1',url:'/panel.json'}],implements:['easel.test.panel@1'],libraryEntry:uri(moduleSource),applicationEntry:uri(appSource)};
  const plan={protocol:{major:1,minor:0},client:'http',packages:[pkg],libraryOrder:['easel.test.app'],applicationOrder:['easel.test.app']};
  const sent=[];
  class Socket {
    readyState=1;
    constructor(){globalThis.lastSocket=this;queueMicrotask(()=>this.onopen());}
    close(){this.readyState=3;}
    receive(f){this.onmessage({data:JSON.stringify(f)});}
    send(data){const f=JSON.parse(data);sent.push(f);let response;
      if(f.type==='hello')response={type:'welcome',replyTo:f.id,...plan};
      if(f.type==='subscribe'||f.type==='unsubscribe')response={type:'subscription.ack',replyTo:f.id,accepted:f.names,rejected:[]};
      if(f.type==='ready')response={type:'ready.ok',replyTo:f.id};
      if(f.type==='event'&&f.name==='acknowledged')response={type:'event.ack',replyTo:f.id};
      if(response)queueMicrotask(()=>this.receive(response));
    }
  }
  globalThis.fetch=async()=>({ok:true,json:async()=>definition});globalThis.WebSocket=Socket;
  const runtime=createRuntime(new Element());await runtime.connect('ws://localhost');
  assert.equal(sent.filter(f=>f.type==='subscribe').length,1);
  assert.ok(sent.findIndex(f=>f.type==='subscribe')<sent.findIndex(f=>f.type==='ready'));
  lastSocket.receive({type:'event',name:'changed',payload:{}});assert.equal(globalThis.deliveries,2);
  assert.equal(sent.filter(f=>f.type==='event').length,0);
  await Application.events.emit('acknowledged',{});
  offFirst();await new Promise(resolve=>setImmediate(resolve));assert.equal(sent.filter(f=>f.type==='unsubscribe').length,0);
  offSecond();await new Promise(resolve=>setImmediate(resolve));assert.equal(sent.filter(f=>f.type==='unsubscribe').length,1);
  const pending=Application.events.emit('pending',{});const rejected=assert.rejects(pending,/Disconnected/);runtime.destroy();await rejected;await runtime.closed;
  assert.equal(sent.filter(f=>f.type==='event'&&f.name==='pending').length,1);
});

test('the server can move a connection between levels and leave returns it',async()=>{
  const library="export function initialize(){class Panel{constructor(){this.element=new Element();this.slots={content:this.element};}update(){}destroy(){}}Easel.Interfaces.register('easel.test','easel.test.panel@1',Panel);}";
  const app=name=>"export function initialize(){Easel.Components.mountRoot(Easel.Components.create('easel.test.panel@1',{id:'"+name+"'}));Application.events.on('changed',()=>{});}";
  const uri=text=>'data:text/javascript;base64,'+Buffer.from(text).toString('base64');
  const plan=(name,game)=>({protocol:{major:1,minor:0},client:'http',...(game?{game}:{}),packages:[{id:'easel.test.app',host:'easel.test',interfaces:[{name:'easel.test.panel@1',url:'/panel.json'}],implements:['easel.test.panel@1'],libraryEntry:uri(library),applicationEntry:uri(app(name))}],libraryOrder:['easel.test.app'],applicationOrder:['easel.test.app']});
  const sent=[],levels=[];
  class Socket {
    readyState=1;
    constructor(){globalThis.lastSocket=this;queueMicrotask(()=>this.onopen());}
    close(){this.readyState=3;}
    receive(f){this.onmessage({data:JSON.stringify(f)});}
    send(data){const f=JSON.parse(data);sent.push(f);let response;
      if(f.type==='hello')response={type:'welcome',replyTo:f.id,...plan('lobby')};
      if(f.type==='leave')response={type:'welcome',replyTo:f.id,...plan('lobby')};
      if(f.type==='subscribe'||f.type==='unsubscribe')response={type:'subscription.ack',replyTo:f.id,accepted:f.names,rejected:[]};
      if(f.type==='ready')response={type:'ready.ok',replyTo:f.id};
      if(response)queueMicrotask(()=>this.receive(response));
    }
  }
  globalThis.fetch=async()=>({ok:true,json:async()=>definition});globalThis.WebSocket=Socket;
  const root=new Element();
  const runtime=createRuntime(root,()=>{},{onLevel:({game})=>levels.push(game)});
  await runtime.connect('ws://localhost');
  assert.deepEqual(levels,[null]);
  lastSocket.receive({type:'welcome',...plan('table','g1')});
  while(levels.length<2)await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(levels,[null,'g1']);
  await runtime.leave();
  assert.deepEqual(levels,[null,'g1',null]);
  assert.equal(sent.filter(f=>f.type==='ready').length,3);
  assert.equal(sent.filter(f=>f.type==='subscribe').length,3);
  assert.equal(root.children.length,1);
  runtime.destroy();await runtime.closed;
});


test('owner namespaces distinguish hosts and prefer the declaring implementation',()=>{
  const r=createInterfaces();
  class Original{} class Alternate{}
  r.define('alice.cards.surface@1',definition);
  r.enter({host:'bob.cards',implements:['alice.cards.surface@1']});
  r.api.register('bob.cards','alice.cards.surface@1',Alternate);
  r.enter({host:'alice.cards',implements:['alice.cards.surface@1']});
  r.api.register('alice.cards','alice.cards.surface@1',Original);
  assert.ok(r.api.create('alice.cards.surface@1') instanceof Original);
  assert.ok(r.api.create('alice.cards.surface@1','bob.cards') instanceof Alternate);
  assert.deepEqual(r.api.list('alice.cards.surface@1').map(i=>i.host),['alice.cards','bob.cards']);
  for(const name of ['cards.surface@1','alice.cards.extra.surface@1','alice..surface@1'])
    assert.throws(()=>r.api.create(name),/Exact interface version required/);
});

test('lazy implementations load once on demand and report when they are not loaded',async()=>{
  const r=createInterfaces();let imports=0;
  class Lazy{}
  r.loader(async()=>{imports++;await new Promise(resolve=>setImmediate(resolve));return {default:Lazy};});
  r.define('easel.test.panel@1',definition);r.lazy('easel.test.panel@1','easel.test','/panel.mjs');
  assert.equal(r.api.supports('easel.test.panel@1'),1);
  assert.throws(()=>r.api.create('easel.test.panel@1'),/not loaded; require it or await Easel\.Interfaces\.load/);
  assert.throws(()=>r.api.list('easel.test.panel@1')[0].obj,/not loaded/);
  r.enter({host:'easel.test',implements:[]});assert.throws(()=>r.api.register('easel.test','easel.test.panel@1',Lazy),/Unauthorized/);r.leave();
  await Promise.all([r.api.load('easel.test.panel@1'),r.api.load('easel.test.panel@1')]);
  assert.equal(imports,1);assert.ok(r.api.create('easel.test.panel@1') instanceof Lazy);assert.equal(r.api.list('easel.test.panel@1')[0].obj,Lazy);
  await r.api.load('easel.test.panel@1');assert.equal(imports,1);
  await assert.rejects(r.api.load('easel.test.missing@1'),/Missing implementation/);
  assert.throws(()=>r.lazy('easel.test.panel@1','easel.test','/again.mjs'),/Duplicate/);
});

test('a failed lazy import reports the interface and can be retried',async()=>{
  const r=createInterfaces();let attempt=0;class Lazy{}
  r.loader(async()=>++attempt===1?{default:()=>{}}:{default:Lazy});
  r.lazy('easel.test.panel@1','easel.test','/panel.mjs');
  await assert.rejects(r.api.load('easel.test.panel@1'),/easel\.test\.panel@1 from easel\.test: default export must be a class/);
  await r.api.load('easel.test.panel@1');assert.ok(r.api.create('easel.test.panel@1') instanceof Lazy);
});

test('bootstrap preloads required lazy components and leaves the rest unloaded',async()=>{
  const uri=text=>'data:text/javascript;base64,'+Buffer.from(text).toString('base64');
  const panel="export function initialize({Easel}){globalThis.panelEasel=Easel;}export default class Panel{constructor(){this.element=new Element();this.slots={content:this.element};}update(){}destroy(){}}";
  const extra="globalThis.extraImported=true;export default class Extra{constructor(){this.element=new Element();this.slots={content:this.element};}update(){}destroy(){}}";
  const app="export function initialize(){Easel.Components.mountRoot(Easel.Components.create('easel.test.panel@1'));}";
  const pkg={id:'easel.test.kit',host:'easel.test',interfaces:[{name:'easel.test.panel@1',url:'/panel.json',implementation:uri(panel)},{name:'easel.test.extra@1',url:'/extra.json',implementation:uri(extra)}],implements:[],applicationEntry:uri(app),applicationRequires:['easel.test.panel@1']};
  const plan={protocol:{major:1,minor:0},client:'http',packages:[pkg],libraryOrder:[],applicationOrder:['easel.test.kit']};
  class Socket {
    readyState=1;
    constructor(){globalThis.lastSocket=this;queueMicrotask(()=>this.onopen());}
    close(){this.readyState=3;}
    send(data){const f=JSON.parse(data);let response;
      if(f.type==='hello')response={type:'welcome',replyTo:f.id,...plan};
      if(f.type==='ready')response={type:'ready.ok',replyTo:f.id};
      if(response)queueMicrotask(()=>this.onmessage({data:JSON.stringify(response)}));
    }
  }
  globalThis.fetch=async()=>({ok:true,json:async()=>definition});globalThis.WebSocket=Socket;globalThis.extraImported=false;
  const runtime=createRuntime(new Element());await runtime.connect('ws://localhost');
  assert.equal(globalThis.panelEasel,Easel);assert.equal(globalThis.extraImported,false);
  assert.throws(()=>Easel.Components.create('easel.test.extra@1'),/not loaded/);
  await Easel.Interfaces.load('easel.test.extra@1');assert.equal(globalThis.extraImported,true);
  assert.ok(Easel.Components.create('easel.test.extra@1'));
  runtime.destroy();await runtime.closed;
});

test('a lazy member loads its required interfaces before its own file',async()=>{
  const r=createInterfaces(),order=[];class Base{}class Uses{}
  r.loader(async(url)=>{order.push(url);return {default:url==='/base.mjs'?Base:Uses};});
  r.lazy('easel.test.base@1','easel.test','/base.mjs');
  r.lazy('easel.test.uses@1','easel.test','/uses.mjs',['easel.test.base@1']);
  await r.api.load('easel.test.uses@1');
  assert.deepEqual(order,['/base.mjs','/uses.mjs']);assert.ok(r.api.create('easel.test.base@1') instanceof Base);
  const c=createInterfaces();c.loader(async(url)=>({default:url==='/a.mjs'?class A{}:class B{}}));
  c.lazy('easel.test.a@1','easel.test','/a.mjs',['easel.test.b@1']);c.lazy('easel.test.b@1','easel.test','/b.mjs',['easel.test.a@1']);
  await c.api.load('easel.test.a@1');assert.ok(c.api.create('easel.test.b@1'));
});
