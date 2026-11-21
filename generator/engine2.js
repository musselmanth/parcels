// ===== RUNTIME START (shared by the game page and the generator) =====
// Board = any set of hex cells in axial coordinates [q, r]. Parcels = 3 connected cells.
// Rules: shape, color and count (1-3) are each all the same or all different.
let CELLS=[], N=0, GROUPS=0, NEIGH=[], PLACEMENTS=[], PKEYS=new Set();
const DIRS=[[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];
function setCells(cells){
  CELLS=cells; N=cells.length; GROUPS=N/3; PLACEMENTS=[]; PKEYS=new Set();
  const idx=new Map(cells.map(([q,r],i)=>[q+','+r,i]));
  NEIGH=cells.map(([q,r])=>DIRS.map(([dq,dr])=>idx.get((q+dq)+','+(r+dr))).filter(x=>x!==undefined));
  for(let a=0;a<N;a++) for(const b of NEIGH[a]) for(const c of new Set([...NEIGH[a],...NEIGH[b]])){
    if(c===a||c===b) continue;
    const t=[a,b,c].sort((x,y)=>x-y), k=t.join(',');
    if(!PKEYS.has(k)){PKEYS.add(k); PLACEMENTS.push(t);}
  }
}
const sameOrDiff=(x,y,z)=>(x===y&&y===z)||(x!==y&&y!==z&&x!==z);
function validTiles(A,B,C){ return sameOrDiff(A.s,B.s,C.s)&&sameOrDiff(A.c,B.c,C.c)&&sameOrDiff(A.n,B.n,C.n); }
function whyInvalid(A,B,C){
  const out=[];
  if(!sameOrDiff(A.s,B.s,C.s)) out.push('Shapes: two match and one doesn’t.');
  if(!sameOrDiff(A.c,B.c,C.c)) out.push('Colors: two match and one doesn’t.');
  if(!sameOrDiff(A.n,B.n,C.n)) out.push('Counts: two match and one doesn’t.');
  return out.join(' ');
}
// ===== RUNTIME END =====

// ===== GENERATOR (offline only) =====
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function shuffle(arr,r){const a=arr.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
const isValid=(t,p)=>validTiles(t[p[0]],t[p[1]],t[p[2]]);
const candidates=t=>PLACEMENTS.filter(p=>isValid(t,p));

// ---------- board shapes ----------
// Start from a hexagon of radius R and carve away symmetric groups of cells, favoring the rim
// (lobes, notches, star points) and sometimes the middle (holes). Then insist every cell touches
// at least 3 others, the board is one piece, and its size is a multiple of 3 in the target range.
const ROT=([q,r])=>[-r,q+r];                 // 60° turn
const MIR=([q,r])=>[r,q];                    // reflection
const SYMS={
  r6:c=>{const o=[c];for(let k=1;k<6;k++)o.push(ROT(o[k-1]));return o;},
  r3:c=>{const a=ROT(ROT(c)),b=ROT(ROT(a));return [c,a,b];},
  r2:c=>[c,ROT(ROT(ROT(c)))],
  d6:c=>{const o=SYMS.r6(c);return [...o,...o.map(MIR)];},
  d3:c=>{const o=SYMS.r3(c);return [...o,...o.map(MIR)];},
  m:c=>[c,MIR(c)],
  d2:c=>{const o=SYMS.r2(c);return [...o,...o.map(MIR)];},
};
const ck=([q,r])=>q+','+r;
const hexDist=([q,r])=>Math.max(Math.abs(q),Math.abs(r),Math.abs(q+r));
function components(set){
  const left=new Set(set), comps=[];
  while(left.size){ const s=left.values().next().value, comp=[s]; left.delete(s);
    for(let i=0;i<comp.length;i++){ const [q,r]=comp[i].split(',').map(Number);
      for(const [dq,dr] of DIRS){ const k=(q+dq)+','+(r+dr); if(left.has(k)){ left.delete(k); comp.push(k);} } }
    comps.push(comp); }
  return comps;
}
function neighborsIn(set,k){ const [q,r]=k.split(',').map(Number); let n=0; for(const [dq,dr] of DIRS) if(set.has((q+dq)+','+(r+dr))) n++; return n; }
function makeShape(r,R,lo,hi,minFill=.5,minDeg=4.3){
  // the classic: a plain hexagon (minus the center when the count needs it), about 1 board in 5
  if(r()<.22){
    for(let RR=R;RR>=2;RR--){ const all=[]; for(let q=-RR;q<=RR;q++) for(let s=-RR;s<=RR;s++){ if(hexDist([q,s])<=RR && !(q===0&&s===0&&(3*RR*(RR+1)+1)%3!==0)) all.push([q,s]); }
      if(all.length%3===0 && all.length>=lo && all.length<=hi) return {cells:all.sort((a,b)=>a[1]-b[1]||a[0]-b[0]), sym:'hex'}; }
  }
  for(let attempt=0;attempt<600;attempt++){
    const symName=shuffle(Object.keys(SYMS),r)[0], sym=SYMS[symName];
    const all=[]; for(let q=-R;q<=R;q++) for(let s=-R;s<=R;s++){ if(hexDist([q,s])<=R) all.push([q,s]); }
    const cells=new Set(all.map(ck));
    // orbits of the symmetry group
    const seen=new Set(), orbits=[];
    for(const c of all){ const k=ck(c); if(seen.has(k)) continue; const o=[...new Set(sym(c).map(ck))].filter(x=>cells.has(x)); o.forEach(x=>seen.add(x)); orbits.push({o,d:hexDist(c)}); }
    // each group of cells gets its own random appetite for removal, so carving makes lobes and notches
    // instead of peeling whole rings
    const holeBias=r()<.38;
    orbits.forEach(x=>{ x.w = x.d===0 ? (holeBias?4:0) : Math.pow(r(),2.2) * (x.d===R ? 1.6 : x.d===1 ? (holeBias?1.2:.25) : .55+ .5*x.d/R); });
    const weight=x=>Math.max(x.w,0);
    const target=lo+Math.floor(r()*(hi-lo+1));
    let guard=0;
    while(cells.size>target && guard++<500){
      const pool=orbits.filter(x=>x.o.every(k=>cells.has(k)));
      const tot=pool.reduce((s,x)=>s+weight(x),0); if(!tot) break;
      let pick=r()*tot, ch=pool[0]; for(const x of pool){ pick-=weight(x); if(pick<=0){ ch=x; break; } }
      if(cells.size-ch.o.length < lo-3) { ch.w=0; continue; }
      ch.o.forEach(k=>cells.delete(k));
    }
    // prune cells that touch fewer than 3 others; keep the biggest piece
    let changed=true; while(changed){ changed=false; for(const k of [...cells]) if(neighborsIn(cells,k)<3){ cells.delete(k); changed=true; } }
    const comps=components(cells); if(!comps.length) continue;
    const main=comps.sort((a,b)=>b.length-a.length)[0];
    if(main.length%3!==0 || main.length<lo || main.length>hi) continue;
    const set=new Set(main); if(main.some(k=>neighborsIn(set,k)<3)) continue;
    // no pinholes: a missing cell surrounded by board on 5-6 sides looks like a lost tile (the center hole is fine)
    let pin=false;
    for(const k of set){ const [q,r]=k.split(',').map(Number);
      for(const [dq,dr] of DIRS){ const h=[q+dq,r+dr], hk=ck(h); if(set.has(hk)||(h[0]===0&&h[1]===0)) continue; if(neighborsIn(set,hk)>=5){ pin=true; break; } }
      if(pin) break; }
    if(pin) continue;
    // keep it reasonably compact so tiles stay big on a phone
    const Rm0=Math.max(...main.map(k=>hexDist(k.split(',').map(Number))));
    if(main.length < minFill*(3*Rm0*(Rm0+1)+1)) continue;
    // too close to a plain hexagon? compare with the smallest hexagon that contains it
    const Rm=Math.max(...main.map(k=>hexDist(k.split(',').map(Number)))), full=3*Rm*(Rm+1)+1;
    if(full-main.length < Math.max(3, Math.round(.08*full))) continue;
    // chunky: thin rings and long arms leave too few believable wrong parcels
    const avgDeg=main.reduce((t,k)=>t+neighborsIn(set,k),0)/main.length;
    if(avgDeg<minDeg) continue;
    const out=main.map(k=>k.split(',').map(Number)).sort((a,b)=>a[1]-b[1]||a[0]-b[0]);
    return {cells:out, sym:symName};
  }
  return null;
}

// ---------- partition into parcels (with a work budget so awkward shapes are rejected fast) ----------
function tilePartition(r){
  const grid=new Array(N).fill(-1), groups=[]; let budget=40000;
  const ok=(function rec(){
    if(--budget<0) return false;
    let i=-1, best=99;
    for(let k=0;k<N;k++) if(grid[k]<0){ const n=PLACEMENTS.filter(p=>p.includes(k)&&p.every(x=>grid[x]<0)).length; if(n<best){best=n;i=k; if(n<=1)break;} }
    if(i<0) return true; if(best===0) return false;
    for(const p of shuffle(PLACEMENTS.filter(p=>p.includes(i)&&p.every(k=>grid[k]<0)),r)){
      p.forEach(k=>grid[k]=groups.length); groups.push(p);
      if(rec()) return true;
      groups.pop(); p.forEach(k=>grid[k]=-1);
    }
    return false;
  })();
  return ok?groups:null;
}

// ---------- solving / difficulty ----------
function countSolutions(cands,limit){
  const used=new Array(N).fill(false), byCell=Array.from({length:N},()=>[]);
  cands.forEach(p=>p.forEach(i=>byCell[i].push(p)));
  let count=0, sol=null; const stack=[];
  (function rec(){
    if(count>=limit) return;
    let bestOpts=null;
    for(let i=0;i<N;i++){ if(used[i]) continue; const o=byCell[i].filter(p=>p.every(k=>!used[k])); if(o.length===0) return; if(!bestOpts||o.length<bestOpts.length){bestOpts=o; if(o.length===1) break;} }
    if(!bestOpts){count++; sol=stack.slice(); return;}
    for(const p of bestOpts){ p.forEach(k=>used[k]=true); stack.push(p); rec(); stack.pop(); p.forEach(k=>used[k]=false); if(count>=limit) return; }
  })();
  return {count,sol};
}
function propagate(used,live){
  for(;;){ let placed=false;
    for(let i=0;i<N;i++){ if(used[i]) continue; let only=null,n=0;
      for(const p of live){ if(p.includes(i)&&p.every(k=>!used[k])){ n++; only=p; if(n>1) break; } }
      if(n===0) return false; if(n===1){ only.forEach(k=>used[k]=true); placed=true; } }
    if(!placed) return true; }
}
// 1 = forced moves only, 2 = "this would strand a tile", 3 = chain reasoning, 4 = needs a guess
function analyze(cands){
  let level=1, hardSteps=0; const used=new Array(N).fill(false); let live=cands.slice();
  for(;;){
    if(!propagate(used,live)) return {level:4,hardSteps};
    live=live.filter(p=>p.every(k=>!used[k]));
    if(used.every(Boolean)) return {level,hardSteps};
    const stranded=p=>{ const u=used.slice(); p.forEach(k=>u[k]=true);
      for(let i=0;i<N;i++){ if(!u[i]&&!live.some(q=>q.includes(i)&&q.every(k=>!u[k]))) return true; } return false; };
    let kill=live.filter(stranded);
    if(kill.length){ live=live.filter(p=>!kill.includes(p)); level=Math.max(level,2); hardSteps++; continue; }
    kill=live.filter(p=>{ const u=used.slice(); p.forEach(k=>u[k]=true); return !propagate(u,live); });
    if(kill.length){ live=live.filter(p=>!kill.includes(p)); level=Math.max(level,3); hardSteps+=2; continue; }
    return {level:4,hardSteps};
  }
}
const tkey=x=>x.s*16+x.c*4+x.n;
function makeGroupTiles(r,pSame){
  const pick=k=>{ if(r()<pSame){const v=Math.floor(r()*k); return [v,v,v];} return shuffle([...Array(k).keys()],r).slice(0,3); };
  const s=pick(4), c=pick(4), n=pick(3);
  return [0,1,2].map(i=>({s:s[i],c:c[i],n:n[i]+1}));
}
let MAXCOPY=1;
const copiesOK=t=>{ const m=new Map(); for(const x of t){ const k=tkey(x); const v=(m.get(k)||0)+1; if(v>MAXCOPY) return false; m.set(k,v);} return true; };
function evaluate(t){
  if(!copiesOK(t)) return null;
  const cands=candidates(t); const {count,sol}=countSolutions(cands,2);
  if(count!==1) return null;
  sol.forEach(g=>g.sort((a,b)=>a-b));
  const cover=new Array(N).fill(0); cands.forEach(p=>p.forEach(i=>cover[i]++));
  // Look-alike measures. realLook: real parcels whose tiles match on 2+ attributes (a giveaway).
  // decoyLook: false parcels that look like that (a trap). traps: touching tiles from different
  // real parcels that match on 2+ attributes (they look like they belong together but don't).
  const same=g=>(t[g[0]].s===t[g[1]].s&&t[g[1]].s===t[g[2]].s)+(t[g[0]].c===t[g[1]].c&&t[g[1]].c===t[g[2]].c)+(t[g[0]].n===t[g[1]].n&&t[g[1]].n===t[g[2]].n);
  const owner=new Array(N); sol.forEach((g,k)=>g.forEach(i=>owner[i]=k));
  const solKeys=new Set(sol.map(g=>g.join(',')));
  let realLook=0, decoyLook=0, traps=0;
  sol.forEach(g=>{ if(same(g)>=2) realLook++; });
  cands.forEach(g=>{ if(!solKeys.has(g.join(',')) && same(g)>=2) decoyLook++; });
  for(let i=0;i<N;i++) for(const j of NEIGH[i]) if(j>i && owner[i]!==owner[j]){ const a=t[i],b=t[j]; if((a.s===b.s)+(a.c===b.c)+(a.n===b.n)>=2) traps++; }
  return {decoys:cands.length-GROUPS, forced:cover.filter(x=>x===1).length, sol, cands, realLook, decoyLook, traps};
}

// ---------- difficulty profiles ----------
const LOOK=e=> .35*e.traps + 3*e.decoyLook - 5*e.realLook;
const PROFILES={
  easy:   {R:3, lo:18, hi:24, minFill:.42, minDeg:3.75, pSame:.14, iters:900,
           score:(e,a)=> -Math.abs(e.decoys-.4*N) + LOOK(e) + (a.level===2?4:0) - (a.level>2?40:0),
           gate:(e,a)=> a.level<=2},
  medium: {R:4, lo:27, hi:36, minDeg:4.15, pSame:.12, iters:2000,
           score:(e,a)=> e.decoys + 3*a.hardSteps + LOOK(e) - 4*e.forced - (a.level>=4?60:0),
           gate:(e,a)=> a.level>=2 && a.hardSteps>=2 && e.forced<=1},
  hard:   {R:4, lo:39, hi:48, pSame:.12, iters:2600,
           score:(e,a)=> e.decoys + 4*a.hardSteps + (a.level===3?15:0) + LOOK(e) - 4*e.forced - (a.level>=4?60:0),
           gate:(e,a)=> a.level===3 && e.forced===0},
  extreme:{R:4, lo:48, hi:60, pSame:.12, iters:3200,
           score:(e,a)=> e.decoys + 5*a.hardSteps + (a.level===3?20:0) + LOOK(e) - 5*e.forced - (a.level>=4?60:0),
           gate:(e,a)=> a.level===3 && a.hardSteps>=6 && e.forced===0},
};

function generatePuzzle(seed,kind){
  const m=PROFILES[kind], r=mulberry32(seed);
  for(let tries=0;tries<50;tries++){
    const shape=makeShape(r,m.R,m.lo,m.hi,m.minFill||.5,m.minDeg||4.3); if(!shape) continue;
    setCells(shape.cells); MAXCOPY = N>42 ? 2 : 1;
    const groups=tilePartition(r); if(!groups) continue;
    const t=new Array(N);
    const fill=g=>{
      const own=new Set(groups[g]), counts=new Map();
      t.forEach((x,i)=>{ if(x&&!own.has(i)){ const k=tkey(x); counts.set(k,(counts.get(k)||0)+1);} });
      let tt; for(let k=0;k<60;k++){ tt=makeGroupTiles(r,m.pSame); const ks=tt.map(tkey); if(new Set(ks).size===3 && ks.every(x=>(counts.get(x)||0)<MAXCOPY)) break; }
      groups[g].forEach((c,i)=>t[c]=tt[i]);
    };
    const full=()=>{ const e=evaluate(t); if(!e) return null; const a=analyze(e.cands); return {e,a,sc:m.score(e,a)}; };
    groups.forEach((_,g)=>fill(g));
    let cur=full(); for(let k=0;!cur&&k<400;k++){ fill(Math.floor(r()*GROUPS)); cur=full(); }
    if(!cur) continue;
    let best={...cur,t:t.slice()};
    for(let it=0;it<m.iters;it++){
      const T=3*(1-it/m.iters)+.05, g=Math.floor(r()*GROUPS), saved=groups[g].map(i=>t[i]);
      fill(g); const nx=full();
      if(nx && (nx.sc>=cur.sc || r()<Math.exp((nx.sc-cur.sc)/T))){ cur=nx; if(cur.sc>best.sc) best={...cur,t:t.slice()}; }
      else groups[g].forEach((c,i)=>t[c]=saved[i]);
    }
    if(!m.gate(best.e,best.a)) continue;
    return {cells:CELLS, sym:shape.sym, tiles:best.t, sol:best.e.sol, d:best.e.decoys, f:best.e.forced, l:best.a.level, h:best.a.hardSteps,
            look:{real:best.e.realLook, decoy:best.e.decoyLook, traps:best.e.traps}};
  }
  return null;
}
if(typeof module!=='undefined') module.exports={generatePuzzle,setCells,makeShape,mulberry32,PROFILES,candidates,countSolutions,get N(){return N;}};
