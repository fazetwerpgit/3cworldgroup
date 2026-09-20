import { chromium } from "playwright";
const routes=["/","/about","/services","/opportunities","/contact","/apply","/careers","/privacy","/terms"];
const b=await chromium.launch(); let bad=0;
for (const r of routes){ const p=await b.newPage({viewport:{width:1440,height:900}}); const errs=[];
 p.on("console",m=>m.type()==="error"&&errs.push(m.text())); p.on("pageerror",e=>errs.push(e.message));
 const res=await p.goto("http://127.0.0.1:3120"+r,{waitUntil:"networkidle"});
 const sw=await p.evaluate(()=>document.documentElement.scrollWidth);
 const hasKit=await p.evaluate(()=>!!document.querySelector('header a[href="/apply"]'));
 const ok=res.status()===200&&errs.length===0&&sw<=1440;
 if(!ok) bad++;
 console.log(`${r.padEnd(15)} ${res.status()} errors=${errs.length} overflow=${sw>1440} cinematicChrome=${hasKit}`);
 await p.close(); }
// nav crawl from home
const p=await b.newPage({viewport:{width:1440,height:900}});
await p.goto("http://127.0.0.1:3120/",{waitUntil:"networkidle"});
const hrefs=await p.$$eval("header a, footer a",as=>[...new Set(as.map(a=>a.getAttribute("href")))]);
console.log("chrome links:",hrefs.join(" "));
await p.close(); await b.close(); console.log(bad?`FAIL ${bad}`:"ALL OK");
