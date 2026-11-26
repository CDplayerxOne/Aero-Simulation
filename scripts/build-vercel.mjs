import {cp,mkdir,readdir} from 'node:fs/promises';
import {extname} from 'node:path';

await mkdir('public',{recursive:true});
for(const file of await readdir('.')){
  if(['.html','.css','.svg'].includes(extname(file)) || ['assets','js','vendor'].includes(file)){
    await cp(file,'public/'+file,{recursive:true});
  }
}
