import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Actor } from './characters.js';
import { formatTime } from './state.js';

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function canvasTexture(width, height, draw, repeat = null) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  draw(ctx, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  if (repeat) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeat[0], repeat[1]);
  }
  return texture;
}

function woodTexture() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#c99b68';
    ctx.fillRect(0, 0, w, h);
    for (let row = 0; row < 6; row += 1) {
      const y = row * (h / 6);
      const shade = row % 2 ? '#c6915f' : '#d3a673';
      ctx.fillStyle = shade;
      ctx.fillRect(0, y, w, h / 6 - 2);
      ctx.strokeStyle = 'rgba(105, 69, 38, 0.25)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, y + h / 6 - 1);
      ctx.lineTo(w, y + h / 6 - 1);
      ctx.stroke();
      for (let i = 0; i < 9; i += 1) {
        ctx.strokeStyle = `rgba(112, 72, 40, ${0.07 + (i % 3) * 0.025})`;
        ctx.beginPath();
        const lineY = y + 7 + ((i * 19) % (h / 6 - 12));
        ctx.moveTo(0, lineY);
        ctx.bezierCurveTo(w * 0.3, lineY + 4, w * 0.6, lineY - 3, w, lineY + 2);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(100, 63, 34, 0.22)';
      const seamX = ((row * 83) % 220) + 15;
      ctx.fillRect(seamX, y, 2, h / 6 - 2);
    }
  }, [5, 4]);
}

function grassTexture() {
  return canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#8fae72';
    ctx.fillRect(0, 0, w, h);
    let seed = 7;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    for (let i = 0; i < 700; i += 1) {
      const x = random() * w;
      const y = random() * h;
      ctx.fillStyle = random() > 0.5 ? 'rgba(70, 117, 66, 0.20)' : 'rgba(201, 214, 139, 0.20)';
      ctx.fillRect(x, y, 2, 3 + random() * 3);
    }
  }, [9, 7]);
}

function tileTexture() {
  return canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#e6d7bd';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#c9b89d';
    ctx.lineWidth = 4;
    for (let i = 0; i <= 4; i += 1) {
      const p = (i * w) / 4;
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, h);
      ctx.moveTo(0, p);
      ctx.lineTo(w, p);
      ctx.stroke();
    }
  }, [3, 2.5]);
}

function fabricTexture(a, b) {
  return canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = a;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = b;
    ctx.lineWidth = 5;
    for (let i = -h; i < w + h; i += 18) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + h, h);
      ctx.stroke();
    }
  }, [2, 2]);
}

