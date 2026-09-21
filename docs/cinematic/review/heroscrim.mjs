// Measures the mobile hero scrims: how bright the photo is under each band of
// copy (contrast) and how bright it is anywhere in the frame (is it a photo?).
import { chromium } from "playwright";
import fs from "node:fs";
import { decodePng } from "./png.mjs";

const BASE = "http://127.0.0.1:3120";
const rel = (r,g,b)=>{const f=c=>{c/=255;return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4);};return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b);};
const ratio=(a,b)=>(Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);
const killSmooth=()=>{const s=document.createElement("style");s.textContent="html{scroll-behavior:auto !important}";const a=()=>document.head&&document.head.appendChild(s);document.head?a():document.addEventListener("DOMContentLoaded",a);};

const ROUTES=[["/","home"],["/about","about"],["/services","services"],["/opportunities","careers"],["/apply","apply"]];
const rows=[];
const b=await chromium.launch();
for (const w of [390,430]) {
  const ctx=await b.newContext({viewport:{width:w,height:w===390?844:932},deviceScaleFactor:1,isMobile:true,hasTouch:true});
  await ctx.addInitScript(killSmooth);
  const p=await ctx.newPage();
  for (const [route,name] of ROUTES) {
    await p.goto(BASE+route,{waitUntil:"networkidle"}); await p.waitForTimeout(1600);
    const boxes=await p.evaluate(()=>{
      const h1=document.querySelector("h1"); if(!h1) return null;
      const head=h1.closest("header")||h1.parentElement.parentElement;
      const lime=h1.querySelector('[class*="Lime"], [class*="lime"]');
      const lede=head.querySelector('p[class*="ede"]');
      const box=el=>{if(!el)return null;const r=el.getBoundingClientRect();
        return {x:Math.max(0,Math.round(r.x)),y:Math.max(0,Math.round(r.y)),w:Math.round(r.width),h:Math.round(r.height),color:getComputedStyle(el).color,fs:parseFloat(getComputedStyle(el).fontSize)};};
      const H=box(h1), L=box(lime);
      // the white part of the headline is whatever sits above the lime line
      const white=L&&H?{...H,h:Math.max(4,L.y-H.y),color:getComputedStyle(h1).color,fs:H.fs}:H;
      return {white, lime:L, lede:box(lede), frame:box(head)};
    });
    if(!boxes){rows.push({w,name,note:"no h1"});continue;}
    // hide every glyph and vector so only photo + scrim remain
    await p.evaluate(()=>{for(const e of document.querySelectorAll("h1,h2,h3,p,a,button,span,li,svg,form,label,input,select,textarea")) e.style.visibility="hidden";});
    await p.waitForTimeout(300);
    const vh = w===390?844:932;
    const shot=async(bx)=>{ if(!bx||bx.h<3||bx.y>vh) return null;
      const clip={x:bx.x,y:bx.y,width:Math.max(2,Math.min(bx.w,w-bx.x)),height:Math.max(2,Math.min(bx.h,vh-bx.y))};
      const png=decodePng(await p.screenshot({clip})); const ch=png.channels; let mx=0;
      for(let i=0;i<png.pixels.length;i+=ch){const L=rel(png.pixels[i],png.pixels[i+1],png.pixels[i+2]); if(L>mx)mx=L;}
      return mx; };
    const r={w,name};
    if(boxes.frame&&boxes.white){ r.copyTopPct=Math.round(100*(boxes.white.y-boxes.frame.y)/boxes.frame.h);
      r.frameH=boxes.frame.h;
      if(boxes.lime) r.limeBandPct=Math.round(100*(boxes.lime.y-boxes.frame.y)/boxes.frame.h)+"-"+Math.round(100*(boxes.lime.y+boxes.lime.h-boxes.frame.y)/boxes.frame.h); }
    for (const k of ["white","lime","lede","frame"]) {
      const mx=await shot(boxes[k]); if(mx==null) continue;
      r[k+"MaxL"]=+mx.toFixed(4);
      if(k!=="frame"){ const m=/rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(boxes[k].color);
        const tl=m?rel(+m[1],+m[2],+m[3]):1;
        r[k+"Fs"]=Math.round(boxes[k].fs);
        r[k+"Ratio"]=+ratio(tl,mx).toFixed(2);
        r[k+"Floor"]= k==="lede"?4.5:3; }
    }
    rows.push(r);
  }
  await ctx.close();
}
await b.close();
fs.writeFileSync("docs/cinematic/review/heroscrim.json",JSON.stringify(rows,null,2));
const bad=[];
for(const r of rows){
  const parts=[];
  for(const k of ["white","lime","lede"]) if(r[k+"Ratio"]!=null){
    const ok=r[k+"Ratio"]>=r[k+"Floor"]; if(!ok) bad.push(`${r.w} ${r.name} ${k}`);
    parts.push(`${k} ${r[k+"Ratio"]}${ok?"":" FAIL"}/${r[k+"Floor"]}`);
  }
  const fok=(r.frameMaxL??0)>=0.35;
  if(!fok) bad.push(`${r.w} ${r.name} frame`);
  console.log(`${r.w} ${r.name.padEnd(9)} ${parts.join("  ")}  | frameMaxL ${r.frameMaxL}${fok?"":" DIM"} | frameH ${r.frameH} copyTop ${r.copyTopPct}% lime ${r.limeBandPct}%`);
}
console.log(bad.length?"FAILING: "+bad.join(", "):"all hero bands clear their floors and every frame reads as a photo");
