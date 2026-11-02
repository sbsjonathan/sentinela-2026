'use strict';
// Whole-verse actions use publication text, so notes and reference labels never leak into a copy.
function initTextActions({root,getChapter,getName,onListen,onBookmark,onStudy,onNotice}) {
  if(!root || typeof getChapter!=='function')throw new Error('O menu precisa do texto do capítulo.');
  const icons={
    study:'<path d="M3 4c4-1 6 0 9 1 3-1 5-2 9-1v15c-4-1-6 0-9 1-3-1-5-2-9-1Z"/><path d="M12 5v15M6 9h3M15 9h3M6 13h3M15 13h3"/>',
    bookmark:'<path d="M6 2h12v20l-6-5-6 5Z"/>',
    share:'<path d="M4 19c1-7 5-10 12-10V4l6 8-6 7v-5c-6 0-9 1-12 5Z"/>',
    copy:'<path d="M8 6H3v16h13v-5M8 2h9l4 4v11H8Z"/><path d="M17 2v5h4"/>',
    listen:'<path d="M3 14v-3a9 9 0 0 1 18 0v3M3 12h4v9H3zM17 12h4v9h-4z"/>',
    clear:'<path d="m6 6 12 12M18 6 6 18"/>'
  };
  const toolbar=document.createElement('div');toolbar.id='text-actions';toolbar.className='text-actions';toolbar.hidden=true;
  toolbar.setAttribute('role','toolbar');toolbar.setAttribute('aria-label','Opções do texto selecionado');
  const buttons={},labels={study:'Notas de estudo',bookmark:'Marcar passagem',share:'Compartilhar',copy:'Copiar',listen:'Ouvir áudio',clear:'Fechar opções'};
  for(const name of ['study','bookmark','share','copy','listen','clear']) {
    const b=document.createElement('button');b.type='button';b.id='action-'+name;b.setAttribute('aria-label',labels[name]);b.title=labels[name];
    b.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true">'+icons[name]+'</svg>';buttons[name]=b;toolbar.append(b);
  }
  document.body.append(toolbar);
  const events=new AbortController(),signal=events.signal;
  let selected=[],anchorVerse=null,anchorElement=null,anchorOffset=0,chapterKey='',frame=0;
  let gesture=null,holdTimer=0,suppressUntil=0;
  const nativeControl='.note-marker,.study-word,a,.inline-reference';
  const tell=(message,error=false)=>{if(typeof onNotice==='function')onNotice(message,error);};
  const numericVerse=e=>{const value=Number(e?.dataset.verse);return Number.isInteger(value)&&value>0?value:null;};
  const chapterId=data=>data?`${data.book}:${data.chapter}`:'';
  function hasNativeSelection() {
    const value=window.getSelection();if(!value || value.isCollapsed || !value.rangeCount)return false;
    for(let i=0;i<value.rangeCount;i++)if(value.getRangeAt(i).intersectsNode(root))return true;
    return false;
  }
  function clear() {
    selected=[];anchorVerse=null;anchorElement=null;chapterKey='';toolbar.hidden=true;
    root.classList.remove('has-text-selection');root.removeAttribute('data-selected-reference');
    root.querySelectorAll('.text-selected,.text-unselected').forEach(e=>e.classList.remove('text-selected','text-unselected'));
    root.querySelectorAll('.verse-number[role="button"]').forEach(e=>e.setAttribute('aria-pressed','false'));
  }
  function refresh() {
    clear();
    for(const number of root.querySelectorAll('.verse-number')){
      const n=numericVerse(number.closest('[data-verse]'));if(n==null)continue;
      number.setAttribute('role','button');number.tabIndex=0;number.setAttribute('aria-label',`Opções do versículo ${n}`);
      number.setAttribute('aria-controls',toolbar.id);number.setAttribute('aria-pressed','false');
    }
  }
  function selection() {
    const data=getChapter();if(!data || chapterId(data)!==chapterKey || !selected.length)return null;
    const verses=(data.verses||[]).filter(v=>selected.includes(Number(v.number))).sort((a,b)=>Number(a.number)-Number(b.number));
    if(!verses.length)return null;
    const first=Number(verses[0].number),last=Number(verses[verses.length-1].number),bookName=typeof getName==='function'?getName(data.book):data.book;
    const reference=`${bookName} ${data.chapter}:${first}${last!==first?'–'+last:''}`;
    const body=verses.map(v=>`${v.number} ${String(v.text||'').trim()}`).join(' ');
    const notes=[],seen=new Set();
    for(const v of verses)for(const note of v.notes||[])if(note.kind==='study'&&!seen.has(note.id)){seen.add(note.id);notes.push(note);}
    return {book:Number(data.book),chapter:Number(data.chapter),startVerse:first,endVerse:last,verses:verses.map(v=>Number(v.number)),text:reference+'\n'+body,reference,notes};
  }
  function paint() {
    const value=selection();if(!value){clear();return;}
    root.classList.add('has-text-selection');root.dataset.selectedReference=value.reference;
    root.querySelectorAll('[data-verse]').forEach(el=>{const n=numericVerse(el);el.classList.toggle('text-selected',selected.includes(n));el.classList.toggle('text-unselected',n!=null&&!selected.includes(n));});
    root.querySelectorAll('.verse-number[role="button"]').forEach(el=>el.setAttribute('aria-pressed',String(selected.includes(numericVerse(el.closest('[data-verse]'))))));
    buttons.study.hidden=typeof onStudy!=='function'||!value.notes.length;
    buttons.bookmark.hidden=typeof onBookmark!=='function';buttons.listen.hidden=typeof onListen!=='function';
    toolbar.hidden=false;position();
  }
  function position() {
    frame=0;if(toolbar.hidden || !anchorElement)return;
    if(!anchorElement.isConnected || !root.getClientRects().length){clear();return;}
    const rect=anchorElement.getBoundingClientRect(),view=window.visualViewport;
    const viewLeft=view?.offsetLeft||0,viewTop=view?.offsetTop||0,viewWidth=view?.width||innerWidth,viewBottom=viewTop+(view?.height||innerHeight);
    const header=document.querySelector('.app-header')?.getBoundingClientRect();
    const player=document.querySelector('#audio-player:not([hidden])');const footer=(player||document.querySelector('.bottom-navbar'))?.getBoundingClientRect();
    const topEdge=Math.max(viewTop+8,header?.bottom+7||0),bottomEdge=Math.min(viewBottom-8,footer?.top-8||viewBottom-8);
    if(rect.bottom<topEdge || rect.top>bottomEdge){clear();return;}
    const anchorY=Math.max(rect.top,Math.min(rect.bottom,rect.top+anchorOffset));
    const menuRect=toolbar.getBoundingClientRect(),middle=Math.min(viewLeft+viewWidth-12,Math.max(viewLeft+12,(rect.left+rect.right)/2));
    const left=Math.max(viewLeft+8,Math.min(viewLeft+viewWidth-menuRect.width-8,middle-menuRect.width/2));
    let top=anchorY-menuRect.height-15,below=false;
    if(top<topEdge){top=anchorY+22;below=true;}
    top=Math.max(topEdge,Math.min(bottomEdge-menuRect.height,top));
    toolbar.style.left=left+'px';toolbar.style.top=top+'px';toolbar.style.setProperty('--arrow-x',Math.max(13,Math.min(menuRect.width-13,middle-left))+'px');
    toolbar.classList.toggle('below',below);
  }
  function queuePosition(){if(!frame)frame=requestAnimationFrame(position);}
  function choose(event) {
    const target=event.target instanceof Element?event.target:null;
    if(!target || target.closest(nativeControl))return;
    // A native range belongs to Safari: never replace it or compete with its handles/menu.
    if(hasNativeSelection() || performance.now()<suppressUntil || event.detail>1 || event.button>0 || event.metaKey || event.ctrlKey || event.altKey){clear();return;}
    const el=target.closest('[data-verse]');if(!el || !root.contains(el))return;
    const n=numericVerse(el),data=getChapter();if(n==null || !(data?.verses||[]).some(v=>Number(v.number)===n))return;
    event.stopPropagation();
    const key=chapterId(data);if(key!==chapterKey)clear();chapterKey=key;
    if(selected.length===1&&selected[0]===n){clear();return;}
    if(anchorVerse==null || selected.length>1&&selected.includes(n)){anchorVerse=n;selected=[n];}
    else selected=data.verses.map(v=>Number(v.number)).filter(v=>v>0&&v>=Math.min(anchorVerse,n)&&v<=Math.max(anchorVerse,n));
    anchorElement=el;const rect=el.getBoundingClientRect();anchorOffset=Number.isFinite(event.clientY)&&event.clientY?Math.max(0,event.clientY-rect.top):Math.min(18,rect.height/2);
    paint();
  }
  function leaveToNative() {
    suppressUntil=Math.max(suppressUntil,performance.now()+700);clear();
  }
  function startGesture(event) {
    clearTimeout(holdTimer);
    if(event.isPrimary===false || event.button>0 || event.touches?.length>1){gesture=null;leaveToNative();return;}
    const point=event.touches?.[0]||event;
    gesture={id:event.pointerId,x:point.clientX,y:point.clientY,start:performance.now(),moved:false,native:hasNativeSelection()};
    if(gesture.native)leaveToNative();
    holdTimer=setTimeout(()=>{if(gesture){gesture.native=true;leaveToNative();}},400);
  }
  function moveGesture(event) {
    if(!gesture || event.pointerId!=null&&gesture.id!==event.pointerId)return;
    const point=event.touches?.[0]||event;
    if(Math.hypot(point.clientX-gesture.x,point.clientY-gesture.y)>8){gesture.moved=true;clearTimeout(holdTimer);leaveToNative();}
  }
  function endGesture(event) {
    if(!gesture || event.pointerId!=null&&gesture.id!==event.pointerId)return;
    clearTimeout(holdTimer);
    if(gesture.native || gesture.moved || performance.now()-gesture.start>=400 || event.type.endsWith('cancel'))leaveToNative();
    gesture=null;
  }
  // Pointer Events cover current iPhones; touch events keep older WebKit on the same contract.
  if('PointerEvent' in window){
    root.addEventListener('pointerdown',startGesture,{passive:true,signal});
    document.addEventListener('pointermove',moveGesture,{passive:true,signal});
    document.addEventListener('pointerup',endGesture,{passive:true,signal});
    document.addEventListener('pointercancel',endGesture,{passive:true,signal});
  }else{
    root.addEventListener('touchstart',startGesture,{passive:true,signal});
    document.addEventListener('touchmove',moveGesture,{passive:true,signal});
    document.addEventListener('touchend',endGesture,{passive:true,signal});
    document.addEventListener('touchcancel',endGesture,{passive:true,signal});
  }
  root.addEventListener('click',choose,{capture:true,signal});
  root.addEventListener('contextmenu',leaveToNative,{signal});
  root.addEventListener('keydown',event=>{if(!['Enter',' '].includes(event.key) || !event.target.matches?.('.verse-number[role="button"]'))return;event.preventDefault();choose(event);},{signal});
  document.addEventListener('selectionchange',()=>{if(hasNativeSelection())leaveToNative();},{signal});
  document.addEventListener('pointerdown',event=>{if(toolbar.hidden)return;const el=event.target instanceof Element?event.target:null;if(el && (toolbar.contains(el)||root.contains(el)&&!el.closest(nativeControl)))return;clear();},{capture:true,signal});
  document.addEventListener('keydown',event=>{if(event.key==='Escape')clear();},{signal});
  window.addEventListener('scroll',queuePosition,{passive:true,signal});window.addEventListener('resize',queuePosition,{passive:true,signal});
  window.visualViewport?.addEventListener('resize',queuePosition,{passive:true,signal});window.visualViewport?.addEventListener('scroll',queuePosition,{passive:true,signal});
  function callback(fn,value){clear();try{Promise.resolve(fn(value)).catch(e=>tell(e?.message||'Não foi possível concluir esta ação.',true));}catch(e){tell(e?.message||'Não foi possível concluir esta ação.',true);}}
  function legacyCopy(text){
    const field=document.createElement('textarea');field.value=text;field.readOnly=true;field.style.cssText='position:fixed;left:0;top:0;opacity:0;font-size:16px;pointer-events:none';
    document.body.append(field);field.focus();field.select();field.setSelectionRange(0,text.length);
    let copied=false;try{copied=document.execCommand('copy');}finally{field.remove();}return copied;
  }
  async function copy(value){
    try{if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(value.text);else if(!legacyCopy(value.text))throw new Error();clear();tell('Texto copiado.');}
    catch{if(legacyCopy(value.text)){clear();tell('Texto copiado.');}else tell('Não foi possível copiar. Tente novamente no Safari.',true);}
  }
  buttons.clear.onclick=clear;buttons.copy.onclick=()=>{const value=selection();if(value)copy(value);};
  buttons.share.onclick=()=>{const value=selection();if(!value)return;if(!navigator.share){copy(value);return;}navigator.share({title:value.reference,text:value.text}).then(clear).catch(error=>{if(error?.name!=='AbortError')tell('Não foi possível compartilhar esta passagem.',true);});};
  buttons.bookmark.onclick=()=>{const value=selection();if(value&&typeof onBookmark==='function')callback(onBookmark,value);};
  buttons.listen.onclick=()=>{const value=selection();if(value&&typeof onListen==='function')callback(onListen,value);};
  buttons.study.onclick=()=>{const value=selection();if(value&&typeof onStudy==='function')callback(onStudy,value);};
  refresh();
  return {clear,refresh,getSelection:selection,destroy(){clear();events.abort();clearTimeout(holdTimer);if(frame)cancelAnimationFrame(frame);toolbar.remove();}};
}
