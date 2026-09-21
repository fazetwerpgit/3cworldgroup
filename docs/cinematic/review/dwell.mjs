// Third-photo dwell: scroll px between the stage switching to chapter 3 and
// the pinned stage releasing (its column ending). Also chapter beat heights.
import { chromium } from "playwright";
const BASE = "http://127.0.0.1:3120";
const VPS = [[1440,700],[1440,900],[1740,1000],[1920,1080]];
const browser = await chromium.launch();
for (const [w,h] of VPS) {
  const ctx = await browser.newContext({ viewport:{width:w,height:h}, deviceScaleFactor:1 });
  await ctx.addInitScript(()=>{const s=document.createElement("style");s.textContent="html{scroll-behavior:auto!important}";document.addEventListener("DOMContentLoaded",()=>document.head.appendChild(s));});
  const page = await ctx.newPage();
  await page.goto(BASE+"/", { waitUntil:"networkidle" });
  await page.waitForTimeout(500);
  const info = await page.evaluate(()=>{
    const stage=document.querySelector("[data-chapter-stage]");
    const chs=[...document.querySelectorAll("[data-chapter]")];
    const col=stage.parentElement; const sy=window.scrollY;
    return { colTop: col.getBoundingClientRect().top+sy, colBottom: col.getBoundingClientRect().bottom+sy,
      stageH: stage.getBoundingClientRect().height, beats: chs.map(c=>Math.round(c.getBoundingClientRect().height)) };
  });
  const swaps={}; let release=null;
  for (let y=Math.max(0,info.colTop-h); y<info.colBottom+200; y+=10) {
    await page.evaluate(yy=>window.scrollTo(0,yy), y);
    await page.waitForTimeout(16);
    const s = await page.evaluate(()=>{const st=document.querySelector("[data-chapter-stage]");const r=st.getBoundingClientRect();
      return { a: st.dataset.activeChapter, top: Math.round(r.top), bottom: Math.round(r.bottom), colBottom: Math.round(st.parentElement.getBoundingClientRect().bottom) };});
    if (!(s.a in swaps)) swaps[s.a]=y;
    // released once the stage bottom is pinned to the column bottom and moving up
    if (release===null && s.a==="2" && s.bottom===s.colBottom && s.top < (swaps.pinTop ?? 1e9)) release=y;
    if (s.a==="0" && swaps.pinTop===undefined && s.top>=0 && s.top<=200) swaps.pinTop=s.top;
  }
  const dwell = release!==null && swaps["2"]!==undefined ? release-swaps["2"] : null;
  console.log(`${w}x${h}  beats=${info.beats.join("/")}  stageH=${Math.round(info.stageH)}  swap1=${swaps["1"]} swap2=${swaps["2"]} release=${release}  dwell3=${dwell}`);
  await ctx.close();
}
await browser.close();
