import { chromium } from 'playwright';
const BASE='http://127.0.0.1:3120';
const ROUTES=['/','/about','/services','/opportunities','/contact','/apply'];
const CSS=`html{scroll-behavior:auto !important}nextjs-portal{display:none!important}`;
const browser=await chromium.launch();
const out=[];
for(const reduce of [true,false]){
  const ctx=await browser.newContext({viewport:{width:1740,height:1000},reducedMotion:reduce?'reduce':'no-preference'});
  const page=await ctx.newPage();
  for(const route of ROUTES){
    await page.goto(BASE+route,{waitUntil:'networkidle'});
    await page.addStyleTag({content:CSS});
    await page.waitForTimeout(900);
    const r=await page.evaluate(()=>{
      const root=document.querySelector('[data-motion], body > div');
      const motionAttr=document.querySelector('[data-motion="on"]')?'on':'off';
      const bad=[];
      for(const el of document.querySelectorAll('[data-reveal]')){
        const cs=getComputedStyle(el);
        const cls=((typeof el.className==='string'?el.className:'')||'').split(/\s+/).map(s=>s.replace(/^[a-z-]+-module__[A-Za-z0-9_]+__/,'')).join('.');
        const issues=[];
        if(parseFloat(cs.opacity)<0.999) issues.push('opacity='+cs.opacity);
        if(cs.transform!=='none'&&cs.transform!=='matrix(1, 0, 0, 1, 0, 0)') issues.push('transform='+cs.transform);
        if(cs.maskSize && cs.maskSize!=='auto' && !/100%\s+100%/.test(cs.maskSize) && cs.maskImage!=='none') issues.push('maskSize='+cs.maskSize);
        if(cs.clipPath!=='none') issues.push('clipPath='+cs.clipPath);
        if(cs.visibility!=='visible') issues.push('visibility='+cs.visibility);
        if(issues.length) bad.push({cls,shown:el.dataset.shown||'-',issues});
      }
      // route line
      const rl=document.querySelector('[class*="routeLine"]');
      let route=null;
      if(rl){const c=getComputedStyle(rl);route={dashoffset:c.strokeDashoffset,dasharray:c.strokeDashArray,progress:getComputedStyle(document.querySelector('[data-route-section]')||document.body).getPropertyValue('--route-progress')};}
      // contact head line
      const hl=document.querySelector('[class*="headLinePath"]');
      let head=null;
      if(hl){const c=getComputedStyle(hl);head={dashoffset:c.strokeDashoffset,dasharray:c.strokeDashArray};}
      return {motionAttr,total:document.querySelectorAll('[data-reveal]').length,bad,route,head};
    });
    out.push({reduce,route,...r});
  }
  // scroll test on / for route line with motion on
  if(!reduce){
    await page.goto(BASE+'/',{waitUntil:'networkidle'});
    await page.addStyleTag({content:CSS});
    await page.waitForTimeout(500);
    const sec=await page.locator('[data-route-section]').first();
    await sec.scrollIntoViewIfNeeded(); await page.waitForTimeout(900);
    const after=await page.evaluate(()=>{const rl=document.querySelector('[class*="routeLine"]');const s=document.querySelector('[data-route-section]');return {dashoffset:getComputedStyle(rl).strokeDashoffset,prog:s.style.getPropertyValue('--route-progress'),arrived:[...document.querySelectorAll('[data-stop]')].map(x=>x.dataset.arrived||'-')}});
    out.push({note:'MOTION-ON route line after scroll',...after});
    // scroll further
    await page.mouse.wheel(0,1200); await page.waitForTimeout(900);
    const after2=await page.evaluate(()=>{const rl=document.querySelector('[class*="routeLine"]');const s=document.querySelector('[data-route-section]');return {dashoffset:getComputedStyle(rl).strokeDashoffset,prog:s.style.getPropertyValue('--route-progress'),arrived:[...document.querySelectorAll('[data-stop]')].map(x=>x.dataset.arrived||'-')}});
    out.push({note:'MOTION-ON route line after more scroll',...after2});
  }
  await ctx.close();
}
await browser.close();
for(const o of out) console.log(JSON.stringify(o));
