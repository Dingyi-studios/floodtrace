/** Leave native activation and editing keys with the focused control. */
export function ownsKeyboard(target){
 return !!target?.closest?.('button,a[href],input,select,textarea,summary,[contenteditable]:not([contenteditable="false"]),[role="button"],[role="slider"]');
}
