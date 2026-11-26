import {readFile,readdir,mkdir,writeFile,copyFile} from 'node:fs/promises';
import {extname} from 'node:path';
import {gzipSync} from 'node:zlib';
const types={'.html':'text/html; charset=utf-8','.css':'text/css','.svg':'image/svg+xml','.js':'text/javascript','.webp':'image/webp','.mp3':'audio/mpeg','.glb':'model/gltf-binary','.woff2':'font/woff2'};
const assets=Object.create(null);
async function pack(file){
  const bytes=await readFile(file);
  const compressed=gzipSync(bytes);
  const packed=compressed.length+100<bytes.length;
  assets[file]=[types[extname(file)]||'text/plain',packed,(packed?compressed:bytes).toString('base64')];
}
async function directory(path){
  for(const item of await readdir(path,{withFileTypes:true})){
    const child=path+'/'+item.name;
    if(item.isDirectory())await directory(child);else await pack(child);
  }
}
for(const item of await readdir('.'))if(['.html','.css','.svg'].includes(extname(item)))await pack(item);
for(const dir of ['assets','js','vendor'])await directory(dir);
const api=await readFile('worker/pairing.mjs','utf8');
const site=await readFile('worker/site.mjs','utf8');
await mkdir('dist/server',{recursive:true});
await writeFile('dist/server/index.js',api+'\nconst assets='+JSON.stringify(assets)+';\n'+site);
await mkdir('dist/.openai',{recursive:true});
await copyFile('.openai/hosting.json','dist/.openai/hosting.json');
