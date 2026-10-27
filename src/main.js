import * as THREE from 'three';
import { AudioSystem } from './audio.js';
import { GameDirector } from './game.js';
import { EventBus, createState } from './state.js';

const canvas = document.getElementById('scene');
const shell = document.getElementById('game-shell');

function showFatal(message) {
  shell.innerHTML = `
    <div style="position:absolute;inset:0;display:grid;place-items:center;padding:24px;background:#f5e8d3;color:#3b2a1e;font:600 16px system-ui,sans-serif;text-align:center">
      <div style="max-width:540px;padding:24px;border:1px solid rgba(105,72,42,.25);border-radius:20px;background:#fff8eb;box-shadow:0 16px 40px rgba(66,43,24,.16)">
        <h1 style="margin:0 0 10px;font-size:24px">No se pudo iniciar la experiencia 3D</h1>
        <p style="margin:0;line-height:1.5">${message}</p>
      </div>
    </div>`;
}

let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
    alpha: false,
  });
} catch (error) {
  console.error(error);
  showFatal('Tu navegador debe tener WebGL habilitado para explorar la vivienda en 3D.');
  throw error;
}

renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#f3e4ca');
scene.fog = new THREE.Fog('#f3e4ca', 25, 52);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(2, 9, 11);

const state = createState();
const bus = new EventBus();
const audio = new AudioSystem();

const game = new GameDirector({ scene, camera, renderer, canvas, state, bus, audio });

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height, false);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => window.setTimeout(resize, 150));

let previous = performance.now();
function frame(now) {
  const dt = Math.min(0.06, (now - previous) / 1000);
  previous = now;
  game.update(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Exposed for lightweight debugging in the browser console.
window.cuidaDia = { game, state, bus, audio, scene, camera };
