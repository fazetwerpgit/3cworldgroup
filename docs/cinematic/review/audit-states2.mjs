import { chromium } from 'playwright';
const BASE='http://127.0.0.1:3120';
const CSS=`html{scroll-behavior:auto !important}nextjs-portal{display:none!important}`;
const browser=await chromium.launch();
const ctx=await browser.newContext({viewport:{width:1740,height:1000}});
const page=await ctx.newPage();
const log=[];
const P=(...a)=>log.push(a.join(' '));

async function prep(route){
  await page.goto(BASE+route,{waitUntil:'networkidle'});
  await page.addStyleTag({content:CSS});
  await page.evaluate(()=>{document.querySelectorAll('[data-reveal]').forEach(e=>e.dataset.shown='true')});
  await page.waitForTimeout(300);
}
async function pseudoHover(sel,pseudo,label){
  const h=page.locator(sel).first();
  if(!await h.count()) return P('MISSING',sel);
  await h.scrollIntoViewIfNeeded();
  const before=await h.evaluate((el,p)=>{const c=getComputedStyle(el,p);return {t:c.transform,o:c.opacity,bg:c.backgroundColor,w:c.width,col:c.color,tr:c.transitionProperty+' '+c.transitionDuration}},pseudo);
  await h.hover(); await page.waitForTimeout(420);
  const after=await h.evaluate((el,p)=>{const c=getComputedStyle(el,p);return {t:c.transform,o:c.opacity,bg:c.backgroundColor,w:c.width,col:c.color,tr:c.transitionProperty+' '+c.transitionDuration}},pseudo);
  P(label,pseudo,JSON.stringify(before),'->',JSON.stringify(after));
  await page.mouse.move(2,2); await page.waitForTimeout(120);
}

// --- HOME
await prep('/');
P('=== HOME pseudo/hover');
await pseudoHover('[class*="headerLink"]','::after','headerLink');
await pseudoHover('[class*="cityChip"]','::before','cityChip');
await pseudoHover('[class*="footerNav"] a','','footerNav a');
await pseudoHover('[class*="footerSocial"] a','','footerSocial a');
await pseudoHover('[class*="footerLegal"] a','','footerLegal a');
P('=== HOME active states (mouse down held)');
for(const [sel,label] of [['[class*="btnLime"]','btnLime'],['[class*="btnGhost"]','btnGhost'],['[class*="cityChip"]','cityChip'],['[class*="quietLink"]','quietLink'],['[class*="faqSummary"]','faqSummary'],['[class*="footerNav"] a','footerNav a']]){
  const h=page.locator(sel).first(); if(!await h.count()){P('MISSING',sel);continue}
  await h.scrollIntoViewIfNeeded(); const box=await h.boundingBox(); if(!box){P('NOBOX',sel);continue}
  const rest=await h.evaluate(el=>{const c=getComputedStyle(el);return {t:c.transform,bg:c.backgroundColor,col:c.color,sh:c.boxShadow}});
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
  await page.mouse.down(); await page.waitForTimeout(350);
  const act=await h.evaluate(el=>{const c=getComputedStyle(el);return {t:c.transform,bg:c.backgroundColor,col:c.color,sh:c.boxShadow,m:el.matches(':active')}});
  await page.mouse.up(); await page.waitForTimeout(120); await page.mouse.move(2,2);
  P('ACTIVE',label,JSON.stringify(rest),'->',JSON.stringify(act));
}

// --- CONTACT pathRow
await prep('/contact');
P('=== CONTACT pathRow');
{
  const h=page.locator('[class*="pathRow"]').first();
  await h.scrollIntoViewIfNeeded(); const box=await h.boundingBox();
  const rest=await h.evaluate(el=>{const c=getComputedStyle(el);return {tr:c.transitionProperty+' / '+c.transitionDuration,t:c.transform,pl:c.paddingLeft,bb:c.borderBottomColor}});
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2); await page.mouse.down(); await page.waitForTimeout(400);
  const act=await h.evaluate(el=>{const c=getComputedStyle(el);return {t:c.transform,pl:c.paddingLeft,bb:c.borderBottomColor,m:el.matches(':active')}});
  await page.mouse.up(); await page.mouse.move(2,2);
  P('pathRow rest',JSON.stringify(rest)); P('pathRow :active',JSON.stringify(act));
}
P('=== CONTACT select arrow');
{
  const s=page.locator('select').first();
  const info=await s.evaluate(el=>{const c=getComputedStyle(el);return {appearance:c.appearance,bgImage:c.backgroundImage.slice(0,60),bgPos:c.backgroundPosition,bgSize:c.backgroundSize,bgRepeat:c.backgroundRepeat,pr:c.paddingRight,w:el.getBoundingClientRect().width}});
  P('select',JSON.stringify(info));
}

