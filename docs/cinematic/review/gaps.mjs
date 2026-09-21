import fs from "fs";
const o = JSON.parse(fs.readFileSync("docs/cinematic/review/measure.json", "utf8"));
for (const [vw, target] of [["1740", 140], ["390", 96]]) {
  let max = 0, over = 0, n = 0;
  for (const k of Object.keys(o)) {
    if (!k.startsWith(vw + "/")) continue;
    for (const g of o[k].gaps) {
      if (typeof g.deadAbove !== "number") continue;
      n++; if (g.deadAbove > max) max = g.deadAbove;
      if (g.deadAbove > target) { over++; console.log(`  OVER ${vw} ${k} ${g.cls} ${g.deadAbove}`); }
    }
  }
  console.log(`${vw}: target<=${target}  max ${max}  over ${over} of ${n} joints`);
}
console.log("sheet:", JSON.stringify(o["1740-chrome"].sheet));
for (const c of o.contrast) console.log(`  ${c.label.padEnd(20)} ${String(c.fs).padStart(8)}  worst ${c.worstRatio}  maxBackdropL ${c.maxBackdropL}`);
