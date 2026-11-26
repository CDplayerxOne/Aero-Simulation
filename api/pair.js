// Vercel Node function. Both devices use the same origin and private Blob store.
import {handlePairing} from '../worker/vercel-pairing.mjs';
import {pairingStore} from '../worker/vercel-blob.mjs';

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).setHeader('Allow','POST').json({error:'Use POST.'});
  const host=req.headers.host;
  if(req.headers.origin && req.headers.origin!=='https://'+host && req.headers.origin!=='http://'+host){
    return res.status(403).json({error:'Open the garage and controller on the same site.'});
  }
  if(!req.headers['content-type']?.startsWith('application/json'))return res.status(415).json({error:'Expected JSON.'});
  if(!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID){
    return res.status(503).json({error:'Connect a private Vercel Blob store to enable phone pairing, then redeploy.'});
  }
  try{
    const address=req.headers['x-vercel-forwarded-for'] || req.socket.remoteAddress;
    const result=await handlePairing(req.query.action,req.body,host,address,pairingStore);
    return res.status(result.status).json(result.body);
  }catch{
    return res.status(503).json({error:'Pairing storage is unavailable. Check the Vercel Blob connection and try again.'});
  }
}
