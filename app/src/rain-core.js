export function rainAppearance(rate,strength,width,height,enabled=true){
 const amount=Math.max(0,Number(rate)||0),level=Math.max(0,Math.min(1,Number(strength)||0)),fraction=1-Math.exp(-amount/26);
 const areaScale=Math.max(.55,Math.min(1.4,Math.sqrt(Math.max(1,width*height)/(1166*640))));
 const count=enabled&&amount>.001&&level>0?Math.min(650,Math.round((18+900*fraction)*level*areaScale)):0;
 return{count,opacity:.25+.15*fraction,fraction,areaScale};
}
