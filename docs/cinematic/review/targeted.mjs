import { chromium } from "playwright";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:3, isMobile:true, hasTouch:true });
await ctx.addInitScript(()=>{const s=document.createElement('style');s.textContent='html{scroll-behavior:auto!important}';const a=()=>document.head&&document.head.appendChild(s);document.head?a():document.addEventListener('DOMContentLoaded',a);});
const p = await ctx.newPage();
const shot = async (url, y, name) => {
  await p.goto("http://127.0.0.1:3120"+url,{waitUntil:"networkidle"});
  await p.waitForTimeout(1200);
  for(let s=0;s<=y;s+=500){await p.evaluate(v=>window.scrollTo({top:v,behavior:'instant'}),s);await p.waitForTimeout(90);}
  await p.evaluate(v=>window.scrollTo({top:v,behavior:'instant'}),y); await p.waitForTimeout(700);
  await p.screenshot({path:"docs/cinematic/review/shots/"+name+".png"});
};
// apply form clean
const formY = async () => p.evaluate(()=>{const f=document.querySelector("#apply-form");return f?Math.round(f.getBoundingClientRect().top+window.scrollY-70):0;});
await p.goto("http://127.0.0.1:3120/apply",{waitUntil:"networkidle"}); await p.waitForTimeout(1200);
await shot("/apply", await formY(), "T-apply-form-390");
// contact form
await p.goto("http://127.0.0.1:3120/contact",{waitUntil:"networkidle"}); await p.waitForTimeout(1200);
const cy = await p.evaluate(()=>{const f=document.querySelector("form");return f?Math.round(f.getBoundingClientRect().top+window.scrollY-70):0;});
await shot("/contact", cy, "T-contact-form-390");
// focus ring check on an input
await p.goto("http://127.0.0.1:3120/apply",{waitUntil:"networkidle"}); await p.waitForTimeout(1200);
await p.locator("#apply-name").scrollIntoViewIfNeeded(); await p.locator("#apply-name").focus(); await p.waitForTimeout(400);
await p.screenshot({path:"docs/cinematic/review/shots/T-apply-focus-390.png"});
console.log("input font-size:", await p.evaluate(()=>getComputedStyle(document.querySelector("#apply-name")).fontSize));
console.log("input height:", await p.evaluate(()=>Math.round(document.querySelector("#apply-name").getBoundingClientRect().height)));
await ctx.close();
// desktop contact form
const ctx2 = await b.newContext({ viewport:{width:1740,height:1000} });
const q = await ctx2.newPage();
await q.goto("http://127.0.0.1:3120/contact",{waitUntil:"networkidle"}); await q.waitForTimeout(1500);
const h = await q.evaluate(()=>document.documentElement.scrollHeight);
for(let s=0;s<h;s+=500){await q.evaluate(v=>window.scrollTo({top:v,behavior:'instant'}),s);await q.waitForTimeout(80);}
const fy = await q.evaluate(()=>{const f=document.querySelector("form");return f?Math.round(f.getBoundingClientRect().top+window.scrollY-90):0;});
await q.evaluate(v=>window.scrollTo({top:v,behavior:'instant'}),fy); await q.waitForTimeout(700);
await q.screenshot({path:"docs/cinematic/review/shots/T-contact-form-1740.png"});
await b.close();
