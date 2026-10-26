/** Fit image and all control rows inside the current map, including short windows. */
export function cameraLayout(mapWidth,mapHeight,full=false,chrome=92){
 const margin=full?8:10,width=Math.max(1,full?mapWidth-16:mapWidth<650?mapWidth-20:Math.min(640,Math.max(300,mapWidth*.60)));
 const preferredTop=mapWidth<650?113:56,top=full?8:Math.min(preferredTop,Math.max(8,mapHeight-260));
 const available=Math.max(1,mapHeight-top-margin),height=full?available:Math.min(available,width*.625+chrome);
 return{width,height,top,right:margin,screenHeight:Math.max(0,height-chrome)};
}
