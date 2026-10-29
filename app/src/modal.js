/** Native dialog supplies focus containment, inert background and Escape. */
export class Modal{
 constructor(root){this.root=root;this.dialog=null;this.previousFocus=null}
 get open(){return !!this.dialog?.open}
 show(content){
  const previous=this.open?this.previousFocus:document.activeElement;
  this.close(false);this.previousFocus=previous;
  const dialog=document.createElement('dialog');dialog.className='modal-dialog';
  dialog.innerHTML=`<div class="modal"><button class="close" aria-label="关闭" autofocus>×</button>${content}</div>`;
  this.root.replaceChildren(dialog);this.dialog=dialog;
  const title=dialog.querySelector('h2');if(title){title.id='modal-title';dialog.setAttribute('aria-labelledby',title.id)}
  dialog.querySelector('.close').onclick=()=>this.close();
  dialog.addEventListener('click',e=>{if(e.target===dialog)this.close()});
  dialog.addEventListener('cancel',e=>{e.preventDefault();this.close()});
  dialog.addEventListener('keydown',e=>{
   if(e.key!=='Tab')return;
   const items=[...dialog.querySelectorAll('button,a[href],input,select,textarea,[tabindex]')].filter(el=>!el.disabled&&el.tabIndex>=0&&el.getClientRects().length);
   const edge=e.shiftKey?items[0]:items.at(-1);
   if(document.activeElement===edge){e.preventDefault();(e.shiftKey?items.at(-1):items[0])?.focus()}
  });
  dialog.showModal();
 }
 close(restore=true){
  if(!this.dialog)return;
  this.dialog.close();this.dialog.remove();this.dialog=null;
  if(restore&&this.previousFocus?.isConnected)this.previousFocus.focus({preventScroll:true});
  this.previousFocus=null;
 }
}
