const E=require('./engine2.js'); const fs=require('fs');
const kind=process.argv[2], want=+process.argv[3]||50; const out=[], shapeCount=new Map(); let seed=1, misses=0; const t0=Date.now();
while(out.length<want){
  const p=E.generatePuzzle(seed*104729+kind.length*977, kind); seed++;
  if(!p) continue;
  const sig=p.cells.map(c=>c.join(',')).join(';');
  if((shapeCount.get(sig)||0)>=(p.sym==='hex'?10:(kind==='easy'?5:3))) continue;   // varied shapes: the classic hexagon up to 10 per level, others at most 2
  shapeCount.set(sig,(shapeCount.get(sig)||0)+1);
  // independent re-check: exactly one solution
  E.setCells(p.cells); if(E.countSolutions(E.candidates(p.tiles),2).count!==1) throw new Error('not unique');
  out.push({c:p.cells.flat(), t:p.tiles.map(x=>''+x.s+x.c+x.n).join(''), sol:p.sol, d:p.d, f:p.f, l:p.l, h:p.h, sym:p.sym, look:p.look});
}
// order each category from gentlest to toughest within its band
out.sort((a,b)=>(a.l-b.l)||(a.h-b.h)||(a.d-b.d));
fs.writeFileSync(`pz_${kind}.json`, JSON.stringify(out));
const avg=f=>(out.reduce((s,o)=>s+f(o),0)/out.length).toFixed(1), lv={}; out.forEach(o=>lv[o.l]=(lv[o.l]||0)+1);
console.log(kind, out.length, 'puzzles in', ((Date.now()-t0)/1000).toFixed(0)+'s | parcels', Math.min(...out.map(o=>o.c.length/6)),'-',Math.max(...out.map(o=>o.c.length/6)),
  '| decoys avg', avg(o=>o.d), '| forced avg', avg(o=>o.f), '| levels', JSON.stringify(lv), '| distinct shapes', shapeCount.size, '| plain hexagons', out.filter(o=>o.sym==="hex").length, '| look-alike real parcels avg', avg(o=>o.look.real), '| look-alike traps avg', avg(o=>o.look.decoy));
