/* Best Robux — non-blocking loading recovery. Never replaces the page or blocks navigation. */
(()=>{
  if(window.__bestRobuxLoadingRecovery)return;
  window.__bestRobuxLoadingRecovery=true;
  const TIMEOUT=12000;
  const isLoading=(el)=>el&&el.children.length===0&&/^(carregando(?:\.\.\.)?|verificando(?:\.\.\.)?|aguarde(?:\.\.\.)?|loading(?:\.\.\.)?)$/i.test((el.textContent||'').trim());
  const mark=(el)=>{
    if(el.dataset.brLoadingResolved)return;
    el.dataset.brLoadingResolved='1';
    el.setAttribute('aria-live','polite');
    const original=el.textContent.trim();
    el.innerHTML='<span>'+original+'</span> <button type="button" style="margin-left:8px;padding:5px 8px;border:1px solid currentColor;border-radius:5px;background:transparent;color:inherit;cursor:pointer">Tentar novamente</button>';
    el.querySelector('button')?.addEventListener('click',()=>location.reload());
  };
  const scan=()=>document.querySelectorAll('body *').forEach(el=>{
    if(isLoading(el)&&el.dataset.brLoadingSince && Date.now()-Number(el.dataset.brLoadingSince)>=TIMEOUT)mark(el);
  });
  const stamp=()=>document.querySelectorAll('body *').forEach(el=>{
    if(isLoading(el)&&!el.dataset.brLoadingSince)el.dataset.brLoadingSince=String(Date.now());
  });
  const observer=new MutationObserver(()=>stamp());
  const start=()=>{stamp();observer.observe(document.body,{subtree:true,childList:true,characterData:true});setInterval(scan,1000)};
  if(document.body)start();else document.addEventListener('DOMContentLoaded',start,{once:true});
  window.addEventListener('unhandledrejection',e=>console.error('[Best Robux] promessa rejeitada:',e.reason));
  window.addEventListener('error',e=>console.error('[Best Robux] erro de JavaScript:',e.error||e.message));
})();
