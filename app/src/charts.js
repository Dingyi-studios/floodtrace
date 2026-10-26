export const fmt=(v,n=2)=>v==null?'—':Number(v).toFixed(n);
export function at(series,t){if(!series?.length)return null;let lo=0,hi=series.length-1;if(t<series[0].t||t>series[hi].t)return null;while(lo<hi){let m=Math.ceil((lo+hi)/2);if(series[m].t<=t)lo=m;else hi=m-1}const a=series[lo],b=series[Math.min(lo+1,series.length-1)];if(a.value==null||b.value==null)return a.t===t?a.value:null;const u=b.t===a.t?0:(t-a.t)/(b.t-a.t);return a.value+(b.value-a.value)*u}
export function chart({title,unit,series,t,duration,subtitle='',colors=['#528f87','#c28e51'],legend=[],bars=false,currentValue=undefined,startLabel='00:00',endLabel='02:00'}){
 const values=series.flatMap(s=>s.filter(v=>v.value!=null&&Number.isFinite(v.value)).map(v=>v.value));let min=values.length?Math.min(...values):0,max=values.length?Math.max(...values):1;
 if(min>=0&&(bars||max-min>.3))min=0;if(max-min<.01){min-=.05;max+=.05}const pad=(max-min)*.08;max+=pad;if(min!==0)min-=pad;
 const W=330,H=94,L=33,R=8,T=8,B=17,w=W-L-R,h=H-T-B,x=v=>L+v/duration*w,y=v=>T+h-(v-min)/(max-min)*h;
 const axis=[0,.5,1].map(f=>{const v=min+(max-min)*f;return`<line x1="${L}" y1="${y(v)}" x2="${W-R}" y2="${y(v)}" stroke="#dfe6d7" stroke-width=".7"/><text x="${L-6}" y="${y(v)+3}" text-anchor="end">${v>=1000?(v/1000).toFixed(1)+'k':v.toFixed(max>10?0:1)}</text>`}).join('');
 const paths=series.map((s,i)=>{
  if(bars&&i===0)return s.filter(p=>p.value!=null).map(p=>`<rect x="${x(p.t)}" y="${y(p.value)}" width="${Math.max(1.1,w/s.length*.85)}" height="${Math.max(0,y(0)-y(p.value))}" fill="${colors[i]}" opacity="${p.t>t?.28:.75}"/>`).join('');
  let d='',pen=false;for(const p of s){if(p.value==null){pen=false;continue}d+=`${pen?'L':'M'}${x(p.t).toFixed(2)},${y(p.value).toFixed(2)} `;pen=true}
  const path=`<path d="${d}" fill="none" stroke="${colors[i%colors.length]}" stroke-width="1.7" stroke-linecap="round" ${i===1?'stroke-dasharray="3 2"':''}/>`;
  const solid=s.filter(p=>p.value!=null),area=solid.length&&series.length===1?`<path d="M${x(solid[0].t)},${T+h} ${solid.map(p=>`L${x(p.t).toFixed(2)},${y(p.value).toFixed(2)}`).join(' ')} L${x(solid.at(-1).t)},${T+h} Z" fill="${colors[i]}" opacity=".08"/>`:'';
  return area+path;
 }).join('');
 const cursor=`<rect x="${x(t)}" y="${T}" width="${Math.max(0,W-R-x(t))}" height="${h}" fill="#f7f9f1" opacity=".44"/><line x1="${x(t)}" y1="${T}" x2="${x(t)}" y2="${T+h}" stroke="#64876a" stroke-width=".8" stroke-dasharray="2 2"/>`;
 const dots=series.map((s,i)=>{const v=i===0&&currentValue!==undefined?currentValue:at(s,t);return v==null?'':`<circle cx="${x(t)}" cy="${y(v)}" r="2.5" fill="${colors[i%colors.length]}" stroke="#f7f9f1" stroke-width="1.5"/>`}).join('');
 const current=currentValue!==undefined?currentValue:at(series[0],t);
 return `<div class="chart-head"><b>${title}</b><span class="chart-current mono">${fmt(current,['人','队'].includes(unit)?0:unit==='m³'||unit==='ha'?1:2)}<small>${unit}</small></span></div><div class="chart-sub">${subtitle}</div><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${title}，点击曲线可定位时间">${axis}${paths}${cursor}${dots}<text x="${L}" y="${H-2}">${startLabel}</text><text x="${(L+W-R)/2}" y="${H-2}" text-anchor="middle">回放时间</text><text x="${W-R}" y="${H-2}" text-anchor="end">${endLabel}</text></svg><div class="chart-legend">${legend.map((l,i)=>`<span style="--c:${colors[i%colors.length]}">${l}</span>`).join('')}</div>`;
}
