import { chromium } from 'playwright';
const CSS=`html{scroll-behavior:auto !important}nextjs-portal{display:none!important}`;
const b=await chromium.launch();
const p=await (await b.newContext({viewport:{width:1740,height:1000}})).newPage();
await p.goto('http://127.0.0.1:3120/',{waitUntil:'networkidle'});
await p.addStyleTag({content:CSS});
await p.waitForTimeout(600);
const sec=p.locator('[data-route-section]').first();
const box=await sec.boundingBox();
// scroll so the section top is just at 82% of viewport (progress ~0)
for(const frac of [0.0,0.35,0.7,1.0]){
  const span=Math.max(240, box.height*0.62);
  const targetTop = 1000*0.82 - frac*span;
  await p.evaluate(({y})=>window.scrollTo(0,y),{y: box.y - targetTop});
  await p.waitForTimeout(500);
  const s=await p.evaluate(()=>{
    const sec=document.querySelector('[data-route-section]');
    const rl=document.querySelector('[class*="routeLine"]');
    const g=document.querySelector('[class*="routeGhost"]');
    return {prog:sec.style.getPropertyValue('--route-progress'),
      dashoff:getComputedStyle(rl).strokeDashoffset, dasharr:getComputedStyle(rl).strokeDashArray,
      ghostArr:getComputedStyle(g).strokeDashArray, ghostLen:g.getTotalLength(),
      arrived:[...document.querySelectorAll('[data-stop]')].map(x=>x.dataset.arrived||'-')};
  });
  console.log('frac',frac,JSON.stringify(s));
}
await sec.screenshot({path:'/tmp/claude-1000/-home-fazetwerpnerd69-dev-3cworldgroup/8775fa2d-1e5a-44cb-bbfb-e4c983885754/scratchpad/route.png'});
await b.close();
