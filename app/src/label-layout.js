/** Bounded offsets only: labels never build an arbitrarily tall vertical stack. */
export function placeMapLabels(items,width,height,obstacles=[]){
 const placed=[],result=[];
 for(const item of [...items].sort((a,b)=>Number(!!b.selected)-Number(!!a.selected))){
  if(!item.visible){result.push({...item,visible:false});continue}
  const x=Math.max(8+item.width/2,Math.min(width-8-item.width/2,item.x));let match=null;
  for(const offset of [0,-item.height-6,item.height+6]){
   const y=item.y+offset,box={left:x-item.width/2,right:x+item.width/2,top:y-item.height,bottom:y};
   if(box.top<8||box.bottom>height-8)continue;
   const intersects=o=>box.left<o.right+4&&box.right>o.left-4&&box.top<o.bottom+4&&box.bottom>o.top-4;
   if(placed.some(intersects)||obstacles.some(intersects))continue;
   match={x,y,visible:true};placed.push(box);break;
  }
  result.push({...item,...(match||{visible:false})});
 }
 return result;
}
