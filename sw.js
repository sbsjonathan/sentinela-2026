/* One worker owns Sentinela's offline shell and included Bible. */
const PREFIX = 'sentinela-integrado-';
// Bump the shell version when application code changes. The large Bible cache is independent.
const SHELL_CACHE = PREFIX + 'shell-v3';
const BIBLE_CACHE = PREFIX + 'bible-v1';
const RUNTIME_CACHE = PREFIX + 'runtime-v1';
const OWN_CACHES = [SHELL_CACHE, BIBLE_CACHE, RUNTIME_CACHE];
const SCOPE = self.registration.scope;
const absolute = path => new URL(path, SCOPE).href;
const ASSET_URL = absolute('offline-assets.json');
const BUNDLE_URL = absolute('biblia/bundled/manifest.json');
const BUNDLE_ROOT = new URL('./', BUNDLE_URL).href;
const RECEIPT_URL = new URL('.offline-receipt-v1', BUNDLE_ROOT).href;
const VERIFIED = 'x-sentinela-sha256';
const VERIFIED_BYTES = 'x-sentinela-bytes';
let assetMemo, manifestMemo, bibleJob, fullJob, generation = 0;
const validResponse = r => r && r.ok && !r.redirected && r.status !== 206;
const errorMessage = e => e && e.message || 'Não foi possível preparar os arquivos offline.';
function reporter(event) {
  return payload => {
    const message = { ...payload, requestId: event.data.requestId };
    try { if (event.ports && event.ports[0]) event.ports[0].postMessage(message); } catch (_) {}
    try { if (event.source) event.source.postMessage(message); } catch (_) {}
  };
}
async function readManifest(url, cacheName, refresh = false) {
  const cache = await caches.open(cacheName);
  let response = await cache.match(url);
  if (!refresh && validResponse(response)) return {cache,response,data:await response.clone().json()};
  try {
    const fresh = await fetch(url, {cache:'reload'});
    if (!validResponse(fresh)) throw new Error('Pacote offline indisponível.');
    response = fresh;
  } catch (error) { if (!validResponse(response)) throw error; }
  return {cache,response,data:await response.clone().json()};
}
async function assetManifest(refresh = false) {
  if (assetMemo && !refresh) return assetMemo;
  const {cache,response,data} = await readManifest(ASSET_URL, SHELL_CACHE, refresh);
  if (!Array.isArray(data.shell) || !Array.isArray(data.app) || !data.shell.length) throw new Error('Lista offline inválida.');
  for (const path of [...data.shell,...data.app]) if (typeof path !== 'string' || !absolute(path).startsWith(SCOPE)) throw new Error('Caminho offline inválido.');
  await cache.put(ASSET_URL,response); assetMemo=data; return data;
}
function parseBundle(data) {
  const chunks = data && data.database && data.database.chunks;
  if (!Array.isArray(chunks) || !chunks.length || !Array.isArray(data.media) || !data.media.length) throw new Error('Pacote da Bíblia inválido.');
  const entries = [...chunks,...data.media].map(entry => {
    const url = new URL(entry.path,BUNDLE_ROOT).href;
    if (!url.startsWith(BUNDLE_ROOT) || !Number.isSafeInteger(entry.bytes) || entry.bytes<=0 || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error('Arquivo da Bíblia inválido.');
    return {...entry,url};
  });
  if (new Set(entries.map(e=>e.url)).size !== entries.length) throw new Error('Arquivos duplicados no pacote.');
  return {...data,entries,byURL:new Map(entries.map(e=>[e.url,e]))};
}
async function bundleManifest(network = false) {
  if (manifestMemo && !network) return manifestMemo;
  const {cache,response,data} = await readManifest(BUNDLE_URL,BIBLE_CACHE,network);
  const parsed=parseBundle(data); await cache.put(BUNDLE_URL,response); manifestMemo=parsed; return parsed;
}
async function sha256(bytes) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
}
async function verifyAndStore(cache,entry,response) {
  if (!validResponse(response)) throw new Error('Falha ao baixar '+entry.path);
  const bytes=await response.arrayBuffer();
  if (bytes.byteLength!==entry.bytes || await sha256(bytes)!==entry.sha256) throw new Error('Arquivo incompleto ou inválido: '+entry.path);
  const headers=new Headers(response.headers);
  headers.delete('content-encoding'); headers.delete('content-length');
  headers.set(VERIFIED,entry.sha256); headers.set(VERIFIED_BYTES,String(entry.bytes));
  const verified=new Response(bytes,{status:200,headers});
  await cache.put(entry.url,verified.clone()); return verified;
}
function verifiedHit(response,entry) {
  return validResponse(response) && response.headers.get(VERIFIED)===entry.sha256 && response.headers.get(VERIFIED_BYTES)===String(entry.bytes);
}
async function ensureBundleEntry(cache,entry,token) {
  if (token!==generation) throw new Error('Download cancelado.');
  const cached=await cache.match(entry.url);
  if (verifiedHit(cached,entry)) return;
  if (cached) { try { await verifyAndStore(cache,entry,cached); return; } catch (_) {} }
  let lastError;
  for (let attempt=0;attempt<2;attempt++) {
    if (token!==generation) throw new Error('Download cancelado.');
    try {
      const response=await fetch(entry.url,{cache:'reload'});
      if (token!==generation) throw new Error('Download cancelado.');
      await verifyAndStore(cache,entry,response); return;
    } catch (error) {lastError=error;}
  }
  throw lastError;
}
async function ensureStaticFiles(paths,progress=()=>{},token=generation,refresh=false) {
  const cache=await caches.open(SHELL_CACHE),failed=[],files=[...new Set(paths)];
  let loaded=0,cursor=0;
  async function worker(){
    while(cursor<files.length){
      if(token!==generation)throw new Error('Download cancelado.');
      const path=files[cursor++],url=absolute(path);
      try{
        let response=await cache.match(url);
        if(refresh||!validResponse(response)){
          response=await fetch(url,{cache:'reload'});
          if(!validResponse(response))throw new Error('Arquivo indisponível: '+path);
          if(token!==generation)throw new Error('Download cancelado.');
          await cache.put(url,response);
        }
        loaded++;
      }catch(_){failed.push(path);}
      progress({loaded,total:files.length,failed:failed.length});
    }
  }
  // Small shell files can download together; large Bible parts keep their two-request limit.
  await Promise.allSettled(Array.from({length:Math.min(4,files.length)},()=>worker()));
  if(token!==generation)throw new Error('Download cancelado.');
  if(failed.length)throw Object.assign(new Error('Alguns arquivos do aplicativo não foram baixados.'),{failed});
}
function prepareBible(send) {
  if (bibleJob) {bibleJob.listeners.add(send);if(bibleJob.last)send(bibleJob.last);return bibleJob.promise;}
  const job={listeners:new Set([send]),last:null},token=generation;
  const emit=payload=>{job.last=payload;for(const listener of job.listeners)listener(payload);};
  bibleJob=job;
  job.promise=(async()=>{
    const assets=await assetManifest(); await ensureStaticFiles(assets.shell,()=>{},token);
    // A missing auxiliary page must not label already saved Bible text as unsaved.
    try { await ensureStaticFiles(assets.app,()=>{},token); } catch(error) { if(token!==generation)throw error; }
    const manifest=await bundleManifest(),cache=await caches.open(BIBLE_CACHE),failed=[];
    let loaded=0,bytesLoaded=0,cursor=0;
    const total=manifest.entries.length,bytesTotal=manifest.entries.reduce((n,e)=>n+e.bytes,0);
    emit({type:'BIBLE_OFFLINE_PROGRESS',loaded,total,bytesLoaded,bytesTotal});
    async function worker(){
      while(cursor<total){
        const entry=manifest.entries[cursor++];
        try{await ensureBundleEntry(cache,entry,token);loaded++;bytesLoaded+=entry.bytes;}
        catch(error){if(token!==generation)throw error;failed.push(entry.path);}
        emit({type:'BIBLE_OFFLINE_PROGRESS',loaded,total,bytesLoaded,bytesTotal,failed:failed.length});
      }
    }
    // Two requests bound digest memory while downloading 8 MiB database parts on iPhone.
    await Promise.allSettled([worker(),worker()]);
    if(token!==generation)throw new Error('Download cancelado.');
    if(failed.length)throw Object.assign(new Error('Download incompleto. Conecte-se e tente novamente para continuar de onde parou.'),{failed});
    if(!(await getCacheStatus()).bibleComplete)throw new Error('Não foi possível confirmar todos os arquivos da Bíblia.');
    const result={type:'BIBLE_OFFLINE_COMPLETE',complete:true,loaded,total,bytesLoaded,bytesTotal};emit(result);return result;
  })().catch(error=>{emit({type:'BIBLE_OFFLINE_ERROR',complete:false,message:errorMessage(error),failed:error.failed||[]});throw error;})
  .finally(()=>{if(bibleJob===job)bibleJob=null;});
  return job.promise;
}
async function cachedStaticComplete(paths,cache){
  const keys = new Set((await cache.keys()).map(request=>request.url));
  return paths.every(path=>keys.has(absolute(path)));
}
async function manifestFingerprint(manifest) {
  return sha256(new TextEncoder().encode(manifest.entries.map(entry=>`${entry.url}|${entry.bytes}|${entry.sha256}`).join('\n')));
}
async function getCacheStatus({fast=false}={}){
  const names=await caches.keys(),hasCache=OWN_CACHES.some(name=>names.includes(name));
  const shellCache=await caches.open(SHELL_CACHE),bibleCache=await caches.open(BIBLE_CACHE);
  let assets,shellComplete=false,appComplete=false,loaded=0,total=0,bytesLoaded=0,bytesTotal=0;
  try{const response=await shellCache.match(ASSET_URL);assets=response&&await response.json();}catch(_){}
  if(assets&&Array.isArray(assets.app)&&Array.isArray(assets.shell)){
    const keys=new Set((await shellCache.keys()).map(request=>request.url));
    shellComplete=assets.shell.every(path=>keys.has(absolute(path)));
    appComplete=assets.app.every(path=>keys.has(absolute(path)));
  }
  try{
    const response=await bibleCache.match(BUNDLE_URL),manifest=response&&parseBundle(await response.json());
    if(manifest){
      total=manifest.entries.length;
      const fingerprint=await manifestFingerprint(manifest);
      let receipt;
      if(fast){try{const saved=await bibleCache.match(RECEIPT_URL);receipt=saved&&await saved.json();}catch(_){}}
      // The receipt is written only after inspecting verified headers for every file.
      // Cache.keys detects eviction or removal without reopening 731 response bodies.
      const trusted=fast&&receipt?.version===1&&receipt.fingerprint===fingerprint;
      const keys=trusted?new Set((await bibleCache.keys()).map(request=>request.url)):null;
      for(const entry of manifest.entries){
        bytesTotal+=entry.bytes;
        if(trusted?keys.has(entry.url):verifiedHit(await bibleCache.match(entry.url),entry)){loaded++;bytesLoaded+=entry.bytes;}
      }
      if(loaded===total&&!trusted)await bibleCache.put(RECEIPT_URL,new Response(JSON.stringify({version:1,fingerprint}),{headers:{'Content-Type':'application/json'}}));
    }
  }catch(_){}
  const bibleComplete=shellComplete&&total>0&&loaded===total;
  return {hasCache,complete:appComplete&&bibleComplete,appComplete,shellComplete,bibleComplete,loaded,total,bytesLoaded,bytesTotal};
}
function downloadApp(send){
  if(fullJob){fullJob.listeners.add(send);if(fullJob.last)send(fullJob.last);return fullJob.promise;}
  const job={listeners:new Set([send]),last:null},token=generation;
  const emit=payload=>{job.last=payload;for(const listener of job.listeners)listener(payload);};fullJob=job;
  job.promise=(async()=>{
    const assets=await assetManifest(true),manifest=await bundleManifest(true),total=assets.app.length+manifest.entries.length;
    await ensureStaticFiles(assets.app,p=>emit({type:'DOWNLOAD_PROGRESS',loaded:p.loaded,total,phase:'app'}),token);
    await prepareBible(p=>{if(p.type==='BIBLE_OFFLINE_PROGRESS')emit({...p,type:'DOWNLOAD_PROGRESS',loaded:assets.app.length+p.loaded,total,phase:'bible'});});
    if(token!==generation||!(await getCacheStatus()).complete)throw new Error('O aplicativo ainda não está completo para uso offline.');
    emit({type:'DOWNLOAD_COMPLETE',complete:true});
  })().catch(error=>{emit({type:'DOWNLOAD_ERROR',complete:false,message:errorMessage(error),failed:error.failed||[]});throw error;})
  .finally(()=>{if(fullJob===job)fullJob=null;});return job.promise;
}
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const assets=await assetManifest(true);
  // Finish the new, small application version before replacing the previous shell.
  // The 126 MB Bible cache and the user's IndexedDB library are never redownloaded here.
  await ensureStaticFiles(assets.app,()=>{},generation,true);await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  // Preserve artigo-offline-v1, imported publications, and unrelated apps' caches.
  for(const name of await caches.keys())if(name.startsWith(PREFIX)&&!OWN_CACHES.includes(name))await caches.delete(name);
  await self.clients.claim();
})()));
self.addEventListener('message',event=>{
  if(!event.data||!event.data.action)return;
  const send=reporter(event),action=event.data.action;
  if(action==='PREPARE_BIBLE_OFFLINE')event.waitUntil(prepareBible(send).catch(()=>{}));
  else if(action==='START_DOWNLOAD')event.waitUntil(downloadApp(send).catch(()=>{}));
  else if(action==='CACHE_STATUS')event.waitUntil(getCacheStatus({fast:event.data.fast===true}).then(status=>send({type:'CACHE_STATUS',...status})).catch(error=>send({type:'CACHE_STATUS',complete:false,bibleComplete:false,message:errorMessage(error)})));
  else if(action==='CLEAR_CACHE')event.waitUntil((async()=>{
    generation++;await Promise.allSettled([bibleJob&&bibleJob.promise,fullJob&&fullJob.promise].filter(Boolean));
    for(const name of await caches.keys())if(name.startsWith(PREFIX))await caches.delete(name);
    assetMemo=undefined;manifestMemo=undefined;send({type:'CACHE_CLEARED'});
  })());
});
async function serveBundle(request){
  const url=new URL(request.url);url.search='';const cache=await caches.open(BIBLE_CACHE);
  if(url.href===BUNDLE_URL){const saved=await cache.match(BUNDLE_URL);if(validResponse(saved))return saved;try{await bundleManifest();}catch(_){}return await cache.match(BUNDLE_URL)||new Response('Bíblia indisponível offline.',{status:503});}
  let manifest;try{manifest=await bundleManifest();}catch(_){}
  const entry=manifest&&manifest.byURL.get(url.href),cached=await cache.match(url.href);
  if(entry&&verifiedHit(cached,entry))return cached;
  try{const response=await fetch(request);return entry?await verifyAndStore(cache,entry,response):response;}
  catch(_){return new Response('Este arquivo ainda não está disponível offline.',{status:503});}
}
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||!url.protocol.startsWith('http')||request.headers.has('range'))return;
  if(url.hostname.endsWith('supabase.co')||url.hostname.endsWith('workers.dev'))return;
  // Do not cache streamed audio/video. Packaged illustrations are handled below.
  if(/\.(?:mp3|mp4|m4a|m3u8)$/i.test(url.pathname))return;
  if(url.href.startsWith(BUNDLE_ROOT)){event.respondWith(serveBundle(request));return;}
  event.respondWith((async()=>{
    const local=url.href.startsWith(SCOPE),canonical=new URL(url.href);canonical.search='';
    if(local&&canonical.pathname.endsWith('/'))canonical.pathname+='index.html';
    const fallback=async()=>{
      const shell=await caches.open(SHELL_CACHE),runtime=await caches.open(RUNTIME_CACHE);
      if(local)return await shell.match(canonical.href)||await shell.match(request)||await runtime.match(request)||await runtime.match(canonical.href);
      return await runtime.match(request);
    };
    // Static application files are immutable for this shell version. Read locally
    // first, even when the network is connected but slow or unresponsive.
    if(local){const cached=await(await caches.open(SHELL_CACHE)).match(canonical.href);if(validResponse(cached))return cached;}
    try{
      const response=await fetch(request);
      if(!response.ok&&response.type!=='opaque')return await fallback()||response;
      if(!response.redirected&&response.status!==206){
        try{await(await caches.open(RUNTIME_CACHE)).put(request,response.clone());}catch(_){}
        if(local&&assetMemo&&[...assetMemo.shell,...assetMemo.app].some(path=>absolute(path)===canonical.href)){
          try{await(await caches.open(SHELL_CACHE)).put(canonical.href,response.clone());}catch(_){}
        }
      }
      return response;
    }catch(_){return await fallback()||new Response('Conecte-se para carregar este conteúdo.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});}
  })());
});
