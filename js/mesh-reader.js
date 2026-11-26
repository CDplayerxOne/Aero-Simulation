import {maxFileMiB,maxFileBytes,maxTriangles,triangleLimitMessage} from './mesh-limits.js';

const chunkBytes=512*1024;
const blockSize=3*8192;
const maxRecord=4*1024*1024;

// Chunked numeric storage supports negative OBJ indices without retaining the
// source text or boxed arrays of every face, normal, texture coordinate and UV.
class Coordinates {
  blocks=[];
  length=0;
  add(x,y,z){
    const offset=this.length%blockSize;
    if(!offset)this.blocks.push(new Float32Array(blockSize));
    const block=this.blocks[this.blocks.length-1];
    block[offset]=x;block[offset+1]=y;block[offset+2]=z;this.length+=3;
  }
  appendVertex(source,index){
    const block=source.blocks[Math.floor(index/blockSize)],i=index%blockSize;
    this.add(block[i],block[i+1],block[i+2]);
  }
  finish(){
    const result=new Float32Array(this.length);
    this.blocks.forEach((block,i)=>result.set(block.subarray(0,Math.min(blockSize,this.length-i*blockSize)),i*blockSize));
    return result;
  }
}

async function textRecords(file,delimiter,consume){
  const decoder=new TextDecoder();
  let tail='';
  for(let offset=0;offset<file.size;offset+=chunkBytes){
    const bytes=await file.slice(offset,offset+chunkBytes).arrayBuffer();
    const text=tail+decoder.decode(bytes,{stream:offset+chunkBytes<file.size});
    delimiter.lastIndex=0;
    let start=0,match;
    while((match=delimiter.exec(text))){
      if(match.index-start>maxRecord)throw Error('Mesh text record is too long.');
      consume(text.slice(start,match.index));
      start=delimiter.lastIndex;
    }
    tail=text.slice(start);
    if(tail.length>maxRecord)throw Error('Mesh text record is too long.');
  }
  if(tail)consume(tail);
}

async function readOBJ(file){
  const positions=new Coordinates(),faces=new Coordinates();
  let continued='';
  await textRecords(file,/\r\n|[\r\n]/g,line=>{
    line=line.split('#',1)[0].trim();
    if(continued){line=continued+line;continued=''}
    if(line.endsWith('\\')){
      if(line.length>maxRecord)throw Error('Mesh text record is too long.');
      continued=line.slice(0,-1)+' ';return;
    }
    if(/^v\s/.test(line)){
      if(positions.length>=9*maxTriangles)throw Error('Too many source vertices. Remove unused OBJ vertices.');
      const [,x,y,z]=line.split(/\s+/,4);
      positions.add(Number(x),Number(y),Number(z));
    }else if(/^f\s/.test(line)){
      const indices=line.slice(1).trim().split(/\s+/);
      if(indices.length<3)throw Error('OBJ faces need at least three vertices.');
      if(faces.length/9+indices.length-2>maxTriangles)throw Error(triangleLimitMessage());
      let first,previous;
      for(let i=0;i<indices.length;i++){
        const token=indices[i],slash=token.indexOf('/');
        const raw=Number(slash===-1?token:token.slice(0,slash));
        const index=raw<0?positions.length+3*raw:3*(raw-1);
        if(!Number.isInteger(raw)||raw===0||index<0||index>=positions.length)throw Error('Invalid OBJ vertex index.');
        if(i===0)first=index;
        if(i>=2){faces.appendVertex(positions,first);faces.appendVertex(positions,previous);faces.appendVertex(positions,index)}
        previous=index;
      }
    }
  });
  if(continued)throw Error('Incomplete OBJ line continuation.');
  return faces.finish();
}

async function readSTL(file){
  const header=await file.slice(0,84).arrayBuffer();
  const count=header.byteLength===84?new DataView(header).getUint32(80,true):0;
  const expected=84+count*50;
  if(expected===file.size || !/^\s*solid/i.test(new TextDecoder().decode(header))){
    if(header.byteLength<84||expected>file.size)throw Error('Incomplete binary STL.');
    if(count>maxTriangles)throw Error(triangleLimitMessage());
    const vertices=new Float32Array(count*9);
    for(let start=0;start<count;start+=8192){
      const end=Math.min(count,start+8192);
      const view=new DataView(await file.slice(84+start*50,84+end*50).arrayBuffer());
      for(let face=start;face<end;face++){
        const offset=(face-start)*50+12;
        for(let i=0;i<9;i++)vertices[face*9+i]=view.getFloat32(offset+i*4,true);
      }
    }
    return vertices;
  }
  const faces=new Coordinates();
  await textRecords(file,/\bendfacet\b/gi,record=>{
    if(!/\bfacet\s/i.test(record))return;
    if(faces.length/9>=maxTriangles)throw Error(triangleLimitMessage());
    let count=0;
    for(const m of record.matchAll(/\bvertex\s+(\S+)\s+(\S+)\s+(\S+)/gi)){
      if(++count>3)throw Error('Invalid STL facet.');
      faces.add(Number(m[1]),Number(m[2]),Number(m[3]));
    }
    if(count!==3)throw Error('Incomplete STL facet.');
  });
  return faces.finish();
}

export async function readMesh(file,type){
  if(file.size>maxFileBytes)throw Error(`Choose a mesh no larger than ${maxFileMiB} MiB.`);
  if(type!=='obj'&&type!=='stl')throw Error('Choose an OBJ or STL file.');
  const vertices=type==='obj'?await readOBJ(file):await readSTL(file);
  if(!vertices.length)throw Error('No triangular faces found.');
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<vertices.length;i+=3)for(let axis=0;axis<3;axis++){
    const v=vertices[i+axis];
    if(!Number.isFinite(v))throw Error('Mesh coordinates must be finite.');
    min[axis]=Math.min(min[axis],v);max[axis]=Math.max(max[axis],v);
  }
  const extent=Math.max(...max.map((v,i)=>v-min[i]));
  if(extent<=0)throw Error('The mesh has no measurable size.');
  const center=min.map((v,i)=>(v+max[i])/2);
  for(let i=0;i<vertices.length;i+=3)for(let axis=0;axis<3;axis++)vertices[i+axis]=(vertices[i+axis]-center[axis])*3.05/extent;
  return vertices;
}
