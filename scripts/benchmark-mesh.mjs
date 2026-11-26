// Run each file in a fresh process to make peak RSS comparable between runs.
import {openAsBlob} from 'node:fs';
import {extname} from 'node:path';
import {performance} from 'node:perf_hooks';

const [path,...extra]=process.argv.slice(2);
if(!path||extra.length)throw Error('Usage: node scripts/benchmark-mesh.mjs path/to/mesh.obj');
const file=await openAsBlob(path);
const type=extname(path).slice(1).toLowerCase();
let result;
globalThis.self={postMessage(data){result=data}};
await import('../js/mesh-worker.js');
const start=performance.now();
await self.onmessage({data:{file,type}});
if(result.error)throw Error(result.error);
const {vertices,preview}=result;
const imported=performance.now();
await import('../js/flow-worker.js');
self.onmessage({data:{vertices:vertices.slice(),angle:-4*Math.PI/180}});
if(result.error)throw Error(result.error);
console.table({
  fileMiB:+(file.size/1048576).toFixed(2),
  simulatedTriangles:vertices.length/9,
  displayedTriangles:(preview??vertices).length/9,
  importMs:Math.round(imported-start),
  firstSolveMs:Math.round(performance.now()-imported),
  processPeakMiB:Math.round(process.resourceUsage().maxRSS/1024)
});
