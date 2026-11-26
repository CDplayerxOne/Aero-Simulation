import {BufferAttribute,BufferGeometry} from '../vendor/three.module.min.js';
import {readMesh} from './mesh-reader.js';

self.onmessage=async({data:{file,type}})=>{
  try{
    const vertices=await readMesh(file,type);
    const geometry=new BufferGeometry().setAttribute('position',new BufferAttribute(vertices,3));
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const normals=geometry.attributes.normal.array;
    self.postMessage({vertices,normals,box:geometry.boundingBox,sphere:geometry.boundingSphere},[vertices.buffer,normals.buffer]);
  }catch(error){self.postMessage({error:error.message||'Could not read this mesh.'})}
};
