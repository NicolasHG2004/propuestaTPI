import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

function makeMaterial(color, roughness = 0.78) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.02 });
}

function rounded(width, height, depth, color, radius = 0.06) {
  const safeRadius = Math.max(0.005, Math.min(radius, width / 2 - 0.002, height / 2 - 0.002, depth / 2 - 0.002));
  const mesh = new THREE.Mesh(
    new RoundedBoxGeometry(width, height, depth, 4, safeRadius),
    makeMaterial(color),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function limb(radius, length, color) {
  const mesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(radius, length, 4, 10),
    makeMaterial(color),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createFaceTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return { canvas, ctx: canvas.getContext('2d'), texture };
}

function drawFace(face, expression, blink, elder) {
  const { ctx, canvas, texture } = face;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Soft cheeks.
  ctx.fillStyle = 'rgba(196, 111, 93, 0.16)';
  ctx.beginPath();
  ctx.ellipse(70, 145, 22, 12, 0, 0, Math.PI * 2);
  ctx.ellipse(186, 145, 22, 12, 0, 0, Math.PI * 2);
  ctx.fill();

  // Eyes and eyelids.
  ctx.strokeStyle = '#3d3028';
  ctx.fillStyle = '#3d3028';
  ctx.lineWidth = 7;
  [90, 166].forEach((x) => {
    if (blink) {
      ctx.beginPath();
      ctx.moveTo(x - 15, 106);
      ctx.quadraticCurveTo(x, 112, x + 15, 106);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.ellipse(x, 105, 6.5, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x + 2, 102, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#3d3028';
    }
  });

  // Glasses give the elder a readable, distinctive silhouette.
  if (elder) {
    ctx.strokeStyle = 'rgba(69, 58, 48, 0.78)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(62, 84, 57, 45, 15);
    ctx.roundRect(137, 84, 57, 45, 15);
    ctx.moveTo(119, 103);
    ctx.lineTo(137, 103);
    ctx.moveTo(62, 98);
    ctx.lineTo(38, 94);
    ctx.moveTo(194, 98);
    ctx.lineTo(218, 94);
    ctx.stroke();
  }

  // Eyebrows shift with the expression.
  ctx.strokeStyle = '#5a4638';
  ctx.lineWidth = 8;
  const browY = expression === 'surprised' ? 72 : expression === 'concerned' ? 78 : 76;
  ctx.beginPath();
  ctx.moveTo(66, browY + (expression === 'concerned' ? 8 : 0));
  ctx.quadraticCurveTo(90, browY - 7, 113, browY + (expression === 'concerned' ? -6 : 0));
  ctx.moveTo(143, browY + (expression === 'concerned' ? -6 : 0));
  ctx.quadraticCurveTo(166, browY - 7, 190, browY + (expression === 'concerned' ? 8 : 0));
  ctx.stroke();

  // Nose.
  ctx.strokeStyle = 'rgba(130, 84, 64, 0.55)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(128, 112);
  ctx.quadraticCurveTo(121, 137, 132, 141);
  ctx.stroke();

  // Mouth.
  ctx.strokeStyle = '#8b4d46';
  ctx.lineWidth = 7;
  ctx.beginPath();
  if (expression === 'smile') {
    ctx.moveTo(99, 169);
    ctx.quadraticCurveTo(128, 193, 157, 169);
  } else if (expression === 'concerned') {
    ctx.moveTo(103, 181);
    ctx.quadraticCurveTo(128, 164, 153, 181);
  } else if (expression === 'surprised') {
    ctx.ellipse(128, 176, 13, 17, 0, 0, Math.PI * 2);
  } else {
    ctx.moveTo(106, 174);
    ctx.quadraticCurveTo(128, 181, 150, 174);
  }
  ctx.stroke();

  texture.needsUpdate = true;
}

function createWearable() {
  const group = new THREE.Group();
  group.name = 'Wearable de Rosa';

  const strapTop = rounded(0.15, 0.2, 0.07, '#4b4f52', 0.035);
  strapTop.position.y = 0.2;
  const strapBottom = rounded(0.15, 0.2, 0.07, '#4b4f52', 0.035);
  strapBottom.position.y = -0.2;
  group.add(strapTop, strapBottom);

  const body = rounded(0.29, 0.31, 0.11, '#e9ece8', 0.075);
  body.position.z = 0.01;
  group.add(body);

  const bezel = rounded(0.235, 0.19, 0.018, '#293438', 0.045);
  bezel.position.set(0, 0, 0.073);
  group.add(bezel);

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 192;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.205, 0.155),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true }),
  );
  screen.position.set(0, 0, 0.085);
  group.add(screen);

  const sosButton = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.045, 0.035, 20),
    new THREE.MeshStandardMaterial({ color: '#c7453b', roughness: 0.55 }),
  );
  sosButton.position.set(0, 0.173, 0.018);
  sosButton.castShadow = true;
  sosButton.userData.interact = 'wearable.sos';
  group.add(sosButton);

  const hitArea = new THREE.Mesh(
    new THREE.SphereGeometry(0.23, 10, 8),
    new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }),
  );
  hitArea.userData.interact = 'wearable';
  group.add(hitArea);

  return {
    group,
    canvas,
    ctx: canvas.getContext('2d'),
    texture,
    sosButton,
    screen,
  };
}

