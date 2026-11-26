import {get,put,del,BlobPreconditionFailedError,BlobNotFoundError} from '@vercel/blob';

// Read from origin because a cached offer could outlive its cancellation.
export const pairingStore={
  async read(path){
    const result=await get(path,{access:'private',useCache:false});
    if(!result)return null;
    return {body:await new Response(result.stream).json(),etag:result.blob.etag};
  },
  async write(path,body,etag){
    try{
      await put(path,JSON.stringify(body),{
        access:'private',contentType:'application/json',ttlDays:1,addRandomSuffix:false,
        allowOverwrite:!!etag,ifMatch:etag
      });
      return true;
    }catch(error){
      if(error instanceof BlobPreconditionFailedError || /already exists/i.test(error.message))return false;
      throw error;
    }
  },
  async remove(path,etag){
    try{await del(path,{ifMatch:etag})}
    catch(error){if(!(error instanceof BlobNotFoundError || error instanceof BlobPreconditionFailedError))throw error}
  }
};
