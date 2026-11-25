import * as THREE from '../vendor/three.module.min.js';

// Each z slice occupies a band of rows in an ordinary 2D texture. Hardware
// filtering interpolates x and y. The shader interpolates adjacent z slices.
export function pressureMaterial(){
  return new THREE.ShaderMaterial({
    side:THREE.DoubleSide,
    uniforms:{
      field:{value:null}, dimensions:{value:new THREE.Vector3()},
      origin:{value:new THREE.Vector3()}, spacing:{value:1}
    },
    vertexShader:`
      varying vec3 surfacePosition;
      varying vec3 surfaceNormal;
      void main(){
        vec4 world=modelMatrix*vec4(position,1.);
        surfacePosition=world.xyz;
        surfaceNormal=mat3(modelMatrix)*normal;
        gl_Position=projectionMatrix*viewMatrix*world;
      }`,
    fragmentShader:`
      uniform sampler2D field;
      uniform vec3 dimensions,origin;
      uniform float spacing;
      varying vec3 surfacePosition,surfaceNormal;
      vec2 samplePressure(vec3 p){
        vec3 cell=clamp((p-origin)/spacing,vec3(0.),dimensions-1.);
        float slice=floor(cell.z);
        vec2 size=vec2(dimensions.x,dimensions.y*dimensions.z);
        vec2 xy=cell.xy+.5;
        vec2 first=(xy+vec2(0.,slice*dimensions.y))/size;
        vec2 second=(xy+vec2(0.,min(slice+1.,dimensions.z-1.)*dimensions.y))/size;
        return mix(texture2D(field,first).rg,texture2D(field,second).rg,fract(cell.z));
      }
      vec3 palette(float t){
        vec3 low=vec3(.20,.21,.74),blue=vec3(.12,.57,.91),mint=vec3(.20,.84,.75);
        vec3 gold=vec3(.96,.89,.36),high=vec3(.95,.25,.15);
        if(t<.25)return mix(low,blue,t*4.);
        if(t<.5)return mix(blue,mint,(t-.25)*4.);
        if(t<.75)return mix(mint,gold,(t-.5)*4.);
        return mix(gold,high,(t-.75)*4.);
      }
      void main(){
        vec3 n=normalize(surfaceNormal);
        vec2 sampleValue=samplePressure(surfacePosition+n*spacing);
        // Uploaded meshes may have inward-facing triangles.
        if(sampleValue.y<.1)sampleValue=samplePressure(surfacePosition-n*spacing);
        float t=sampleValue.y>.001?sampleValue.x/sampleValue.y:2./3.;
        gl_FragColor=vec4(palette(clamp(t,0.,1.))*(.94+.06*abs(n.y)),1.);
      }`
  });
}
export function setPressureField(material,{texels,dimensions,origin,spacing}){
  const [nx,ny,nz]=dimensions;
  const texture=new THREE.DataTexture(texels,nx,ny*nz,THREE.RGBAFormat);
  texture.magFilter=texture.minFilter=THREE.LinearFilter;
  texture.needsUpdate=true;
  const uniforms=material.uniforms;
  uniforms.field.value?.dispose();
  uniforms.field.value=texture;
  uniforms.dimensions.value.fromArray(dimensions);
  uniforms.origin.value.fromArray(origin);
  uniforms.spacing.value=spacing;
}
