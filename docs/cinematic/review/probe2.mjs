import { chromium } from "playwright";
const b = await chromium.launch();
for (const w of [1740, 1440]) {
const ctx = await b.newContext({ viewport: { width: w, height: 1000 } });
const p = await ctx.newPage();
await p.goto("http://127.0.0.1:3120/", { waitUntil: "networkidle" });
await p.addStyleTag({content:"html{scroll-behavior:auto!important}nextjs-portal{display:none!important}"});
await p.evaluate(async()=>{for(let y=0;y<document.body.scrollHeight;y+=450){scrollTo(0,y);await new Promise(r=>requestAnimationFrame(r));}scrollTo(0,0);});
await p.waitForTimeout(700);
const r = await p.evaluate(() => {
  const out = [];
  document.querySelectorAll("[data-chapter]").forEach((c) => {
    const cb = c.getBoundingClientRect();
    const num = c.querySelector("p");
    const kids = [...c.children].filter(e=>e.tagName!=="DIV");
    const first = kids[0].getBoundingClientRect();
    const last = kids[kids.length-1].getBoundingClientRect();
    out.push({ h: Math.round(cb.height), padTop: Math.round(first.top-cb.top), content: Math.round(last.bottom-first.top), padBot: Math.round(cb.bottom-last.bottom) });
  });
  const st = document.querySelector("[data-chapter-stage]").getBoundingClientRect();
  const list = document.querySelector("[data-chapter]").parentElement.getBoundingClientRect();
  return { out, stage: Math.round(st.height), listH: Math.round(list.height) };
});
console.log(w, JSON.stringify(r));
await ctx.close();
}
await b.close();
