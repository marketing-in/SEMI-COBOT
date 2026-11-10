// The one Vercel Function. vercel.json rewrites every /api/* path here and passes the original path as
// __path, because a rewritten function is not guaranteed to see the URL the browser asked for.
import {handleHosted} from '../hosted.mjs';

export function originalRequest(request){
 const url=new URL(request.url),path=url.searchParams.get('__path');if(path==null)return request;
 url.searchParams.delete('__path');url.pathname='/api/'+path.replace(/^\/+/,'');
 return new Request(url,request)}

export default {fetch:request=>handleHosted(originalRequest(request),{
 ...process.env,REQUIRE_SIGNIN:process.env.REQUIRE_SIGNIN??'0'
})};
