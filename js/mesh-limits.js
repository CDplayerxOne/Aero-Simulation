// File bytes bound local decoding time. Triangle count independently bounds
// render buffers and work on every angle change.
export const maxFileMiB=20;
export const maxTriangles=350000;
export const maxFileBytes=maxFileMiB*1024*1024;
export const triangleLimitMessage=()=>`Use a mesh with at most ${maxTriangles.toLocaleString('en-US')} triangles.`;