function dampAngle(current, target, lambda, dt) {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + delta * Math.min(1, lambda * dt);
}

export class Actor {
  constructor(options = {}) {
    const elder = Boolean(options.elder);
    this.elder = elder;
    this.group = new THREE.Group();
    this.group.name = elder ? 'Rosa' : 'Álex';
    this.phase = 0;
    this.blinkTimer = 1 + Math.random() * 3;
    this.blinking = false;
    this.expression = 'neutral';
    this.pose = 'idle';
    this.poseTimer = 0;
    this.poseTime = 0;
    this.script = [];
    this.scriptIndex = 0;
    this.scriptStarted = false;
    this.onScriptDone = null;
    this.scriptMoving = false;
    this.activity = '';

    const skin = elder ? '#e8bd9d' : '#c88d69';
    const hair = elder ? '#d5d1ca' : '#3d302b';
    const shirt = elder ? '#b9847a' : '#3b837c';
    const trousers = elder ? '#6f6159' : '#35495d';
    const shoe = elder ? '#4a3b35' : '#2d3540';

    this.torso = rounded(0.56, 0.69, 0.34, shirt, 0.14);
    this.torso.position.y = 1.19;
    this.torsoBaseY = 1.19;
    this.group.add(this.torso);

    const collar = rounded(0.31, 0.11, 0.355, elder ? '#f1d9c4' : '#f0d9bd', 0.04);
    collar.position.set(0, 1.5, 0.005);
    this.group.add(collar);

    const hips = rounded(0.49, 0.23, 0.32, trousers, 0.08);
    hips.position.y = 0.82;
    this.group.add(hips);

    this.head = new THREE.Group();
    this.head.position.y = 1.72;
    this.group.add(this.head);

    const headMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.255, 24, 18),
      makeMaterial(skin, 0.82),
    );
    headMesh.scale.set(0.95, 1.05, 0.92);
    headMesh.castShadow = true;
    this.head.add(headMesh);

    const hairCap = new THREE.Mesh(
      new THREE.SphereGeometry(0.258, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2),
      makeMaterial(hair, 0.9),
    );
    hairCap.scale.set(0.98, elder ? 0.82 : 0.72, 0.98);
    hairCap.position.y = 0.045;
    hairCap.castShadow = true;
    this.head.add(hairCap);

    if (elder) {
      const bun = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), makeMaterial(hair, 0.9));
      bun.position.set(0, 0.12, -0.24);
      bun.castShadow = true;
      this.head.add(bun);
    } else {
      // A few short, rounded locks soften the silhouette without hiding the face.
      [-0.12, 0.02, 0.15].forEach((x, index) => {
        const lock = new THREE.Mesh(
          new THREE.SphereGeometry(0.09, 12, 8),
          makeMaterial(hair, 0.9),
        );
        lock.scale.set(1, 0.5, 0.72);
        lock.position.set(x, 0.18 - index * 0.012, 0.175);
        lock.castShadow = true;
        this.head.add(lock);
      });
    }

    [-0.247, 0.247].forEach((x) => {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), makeMaterial(skin));
      ear.position.set(x, -0.01, 0);
      this.head.add(ear);
    });

    this.face = createFaceTexture();
    const facePlane = new THREE.Mesh(
      new THREE.PlaneGeometry(0.41, 0.41),
      new THREE.MeshBasicMaterial({ map: this.face.texture, transparent: true, depthWrite: false }),
    );
    facePlane.position.set(0, -0.005, 0.238);
    this.head.add(facePlane);
    drawFace(this.face, 'neutral', false, elder);

    this.leftLeg = new THREE.Group();
    this.rightLeg = new THREE.Group();
    this.leftLeg.position.set(-0.16, 0.78, 0);
    this.rightLeg.position.set(0.16, 0.78, 0);
    [this.leftLeg, this.rightLeg].forEach((leg) => {
      const mesh = limb(0.085, 0.43, trousers);
      mesh.position.y = -0.31;
      leg.add(mesh);
      const foot = rounded(0.17, 0.09, 0.29, shoe, 0.04);
      foot.position.set(0, -0.68, 0.07);
      leg.add(foot);
      this.group.add(leg);
    });

    this.leftArm = new THREE.Group();
    this.rightArm = new THREE.Group();
    this.leftArm.position.set(-0.37, 1.45, 0);
    this.rightArm.position.set(0.37, 1.45, 0);
    [this.leftArm, this.rightArm].forEach((arm) => {
      const sleeve = limb(0.075, 0.38, shirt);
      sleeve.position.y = -0.27;
      arm.add(sleeve);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.085, 14, 12), makeMaterial(skin));
      hand.position.y = -0.58;
      hand.castShadow = true;
      arm.add(hand);
      this.group.add(arm);
    });

    if (elder) {
      this.wearable = createWearable();
      this.wearable.group.position.set(0, -0.52, 0.075);
      this.wearable.group.rotation.x = -0.18;
      this.leftArm.add(this.wearable.group);
      const necklace = new THREE.Mesh(
        new THREE.TorusGeometry(0.095, 0.012, 8, 24),
        new THREE.MeshStandardMaterial({ color: '#d5ad62', metalness: 0.25, roughness: 0.6 }),
      );
      necklace.position.set(0, 1.38, 0.18);
      necklace.rotation.x = Math.PI / 2;
      this.group.add(necklace);
    }

    const scale = elder ? 0.94 : 1;
    this.group.scale.setScalar(scale);
  }

  setExpression(expression) {
    if (this.expression === expression) return;
    this.expression = expression;
    drawFace(this.face, expression, this.blinking, this.elder);
  }

  setPose(pose, duration = 0) {
    this.pose = pose;
    this.poseTimer = duration;
    this.poseTime = 0;
  }

  setScript(steps = [], onDone = null) {
    this.script = steps.map((step) => ({ ...step }));
    this.scriptIndex = 0;
    this.scriptStarted = false;
    this.scriptMoving = false;
    this.onScriptDone = onDone;
  }

  clearScript() {
    this.script = [];
    this.scriptIndex = 0;
    this.scriptStarted = false;
    this.scriptMoving = false;
    this.onScriptDone = null;
  }

  lookTowards(x, z, dt = 1) {
    const dx = x - this.group.position.x;
    const dz = z - this.group.position.z;
    if (Math.hypot(dx, dz) < 0.001) return;
    const target = Math.atan2(dx, dz);
    this.group.rotation.y = dampAngle(this.group.rotation.y, target, 8, dt);
  }

  updateScript(dt) {
    if (this.scriptIndex >= this.script.length) {
      if (this.onScriptDone) {
        const done = this.onScriptDone;
        this.onScriptDone = null;
        done();
      }
      return false;
    }
    const step = this.script[this.scriptIndex];
    if (!this.scriptStarted) {
      this.scriptStarted = true;
      step.elapsed = 0;
      if (step.activity) this.activity = step.activity;
      if (step.expression) this.setExpression(step.expression);
      if (step.pose) this.setPose(step.pose, step.duration || 0);
      step.emit?.();
    }

    if (step.type === 'move') {
      const [tx, tz] = step.to;
      const dx = tx - this.group.position.x;
      const dz = tz - this.group.position.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 0.08) {
        this.scriptMoving = false;
        this.advanceScript();
        return false;
      }
      const speed = step.speed || 1.35;
      const amount = Math.min(distance, speed * dt);
      this.group.position.x += (dx / distance) * amount;
      this.group.position.z += (dz / distance) * amount;
      this.lookTowards(tx, tz, dt);
      this.scriptMoving = true;
      return true;
    }

    if (step.type === 'wait') {
      step.elapsed += dt;
      this.scriptMoving = false;
      if (step.face) this.lookTowards(step.face[0], step.face[1], dt);
      if (step.elapsed >= (step.duration || 1)) {
        this.advanceScript();
      }
      return false;
    }

    if (step.type === 'call') {
      // Advance the current script BEFORE invoking the callback: a callback may
      // replace the script (for example, starting a new route).
      this.advanceScript();
      step.run?.();
      return false;
    }

    this.advanceScript();
    return false;
  }

  advanceScript() {
    this.scriptIndex += 1;
    this.scriptStarted = false;
    if (this.scriptIndex >= this.script.length) {
      this.scriptMoving = false;
      this.setPose('idle');
    }
  }

  update(dt, externalMoving = false) {
    const scriptMoving = this.updateScript(dt);
    const moving = externalMoving || scriptMoving;
    this.phase += dt * (moving ? 9 : 2.2);

    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      this.blinking = !this.blinking;
      this.blinkTimer = this.blinking ? 0.11 : 1.7 + Math.random() * 3.2;
      drawFace(this.face, this.expression, this.blinking, this.elder);
    }

    if (this.poseTimer > 0) {
      this.poseTimer -= dt;
      this.poseTime += dt;
      if (this.poseTimer <= 0) {
        this.pose = 'idle';
      }
    }

    const swing = moving ? Math.sin(this.phase) * 0.48 : 0;
    const armSwing = moving ? Math.sin(this.phase) * 0.35 : 0;
    this.leftLeg.rotation.x = swing;
    this.rightLeg.rotation.x = -swing;
    this.leftArm.rotation.set(armSwing, 0, 0.06);
    this.rightArm.rotation.set(-armSwing, 0, -0.06);
    this.torso.position.y = this.torsoBaseY + Math.sin(this.phase) * (moving ? 0.018 : 0.008);
    this.head.rotation.x = 0;
    this.head.rotation.z = Math.sin(this.phase * 0.5) * 0.018;

    if (!moving) {
      const motion = Math.sin(this.poseTime * 5);
      if (this.pose === 'takePill') {
        this.rightArm.rotation.x = -1.35 + motion * 0.07;
        this.rightArm.rotation.z = -0.18;
        this.head.rotation.x = 0.12;
      } else if (this.pose === 'pressDevice' || this.pose === 'pressButton') {
        this.rightArm.rotation.x = -1.22 + motion * 0.06;
        this.rightArm.rotation.z = 0.12;
        this.head.rotation.x = 0.08;
      } else if (this.pose === 'sos') {
        this.leftArm.rotation.x = -0.95;
        this.rightArm.rotation.x = -1.25 + motion * 0.1;
        this.head.rotation.x = 0.1;
        this.setExpression('concerned');
      } else if (this.pose === 'water') {
        this.rightArm.rotation.x = -0.8 + motion * 0.15;
        this.rightArm.rotation.z = -0.28;
        this.setExpression('smile');
      } else if (this.pose === 'talk') {
        this.rightArm.rotation.x = -0.3 + motion * 0.08;
        this.setExpression('smile');
      } else if (this.pose === 'ready') {
        this.leftArm.rotation.x = -0.15;
        this.rightArm.rotation.x = -0.15;
        this.setExpression('smile');
      } else if (this.pose === 'rest') {
        this.leftArm.rotation.x = 0.12;
        this.rightArm.rotation.x = 0.12;
        this.head.rotation.x = 0.08;
        this.setExpression('neutral');
      } else {
        this.leftArm.rotation.x = Math.sin(this.phase) * 0.04;
        this.rightArm.rotation.x = -Math.sin(this.phase) * 0.04;
      }
    }
  }
}
