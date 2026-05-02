(function(){
  var root=document.documentElement;
  var ua=navigator.userAgent||"";
  var ios=/iPad|iPhone|iPod/.test(ua)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
  var standalone=false;
  try{standalone=window.navigator.standalone===true||window.matchMedia("(display-mode: standalone)").matches||window.matchMedia("(display-mode: fullscreen)").matches;}catch(e){}
  root.classList.toggle("is-ios",ios);
  root.classList.toggle("is-pwa",standalone);
  root.classList.toggle("is-browser",!standalone);
  root.dataset.appMode=standalone?"pwa":"browser";
  root.dataset.deviceMode=ios?"ios":"other";
  function applySize(){
    root.style.setProperty("--app-height",window.innerHeight+"px");
    if(window.visualViewport){root.style.setProperty("--visual-viewport-height",window.visualViewport.height+"px");}
  }
  applySize();
  window.addEventListener("resize",applySize,{passive:true});
  window.addEventListener("orientationchange",function(){setTimeout(applySize,250);},{passive:true});
  if(window.visualViewport){window.visualViewport.addEventListener("resize",applySize,{passive:true});}
})();
