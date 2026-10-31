'use strict';
const releaseBase='https://github.com/RishabhShenoy03/claude-hackathon/releases/latest/download/';
const downloads={suite:'OpenSuite-Setup-0.3.0-x64.exe',portable:'OpenSuite-Portable-0.3.0-x64.exe',pdf:'OpenPDF.exe',slides:'OpenSlides-Portable-0.3.0-x64.exe'};
const bridge=window.openSuite;
let noticeTimer;
function notify(message){const n=document.querySelector('#notice');n.textContent=message;n.hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>{n.hidden=true;},6500);}
for(const link of document.querySelectorAll('[data-download]'))link.href=releaseBase+downloads[link.dataset.download];
if(bridge){
 document.body.classList.add('desktop');
 for(const link of document.querySelectorAll('[data-app]')){
  const app=link.dataset.app;link.textContent=app==='openpdf'?'Open OpenPDF ↗':'Open OpenSlides ↗';
  link.addEventListener('click',async event=>{event.preventDefault();if(link.getAttribute('aria-disabled')==='true')return;link.setAttribute('aria-disabled','true');try{const result=await bridge.launch(app);notify(result.message);}catch(error){notify(error.message||'Could not open this app. Try reinstalling OpenSuite.');}finally{link.removeAttribute('aria-disabled');}});
 }
 document.addEventListener('click',async event=>{const link=event.target.closest('a');if(!link||link.dataset.app||!link.href.startsWith('https://'))return;event.preventDefault();try{await bridge.openExternal(link.href);}catch{notify('Could not open the link.');}});
}
for(const link of document.querySelectorAll('.rail nav a'))link.addEventListener('click',()=>{for(const item of document.querySelectorAll('.rail nav a'))item.classList.toggle('active',item===link);});
