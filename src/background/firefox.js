import {getApi} from '../shared/api.js';
import {createBackground} from './common.js';
import {firefoxMedia} from '../media/firefox.js';
const api=getApi();let background;
const progress=(owner,value)=>background?.progress(owner,value);
let host=firefoxMedia(api,id=>background.expire(id),progress);
const media={resolveDownload:spec=>host.resolveDownload(spec),copy:(...args)=>host.copy(...args),prepare:(...args)=>host.prepare(...args),prepareDownload:(...args)=>host.prepareDownload(...args),inventory:()=>host.inventory(),bind:(...args)=>host.bind(...args),release:(...args)=>host.release(...args),cancelOwner:token=>host.cancelOwner(token)};
if(__VALIDATION__){media.configure=value=>host.configure(value);media.releaseBarrier=id=>host.releaseBarrier(id);media.lose=async()=>{host.dispose();host=firefoxMedia(api,id=>background.expire(id),progress);};}
background=createBackground({api,media,browserKind:'firefox'});
background.ready.catch(error=>console.error('Linklift initialization:',error.message));