// --- APPLY form drive
await prep('/apply');
P('=== APPLY form states');
const snapField=async(sel,label)=>{
  const h=page.locator(sel).first();
  const s=await h.evaluate(el=>{const c=getComputedStyle(el);return {bg:c.backgroundColor,bc:c.borderTopColor,bw:c.borderTopWidth,out:c.outlineWidth+' '+c.outlineStyle+' '+c.outlineColor,oo:c.outlineOffset,sh:c.boxShadow,color:c.color,minH:c.minHeight,fs:c.fontSize,ai:el.getAttribute('aria-invalid'),val:el.value}});
  P(label,JSON.stringify(s));
};
await page.locator('#apply-form').scrollIntoViewIfNeeded();
await snapField('#apply-name','name REST');
await page.locator('#apply-name').hover(); await page.waitForTimeout(250);
await snapField('#apply-name','name HOVER');
await page.locator('#apply-name').click(); await page.waitForTimeout(250);
await snapField('#apply-name','name FOCUS(mouse)');
await page.keyboard.type('Test Person'); await page.waitForTimeout(150);
await snapField('#apply-name','name FILLED+FOCUS');
await page.locator('#apply-city').click(); await page.waitForTimeout(200);
await snapField('#apply-name','name FILLED blurred');
// keyboard focus
await page.locator('#apply-email').evaluate(el=>el.blur());
await page.keyboard.press('Tab'); await page.waitForTimeout(150);
P('activeAfterTab', await page.evaluate(()=>document.activeElement.id||document.activeElement.className));
// submit empty -> invalid
await prep('/apply');
await page.locator('#apply-form').scrollIntoViewIfNeeded();
await page.locator('button[type=submit]').click(); await page.waitForTimeout(600);
await snapField('#apply-name','name AFTER EMPTY SUBMIT');
P('formError text/vis', JSON.stringify(await page.evaluate(()=>{const e=document.querySelector('[role=alert]');const c=getComputedStyle(e);return {text:e.textContent.trim(),display:c.display,color:c.color,bg:c.backgroundColor}})));
P('validationMessage', await page.locator('#apply-name').evaluate(el=>el.validationMessage));
// fill one badly then blur -> user-invalid
await page.locator('#apply-email').fill('not-an-email');
await page.locator('#apply-city').click(); await page.waitForTimeout(250);
await snapField('#apply-email','email BAD (user-invalid?)');
P('email matches user-invalid', String(await page.locator('#apply-email').evaluate(el=>el.matches(':user-invalid'))));
// disabled submit
P('submit disabled style', JSON.stringify(await page.locator('button[type=submit]').evaluate(el=>{el.disabled=true;const c=getComputedStyle(el);return {op:c.opacity,cur:c.cursor,bg:c.backgroundColor,col:c.color}})));

// --- mobile 390
await page.setViewportSize({width:390,height:844});
for(const r of ['/apply','/']){
  await prep(r);
  const bar=await page.evaluate(()=>{const b=document.querySelector('[data-apply-bar]');if(!b)return null;const c=getComputedStyle(b);const rc=b.getBoundingClientRect();return {vis:b.dataset.visible||'none',display:c.display,pos:c.position,h:rc.height,bottom:rc.bottom,bg:c.backgroundColor}});
  P('390 '+r+' applyBar', JSON.stringify(bar));
  if(r==='/apply'){
    const f=await page.evaluate(()=>{const el=document.querySelector('#apply-name');const c=getComputedStyle(el);const r=el.getBoundingClientRect();return {fs:c.fontSize,h:r.height,w:r.width}});
    P('390 apply field', JSON.stringify(f));
    const b=await page.evaluate(()=>{const el=document.querySelector('button[type=submit]');const r=el.getBoundingClientRect();return {h:r.height,w:r.width}});
    P('390 submit', JSON.stringify(b));
  }
}
await browser.close();
console.log(log.join('\n'));
