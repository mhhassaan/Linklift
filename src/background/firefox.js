import {getApi} from '../shared/api.js';
import {createBackground} from './common.js';
import {firefoxMedia} from '../media/firefox.js';
const api=getApi();let background;
let host=firefoxMedia(api,id=>background.expire(id));
const media={copy:(...args)=>host.copy(...args),prepare:(...args)=>host.prepare(...args),inventory:()=>host.inventory(),bind:(...args)=>host.bind(...args),release:(...args)=>host.release(...args),cancelOwner:token=>host.cancelOwner(token)};
if(__VALIDATION__){media.configure=value=>host.configure(value);media.releaseBarrier=id=>host.releaseBarrier(id);media.lose=async()=>{host.dispose();host=firefoxMedia(api,id=>background.expire(id));};}
background=createBackground({api,media,browserKind:'firefox'});
background.ready.catch(error=>console.error('TweetX initialization:',error.message));