function artTexture(seed = 1) {
  return canvasTexture(256, 320, (ctx, w, h) => {
    const palettes = [
      ['#e8c9a0', '#9c6b4a', '#3f6f68', '#f2e2c4'],
      ['#d5e0d4', '#c27c66', '#6c8b7d', '#f3e9d6'],
      ['#ecd9b0', '#72523d', '#b69b6a', '#f8f0dc'],
    ];
    const colors = palettes[seed % palettes.length];
    ctx.fillStyle = colors[3];
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = colors[0];
    ctx.beginPath();
    ctx.arc(130, 130, 85, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = colors[1];
    ctx.beginPath();
    ctx.moveTo(40, 275);
    ctx.quadraticCurveTo(130, 145, 220, 275);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = colors[2];
    ctx.beginPath();
    ctx.ellipse(170, 96, 55, 32, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = colors[1];
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(32, 32);
    ctx.lineTo(224, 32);
    ctx.lineTo(224, 288);
    ctx.lineTo(32, 288);
    ctx.closePath();
    ctx.stroke();
  });
}

function material(color, roughness = 0.8, metalness = 0.02) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function box(parent, width, height, depth, color, x, y, z, radius = 0.05) {
  const safeRadius = Math.max(0.003, Math.min(radius, width / 2 - 0.002, height / 2 - 0.002, depth / 2 - 0.002));
  const mesh = new THREE.Mesh(
    new RoundedBoxGeometry(width, height, depth, 3, safeRadius),
    material(color),
  );
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function cylinder(parent, radiusTop, radiusBottom, height, color, x, y, z, segments = 18) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments),
    material(color),
  );
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function textPlane(text, width, height, options = {}) {
  const texture = canvasTexture(options.canvasWidth || 512, options.canvasHeight || 160, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    if (options.background) {
      ctx.fillStyle = options.background;
      roundRect(ctx, 0, 0, w, h, options.radius || 20);
      ctx.fill();
    }
    ctx.fillStyle = options.color || '#3d2b1f';
    ctx.font = `${options.weight || 700} ${options.fontSize || 50}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2 + 2);
  });
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide }),
  );
  return plane;
}

function markInteractable(root, id, force = false) {
  root.userData.interact = id;
  root.traverse((child) => {
    if (!child.isMesh) return;
    if (force || !child.userData.interact) child.userData.interact = id;
  });
}

function addRing(parent, radius, color = '#e7b95a', y = 0.035) {
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(radius, 0.028, 8, 48),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = y;
  ring.renderOrder = 3;
  parent.add(ring);
  return ring;
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 4) {
  const words = String(text || '').split(/\s+/);
  let line = '';
  let lines = 0;
  for (let n = 0; n < words.length; n += 1) {
    const testLine = line ? `${line} ${words[n]}` : words[n];
    if (ctx.measureText(testLine).width > maxWidth && line) {
      ctx.fillText(line, x, y);
      line = words[n];
      y += lineHeight;
      lines += 1;
      if (lines >= maxLines - 1) break;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, y);
}

function createFixedDevice() {
  const group = new THREE.Group();
  group.name = 'Dispositivo fijo';

  const shell = box(group, 1.75, 0.95, 0.5, '#f1eee6', 0, 0.49, 0, 0.19);
  shell.material.roughness = 0.55;
  const base = box(group, 1.55, 0.09, 0.46, '#7f9a9b', 0, 0.045, 0.01, 0.045);
  base.castShadow = true;

  const screenBezel = box(group, 1.42, 0.6, 0.035, '#354b4d', 0, 0.6, 0.253, 0.09);
  screenBezel.castShadow = false;

  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 256;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(1.34, 0.535),
    new THREE.MeshBasicMaterial({ map: texture }),
  );
  screen.position.set(0, 0.6, 0.274);
  group.add(screen);

  const brand = textPlane('CUIDA·DÍA', 0.62, 0.12, {
    canvasWidth: 420,
    canvasHeight: 100,
    fontSize: 55,
    color: '#3c7472',
  });
  brand.position.set(-0.46, 0.88, 0.23);
  group.add(brand);

  const buttonData = [
    { id: 'fixed.back', color: '#5d9a72', label: 'RELOJ', x: -0.52 },
    { id: 'fixed.appointments', color: '#5b83a8', label: 'CITAS', x: 0 },
    { id: 'fixed.empty', color: '#d8a84b', label: 'AGOTADO', x: 0.52 },
  ];
  const buttons = {};
  buttonData.forEach((item) => {
    const button = box(group, 0.42, 0.13, 0.32, item.color, item.x, 1.01, -0.02, 0.06);
    button.userData.interact = item.id;
    const label = textPlane(item.label, 0.34, 0.105, {
      canvasWidth: 420,
      canvasHeight: 120,
      fontSize: 46,
      color: item.id === 'fixed.empty' ? '#3e2b12' : '#ffffff',
    });
    label.rotation.x = -Math.PI / 2;
    label.position.set(item.x, 1.081, -0.018);
    label.userData.interact = item.id;
    group.add(label);
    buttons[item.id] = button;
  });

  const pillArea = box(group, 1.45, 0.2, 0.15, '#dbe1dd', 0, 0.15, 0.255, 0.045);
  pillArea.castShadow = false;
  for (let i = 1; i < 7; i += 1) {
    const lid = box(group, 0.17, 0.14, 0.045, '#eef3ee', (i - 3) * 0.215, 0.15, 0.34, 0.025);
    lid.userData.interact = 'fixed';
  }

  const drawer = new THREE.Group();
  drawer.position.set(-3 * 0.215, 0.15, 0.34);
  const drawerFront = box(drawer, 0.19, 0.16, 0.13, '#f5efe2', 0, 0, 0, 0.035);
  drawerFront.userData.interact = 'fixed';
  const pill = new THREE.Mesh(
    new THREE.SphereGeometry(0.055, 16, 12),
    material('#d76c5c', 0.5),
  );
  pill.scale.set(1.25, 0.6, 0.8);
  pill.position.set(0, 0.085, 0.11);
  pill.visible = false;
  drawer.add(pill);
  group.add(drawer);

  const speaker = new THREE.Group();
  for (let i = 0; i < 8; i += 1) {
    const hole = new THREE.Mesh(
      new THREE.CircleGeometry(0.012, 10),
      new THREE.MeshBasicMaterial({ color: '#778785' }),
    );
    hole.position.set(0.71 + (i % 2) * 0.035, 0.36 + Math.floor(i / 2) * 0.045, 0.257);
    speaker.add(hole);
  }
  group.add(speaker);

  markInteractable(group, 'fixed');
  Object.entries(buttons).forEach(([id, mesh]) => {
    mesh.userData.interact = id;
  });

  return {
    group,
    canvas,
    ctx: canvas.getContext('2d'),
    texture,
    buttons,
    drawer,
    pill,
  };
}

function drawFixedScreen(fixed, state, force = false) {
  const minute = Math.floor(state.time);
  const key = `${minute}|${state.device.mode}|${state.device.caption}|${state.device.statusText}|${state.doseStatus}`;
  if (!force && key === fixed.lastKey) return;
  fixed.lastKey = key;
  const { ctx, canvas, texture } = fixed;
  const w = canvas.width;
  const h = canvas.height;
  const alertMode = state.device.mode === 'dose' || state.device.mode === 'emergency';
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = alertMode ? '#fff1d7' : '#dce9d9';
  roundRect(ctx, 8, 8, w - 16, h - 16, 22);
  ctx.fill();
  ctx.strokeStyle = alertMode ? '#c26b32' : '#71998e';
  ctx.lineWidth = alertMode ? 7 : 4;
  ctx.stroke();

  ctx.fillStyle = '#36534c';
  ctx.font = '700 24px system-ui, sans-serif';
  ctx.fillText('CUIDA·DÍA  ·  LUN', 32, 44);

  ctx.fillStyle = '#203c37';
  ctx.font = '800 98px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText(formatTime(state.time), 27, 146);

  const modeTitles = {
    clock: 'MODO RELOJ',
    dose: 'AVISO DE DOSIS',
    appointments: 'PRÓXIMAS CITAS',
    empty: 'AVISO DE REPOSICIÓN',
    announcement: 'AVISO DE VOZ',
    emergency: 'ALERTA SIMULADA',
  };
  ctx.fillStyle = alertMode ? '#a44b28' : '#3c7472';
  ctx.font = '800 25px system-ui, sans-serif';
  ctx.fillText(modeTitles[state.device.mode] || 'MODO RELOJ', 370, 50);
  ctx.fillStyle = '#344a45';
  ctx.font = '500 25px system-ui, sans-serif';
  wrapText(ctx, state.device.caption, 370, 92, 240, 32, 4);

  ctx.fillStyle = alertMode ? 'rgba(194, 107, 50, 0.16)' : 'rgba(60, 116, 114, 0.13)';
  roundRect(ctx, 25, 176, w - 50, 56, 15);
  ctx.fill();
  ctx.fillStyle = '#344a45';
  ctx.font = '700 22px system-ui, sans-serif';
  ctx.fillText(state.device.statusText.slice(0, 58), 42, 212);
  texture.needsUpdate = true;
}

function drawWearableScreen(wearable, state) {
  const key = `${Math.floor(state.time)}|${state.wearable.pulse}|${state.wearable.spo2}|${state.emergency.active}`;
  if (key === wearable.lastKey) return;
  wearable.lastKey = key;
  const { ctx, canvas, texture } = wearable;
  const w = canvas.width;
  const h = canvas.height;
  ctx.fillStyle = '#102c2d';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#b9e3d8';
  ctx.font = '800 43px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(formatTime(state.time), w / 2, 52);
  ctx.font = '700 24px system-ui, sans-serif';
  ctx.fillStyle = '#f3c8b4';
  ctx.fillText(`♥ ${state.wearable.pulse} lpm`, w / 2, 101);
  ctx.fillStyle = '#b9dcff';
  ctx.fillText(`O₂ ${state.wearable.spo2}%`, w / 2, 139);
  ctx.fillStyle = '#86aaa7';
  ctx.font = '600 16px system-ui, sans-serif';
  ctx.fillText('PULSO · OXÍGENO', w / 2, 174);
  if (state.emergency.active) {
    ctx.fillStyle = '#d95b4c';
    ctx.beginPath();
    ctx.arc(30, 28, 10, 0, Math.PI * 2);
    ctx.fill();
  }
  texture.needsUpdate = true;
}

function createPhone3D() {
  const group = new THREE.Group();
  group.name = 'Móvil del cuidador';
  const body = box(group, 0.36, 0.045, 0.67, '#263638', 0, 0.027, 0, 0.07);
  body.rotation.y = 0.18;
  const texture = canvasTexture(256, 420, (ctx, w, h) => {
    ctx.fillStyle = '#f6efe2';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#2f7771';
    roundRect(ctx, 16, 18, w - 32, 90, 22);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 28px system-ui, sans-serif';
    ctx.fillText('Hola, Carmen', 34, 62);
    ctx.font = '500 17px system-ui, sans-serif';
    ctx.fillText('App del cuidador', 34, 88);
    ctx.fillStyle = '#e1cbaa';
    roundRect(ctx, 16, 126, w - 32, 92, 18);
    ctx.fill();
    ctx.fillStyle = '#5a4029';
    ctx.font = '700 20px system-ui, sans-serif';
    ctx.fillText('Dosis del día', 32, 155);
    ctx.font = '500 15px system-ui, sans-serif';
    ctx.fillText('Sincronizada', 32, 186);
    ctx.fillStyle = '#dce9d9';
    roundRect(ctx, 16, 234, w - 32, 120, 18);
    ctx.fill();
    ctx.fillStyle = '#315a51';
    ctx.fillText('Agenda · Salud · GPS', 32, 274);
  });
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.31, 0.59),
    new THREE.MeshBasicMaterial({ map: texture }),
  );
  screen.rotation.x = -Math.PI / 2;
  screen.rotation.z = 0.18;
  screen.position.set(0, 0.052, 0);
  group.add(screen);
  markInteractable(group, 'phone3d');
  return group;
}

function createPlant(parent, x, z, scale = 1, color = '#4e8a5f') {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.scale.setScalar(scale);
  const pot = cylinder(group, 0.22, 0.16, 0.36, '#b97759', 0, 0.18, 0);
  pot.castShadow = true;
  const soil = cylinder(group, 0.19, 0.19, 0.03, '#5a432f', 0, 0.37, 0);
  soil.castShadow = false;
  for (let i = 0; i < 7; i += 1) {
    const leaf = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 12, 8),
      material(color, 0.9),
    );
    leaf.scale.set(0.48, 1.25, 0.35);
    const angle = (i / 7) * Math.PI * 2;
    leaf.position.set(Math.cos(angle) * 0.16, 0.62 + (i % 3) * 0.1, Math.sin(angle) * 0.16);
    leaf.rotation.z = Math.cos(angle) * 0.5;
    leaf.rotation.x = Math.sin(angle) * 0.45;
    leaf.castShadow = true;
    group.add(leaf);
  }
  parent.add(group);
  return group;
}

function addWindow(parent, x, z, width = 2, height = 1.1, rotationY = 0) {
  const group = new THREE.Group();
  group.position.set(x, 1.62, z);
  group.rotation.y = rotationY;
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ color: '#b7d9dd', transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
  );
  glass.position.z = 0.015;
  group.add(glass);
  const frameColor = '#f5eee0';
  box(group, width + 0.18, 0.11, 0.09, frameColor, 0, height / 2 + 0.05, 0.03, 0.02);
  box(group, width + 0.18, 0.11, 0.09, frameColor, 0, -height / 2 - 0.05, 0.03, 0.02);
  box(group, 0.1, height + 0.18, 0.09, frameColor, -width / 2 - 0.05, 0, 0.03, 0.02);
  box(group, 0.1, height + 0.18, 0.09, frameColor, width / 2 + 0.05, 0, 0.03, 0.02);
  box(group, 0.07, height, 0.08, frameColor, 0, 0, 0.04, 0.02);
  box(group, width, 0.07, 0.08, frameColor, 0, 0, 0.04, 0.02);
  const sun = textPlane('☀', 0.36, 0.36, { canvasWidth: 128, canvasHeight: 128, fontSize: 90, color: '#e9c56d' });
  sun.position.set(width * 0.28, height * 0.2, 0.06);
  group.add(sun);
  parent.add(group);
}

function addPainting(parent, x, z, seed, rotationY = 0) {
  const group = new THREE.Group();
  group.position.set(x, 1.75, z);
  group.rotation.y = rotationY;
  const art = new THREE.Mesh(
    new THREE.PlaneGeometry(0.78, 0.98),
    new THREE.MeshBasicMaterial({ map: artTexture(seed), side: THREE.DoubleSide }),
  );
  art.position.z = 0.035;
  group.add(art);
  box(group, 0.92, 1.12, 0.08, '#8b6748', 0, 0, 0, 0.025);
  group.remove(art);
  group.add(art);
  parent.add(group);
}

function addFloorLabel(parent, text, x, z, width = 1.5) {
  const label = textPlane(text, width, 0.32, {
    canvasWidth: 420,
    canvasHeight: 100,
    fontSize: 52,
    color: 'rgba(87, 66, 48, 0.30)',
    weight: 800,
  });
  label.rotation.x = -Math.PI / 2;
  label.position.set(x, 0.028, z);
  parent.add(label);
}

export function createWorld(scene, state) {
  const root = new THREE.Group();
  root.name = 'Hogar de Rosa';
  scene.add(root);

  const colliders = [];
  const interactables = [];
  const targetObjects = new Map();
  const targetMeta = new Map();
  const rings = [];
  const buttonAnimations = [];
  const tempVector = new THREE.Vector3();

  function addCollider(x, z, width, depth) {
    colliders.push({ minX: x - width / 2, maxX: x + width / 2, minZ: z - depth / 2, maxZ: z + depth / 2 });
  }

  function registerTarget(id, object, { label, range = 2.4, ring = null, priority = false, only = null }) {
    targetObjects.set(id, object);
    targetMeta.set(id, { label, range, priority, only });
    if (ring) rings.push({ id, ring, object, priority, only });
  }

  // Exterior and foundation.
  const grass = new THREE.Mesh(
    new THREE.PlaneGeometry(46, 34),
    new THREE.MeshStandardMaterial({ map: grassTexture(), roughness: 1 }),
  );
  grass.rotation.x = -Math.PI / 2;
  grass.position.set(0, -0.07, 4);
  grass.receiveShadow = true;
  root.add(grass);

  const foundation = box(root, 20.8, 0.22, 14.8, '#d8c3a2', 0, -0.12, 0, 0.04);
  foundation.castShadow = true;

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 14),
    new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.93 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.005;
  floor.receiveShadow = true;
  root.add(floor);

  const kitchenTile = new THREE.Mesh(
    new THREE.PlaneGeometry(6.5, 5.2),
    new THREE.MeshStandardMaterial({ map: tileTexture(), roughness: 0.9 }),
  );
  kitchenTile.rotation.x = -Math.PI / 2;
  kitchenTile.position.set(6.65, 0.013, -4.3);
  kitchenTile.receiveShadow = true;
  root.add(kitchenTile);

  const path = box(root, 2.8, 0.08, 5.4, '#d6b58c', 7, -0.01, 9.6, 0.12);
  path.receiveShadow = true;
  for (let i = 0; i < 5; i += 1) {
    box(root, 2.2, 0.025, 0.055, '#b9926d', 7, 0.045, 7.5 + i * 1.05, 0.02);
  }

  // Walls: the front is intentionally cut away for an unobstructed camera.
  const wallColor = '#f0dfc4';
  const backWall = box(root, 20.3, 2.8, 0.22, wallColor, 0, 1.4, -7.08, 0.03);
  backWall.receiveShadow = true;
  const leftWall = box(root, 0.22, 2.8, 14.2, wallColor, -10.08, 1.4, 0, 0.03);
  const rightWall = box(root, 0.22, 2.8, 14.2, wallColor, 10.08, 1.4, 0, 0.03);
  leftWall.receiveShadow = true;
  rightWall.receiveShadow = true;
  box(root, 0.18, 2.15, 4.7, '#e8d2b2', -4.25, 1.075, -4.7, 0.025);
  box(root, 0.18, 2.15, 4.7, '#e8d2b2', 3.15, 1.075, -4.7, 0.025);
  box(root, 0.16, 1.7, 3.3, '#e8d2b2', -7.0, 0.85, 0.3, 0.025);
  box(root, 2.8, 1.7, 0.16, '#e8d2b2', -8.6, 0.85, -1.3, 0.025);
  box(root, 15.5, 0.42, 0.2, '#ead8b9', -2.25, 0.21, 7.08, 0.03);
  box(root, 1.6, 0.42, 0.2, '#ead8b9', 9.2, 0.21, 7.08, 0.03);
  addCollider(-2.25, 7.08, 15.5, 0.25);
  addCollider(9.2, 7.08, 1.6, 0.25);

  addWindow(root, -7.1, -6.95, 2.2, 1.12);
  addWindow(root, 5.6, -6.95, 2.4, 1.12);
  addPainting(root, -1.2, -6.94, 1);
  addPainting(root, 0.0, -6.94, 2);
  addPainting(root, -4.1, -3.6, 0, Math.PI / 2);

  // Ceiling-less room labels are subtle and help orientation.
  addFloorLabel(root, 'SALA', -0.8, 2.2, 1.3);
  addFloorLabel(root, 'COCINA', 6.6, -2.1, 1.7);
  addFloorLabel(root, 'DORMITORIO', -7.4, -2.4, 2.2);
  addFloorLabel(root, 'ENTRADA', 7.2, 4.9, 1.7);

  // Rugs and soft furnishings.
  const livingRug = new THREE.Mesh(
    new THREE.PlaneGeometry(5.6, 4.1),
    new THREE.MeshStandardMaterial({ map: fabricTexture('#c9a77f', 'rgba(107, 75, 55, 0.22)'), roughness: 1 }),
  );
  livingRug.rotation.x = -Math.PI / 2;
  livingRug.position.set(-1.4, 0.019, 2.75);
  livingRug.receiveShadow = true;
  root.add(livingRug);

  const bedroomRug = new THREE.Mesh(
    new THREE.PlaneGeometry(3.4, 2.2),
    new THREE.MeshStandardMaterial({ map: fabricTexture('#c7b3a0', 'rgba(90, 70, 60, 0.18)'), roughness: 1 }),
  );
  bedroomRug.rotation.x = -Math.PI / 2;
  bedroomRug.position.set(-6.8, 0.02, -3.0);
  bedroomRug.receiveShadow = true;
  root.add(bedroomRug);

  // Living room sofa.
  const sofa = new THREE.Group();
  sofa.position.set(-2.5, 0, 1.35);
  box(sofa, 3.35, 0.35, 1.15, '#799b91', 0, 0.35, 0, 0.14);
  box(sofa, 3.35, 0.85, 0.3, '#6b8d84', 0, 0.78, -0.48, 0.12);
  box(sofa, 0.28, 0.68, 1.15, '#6b8d84', -1.68, 0.68, 0, 0.1);
  box(sofa, 0.28, 0.68, 1.15, '#6b8d84', 1.68, 0.68, 0, 0.1);
  [-0.95, 0, 0.95].forEach((x) => {
    const cushion = box(sofa, 0.88, 0.18, 0.9, '#a8c0ae', x, 0.58, 0.06, 0.09);
    cushion.rotation.x = -0.04;
  });
  const throwPillow = box(sofa, 0.42, 0.42, 0.17, '#d49a6c', -1.25, 0.78, -0.23, 0.09);
  throwPillow.rotation.z = 0.25;
  root.add(sofa);
  addCollider(-2.5, 1.35, 3.5, 1.35);

  const coffeeTable = new THREE.Group();
  coffeeTable.position.set(-1.7, 0, 4.1);
  box(coffeeTable, 2.0, 0.12, 1.0, '#9b6f4c', 0, 0.46, 0, 0.08);
  [-0.78, 0.78].forEach((x) => {
    [-0.35, 0.35].forEach((z) => cylinder(coffeeTable, 0.055, 0.055, 0.42, '#755138', x, 0.22, z, 10));
  });
  const bowl = cylinder(coffeeTable, 0.2, 0.13, 0.1, '#d6a45f', 0.65, 0.56, -0.1);
  bowl.castShadow = true;
  ['#c56b4a', '#d6b455', '#7f9c60'].forEach((color, i) => {
    const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 10), material(color));
    fruit.position.set(0.55 + i * 0.08, 0.63, -0.1 + (i % 2) * 0.08);
    fruit.castShadow = true;
    coffeeTable.add(fruit);
  });
  root.add(coffeeTable);
  addCollider(-1.7, 4.1, 2.1, 1.1);

  const phone3d = createPhone3D();
  phone3d.position.set(-1.95, 0.525, 4.05);
  const phoneRing = addRing(phone3d, 0.37, '#4f9f95', 0.03);
  root.add(phone3d);
  interactables.push(phone3d);
  registerTarget('phone3d', phone3d, {
    label: 'Móvil del cuidador · abrir aplicación',
    range: 2.1,
    ring: phoneRing,
    priority: true,
  });

  const armchair = new THREE.Group();
  armchair.position.set(1.15, 0, 3.15);
  box(armchair, 1.15, 0.4, 1.05, '#c5906f', 0, 0.37, 0, 0.16);
  box(armchair, 1.15, 0.82, 0.24, '#b77f60', 0, 0.78, -0.43, 0.12);
  box(armchair, 0.22, 0.55, 1.05, '#b77f60', -0.55, 0.65, 0, 0.09);
  box(armchair, 0.22, 0.55, 1.05, '#b77f60', 0.55, 0.65, 0, 0.09);
  root.add(armchair);
  addCollider(1.15, 3.15, 1.25, 1.15);

  const bookshelf = new THREE.Group();
  bookshelf.position.set(-9.35, 0, -0.4);
  box(bookshelf, 0.45, 2.0, 2.1, '#8a674a', 0, 1.0, 0, 0.04);
  [-0.65, -0.05, 0.55].forEach((y, shelf) => {
    box(bookshelf, 0.5, 0.07, 2.0, '#6d503a', 0.08, y + 0.8, 0, 0.02);
    for (let i = 0; i < 9; i += 1) {
      const colors = ['#9c5d4f', '#d7a85f', '#5e8072', '#6c7894', '#c58c6b'];
      const book = box(
        bookshelf,
        0.28,
        0.24 + ((i + shelf) % 3) * 0.04,
        0.12,
        colors[(i + shelf) % colors.length],
        0.3,
        y + 0.94,
        -0.85 + i * 0.21,
        0.015,
      );
      book.rotation.z = i % 5 === 0 ? -0.12 : 0;
    }
  });
  root.add(bookshelf);
  addCollider(-9.35, -0.4, 0.6, 2.2);

  // Kitchen appliances and counters.
  const counter = new THREE.Group();
  counter.position.set(6.5, 0, -6.35);
  box(counter, 6.3, 0.86, 0.86, '#e7d8bd', 0, 0.43, 0, 0.05);
  box(counter, 6.45, 0.1, 0.95, '#9a7658', 0, 0.9, 0, 0.03);
  for (let i = -2; i <= 2; i += 1) {
    box(counter, 1.1, 0.52, 0.04, '#cbb393', i * 1.18, 0.46, 0.45, 0.025);
    box(counter, 0.16, 0.045, 0.06, '#8b6a4f', i * 1.18, 0.56, 0.48, 0.015);
  }
  const sink = box(counter, 0.8, 0.06, 0.56, '#aebbb6', -1.25, 0.94, 0.02, 0.07);
  sink.material.roughness = 0.4;
  cylinder(counter, 0.035, 0.035, 0.36, '#8b9b98', -1.25, 1.12, -0.26, 12);
  box(counter, 0.8, 0.025, 0.4, '#8da29b', 1.2, 0.95, 0, 0.06);
  root.add(counter);
  addCollider(6.5, -6.35, 6.4, 0.95);

  const fridge = new THREE.Group();
  fridge.position.set(9.25, 0, -5.05);
  box(fridge, 1.05, 2.15, 0.9, '#dce4dc', 0, 1.075, 0, 0.09);
  box(fridge, 0.06, 0.65, 0.08, '#9aaba4', -0.32, 1.5, 0.48, 0.02);
  box(fridge, 0.06, 0.55, 0.08, '#9aaba4', -0.32, 0.72, 0.48, 0.02);
  root.add(fridge);
  addCollider(9.25, -5.05, 1.1, 0.95);

  const kitchenTable = new THREE.Group();
  kitchenTable.position.set(5.55, 0, -3.35);
  cylinder(kitchenTable, 1.05, 1.05, 0.1, '#d3b083', 0, 0.76, 0, 28);
  cylinder(kitchenTable, 0.11, 0.14, 0.72, '#825f43', 0, 0.38, 0, 16);
  cylinder(kitchenTable, 0.45, 0.45, 0.035, '#a47f5c', 0, 0.04, 0, 16);
  [-1.35, 1.35].forEach((x) => {
    const chair = new THREE.Group();
    chair.position.set(x, 0, 0);
    box(chair, 0.5, 0.1, 0.52, '#a67c58', 0, 0.47, 0, 0.04);
    box(chair, 0.5, 0.65, 0.08, '#a67c58', 0, 0.76, -0.24, 0.04);
    kitchenTable.add(chair);
  });
  const cup = cylinder(kitchenTable, 0.08, 0.07, 0.16, '#f5f0e3', -0.34, 0.9, 0.17, 14);
  cup.castShadow = true;
  const plate = cylinder(kitchenTable, 0.22, 0.22, 0.035, '#f3e7cd', 0.32, 0.83, 0.1, 20);
  plate.castShadow = true;
  root.add(kitchenTable);
  addCollider(5.55, -3.35, 2.3, 2.3);

  // Medicine cabinet.
  const cabinet = new THREE.Group();
  cabinet.position.set(8.15, 0, -6.05);
  box(cabinet, 1.05, 0.82, 0.2, '#e9e4d6', 0, 1.75, -0.72, 0.045);
  box(cabinet, 0.08, 0.72, 0.03, '#c6d6ce', -0.22, 1.75, -0.6, 0.02);
  const crossV = box(cabinet, 0.13, 0.42, 0.04, '#5e9b85', 0.23, 1.75, -0.59, 0.02);
  const crossH = box(cabinet, 0.42, 0.13, 0.04, '#5e9b85', 0.23, 1.75, -0.58, 0.02);
  crossV.castShadow = false;
  crossH.castShadow = false;
  const cabinetRing = addRing(cabinet, 0.65, '#77a88e', 0.035);
  cabinetRing.position.z = 0.35;
  root.add(cabinet);
  markInteractable(cabinet, 'cabinet');
  interactables.push(cabinet);
  registerTarget('cabinet', cabinet, {
    label: 'Botiquín · registrar reposición',
    range: 2.4,
    ring: cabinetRing,
    priority: true,
  });

  // Fixed device on its sideboard.
  const sideboard = new THREE.Group();
  sideboard.position.set(2.2, 0, -1.3);
  box(sideboard, 2.05, 0.78, 0.76, '#a57b54', 0, 0.39, 0, 0.05);
  box(sideboard, 2.18, 0.09, 0.86, '#c79b6c', 0, 0.82, 0, 0.035);
  box(sideboard, 0.8, 0.34, 0.04, '#8f6746', -0.45, 0.42, 0.4, 0.02);
  box(sideboard, 0.8, 0.34, 0.04, '#8f6746', 0.45, 0.42, 0.4, 0.02);
  root.add(sideboard);
  addCollider(2.2, -1.3, 2.15, 0.9);

  const fixed = createFixedDevice();
  fixed.group.position.set(2.2, 0.87, -1.22);
  const fixedRing = addRing(fixed.group, 0.95, '#e2aa55', 0.025);
  root.add(fixed.group);
  interactables.push(fixed.group);
  registerTarget('fixed', fixed.group, {
    label: 'Dispositivo fijo · inspeccionar',
    range: 2.5,
    ring: fixedRing,
    priority: true,
  });
  const buttonLabels = {
    'fixed.back': 'Botón verde · volver al modo reloj',
    'fixed.appointments': 'Botón azul · próximas citas',
    'fixed.empty': 'Botón ámbar · medicamento agotado',
  };
  Object.entries(fixed.buttons).forEach(([id, object]) => {
    registerTarget(id, object, { label: buttonLabels[id], range: 2.5 });
  });

  // Calendar linked to the app.
  const calendar = new THREE.Group();
  calendar.position.set(0.25, 0, -6.1);
  const calendarCanvas = document.createElement('canvas');
  calendarCanvas.width = 320;
  calendarCanvas.height = 400;
  const calendarTexture = new THREE.CanvasTexture(calendarCanvas);
  calendarTexture.colorSpace = THREE.SRGBColorSpace;
  const calendarBoard = new THREE.Mesh(
    new THREE.PlaneGeometry(1.15, 1.42),
    new THREE.MeshBasicMaterial({ map: calendarTexture, transparent: true, side: THREE.DoubleSide }),
  );
  calendarBoard.position.set(0, 1.72, -0.86);
  calendar.add(calendarBoard);
  box(calendar, 1.28, 1.56, 0.06, '#8d6a4c', 0, 1.72, -0.9, 0.025);
  calendar.remove(calendarBoard);
  calendar.add(calendarBoard);
  const calendarRing = addRing(calendar, 0.62, '#6e9ba2', 0.035);
  calendarRing.position.z = 0.15;
  root.add(calendar);
  markInteractable(calendar, 'calendar');
  interactables.push(calendar);
  registerTarget('calendar', calendar, {
    label: 'Calendario · consultar citas',
    range: 2.6,
    ring: calendarRing,
  });

  let calendarKey = '';
  function drawCalendar(force = false) {
    const appointment = state.appointments[0];
    const key = `${appointment ? `${appointment.time}-${appointment.title}` : 'none'}|${Math.floor(state.time)}`;
    if (!force && key === calendarKey) return;
    calendarKey = key;
    const ctx = calendarCanvas.getContext('2d');
    ctx.fillStyle = '#f8f0dc';
    ctx.fillRect(0, 0, 320, 400);
    ctx.fillStyle = '#5b3d27';
    ctx.font = '800 30px system-ui, sans-serif';
    ctx.fillText('AGENDA', 28, 50);
    ctx.font = '500 18px system-ui, sans-serif';
    ctx.fillText('Jornada de Rosa', 28, 80);
    ctx.strokeStyle = '#c7a77d';
    ctx.lineWidth = 3;
    for (let y = 105; y < 360; y += 42) {
      ctx.beginPath();
      ctx.moveTo(22, y);
      ctx.lineTo(298, y);
      ctx.stroke();
    }
    ctx.fillStyle = '#3f7770';
    ctx.font = '700 23px system-ui, sans-serif';
    if (appointment) {
      ctx.fillText(formatTime(appointment.time), 32, 140);
      ctx.fillStyle = '#5b3d27';
      ctx.font = '600 20px system-ui, sans-serif';
      wrapText(ctx, appointment.title, 32, 178, 255, 28, 3);
      ctx.fillStyle = '#8a6749';
      ctx.font = '500 17px system-ui, sans-serif';
      ctx.fillText('Sincronizado con el reloj', 32, 290);
    } else {
      ctx.fillText('Sin citas programadas', 32, 145);
      ctx.fillStyle = '#8a6749';
      ctx.font = '500 17px system-ui, sans-serif';
      ctx.fillText('Regístrala en la app', 32, 180);
    }
    ctx.fillStyle = '#b27a53';
    ctx.font = '700 19px system-ui, sans-serif';
    ctx.fillText(`Hora actual: ${formatTime(state.time)}`, 32, 365);
    calendarTexture.needsUpdate = true;
  }

  // Bedroom.
  const bed = new THREE.Group();
  bed.position.set(-7.55, 0, -5.05);
  box(bed, 3.25, 0.38, 2.05, '#9a7558', 0, 0.3, 0, 0.07);
  box(bed, 3.25, 0.9, 0.18, '#8b684c', 0, 0.75, -1.02, 0.06);
  box(bed, 3.12, 0.18, 1.9, '#efe1c8', 0, 0.55, 0.02, 0.08);
  box(bed, 3.12, 0.08, 1.16, '#b98e83', 0, 0.66, 0.38, 0.05);
  [-0.7, 0.7].forEach((x) => {
    const pillow = box(bed, 1.1, 0.18, 0.55, '#f7f0df', x, 0.71, -0.68, 0.1);
    pillow.rotation.z = x < 0 ? -0.04 : 0.04;
  });
  root.add(bed);
  addCollider(-7.55, -5.05, 3.35, 2.2);

  const dresser = new THREE.Group();
  dresser.position.set(-9.2, 0, -2.1);
  box(dresser, 1.35, 1.05, 0.65, '#b48a63', 0, 0.53, 0, 0.04);
  [-0.32, 0.08, 0.48].forEach((y) => {
    box(dresser, 1.15, 0.28, 0.035, '#96704f', 0, y + 0.53, 0.34, 0.02);
  });
  const mirror = box(dresser, 1.2, 0.8, 0.05, '#b8d0cc', 0, 1.55, -0.05, 0.2);
  mirror.material.roughness = 0.25;
  const photoFrame = box(dresser, 0.32, 0.4, 0.045, '#d6a66a', 0.35, 1.13, 0.35, 0.02);
  photoFrame.rotation.z = -0.05;
  root.add(dresser);
  addCollider(-9.2, -2.1, 1.4, 0.75);

  const lamp = new THREE.Group();
  lamp.position.set(-5.85, 0, -5.6);
  cylinder(lamp, 0.17, 0.17, 0.06, '#6f5740', 0, 0.03, 0, 16);
  cylinder(lamp, 0.035, 0.035, 0.55, '#8d7355', 0, 0.3, 0, 12);
  const shade = cylinder(lamp, 0.13, 0.25, 0.3, '#f0d29f', 0, 0.72, 0, 18);
  shade.castShadow = true;
  root.add(lamp);

  // Bathroom hints.
  const sinkGroup = new THREE.Group();
  sinkGroup.position.set(-8.65, 0, 0.85);
  box(sinkGroup, 0.8, 0.75, 0.55, '#e7dcc7', 0, 0.38, 0, 0.05);
  const basin = cylinder(sinkGroup, 0.32, 0.25, 0.13, '#f4f2e9', 0, 0.78, 0, 20);
  basin.scale.z = 0.8;
  cylinder(sinkGroup, 0.025, 0.025, 0.28, '#9aa9a4', 0, 0.96, -0.16, 10);
  root.add(sinkGroup);
  addCollider(-8.65, 0.85, 0.9, 0.65);

  // Entrance and door.
  const door = new THREE.Group();
  door.position.set(7, 0, 7.05);
  box(door, 0.16, 2.45, 0.18, '#a57950', -1.25, 1.225, 0, 0.025);
  box(door, 0.16, 2.45, 0.18, '#a57950', 1.25, 1.225, 0, 0.025);
  box(door, 2.65, 0.18, 0.18, '#a57950', 0, 2.42, 0, 0.025);
  const doorPanel = box(door, 2.15, 2.25, 0.08, '#668b8a', -0.12, 1.15, -0.1, 0.035);
  doorPanel.rotation.y = -0.35;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.07, 14, 10), material('#d8b15d', 0.4, 0.25));
  knob.position.set(0.74, 1.05, -0.08);
  door.add(knob);
  const doorSign = textPlane('SALIDA', 0.8, 0.22, {
    canvasWidth: 320,
    canvasHeight: 100,
    fontSize: 48,
    color: '#4b735e',
  });
  doorSign.position.set(0, 2.66, 0.02);
  door.add(doorSign);
  const doorRing = addRing(door, 0.95, '#6c9f7c', 0.035);
  root.add(door);
  markInteractable(door, 'door');
  interactables.push(door);
  registerTarget('door', door, {
    label: 'Salida · acompañar a Rosa',
    range: 2.5,
    ring: doorRing,
    priority: true,
  });

  const coatRack = new THREE.Group();
  coatRack.position.set(9.15, 0, 5.45);
  cylinder(coatRack, 0.055, 0.075, 1.75, '#7d5c3e', 0, 0.88, 0, 12);
  [0, 1, 2].forEach((i) => {
    const hook = cylinder(coatRack, 0.025, 0.025, 0.24, '#7d5c3e', 0, 1.55, 0, 8);
    hook.rotation.z = Math.PI / 2;
    hook.rotation.y = (i / 3) * Math.PI * 2;
  });
  const coat = box(coatRack, 0.45, 0.75, 0.18, '#7c8da8', 0.18, 1.18, 0.08, 0.08);
  coat.rotation.z = 0.08;
  root.add(coatRack);

  const keyTable = new THREE.Group();
  keyTable.position.set(8.55, 0, 4.2);
  box(keyTable, 0.7, 0.08, 0.55, '#b4885f', 0, 0.66, 0, 0.035);
  [-0.25, 0.25].forEach((x) => cylinder(keyTable, 0.035, 0.035, 0.64, '#8a6647', x, 0.32, 0, 10));
  const keyMesh = box(keyTable, 0.22, 0.03, 0.07, '#d4b15e', 0, 0.72, 0, 0.015);
  keyMesh.rotation.y = 0.4;
  root.add(keyTable);

  // Garden.
  const bench = new THREE.Group();
  bench.position.set(4.6, 0, 9.25);
  box(bench, 2.3, 0.15, 0.58, '#b47c50', 0, 0.52, 0, 0.04);
  box(bench, 2.3, 0.65, 0.12, '#a66f45', 0, 0.88, -0.28, 0.04);
  [-0.9, 0.9].forEach((x) => box(bench, 0.12, 0.5, 0.5, '#6e5139', x, 0.26, 0, 0.025));
  root.add(bench);
  addCollider(4.6, 9.25, 2.4, 0.8);

  createPlant(root, 2.55, 5.75, 1.1, '#4f8b60');
  createPlant(root, -8.75, 5.6, 0.85, '#5f9366');
  createPlant(root, 0.2, 8.7, 0.8, '#4d8259');
  createPlant(root, 8.9, 9.2, 1.05, '#6f9c60');
  const wateringCan = new THREE.Group();
  wateringCan.position.set(2.0, 0, 6.2);
  cylinder(wateringCan, 0.18, 0.2, 0.28, '#789c8c', 0, 0.16, 0, 16);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.025, 8, 18), material('#789c8c'));
  handle.position.set(0, 0.32, 0);
  handle.rotation.y = Math.PI / 2;
  wateringCan.add(handle);
  root.add(wateringCan);

  // Characters.
  const player = new Actor({ elder: false });
  player.group.position.set(1.35, 0, 5.55);
  player.group.rotation.y = Math.PI;
  player.activity = 'Cuidador explorando la vivienda';
  root.add(player.group);

  const elder = new Actor({ elder: true });
  elder.group.position.set(-1.25, 0, 2.05);
  elder.group.rotation.y = 0.2;
  elder.activity = 'Descansando en la sala';
  root.add(elder.group);

  const elderRing = addRing(elder.group, 0.72, '#3f8e89', 0.032);
  registerTarget('elder', elder.group, {
    label: 'Hablar con Rosa',
    range: 2.5,
    ring: elderRing,
    priority: true,
  });
  const wearableRing = new THREE.Mesh(
    new THREE.RingGeometry(0.19, 0.22, 32),
    new THREE.MeshBasicMaterial({ color: '#d7594b', transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }),
  );
  wearableRing.position.z = 0.1;
  elder.wearable.group.add(wearableRing);
  markInteractable(elder.group, 'elder', true);
  markInteractable(elder.wearable.group, 'wearable', true);
  elder.wearable.sosButton.userData.interact = 'wearable.sos';
  interactables.push(elder.group);
  registerTarget('wearable', elder.wearable.group, {
    label: 'Wearable · signos vitales y SOS',
    range: 2.5,
    priority: true,
  });
  registerTarget('wearable.sos', elder.wearable.sosButton, {
    label: 'Botón SOS · simulado',
    range: 2.5,
    priority: true,
  });

  // Lighting.
  const hemisphere = new THREE.HemisphereLight('#fff2d8', '#9b8667', 1.75);
  scene.add(hemisphere);
  const sunLight = new THREE.DirectionalLight('#fff0cf', 2.75);
  sunLight.position.set(-7, 13, 8);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.left = -16;
  sunLight.shadow.camera.right = 16;
  sunLight.shadow.camera.top = 16;
  sunLight.shadow.camera.bottom = -16;
  sunLight.shadow.camera.near = 0.5;
  sunLight.shadow.camera.far = 40;
  sunLight.shadow.bias = -0.0004;
  scene.add(sunLight);
  const warmFill = new THREE.PointLight('#ffd9a0', 18, 18, 2);
  warmFill.position.set(-3, 3.2, -3);
  scene.add(warmFill);

  const locations = {
    sofa: { to: [-1.25, 2.1], path: [[0, 0.2], [-1.25, 2.1]], label: 'en la sala' },
    kitchen: { to: [5.2, -2.15], path: [[3.8, -2.4], [5.2, -2.15]], label: 'en la cocina' },
    device: { to: [2.2, -0.25], path: [[1.2, -0.2], [2.2, -0.25]], label: 'junto al dispositivo fijo' },
    bedroom: { to: [-7.2, -2.9], path: [[-4.8, -2.7], [-7.2, -2.9]], label: 'en el dormitorio' },
    entrance: { to: [7.0, 5.55], path: [[4.2, 4.6], [7.0, 5.55]], label: 'en la entrada' },
    garden: { to: [5.1, 8.45], path: [[4.2, 4.6], [7.0, 6.5], [7.1, 7.5], [5.1, 8.45]], label: 'en el jardín' },
    cabinet: { to: [8.05, -4.75], path: [[4.2, -2.8], [8.05, -4.75]], label: 'junto al botiquín' },
    plant: { to: [2.05, 5.55], path: [[1.2, 4.6], [2.05, 5.55]], label: 'regando las plantas' },
  };

  function roomAt(x, z) {
    if (z > 7.25) return 'Jardín';
    if (x > 5.8 && z > 2.5) return 'Entrada';
    if (x < -5.0 && z < -2.1) return 'Dormitorio';
    if (x < -5.0 && z >= -2.1 && z < 3.3) return 'Baño';
    if (x > 3.1 && z < -1.4) return 'Cocina';
    return 'Sala';
  }

  function getGPS() {
    const position = elder.group.position;
    return {
      x: position.x,
      z: position.z,
      room: roomAt(position.x, position.z),
    };
  }

  function elderGo(name, options = {}) {
    const location = locations[name] || locations.sofa;
    const current = elder.group.position;
    const distance = Math.hypot(location.to[0] - current.x, location.to[1] - current.z);
    const path = [...(distance > 5.5 ? [[0.4, 0.4]] : []), ...location.path];
    const steps = path.map((to) => ({
      type: 'move',
      to,
      speed: options.speed || 1.45,
      activity: `Rosa va ${location.label}`,
    }));
    if (options.onArrive) steps.push({ type: 'call', run: options.onArrive });
    if (options.pose || options.duration) {
      steps.push({
        type: 'wait',
        duration: options.duration || 3,
        pose: options.pose || 'idle',
        expression: options.expression || 'neutral',
        activity: options.activity || `Rosa está ${location.label}`,
        face: options.face || null,
      });
    }
    if (options.onDone) steps.push({ type: 'call', run: options.onDone });
    elder.setScript(steps);
    state.npcActivity = `Rosa va ${location.label}`;
  }

  function pressButton(id) {
    let mesh = null;
    if (id.startsWith('fixed.')) mesh = fixed.buttons[id];
    if (id === 'wearable.sos') mesh = elder.wearable.sosButton;
    if (!mesh) return;
    if (buttonAnimations.some((item) => item.mesh === mesh)) return;
    buttonAnimations.push({ mesh, baseY: mesh.position.y, elapsed: 0, duration: 0.38 });
  }

  function getWorldPosition(id) {
    const object = targetObjects.get(id);
    if (!object) return new THREE.Vector3();
    return object.getWorldPosition(tempVector).clone();
  }

  function getTargetMeta(id) {
    return targetMeta.get(id) || { label: 'Objeto interactivo', range: 2.4, priority: false, only: null };
  }

  function isNear(id, position, extra = 0) {
    const target = getWorldPosition(id);
    const meta = getTargetMeta(id);
    const dx = target.x - position.x;
    const dz = target.z - position.z;
    return Math.hypot(dx, dz) <= meta.range + extra;
  }

  function collides(x, z, radius = 0.34) {
    if (x < -9.65 + radius || x > 9.65 - radius || z < -6.72 + radius || z > 10.65 - radius) return true;
    return colliders.some((rect) => (
      x + radius > rect.minX
      && x - radius < rect.maxX
      && z + radius > rect.minZ
      && z - radius < rect.maxZ
    ));
  }

  function update(dt, elapsed, playerPosition) {
    drawFixedScreen(fixed, state);
    drawWearableScreen(elder.wearable, state);
    drawCalendar();

    const targetZ = state.device.compartmentOpen ? 0.63 : 0.34;
    fixed.drawer.position.z = THREE.MathUtils.damp(fixed.drawer.position.z, targetZ, 8, dt);
    fixed.pill.visible = state.device.compartmentOpen && state.device.pillInCompartment;

    for (let i = buttonAnimations.length - 1; i >= 0; i -= 1) {
      const animation = buttonAnimations[i];
      animation.elapsed += dt;
      const progress = Math.min(1, animation.elapsed / animation.duration);
      animation.mesh.position.y = animation.baseY - Math.sin(progress * Math.PI) * 0.035;
      if (progress >= 1) {
        animation.mesh.position.y = animation.baseY;
        buttonAnimations.splice(i, 1);
      }
    }

    elder.update(dt);
    if (!elder.script.length || elder.scriptIndex >= elder.script.length) {
      // Keep a gentle idle expression outside scripted scenes.
      if (elder.pose === 'idle' && elder.expression === 'concerned') elder.setExpression('neutral');
    }
    state.lastRoom = roomAt(elder.group.position.x, elder.group.position.z);

    rings.forEach((entry) => {
      const position = getWorldPosition(entry.id);
      const dx = position.x - playerPosition.x;
      const dz = position.z - playerPosition.z;
      const distance = Math.hypot(dx, dz);
      const only = entry.only ? entry.only(state) : true;
      const visible = only && distance < 7.5;
      entry.ring.visible = visible;
      if (!visible) return;
      const proximity = Math.max(0, 1 - distance / 7.5);
      const pulse = Math.sin(elapsed * 2.6 + distance) * 0.05;
      entry.ring.material.opacity = 0.16 + proximity * 0.45 + (entry.priority ? 0.08 : 0);
      entry.ring.scale.setScalar(1 + pulse);
    });

    const wearablePosition = getWorldPosition('wearable');
    const wearableDistance = Math.hypot(wearablePosition.x - playerPosition.x, wearablePosition.z - playerPosition.z);
    wearableRing.material.opacity = wearableDistance < 4.5 ? 0.3 + Math.sin(elapsed * 4) * 0.12 : 0;
  }

  function setDeviceMode(mode, caption, statusText) {
    state.device.mode = mode;
    state.device.caption = caption;
    state.device.statusText = statusText;
    state.device.lastAnnouncement = caption;
    drawFixedScreen(fixed, state, true);
  }

  function setCompartment(open, pillPresent = state.device.pillInCompartment) {
    state.device.compartmentOpen = open;
    state.device.pillInCompartment = pillPresent;
  }

  return {
    root,
    player,
    elder,
    fixed,
    interactables,
    colliders,
    collides,
    update,
    elderGo,
    pressButton,
    roomAt,
    getGPS,
    getWorldPosition,
    getTargetMeta,
    isNear,
    setDeviceMode,
    setCompartment,
    drawCalendar,
    locations,
  };
}
