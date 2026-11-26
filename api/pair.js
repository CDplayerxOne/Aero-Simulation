// Vercel Node function. Both devices use the same origin and Redis REST store.
module.exports=async function handler(req,res){
  const {handlePairing,redisCommand}=await import('../worker/vercel-pairing.mjs');
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).setHeader('Allow','POST').json({error:'Use POST.'});
  const host=req.headers.host;
  if(req.headers.origin && req.headers.origin!=='https://'+host && req.headers.origin!=='http://'+host){
    return res.status(403).json({error:'Open the garage and controller on the same site.'});
  }
  if(!req.headers['content-type']?.startsWith('application/json'))return res.status(415).json({error:'Expected JSON.'});
  const url=process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token=process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if(!url || !token)return res.status(503).json({error:'Phone pairing needs storage. Connect Upstash Redis to this Vercel project and redeploy.'});
  try{
    const address=req.headers['x-vercel-forwarded-for'] || req.socket.remoteAddress;
    const result=await handlePairing(req.query.action,req.body,host,address,redisCommand(url,token));
    return res.status(result.status).json(result.body);
  }catch{
    return res.status(503).json({error:'Pairing storage is unavailable. Check the Vercel Redis connection and try again.'});
  }
};
