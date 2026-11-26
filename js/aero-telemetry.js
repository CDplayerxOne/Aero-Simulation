// Mesh dimensions in fitted tunnel metres at zero incidence. A fixed reference
// area keeps comparisons across incidence meaningful, including for thin panels.
export function referenceDimensions(box){
  const x=box.max.x-box.min.x, y=box.max.y-box.min.y, z=box.max.z-box.min.z;
  return {length:x,area:Math.max(x*y,y*z,z*x)};
}

// Sum -Cp * normal * face area on the fluid/solid boundary. Each exposed voxel
// face uses the unquantized pressure of its adjacent fluid cell. This does not
// depend on triangle winding, and internal faces make no contribution.
export function integratePressure(solid,velocity,nx,ny,nz,spacing){
  const slice=nx*ny,faceArea=spacing*spacing;
  let dragArea=0,liftArea=0,resolved=false;
  for(let k=1;k<nz-1;k++)for(let j=1;j<ny-1;j++)for(let i=1;i<nx-1;i++){
    const cell=k*slice+j*nx+i;
    if(solid[cell])continue;
    const xFaces=solid[cell+1]-solid[cell-1],yFaces=solid[cell+nx]-solid[cell-nx];
    if(!xFaces&&!yFaces){
      if(solid[cell+slice]||solid[cell-slice])resolved=true;
      continue;
    }
    resolved=true;
    const v=3*cell,cp=1-velocity[v]**2-velocity[v+1]**2-velocity[v+2]**2;
    dragArea+=cp*xFaces*faceArea;
    liftArea+=cp*yFaces*faceArea;
  }
  return resolved?{dragArea,liftArea}:null;
}

export function telemetry(speed,ref,loads){
  // Standard sea-level air. The solver's velocity field is normalized by freestream speed.
  const density=1.225,viscosity=1.81e-5,q=.5*density*speed**2;
  return {
    pressure:q,reynolds:ref.length>0?density*speed*ref.length/viscosity:null,
    drag:loads?q*loads.dragArea:null,lift:loads?q*loads.liftArea:null,
    cd:loads&&ref.area>0?loads.dragArea/ref.area:null,
    cl:loads&&ref.area>0?loads.liftArea/ref.area:null
  };
}
