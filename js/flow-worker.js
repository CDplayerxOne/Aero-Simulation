// Solve a velocity potential on a regular grid. Solid cells have zero normal flux.
const nx=72, ny=41, nz=43, h=0.12, slice=nx*ny, n=slice*nz;
const x0=-(nx-1)*h/2, y0=-(ny-1)*h/2, z0=-(nz-1)*h/2;
const index=(i,j,k)=>i+j*nx+k*slice;
function voxelize(vertices) {
  const solid=new Uint8Array(n), hits=new Map();
  // Rasterize the triangle surface on all three projections to capture thin sheets.
  // Paired intersections along x additionally fill closed volumes.
  const origin=[x0,y0,z0], size=[nx,ny,nz];
  for(let f=0;f<vertices.length;f+=9) for(let axis=0;axis<3;axis++){
    const u=(axis+1)%3,v=(axis+2)%3;
    const a=vertices[f+u], b=vertices[f+v], du=vertices[f+3+u]-a,dv=vertices[f+3+v]-b;
    const eu=vertices[f+6+u]-a,ev=vertices[f+6+v]-b,det=du*ev-dv*eu;
    if(Math.abs(det)<1e-10)continue;
    const uMin=Math.max(1,Math.ceil((a+Math.min(0,du,eu)-origin[u])/h));
    const uMax=Math.min(size[u]-2,Math.floor((a+Math.max(0,du,eu)-origin[u])/h));
    const vMin=Math.max(1,Math.ceil((b+Math.min(0,dv,ev)-origin[v])/h));
    const vMax=Math.min(size[v]-2,Math.floor((b+Math.max(0,dv,ev)-origin[v])/h));
    for(let j=vMin;j<=vMax;j++)for(let i=uMin;i<=uMax;i++){
      const p=origin[u]+i*h-a,q=origin[v]+j*h-b,s=(p*ev-q*eu)/det,t=(du*q-dv*p)/det;
      if(s < -1e-6 || t < -1e-6 || s+t>1.000001)continue;
      const depth=(vertices[f+axis]+s*(vertices[f+3+axis]-vertices[f+axis])+t*(vertices[f+6+axis]-vertices[f+axis])-origin[axis])/h;
      const cell=[];cell[axis]=Math.round(depth);cell[u]=i;cell[v]=j;solid[index(...cell)]=1;
      if(axis===0){const key=j*ny+i;if(!hits.has(key))hits.set(key,[]);hits.get(key).push(depth)}
    }
  }
  for(const [key,list] of hits){list.sort((a,b)=>a-b);const a=list.filter((v,i)=>i===0||v-list[i-1]>.001);if(a.length%2)continue;
    for(let p=0;p<a.length;p+=2)for(let i=Math.ceil(a[p]);i<=Math.floor(a[p+1]);i++)solid[index(i,key%ny,Math.floor(key/ny))]=1}
  return solid;
}
self.onmessage=({data})=>{
  const solid=voxelize(data), phi=new Float32Array(n), masks=new Uint8Array(n), inv=new Float32Array(n),bias=new Float32Array(n);
  const offsets=[-1,1,-nx,nx,-slice,slice];
  for(let k=1;k<nz-1;k++)for(let j=1;j<ny-1;j++)for(let i=1;i<nx-1;i++){
    const q=index(i,j,k);if(solid[q])continue;let count=0;
    offsets.forEach((d,b)=>{if(!solid[q+d]){masks[q]|=1<<b;count++}});
    inv[q]=1/(count||1);bias[q]=h*(solid[q-1]-solid[q+1]);
  }
  for(let step=0;step<125;step++){let change=0;
    for(let k=1;k<nz-1;k++)for(let j=1;j<ny-1;j++)for(let i=1;i<nx-1;i++){
      const q=index(i,j,k),m=masks[q];if(!m)continue;
      const sum=(m&1?phi[q-1]:0)+(m&2?phi[q+1]:0)+(m&4?phi[q-nx]:0)+(m&8?phi[q+nx]:0)+(m&16?phi[q-slice]:0)+(m&32?phi[q+slice]:0);
      const delta=1.72*((sum+bias[q])*inv[q]-phi[q]);phi[q]+=delta;change=Math.max(change,Math.abs(delta));
    }if(step>20&&change<.00012)break;
  }
  const vel=new Float32Array(n*3);
  for(let q=0;q<n;q++){if(solid[q])continue;vel[3*q]=1;const m=masks[q];if(!m)continue;
    for(let a=0;a<3;a++){const d=offsets[2*a+1],u=a===0?1:0;
      vel[3*q+a]=.5*((m&(1<<(2*a))?u+(phi[q]-phi[q-d])/h:0)+(m&(2<<(2*a))?u+(phi[q+d]-phi[q])/h:0))}
  }
  function sample(x,y,z){const grid=[(x-x0)/h,(y-y0)/h,(z-z0)/h],v=[0,0,0];if(grid.some((a,i)=>a<0||a>=[nx-1,ny-1,nz-1][i]))return null;
    const [i,j,k]=grid.map(Math.floor),[a,b,c]=grid.map((v)=>v%1);
    if(solid[index(Math.round(grid[0]),Math.round(grid[1]),Math.round(grid[2]))])return null;
    for(let dk=0;dk<2;dk++)for(let dj=0;dj<2;dj++)for(let di=0;di<2;di++){const w=(di?a:1-a)*(dj?b:1-b)*(dk?c:1-c),q=3*index(i+di,j+dj,k+dk);for(let t=0;t<3;t++)v[t]+=w*vel[q+t]}return v;
  }
  const paths=[];
  for(let j=-3;j<=3;j++)for(let k=-4;k<=4;k++){let x=x0+.05,y=j*.30+.037,z=k*.38+.017;const path=[];
    for(let step=0;step<200;step++){let v=sample(x,y,z);if(!v)break;const s=Math.hypot(...v);if(s<.045)break;path.push(x,y,z,s);
      const dt=.065/s;v=sample(x+v[0]*dt/2,y+v[1]*dt/2,z+v[2]*dt/2);if(!v)break;x+=dt*v[0];y+=dt*v[1];z+=dt*v[2]}
    if(path.length>=8)paths.push(new Float32Array(path));
  }
  self.postMessage(paths,paths.map(p=>p.buffer));
};
