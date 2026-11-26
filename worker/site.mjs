// The build appends the asset table and bundles the same-origin pairing API.
export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname.startsWith('/api/pair/')){
      try{return await pairing(request,env.BUCKET,env.LOCAL_PLAYER || request.headers.get('oai-authenticated-user-id'))}
      catch{return Response.json({error:'Pairing service is temporarily unavailable. Try again.'},{status:503,headers:{'Cache-Control':'no-store'}})}
    }
    if(request.method!=='GET'&&request.method!=='HEAD')return new Response('Method not allowed',{status:405});
    const path=url.pathname.replace(/^\//,'')||'index.html';
    const asset=Object.hasOwn(assets,path)?assets[path]:assets[path+'.html'];
    if(!Array.isArray(asset))return new Response('Page not found',{status:404});
    const [type,packed,data]=asset;
    const headers={'Content-Type':type,'Cache-Control':'private, max-age=0, must-revalidate'};
    if(request.method==='HEAD')return new Response(null,{headers});
    const bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0));
    const stream=new Blob([bytes]).stream();
    return new Response(packed?stream.pipeThrough(new DecompressionStream('gzip')):stream,{headers});
  }
};
