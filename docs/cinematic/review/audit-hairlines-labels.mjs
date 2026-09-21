import { chromium } from 'playwright';
const BASE='http://127.0.0.1:3120';
const ROUTES=['/','/about','/services','/opportunities','/contact','/apply'];
const CSS=`html{scroll-behavior:auto !important}nextjs-portal{display:none!important}`;

const browser=await chromium.launch();
const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1});
const page=await ctx.newPage();
await page.addStyleTag; // noop

const hairlines={}; const labels={}; const numerals={};

for(const route of ROUTES){
  await page.goto(BASE+route,{waitUntil:'networkidle'});
  await page.addStyleTag({content:CSS});
  // force all reveals shown so geometry/styles are final
  await page.evaluate(()=>{document.querySelectorAll('[data-reveal]').forEach(e=>e.dataset.shown='true');});
  await page.waitForTimeout(400);
  const data=await page.evaluate(()=>{
    function bg(el){
      let n=el;
      while(n && n!==document.documentElement){
        const c=getComputedStyle(n).backgroundColor;
        if(c && c!=='rgba(0, 0, 0, 0)' && c!=='transparent') return {color:c, from:n.className||n.tagName};
        n=n.parentElement;
      }
      return {color:getComputedStyle(document.body).backgroundColor, from:'body'};
    }
    function cls(el){ return (typeof el.className==='string'? el.className: el.getAttribute('class')||'')||el.tagName.toLowerCase(); }
    const hl=[], lb=[], nm=[];
    for(const el of document.querySelectorAll('*')){
      const cs=getComputedStyle(el);
      const r=el.getBoundingClientRect();
      if(r.width===0&&r.height===0) continue;
      for(const side of ['Top','Right','Bottom','Left']){
        const w=parseFloat(cs['border'+side+'Width']);
        const st=cs['border'+side+'Style'];
        if(w>0 && st!=='none' && cs['border'+side+'Color']!=='rgba(0, 0, 0, 0)'){
          hl.push({cls:cls(el), tag:el.tagName, side, w, color:cs['border'+side+'Color'], ground:bg(el).color, groundFrom:String(bg(el).from).slice(0,60)});
        }
      }
      const txt=(el.textContent||'').trim();
      const own=Array.from(el.childNodes).filter(n=>n.nodeType===3).map(n=>n.textContent).join('').trim();
      if(own.length>0 && own.length<80){
        const fs=parseFloat(cs.fontSize);
        if(cs.textTransform==='uppercase' && fs<=22){
          lb.push({cls:cls(el), tag:el.tagName, text:own.slice(0,28), ff:cs.fontFamily.split(',')[0].replace(/"/g,''), fs:cs.fontSize, ls:cs.letterSpacing, fw:cs.fontWeight, tt:cs.textTransform, color:cs.color});
        }
        if(/^[\s$€£]*[\d][\d,.\s%kKmMxX+\-–—/]*$/.test(own) && /\d/.test(own)){
          nm.push({cls:cls(el), text:own.slice(0,20), ff:cs.fontFamily.split(',')[0].replace(/"/g,''), fs:cs.fontSize, ls:cs.letterSpacing, fvn:cs.fontVariantNumeric, ffeat:cs.fontFeatureSettings});
        }
      }
    }
    return {hl,lb,nm};
  });
  hairlines[route]=data.hl; labels[route]=data.lb; numerals[route]=data.nm;
}
await browser.close();
console.log(JSON.stringify({hairlines,labels,numerals}));
