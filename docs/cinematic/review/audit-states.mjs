import { chromium } from 'playwright';
const BASE='http://127.0.0.1:3120';
const ROUTES=(process.env.ROUTES||'/,/about,/services,/opportunities,/contact,/apply').split(',');
const CSS=`html{scroll-behavior:auto !important}nextjs-portal{display:none!important}`;
const SELS=['btnLime','btnGhost','quietLink','inlineLink','cityChip','faqSummary','pathRow','detailLink','headerLink','menuToggle','footerSocial','footerNav','footerLegal','submit','applyBar','skipLink','routeStop','bandCta','serviceCta'];

const HELPERS=`
window.__lum=function(c){const m=c.match(/[\\d.]+/g).map(Number);const f=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)};return 0.2126*f(m[0])+0.7152*f(m[1])+0.0722*f(m[2])};
window.__over=function(fg,bg){const a=fg.match(/[\\d.]+/g).map(Number);const b=bg.match(/[\\d.]+/g).map(Number);const al=a.length>3?a[3]:1;return 'rgb('+[0,1,2].map(i=>Math.round(a[i]*al+b[i]*(1-al))).join(', ')+')'};
window.__cr=function(x,y){const a=window.__lum(x),b=window.__lum(y);return +(((Math.max(a,b)+0.05)/(Math.min(a,b)+0.05)).toFixed(2))};
window.__bg=function(el){let n=el;while(n&&n!==document.documentElement){const c=getComputedStyle(n).backgroundColor;if(c&&c!=='rgba(0, 0, 0, 0)')return c;n=n.parentElement}return 'rgb(255, 255, 255)'};
window.__cls=function(el){const c=(typeof el.className==='string'?el.className:el.getAttribute('class'))||'';return c.split(/\\s+/).map(s=>s.replace(/^[a-z-]+-module__[A-Za-z0-9_]+__/,'')).filter(Boolean).join('.')||el.tagName.toLowerCase()};
window.__snap=function(el){const cs=getComputedStyle(el);return {cls:window.__cls(el),tag:el.tagName,bg:cs.backgroundColor,color:cs.color,bc:cs.borderTopColor+'/'+cs.borderBottomColor,bw:cs.borderTopWidth+'/'+cs.borderBottomWidth,transform:cs.transform,opacity:cs.opacity,shadow:cs.boxShadow,outline:cs.outlineWidth+' '+cs.outlineStyle+' '+cs.outlineColor,oo:cs.outlineOffset,td:cs.textDecorationLine+' '+cs.textDecorationColor,trans:cs.transitionProperty+' / '+cs.transitionDuration,ground:window.__bg(el.parentElement||el)}};
`;

const browser=await chromium.launch();
const ctx=await browser.newContext({viewport:{width:1740,height:1000}});
const page=await ctx.newPage();
await page.addInitScript(HELPERS);
const out={};
for(const route of ROUTES){
  await page.goto(BASE+route,{waitUntil:'networkidle'});
  await page.addStyleTag({content:CSS});
  await page.evaluate(()=>{document.querySelectorAll('[data-reveal]').forEach(e=>e.dataset.shown='true')});
  await page.waitForTimeout(300);
  const res={hover:[],focus:[]};
  // ---- hover pass
  const handles=await page.evaluateHandle((sels)=>{
    const seen=new Set(); const picked=[];
    for(const s of sels){
      const els=[...document.querySelectorAll(`[class*="${s}"]`)];
      // group by ground so we catch navy AND paper instances
      const byGround=new Map();
      for(const el of els){
        const r=el.getBoundingClientRect(); if(r.width<4||r.height<4) continue;
        if(!el.matches('a,button,summary,[role=button],[tabindex]')&&!el.querySelector('a,button')) { if(!el.matches('a,button,summary')) continue; }
        const g=window.__bg(el.parentElement||el);
        if(byGround.has(g)) continue; byGround.set(g,el);
      }
      for(const el of byGround.values()){ if(!seen.has(el)){seen.add(el);picked.push({el,s});} }
    }
    window.__picked=picked; return picked.map(p=>p.s);
  },SELS);
  const names=await handles.jsonValue();
  for(let i=0;i<names.length;i++){
    const before=await page.evaluate((i)=>{const el=window.__picked[i].el; el.scrollIntoView({block:'center'}); return {key:window.__picked[i].s, ...window.__snap(el)}},i);
    try{
      await page.evaluate((i)=>{const el=window.__picked[i].el; const r=el.getBoundingClientRect(); window.__pt={x:r.left+r.width/2,y:r.top+r.height/2}},i);
      const pt=await page.evaluate(()=>window.__pt);
      await page.mouse.move(pt.x,pt.y);
      await page.waitForTimeout(420);
      const after=await page.evaluate((i)=>({...window.__snap(window.__picked[i].el), hoverMatch:window.__picked[i].el.matches(':hover')}),i);
      res.hover.push({key:before.key,cls:before.cls,ground:before.ground,rest:before,hov:after});
      await page.mouse.move(2,2); await page.waitForTimeout(150);
    }catch(e){res.hover.push({key:before.key,cls:before.cls,err:String(e).slice(0,80)})}
  }
  // ---- keyboard focus pass
  await page.evaluate(()=>{window.scrollTo(0,0)});
  await page.mouse.move(2,2);
  await page.keyboard.press('Tab');
  const seenFocus=new Set();
  for(let i=0;i<70;i++){
    const f=await page.evaluate(()=>{
      const el=document.activeElement; if(!el||el===document.body) return null;
      const cs=getComputedStyle(el);
      const ground=window.__bg(el.parentElement||el);
      const oc=cs.outlineColor, ow=parseFloat(cs.outlineWidth), os=cs.outlineStyle;
      const solid=window.__over(oc,ground);
      return {cls:window.__cls(el),tag:el.tagName,text:(el.textContent||'').trim().slice(0,22),fv:el.matches(':focus-visible'),
        outline:ow+' '+os+' '+oc, oo:cs.outlineOffset, shadow:cs.boxShadow, ground,
        ringVsGround: (os!=='none'&&ow>0)?window.__cr(solid,ground):null,
        ownBg:cs.backgroundColor,
        ringVsOwnBg:(os!=='none'&&ow>0&&cs.backgroundColor!=='rgba(0, 0, 0, 0)')?window.__cr(solid,window.__over(cs.backgroundColor,ground)):null};
    });
    if(f){ const k=f.cls+'|'+f.ground; if(!seenFocus.has(k)){seenFocus.add(k); res.focus.push(f);} }
    await page.keyboard.press('Tab');
  }
  out[route]=res;
}
await browser.close();
console.log(JSON.stringify(out));
