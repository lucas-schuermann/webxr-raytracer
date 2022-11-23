import * as THREE from 'three';
import Stats from 'stats.js';
import { VRButton } from 'three/examples/jsm/webxr/VRButton';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

const VIEWBOX_ORIGIN = [0, -1.6, -15];

let renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local');
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));

const stats = new Stats();
document.body.appendChild(stats.dom);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(...VIEWBOX_ORIGIN);
controls.update();

// Texture from THREE.js examples
// https://github.com/mrdoob/three.js/tree/25d16a2c3c54befcb3916dbe756e051984c532a8/examples/textures/cube/MilkyWay
const texturePaths = () => {
    const path = 'textures/dark-s_';
    const format = '.jpg';
    return [
        path + 'px' + format, path + 'nx' + format,
        path + 'py' + format, path + 'ny' + format,
        path + 'pz' + format, path + 'nz' + format
    ];
};
const texture0 = new THREE.CubeTextureLoader().load(texturePaths());

const vertexShaderSource = /*glsl*/`
precision mediump float;

varying vec3 localSurfacePos;

void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
    localSurfacePos = position;
}
`;
const fragmentShaderSource = /*glsl*/`
// Inspired by https://www.shadertoy.com/view/3slcWr

precision mediump float;

uniform float time;
uniform vec3 localCameraPos;
varying vec3 localSurfacePos;
uniform samplerCube channel0;

float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i + vec3(0, 0, 0)), 
                        hash(i + vec3(1, 0, 0)), f.x),
                    mix(hash(i + vec3(0, 1, 0)), 
                        hash(i + vec3(1, 1, 0)), f.x), f.y),
                mix(mix(hash(i + vec3(0, 0, 1)), 
                        hash(i + vec3(1, 0, 1)), f.x),
                    mix(hash(i + vec3(0, 1, 1)), 
                        hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}

mat2 rotate(float a) {
    float s = sin(a);
    float c = cos(a);
    return mat2(c, -s, s, c);
}

float sphere(vec4 s) {
    return length(s.xyz) - s.w;
}

vec4 getGlow(float minPDist) {
    float mainGlow = minPDist * 1.2;
    mainGlow = pow(mainGlow, 32.0);
    mainGlow = clamp(mainGlow, 0.0, 1.0);
    float outerGlow = minPDist * 0.4;
    outerGlow = pow(outerGlow, 2.0);
    outerGlow = clamp(outerGlow, 0.0, 1.0);
    vec4 glow = vec4(10, 5, 3, mainGlow);
    glow += vec4(0, 0, 0, outerGlow);
    glow.a = min(glow.a, 1.0);
    return glow;
}

float getDist(vec3 p) {
    vec3 diskPos = -p;
    float diskDist = sphere(vec4(diskPos, 5.0));
    diskDist = max(diskDist, diskPos.y - 0.01);
    diskDist = max(diskDist, -diskPos.y - 0.01);
    diskDist = max(diskDist, -sphere(vec4(-p, 1.5) * 10.0));
    if(diskDist < 2.0)
    {
        vec3 c = vec3(length(diskPos), diskPos.y, atan(diskPos.z + 1.0, diskPos.x + 1.0) * 0.5);
        c *= 10.0;
        diskDist += noise(c) * 0.4;
        diskDist += noise(c * 2.5) * 0.2;
    }
    return diskDist;
}
            
void main() {
    vec3 ro = localCameraPos;
    vec3 rd = normalize(localSurfacePos - localCameraPos);
    vec3 p = ro;
    float glow = 0.0;
    for (int i = 0; i < 64; i++) {
        float dS = getDist(p);
        glow = max(glow, 1.0 / (dS + 1.0));
        vec3 bdir = normalize(-p);
        float bdist = length(p);
        dS = min(dS, bdist) * 0.04 * (700./64.);
        if(dS > 100.) break;
        if(bdist < 1.0) {
            vec4 gcol = getGlow(glow);
            vec4 c = vec4(0.0, 0.0, 0.0, 1.0);
            c.rgb = mix(c.rgb, gcol.rgb, gcol.a);
            gl_FragColor = c;
            return;
        }
        bdist = pow(bdist + 1.0, 2.0);
        bdist = dS * 1.0 / bdist;
        rd = mix(rd, bdir, bdist);
        p += rd * max(dS, 0.01*(700./64.));
    }
    // sample star field
    vec4 c = vec4(textureCube(channel0, rd).rgb, 1.0);
    vec4 gcol = getGlow(glow);
    c.rgb = mix(c.rgb, gcol.rgb, gcol.a);
    gl_FragColor = c;
}
`;
const uniforms = {
    time: {
        value: 0,
    },
    localCameraPos: {
        value: new THREE.Vector3(0, 0, 0),
    },
    channel0: {
        value: texture0,
    },
};
const material = new THREE.ShaderMaterial({
    vertexShader: vertexShaderSource,
    fragmentShader: fragmentShaderSource,
    uniforms,
    side: THREE.BackSide,
});

var geometry = new THREE.BoxGeometry(500, 500, 500);
const skybox = new THREE.Mesh(geometry, material);
skybox.position.set(...VIEWBOX_ORIGIN);
scene.add(skybox);
skybox.onBeforeRender = (renderer, scene, camera, geometry, material, group) => {
    uniforms.localCameraPos.value.setFromMatrixPosition(camera.matrixWorld);
    skybox.worldToLocal(uniforms.localCameraPos.value);
};

const onWindowResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
};
window.addEventListener('resize', onWindowResize, false);

renderer.setAnimationLoop((time) => {
    uniforms.time.value = time;
    renderer.render(scene, camera);
    stats.update();
});