function showErr(msg){
  const b=document.getElementById('errBox'), t=document.getElementById('errText');
  t.textContent=(t.textContent?t.textContent+'\n\n':'')+msg;
  b.style.display='block';
}
window.onerror=function(m,src,l,c,e){
  showErr(m+'\n  at line '+l+':'+c+(e&&e.stack?'\n'+e.stack.split('\n').slice(0,4).join('\n'):''));
  return false;
};
window.addEventListener('unhandledrejection',e=>showErr('Promise: '+(e.reason&&e.reason.message||e.reason)));
