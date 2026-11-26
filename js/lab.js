import * as THREE from '../vendor/three.module.min.js';
import {OrbitControls} from '../vendor/OrbitControls.js';
import {pressureMaterial,setPressureField} from './pressure-map.js';
import {referenceDimensions,telemetry} from './aero-telemetry.js';
const $=id=>document.getElementById(id);
function airfoil(){
  const profile=[],result=[];
  for(let i=0;i<=96;i++){
    const a=i*Math.PI/48,x=(1-Math.cos(a))*.5;
    const thickness=5*.16*(.2969*Math.sqrt(x)-.126*x-.3516*x*x+.2843*x**3-.1036*x**4);
    profile.push([(x-.5)*2.45,2.45*(.04*Math.sin(x*Math.PI)+(i<=48?1:-1)*thickness)]);
  }
  for(let i=0;i<96;i++){
    const [ax,ay]=profile[i],[bx,by]=profile[i+1],a=[ax,ay,-1.4],b=[bx,by,-1.4],c=[bx,by,1.4],d=[ax,ay,1.4];
    result.push(...a,...b,...d,...b,...c,...d,...[0,.08,-1.4],...b,...a,...[0,.08,1.4],...d,...c);
  }return new Float32Array(result);
}
function start(){
  const renderer=new THREE.WebGLRenderer({canvas:$('labview'),antialias:true,alpha:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(35,1,.08,100);
  const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.minDistance=3;controls.maxDistance=17;controls.enablePan=false;
  function resetView(){camera.position.set(4.8,2.5,7.8);controls.target.set(0,0,0);controls.update()}
  resetView();$('reset').onclick=resetView;
  scene.add(new THREE.HemisphereLight(0xe7f8ff,0x51647d,2.1));const sun=new THREE.DirectionalLight(0xddeeff,3.3);sun.position.set(-4,6,2);scene.add(sun);
  const grid=new THREE.GridHelper(16,64,0x58728c,0x3d556e);grid.position.y=-2.2;scene.add(grid);
  const mat=new THREE.MeshStandardMaterial({color:0x8ba9b9,metalness:.45,roughness:.34,side:THREE.DoubleSide});
  const model=new THREE.Mesh(new THREE.BufferGeometry(),mat);scene.add(model);
  const heat=pressureMaterial();
  let pressureReady=false,reference,loads=null;
  function renderTelemetry(){
    const speed=Number($('speed').value);
    const values=telemetry(speed,reference,loads);
    const format=(value,digits)=>value===null?'—':Number(value.toFixed(digits)).toLocaleString(undefined,{maximumFractionDigits:digits});
    $('pressure').textContent=format(values.pressure,0);
    $('reynolds').textContent=values.reynolds===null?'—':format(values.reynolds/1e6,3);
    $('drag').textContent=format(values.drag,1);
    $('lift').textContent=format(values.lift,1);
    $('cd').textContent=format(values.cd,3);
    $('cl').textContent=format(values.cl,3);
  }
  function syncSurface(){
    const show=pressureReady && $('heat').checked;
    model.material=show?heat:mat;
    model.material.wireframe=$('wire').checked;
    $('heatLegend').hidden=!show;
  }
  let solveWorker,readWorker,timer,running=true,phase=0,paths=[],statusText='',importError='';
  const line=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:.45}));
  const dots=new THREE.Points(new THREE.BufferGeometry(),new THREE.PointsMaterial({color:0xb9f4e6,size:.036}));scene.add(line,dots);
  // Match the original wind tunnel's relative air speed colors.
  const flowColors=[0x5363b8,0x4daacb,0x70e0cf,0xdfef93].map(hex=>new THREE.Color(hex));
  const flowColor=new THREE.Color();
  function status(){ $('message').textContent=importError||statusText }
  function solve(){
    solveWorker?.terminate();solveWorker=new Worker(new URL('./flow-worker.js',import.meta.url),{type:'module'});statusText='Computing flow field…';status();const geom=model.geometry.clone().rotateZ(model.rotation.z);
    const job=solveWorker;
    solveWorker.onmessage=e=>{
      if(job!==solveWorker)return;
      loads=e.data.loads;renderTelemetry();
      paths=e.data.paths;setPressureField(heat,e.data.pressure);pressureReady=true;syncSurface();const coords=[],colors=[];
      for(const path of paths)for(let i=4;i<path.length;i+=4)for(const t of [i-4,i]){
        coords.push(path[t],path[t+1],path[t+2]);
        const shade=THREE.MathUtils.clamp((path[t+3]-.25)/1.25,0,1)*(flowColors.length-1);
        const stop=Math.min(Math.floor(shade),flowColors.length-2);
        flowColor.lerpColors(flowColors[stop],flowColors[stop+1],shade-stop);
        colors.push(flowColor.r,flowColor.g,flowColor.b);
      }
      line.geometry.dispose();line.geometry=new THREE.BufferGeometry();line.geometry.setAttribute('position',new THREE.Float32BufferAttribute(coords,3));line.geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
      dots.geometry.dispose();dots.geometry=new THREE.BufferGeometry();dots.geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(3*paths.length*4),3));dots.frustumCulled=false;
      statusText=loads?'Flow field ready':'Flow field ready. No surface resolved for load estimates.';status();solveWorker.terminate();solveWorker=null;
    };solveWorker.onerror=()=>{if(job!==solveWorker)return;statusText='Solver failed. Adjust the angle to retry.';status()};
    const a=geom.attributes.position.array;solveWorker.postMessage(a,[a.buffer]);geom.dispose();
  }
  function updateAngle(){loads=null;renderTelemetry();pressureReady=false;syncSurface();model.rotation.z=-Number($('angle').value)*Math.PI/180;$('angleValue').value=$('angle').value+'°';line.geometry.setDrawRange(0,0);dots.geometry.setDrawRange(0,0);clearTimeout(timer);solveWorker?.terminate();solveWorker=null;timer=setTimeout(solve,100)}
  function setModel(vertices,name){model.geometry.dispose();model.geometry=new THREE.BufferGeometry();model.geometry.setAttribute('position',new THREE.BufferAttribute(vertices,3));model.geometry.computeVertexNormals();model.geometry.computeBoundingBox();
    reference=referenceDimensions(model.geometry.boundingBox);
    $('refLength').textContent=reference.length.toFixed(2)+' m';
    $('refArea').textContent=reference.area.toFixed(2)+' m²';
    $('meshName').textContent=name;$('triCount').textContent=(vertices.length/9).toLocaleString();updateAngle()}
  function load(file){
    if(!file)return;readWorker?.terminate();readWorker=null;importError='';
    const type=file.name.toLowerCase().split('.').pop();if(!['stl','obj'].includes(type)||file.size>20*1024*1024){importError='Choose an OBJ or STL file under 20 MB.';status();return}
    const worker=new Worker(new URL('./mesh-worker.js',import.meta.url),{type:'module'});readWorker=worker;importError='Reading mesh…';status();
    worker.onmessage=({data})=>{if(worker!==readWorker)return;worker.terminate();readWorker=null;importError=data.error||'';if(!data.error)setModel(data.vertices,file.name);status()};
    worker.onerror=()=>{importError='Unable to read the mesh.';status();worker.terminate()};
    file.arrayBuffer().then(buffer=>{if(worker===readWorker)worker.postMessage({buffer,type},[buffer])}).catch(()=>{importError='Unable to open this file.';status()});
  }
  $('file').onchange=e=>{load(e.target.files[0]);e.target.value=''};
  const drop=$('drop');for(const type of ['dragover','dragleave','drop'])drop.addEventListener(type,e=>{e.preventDefault();drop.classList.toggle('over',type==='dragover');if(type==='drop')load(e.dataTransfer.files[0])});
  $('angle').oninput=updateAngle;$('speed').oninput=()=>{$('speedValue').value=$('speed').value+' m/s';renderTelemetry()};
  $('heat').onchange=syncSurface;$('wire').onchange=syncSurface;$('traces').onchange=e=>{dots.visible=line.visible=e.target.checked};$('pause').onclick=()=>{running=!running;$('pause').textContent=running?'Pause flow':'Resume flow'};
  setModel(airfoil(),'Reference airfoil');const clock=new THREE.Clock();
  new ResizeObserver(()=>{const el=renderer.domElement;renderer.setSize(el.clientWidth,el.clientHeight,false);camera.aspect=el.clientWidth/el.clientHeight;camera.updateProjectionMatrix()}).observe(renderer.domElement);
  renderer.setAnimationLoop(()=>{const dt=Math.min(.06,clock.getDelta());if(running)phase+=dt*Number($('speed').value)*.65;
    const pos=dots.geometry.attributes.position;if(pos)paths.forEach((p,j)=>{const n=p.length/4;for(let k=0;k<4;k++){const u=(phase+j*17+k*n/4)%n,i=Math.floor(u),next=Math.min(n-1,i+1),f=u-i;pos.setXYZ(j*4+k,...[0,1,2].map(a=>p[4*i+a]*(1-f)+p[4*next+a]*f))}});if(pos)pos.needsUpdate=true;controls.update();renderer.render(scene,camera)});
}
try{start()}catch(error){$('viewError').hidden=false;$('viewError').textContent='The 3D playground needs WebGL. Enable hardware acceleration and reload.';console.error(error)}
