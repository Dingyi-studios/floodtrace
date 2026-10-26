/** Preserve nested list positions and the visible row across sidebar replacement. */
export class SidebarMemory{
 constructor(){this.scopes=new Map()}
 capture(root){
  const scope=root.dataset.scrollScope;if(!scope)return;
  const box=root.getBoundingClientRect(),rows=[...root.querySelectorAll('[data-object]')];
  const visible=e=>{const r=e.getBoundingClientRect(),clip=e.closest('[data-scroll-key]')?.getBoundingClientRect()??box;return r.bottom>Math.max(box.top+36,clip.top)&&r.top<Math.min(box.bottom-8,clip.bottom)};
  const focused=document.activeElement?.closest?.('[data-object]');
  const row=focused&&root.contains(focused)&&visible(focused)?focused:rows.find(visible);
  const list=row?.closest('[data-scroll-key]');
  this.scopes.set(scope,{top:root.scrollTop,lists:[...root.querySelectorAll('[data-scroll-key]')].map(e=>[e.dataset.scrollKey,e.scrollTop]),details:[...root.querySelectorAll('details')].map(e=>e.open),anchor:row?{id:row.dataset.object,list:list?.dataset.scrollKey,offset:row.getBoundingClientRect().top-box.top}:null});
 }
 restore(root,scope){
  root.dataset.scrollScope=scope;const saved=this.scopes.get(scope);if(!saved){root.scrollTop=0;return}
  for(const [key,top]of saved.lists){const e=[...root.querySelectorAll('[data-scroll-key]')].find(e=>e.dataset.scrollKey===key);if(e)e.scrollTop=top}
  root.querySelectorAll('details').forEach((e,i)=>{if(saved.details[i]!=null)e.open=saved.details[i]});
  root.scrollTop=saved.top;
  if(saved.anchor){const a=saved.anchor,region=a.list?[...root.querySelectorAll('[data-scroll-key]')].find(e=>e.dataset.scrollKey===a.list):root;const row=[...(region?.querySelectorAll('[data-object]')??[])].find(e=>e.dataset.object===a.id);if(row)root.scrollTop+=row.getBoundingClientRect().top-root.getBoundingClientRect().top-a.offset}
 }
}
