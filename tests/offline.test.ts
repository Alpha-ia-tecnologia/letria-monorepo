import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
type WorkerTestEvent={
 request?:Pick<Request,'url'|'method'|'headers'>&Partial<Pick<Request,'mode'|'destination'>>;
 source?:{url:string};data?:{type:string;urls?:string[]};
 ports?:{postMessage:(result:{ok:boolean})=>void}[];
 waitUntil?:(promise:Promise<void>)=>void;respondWith?:(response:Promise<Response>)=>void;
};
function harness(offline=false){
 const listeners:Record<string,(event:WorkerTestEvent)=>void>={},storage=new Map<string,Response>(),downloads:string[]=[];
 const key=(value:string|Request)=>new URL(typeof value==='string'?value:value.url,'https://letria.test').href;
 const cache={put:async(k:string|Request,v:Response)=>{storage.set(key(k),v);},match:async(k:string|Request)=>storage.get(key(k)),addAll:async(urls:string[])=>{for(const url of urls)storage.set(key(url),new Response('cached'));}};
 const self={location:{origin:'https://letria.test'},addEventListener:(name:string,fn:(event:WorkerTestEvent)=>void)=>{listeners[name]=fn;},clients:{claim:async()=>{}},skipWaiting:async()=>{}};
 const caches={open:async()=>cache,match:async(req:string|Request)=>storage.get(key(req)),keys:async()=>['letria-public-v1'],delete:async()=>true};
 const fetch=async(input:string|Request)=>{if(offline)throw new Error('offline');const url=key(input),path=new URL(url).pathname;downloads.push(url);const type=path==='/'||path.endsWith('.html')?'text/html':path.endsWith('.css')?'text/css':path.endsWith('.png')?'image/png':path.endsWith('.webmanifest')?'application/manifest+json':path.endsWith('.woff2')?'font/woff2':'application/javascript';const body=path==='/'?'<script src="/assets/app.js"></script>':path.endsWith('.css')?'@font-face{src:url("/fonts/test.woff2")}':'asset';return new Response(body,{headers:{'Content-Type':type}});};
 vm.runInNewContext(source,{self,caches,fetch,URL,Response,Set,Map,Promise,AbortController,setTimeout,clearTimeout});
 return {listeners,storage,downloads};
}
test('RF-110/RN-010: service worker nunca armazena API privada ou gravações',()=>{
 const h=harness();for(const path of ['/api/platform','/api/audio?id=secret','/signin-with-chatgpt']){let intercepted=false;h.listeners.fetch({request:{url:'https://letria.test'+path,method:'GET',destination:'audio',headers:new Headers()},respondWith:()=>{intercepted=true;}});assert.equal(intercepted,false);}
});
test('RF-110: navegação offline recupera shell sem inventar dados',async()=>{
 const h=harness(true);h.storage.set('https://letria.test/',new Response('Letria offline'));let response:Promise<Response>|undefined;
 h.listeners.fetch({request:{url:'https://letria.test/',method:'GET',mode:'navigate',headers:new Headers()},respondWith:(r:Promise<Response>)=>{response=r;}});assert.equal(await(await response!).text(),'Letria offline');
});
test('RF-112: download explícito inclui dependências de scripts e fontes',async()=>{
 const h=harness();let task:Promise<void>|undefined;let result:{ok:boolean}|undefined;
 h.listeners.message({source:{url:'https://letria.test/'},data:{type:'DOWNLOAD',urls:['/assets/app.css']},ports:[{postMessage:(r:{ok:boolean})=>{result=r;}}],waitUntil:(p:Promise<void>)=>{task=p;}});
 await task;assert.equal(result?.ok,true);assert.ok(h.downloads.includes('https://letria.test/fonts/test.woff2'));assert.ok(h.downloads.includes('https://letria.test/assets/app.js'));
});
test('RF-112: arquivos privados ou download incompleto retornam falha',async()=>{
 for(const offline of [false,true]){const h=harness(offline);let task:Promise<void>|undefined;let result:{ok:boolean}|undefined;
 h.listeners.message({source:{url:'https://letria.test/'},data:{type:'DOWNLOAD',urls:offline?['/assets/app.css']:['/api/platform']},ports:[{postMessage:(r:{ok:boolean})=>{result=r;}}],waitUntil:(p:Promise<void>)=>{task=p;}});await task;assert.equal(result?.ok,false);}
});
