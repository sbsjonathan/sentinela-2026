'use strict';
// Keep native dialog focus/keyboard behavior while letting the sheet finish its exit.
(() => {
  const records=new WeakMap();
  const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
  function stop(record,completed=false){
    ++record.epoch;clearTimeout(record.timer);record.animation?.cancel();record.animation=null;
    record.dialog.classList.remove('is-opening','is-closing');
    record.closing=false;
    if(record.resolve){const resolve=record.resolve;record.resolve=null;record.promise=null;resolve(completed);}
  }
  function bind(dialog){
    if(records.has(dialog))return records.get(dialog);
    const record={dialog,epoch:0,timer:0,animation:null,closing:false,promise:null,resolve:null};
    records.set(dialog,record);dialog.classList.add('bible-modal-motion');
    if(typeof dialog.animate!=='function')dialog.classList.add('dialog-css-motion');
    dialog.addEventListener('cancel',event=>{event.preventDefault();close(dialog);});
    dialog.addEventListener('click',event=>{
      if(event.target!==dialog)return;
      const rect=dialog.getBoundingClientRect();
      if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)close(dialog);
    });
    dialog.addEventListener('close',()=>{
      stop(record,true);
      if(!document.querySelector('dialog[open]'))document.body.classList.remove('sheet-open');
    });
    return record;
  }
  function animate(record,from,to,duration,finish){
    const epoch=record.epoch;
    const done=()=>{if(epoch===record.epoch)finish();};
    if(!duration){done();return;}
    if(typeof record.dialog.animate==='function'){
      record.animation=record.dialog.animate([from,to],{
        duration,easing:record.closing?'cubic-bezier(.4,0,1,1)':'cubic-bezier(.22,1,.36,1)',fill:'both'
      });
      record.animation.finished.then(done).catch(()=>{});
    }
    record.timer=setTimeout(done,duration+60);
  }
  function show(dialog){
    const record=bind(dialog);
    if(dialog.open&&!record.closing)return;
    const reversing=dialog.open&&record.closing;
    const previous=reversing?getComputedStyle(dialog):null;
    const from=reversing?{opacity:previous.opacity,transform:previous.transform}:{opacity:0,transform:'translateY(24px)'};
    stop(record);
    document.body.classList.add('sheet-open');
    if(!dialog.open)dialog.showModal();
    const heading=dialog.querySelector('h2');
    if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}
    if(reduced())return;
    dialog.classList.add('is-opening');
    animate(record,from,{opacity:1,transform:'translateY(0)'},260,()=>{
      clearTimeout(record.timer);record.animation?.cancel();record.animation=null;
      dialog.classList.remove('is-opening');
    });
  }
  function close(dialog,returnValue=''){
    const record=bind(dialog);
    if(!dialog.open)return Promise.resolve(true);
    if(record.closing)return record.promise;
    const style=getComputedStyle(dialog),from={opacity:style.opacity,transform:style.transform};
    stop(record);record.closing=true;
    record.promise=new Promise(resolve=>{record.resolve=resolve;});
    const promise=record.promise;
    dialog.classList.add('is-closing');
    animate(record,from,{opacity:0,transform:'translateY(20px)'},reduced()?0:180,()=>{
      if(dialog.open)dialog.close(returnValue);
    });
    return promise;
  }
  window.BibleDialogs={show,close,bind,isClosing:dialog=>!!records.get(dialog)?.closing};
  document.querySelectorAll('dialog').forEach(bind);
})();
