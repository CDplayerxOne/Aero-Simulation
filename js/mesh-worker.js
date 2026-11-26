import {BufferAttribute,BufferGeometry} from '../vendor/three.module.min.js';
import {readMesh} from './mesh-reader.js';

const previewTriangles=6000;
const exactPreviewThreshold=12000;
const maxPreviewTriangles=24000;
const legacyTriangles=350000;

async function makePreview(vertices){
  if(vertices.length<=exactPreviewThreshold*9)return null;
  const {MeshoptSimplifier}=await import('../vendor/meshopt_simplifier.js');
  if(!MeshoptSimplifier.supported && vertices.length<=9*legacyTriangles)return null;
  if(!MeshoptSimplifier.supported)throw Error('This mesh needs WebAssembly for its interactive preview.');
  await MeshoptSimplifier.ready;
  const indices=new Uint32Array(vertices.length/3);
  for(let i=0;i<indices.length;i++)indices[i]=i;
  // Allow a display error of 2% of the fitted extent, half a solver cell.
  const [reduced]=MeshoptSimplifier.simplifySloppy(indices,vertices,3,null,previewTriangles*3,.02);
  if(!reduced.length||reduced.length>maxPreviewTriangles*3){
    // Some disconnected shapes cannot be reduced faithfully. Keep previously
    // supported originals, and avoid silently losing the shape on dense uploads.
    if(vertices.length<=9*legacyTriangles)return null;
    throw Error('This mesh is too detailed for an interactive preview. Simplify it and try again.');
  }
  if(reduced.length>=indices.length)return null;
  const preview=new Float32Array(reduced.length*3);
  for(let i=0;i<reduced.length;i++){
    const src=3*reduced[i],dst=3*i;
    preview[dst]=vertices[src];preview[dst+1]=vertices[src+1];preview[dst+2]=vertices[src+2];
  }
  return preview;
}

self.onmessage=async({data:{file,type}})=>{
  try{
    const vertices=await readMesh(file,type);
    const original=new BufferGeometry().setAttribute('position',new BufferAttribute(vertices,3));
    original.computeBoundingBox();
    original.computeBoundingSphere();
    // Fit once, so a corner stays inside the shortest tunnel half-span (2.4 m)
    // with a grid cell of clearance, even after arbitrary pitch, roll or yaw.
    const rotationClearance=2.28;
    const radius=original.boundingSphere.radius+original.boundingSphere.center.length();
    if(radius>rotationClearance){
      const scale=rotationClearance/radius;
      original.scale(scale,scale,scale);
    }
    const preview=await makePreview(vertices);
    const geometry=preview?new BufferGeometry().setAttribute('position',new BufferAttribute(preview,3)):original;
    geometry.computeVertexNormals();
    const normals=geometry.attributes.normal.array;
    const buffers=[vertices.buffer,normals.buffer];
    if(preview)buffers.push(preview.buffer);
    self.postMessage({vertices,preview,normals,box:original.boundingBox,sphere:original.boundingSphere},buffers);
  }catch(error){self.postMessage({error:error.message||'Could not read this mesh.'})}
};
