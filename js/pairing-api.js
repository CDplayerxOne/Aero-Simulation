export async function signal(action,body){
  const response=await fetch('/api/pair/'+action,{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),
    cache:'no-store',signal:AbortSignal.timeout(12000)
  });
  const result=await response.json().catch(()=>null);
  if(!response.ok||!result){
    const error=new Error(result?.error||'Could not reach the pairing service. Open Groundline on both devices and try again.');
    error.status=response.status;
    throw error;
  }
  return result;
}
