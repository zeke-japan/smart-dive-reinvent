export let language = (()=>{try{return new URLSearchParams(location.search).get('lang') || localStorage.getItem('smart-dive-language') || (navigator.language.startsWith('ja')?'ja':'en');}catch{return 'en';}})();
if(!['ja','en'].includes(language))language='en';
export const tr=(ja,en)=>language==='ja'?ja:en;
export function applyLanguage(){
 document.documentElement.lang=language;
 document.querySelectorAll('[data-ja][data-en]').forEach(node=>{node.textContent=node.dataset[language];});
 document.querySelectorAll('[data-lang-link]').forEach(node=>{const u=new URL(node.getAttribute('href'),location.href);u.searchParams.set('lang',language);node.href=u.href;});
 const picker=document.getElementById('language');if(picker)picker.value=language;
}
export function initializeLanguage(onChange=()=>{}){
 applyLanguage();const picker=document.getElementById('language');if(picker)picker.onchange=()=>{language=picker.value==='ja'?'ja':'en';try{localStorage.setItem('smart-dive-language',language);}catch{}applyLanguage();onChange();};
}
