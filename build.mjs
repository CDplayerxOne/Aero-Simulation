import { cp, mkdir } from 'node:fs/promises';
const files = ['index.html','style.css','brand.svg','wind-tunnel.html','assets','vendor','js','drive.html','playground.html','lab.css','race.css','controller.html','controller.css'];
await mkdir('dist', { recursive: true });
for (const file of files) await cp(file, 'dist/' + file, { recursive: true });
