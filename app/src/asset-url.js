/** Keep static data and textures under the configured Vite deployment prefix. */
export function assetUrl(path,base=import.meta.env?.BASE_URL??'/'){
 if(/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(path))return path;
 return(base.endsWith('/')?base:base+'/')+path.replace(/^\/+/, '');
}
