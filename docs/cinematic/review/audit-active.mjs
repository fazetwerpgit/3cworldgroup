import { chromium } from 'playwright';
const CSS=`html{scroll-behavior:auto !important}nextjs-portal{display:none!important}`;
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1740,height:1000}});
const p=await ctx.newPage();
await p.goto('http://127.0.0.1:3120/',{waitUntil:'networkidle'});
await p.addStyleTag({content:CSS});
await p.evaluate(()=>{document.querySelectorAll('[data-reveal]').forEach(e=>e.dataset.shown='true');
  document.addEventListener('click',e=>{e.preventDefault();e.stopPropagation()},true);});
await p.waitForTimeout(400);
for(const [sel,label,nth] of [['[class*="cityChip"]','cityChip',2],['[class*="quietLink"]','quietLink',0],['[class*="faqSummary"]','faqSummary',0],['[class*="btnGhost"]','btnGhost',0],['[class*="menuToggle"]','menuToggle',0]]){
  const h=p.locator(sel).nth(nth);
  if(!await h.count() || !await h.isVisible()){console.log('MISSING/HIDDEN',label);continue}
  await h.scrollIntoViewIfNeeded(); const box=await h.boundingBox(); if(!box){console.log('NOBOX',label);continue}
  const get=()=>h.evaluate(el=>{const c=getComputedStyle(el);const bf=getComputedStyle(el,'::before');return {t:c.transform,col:c.color,bg:c.backgroundColor,bb:c.borderBottomColor,beforeT:bf.transform,beforeBg:bf.backgroundColor,op:c.opacity}});
  const rest=await get();
  await p.mouse.move(box.x+box.width/2,box.y+box.height/2); await p.waitForTimeout(450);
  const hov=await get();
  await p.mouse.down(); await p.waitForTimeout(400);
  const act=await h.evaluate(el=>{const c=getComputedStyle(el);return {t:c.transform,col:c.color,bg:c.backgroundColor,m:el.matches(':active')}});
  await p.mouse.up(); await p.mouse.move(2,2); await p.waitForTimeout(200);
  console.log(label,'\n  rest',JSON.stringify(rest),'\n  hover',JSON.stringify(hov),'\n  active',JSON.stringify(act));
}
// focused btnLime on paper — screenshot proof
await p.goto('http://127.0.0.1:3120/services',{waitUntil:'networkidle'});
await p.addStyleTag({content:CSS});
await p.evaluate(()=>{document.querySelectorAll('[data-reveal]').forEach(e=>e.dataset.shown='true')});
await p.waitForTimeout(400);
const btn=p.locator('[class*="btnLime"]').last();
await btn.scrollIntoViewIfNeeded();
await p.keyboard.press('Tab');
await btn.evaluate(el=>el.focus());
await p.keyboard.press('Shift+Tab'); await p.keyboard.press('Tab');
await p.waitForTimeout(300);
const bb=await btn.boundingBox();
await p.screenshot({path:'/tmp/claude-1000/-home-fazetwerpnerd69-dev-3cworldgroup/8775fa2d-1e5a-44cb-bbfb-e4c983885754/scratchpad/focus-paper.png',clip:{x:bb.x-24,y:bb.y-24,width:bb.width+48,height:bb.height+48}});
console.log('focused el:', await p.evaluate(()=>document.activeElement.textContent.trim().slice(0,30)+' | '+getComputedStyle(document.activeElement).outlineColor));
// 390 menu toggle focus
await p.setViewportSize({width:390,height:844});
await p.goto('http://127.0.0.1:3120/',{waitUntil:'networkidle'});
await p.addStyleTag({content:CSS}); await p.waitForTimeout(400);
const mt=p.locator('[class*="menuToggle"]').first();
console.log('menuToggle 390', JSON.stringify(await mt.evaluate(el=>{const r=el.getBoundingClientRect();const c=getComputedStyle(el);return {w:r.width,h:r.height,bc:c.borderTopColor}})));
await b.close();
