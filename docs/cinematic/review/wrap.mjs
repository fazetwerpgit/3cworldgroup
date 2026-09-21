import { chromium } from "playwright";
const B="http://127.0.0.1:3120";
const routes=[["/","home"],["/about","about"],["/services","services"],["/opportunities","careers"],["/contact","contact"],["/apply","apply"]];
const b=await chromium.launch();
for(const w of [1740,1440,390]){
 const ctx=await b.newContext({viewport:{width:w,height:1000}});
 const p=await ctx.newPage();
 for(const [r,name] of routes){
  await p.goto(B+r,{waitUntil:"networkidle"});
  await p.addStyleTag({content:"html{scroll-behavior:auto!important}nextjs-portal{display:none!important}"});
  await p.evaluate(async()=>{for(let y=0;y<document.body.scrollHeight;y+=450){scrollTo(0,y);await new Promise(x=>requestAnimationFrame(x));}scrollTo(0,0);});
  await p.waitForTimeout(500);
  const bad = await p.evaluate(()=>{
    const out=[];
    const lines=(el)=>{const rg=document.createRange();const res=[];
      const walk=(n)=>{ if(n.nodeType===3&&n.textContent.trim()){ let i=0; const t=n.textContent;
          // collect line boxes by measuring each character run
          rg.selectNodeContents(n); const rects=[...rg.getClientRects()];
          rects.forEach(rc=>res.push(rc)); }
        else n.childNodes && [...n.childNodes].forEach(walk); };
      walk(el); return res; };
    document.querySelectorAll("h1,h2,h3").forEach(h=>{
      const cs=getComputedStyle(h); const fs=parseFloat(cs.fontSize);
      if(fs<30) return;
      const rs=lines(h).filter(r=>r.width>1);
      if(rs.length<2) return;
      // group by top
      const rows={}; rs.forEach(r=>{const k=Math.round(r.top);(rows[k] ||= []).push(r);});
      const ws=Object.values(rows).map(g=>Math.round(Math.max(...g.map(r=>r.right))-Math.min(...g.map(r=>r.left))));
      const words=h.innerText.trim().split(/\s+/);
      const maxw=Math.max(...ws);
      const lastLineText=h.innerText.trim().split("\n").pop().trim();
      const widow = ws.length>1 && ws[ws.length-1] < maxw*0.3;
      const oneWord = lastLineText && lastLineText.split(/\s+/).length===1 && words.length>3 && ws.length>1;
      if(widow||oneWord) out.push({t:h.innerText.replace(/\n/g," / ").slice(0,60), ws, fs:Math.round(fs)});
    });
    return out;
  });
  if(bad.length) bad.forEach(x=>console.log(w,name,JSON.stringify(x)));
 }
 await ctx.close();
}
await b.close();
console.log("wrap scan done");
