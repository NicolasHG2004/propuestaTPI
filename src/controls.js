import * as THREE from 'three';

function dampAngle(current, target, lambda, dt) {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + delta * Math.min(1, lambda * dt);
}

export class Controls {
  constructor({ canvas, camera, renderer, world, state, game, ui }) {
    this.canvas = canvas;
    this.camera = camera;
    this.renderer = renderer;
    this.world = world;
    this.state = state;
    this.game = game;
    this.ui = ui;
    this.keys = new Set();
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.hitPoint = new THREE.Vector3();
    this.movementTarget = null;
    this.pendingInteraction = null;
    this.joystick = { x: 0, y: 0, active: false };
    this.yaw = 0;
    this.pitch = 0.7;
    this.distance = 13.2;
    this.cameraTarget = new THREE.Vector3(world.player.group.position.x, 1.05, world.player.group.position.z);
    this.focus = null;
    this.pointerStart = null;
    this.orbiting = false;
    this.hovering = false;
    this.lastRoom = '';

    this.bindPointer();
    this.bindKeyboard();
    this.bindJoystick();
    this.updateCamera(1);
  }

  isBlocked() {
    return this.game.isUIBlocking();
  }

  bindPointer() {
    this.canvas.addEventListener('contextmenu', (event) => event.preventDefault());

    this.canvas.addEventListener('pointerdown', (event) => {
      if (this.isBlocked()) return;
      this.canvas.focus({ preventScroll: true });
      this.pointerStart = {
        x: event.clientX,
        y: event.clientY,
        button: event.button,
        pointerType: event.pointerType,
        pointerId: event.pointerId,
      };
      this.orbiting = event.button === 2 || event.button === 1 || event.shiftKey;
      try {
        this.canvas.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture is optional.
      }
    });

    this.canvas.addEventListener('pointermove', (event) => {
      if (this.isBlocked()) {
        this.ui.hideTooltip();
        this.canvas.classList.remove('hovering');
        return;
      }
      if (this.pointerStart && this.pointerStart.pointerId === event.pointerId) {
        const dx = event.clientX - this.pointerStart.x;
        const dy = event.clientY - this.pointerStart.y;
        const distance = Math.hypot(dx, dy);
        if (this.pointerStart.pointerType === 'touch' && distance > 8 && !this.orbiting) {
          this.orbiting = true;
        }
        if (this.orbiting) {
          const moveX = event.movementX || dx * 0.15;
          const moveY = event.movementY || dy * 0.15;
          this.yaw -= moveX * 0.006;
          this.pitch = THREE.MathUtils.clamp(this.pitch + moveY * 0.004, 0.28, 1.18);
          this.ui.hideTooltip();
          return;
        }
      }
      this.updateHover(event);
    });

    this.canvas.addEventListener('pointerup', (event) => {
      if (!this.pointerStart || this.pointerStart.pointerId !== event.pointerId) return;
      const start = this.pointerStart;
      const distance = Math.hypot(event.clientX - start.x, event.clientY - start.y);
      const wasOrbiting = this.orbiting;
      this.pointerStart = null;
      this.orbiting = false;
      try {
        this.canvas.releasePointerCapture(event.pointerId);
      } catch {
        // Ignore capture release errors.
      }
      if (this.isBlocked() || wasOrbiting || distance > 7 || start.button !== 0) return;
      this.handleWorldClick(event);
    });

    this.canvas.addEventListener('pointercancel', () => {
      this.pointerStart = null;
      this.orbiting = false;
    });

    this.canvas.addEventListener('wheel', (event) => {
      if (this.isBlocked()) return;
      event.preventDefault();
      this.distance = THREE.MathUtils.clamp(this.distance + event.deltaY * 0.012, 7.2, 20);
    }, { passive: false });
  }

  bindKeyboard() {
    const movementKeys = new Set([
      'KeyW', 'KeyA', 'KeyS', 'KeyD',
      'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
      'KeyQ', 'KeyE', 'ShiftLeft', 'ShiftRight',
    ]);

    window.addEventListener('keydown', (event) => {
      const typing = event.target instanceof HTMLElement
        && ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(event.target.tagName);

      if (event.code === 'KeyP' && !typing) {
        event.preventDefault();
        this.game.handleAction('toggle-phone');
        return;
      }
      if (event.code === 'Space' && !typing) {
        event.preventDefault();
        this.game.handleAction('toggle-pause');
        return;
      }
      if (event.code === 'Escape') {
        this.game.handleAction('escape');
        return;
      }
      if (event.code === 'KeyH' && !typing) {
        this.game.handleAction('open-help');
        return;
      }
      if (movementKeys.has(event.code) && !typing) {
        event.preventDefault();
        if (!this.isBlocked()) this.keys.add(event.code);
      }
    });

    window.addEventListener('keyup', (event) => {
      this.keys.delete(event.code);
    });

    window.addEventListener('blur', () => this.keys.clear());
  }

  bindJoystick() {
    const joystick = document.getElementById('joystick');
    const knob = document.getElementById('joystick-knob');
    if (!joystick || !knob) return;

    const update = (event) => {
      const rect = joystick.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const max = rect.width / 2 - 18;
      let dx = event.clientX - centerX;
      let dy = event.clientY - centerY;
      const length = Math.hypot(dx, dy);
      if (length > max) {
        dx = (dx / length) * max;
        dy = (dy / length) * max;
      }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.joystick.x = dx / max;
      this.joystick.y = dy / max;
    };

    joystick.addEventListener('pointerdown', (event) => {
      if (this.isBlocked()) return;
      this.joystick.active = true;
      joystick.setPointerCapture(event.pointerId);
      update(event);
    });
    joystick.addEventListener('pointermove', (event) => {
      if (this.joystick.active) update(event);
    });
    const release = () => {
      this.joystick.active = false;
      this.joystick.x = 0;
      this.joystick.y = 0;
      knob.style.transform = 'translate(0, 0)';
    };
    joystick.addEventListener('pointerup', release);
    joystick.addEventListener('pointercancel', release);
  }

  setPointerFromEvent(event) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
  }

  findInteractionId(object) {
    let current = object;
    while (current) {
      if (current.userData?.interact) return current.userData.interact;
      current = current.parent;
    }
    return null;
  }

  pickInteractable(event) {
    this.setPointerFromEvent(event);
    const hits = this.raycaster.intersectObjects(this.world.interactables, true);
    for (const hit of hits) {
      const id = this.findInteractionId(hit.object);
      if (id) return id;
    }
    return null;
  }

  updateHover(event) {
    const id = this.pickInteractable(event);
    if (!id) {
      this.hovering = false;
      this.canvas.classList.remove('hovering');
      this.ui.hideTooltip();
      return;
    }
    const meta = this.world.getTargetMeta(id);
    const near = this.world.isNear(id, this.world.player.group.position, 0.25);
    this.hovering = true;
    this.canvas.classList.add('hovering');
    this.ui.showTooltip(near ? meta.label : `${meta.label} · acércate para usarlo`, event.clientX, event.clientY);
  }

  findApproachPoint(id) {
    const target = this.world.getWorldPosition(id);
    const player = this.world.player.group.position;
    const range = Math.max(1.1, Math.min(2.1, this.world.getTargetMeta(id).range * 0.75));
    const baseAngle = Math.atan2(player.x - target.x, player.z - target.z);
    const angles = [0, 0.45, -0.45, 0.9, -0.9, 1.4, -1.4, Math.PI];
    for (const offset of angles) {
      const angle = baseAngle + offset;
      const candidate = new THREE.Vector3(
        target.x + Math.sin(angle) * range,
        0,
        target.z + Math.cos(angle) * range,
      );
      if (!this.world.collides(candidate.x, candidate.z, 0.38)) return candidate;
    }
    return new THREE.Vector3(player.x, 0, player.z);
  }

  handleWorldClick(event) {
    const id = this.pickInteractable(event);
    if (id) {
      this.pressButtonIfNeeded(id);
      if (this.world.isNear(id, this.world.player.group.position, 0.2)) {
        this.game.interact(id);
      } else {
        this.movementTarget = this.findApproachPoint(id);
        this.pendingInteraction = id;
        this.ui.showTooltip('Caminando hacia el objeto…', event.clientX, event.clientY);
      }
      return;
    }
    this.setPointerFromEvent(event);
    if (this.raycaster.ray.intersectPlane(this.groundPlane, this.hitPoint)) {
      const point = this.hitPoint.clone();
      point.y = 0;
      if (point.z > -7 && point.z < 11 && point.x > -10.5 && point.x < 10.5) {
        this.movementTarget = point;
        this.pendingInteraction = null;
      }
    }
  }

  pressButtonIfNeeded(id) {
    if (id.startsWith('fixed.') || id === 'wearable.sos') this.world.pressButton(id);
  }

  focusOn(x, z, duration = 3) {
    this.focus = { x, z, remaining: duration };
  }

  approach(id) {
    if (!id) return;
    this.movementTarget = this.findApproachPoint(id);
    this.pendingInteraction = id;
  }

  update(dt) {
    const player = this.world.player.group;
    const blocked = this.isBlocked();
    let moving = false;

    if (this.keys.has('KeyQ')) this.yaw += dt * 1.35;
    if (this.keys.has('KeyE')) this.yaw -= dt * 1.35;

    if (!blocked) {
      let inputX = 0;
      let inputZ = 0;
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) inputX -= 1;
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) inputX += 1;
      if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) inputZ += 1;
      if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) inputZ -= 1;
      inputX += this.joystick.x;
      inputZ -= this.joystick.y;

      const sin = Math.sin(this.yaw);
      const cos = Math.cos(this.yaw);
      let vx = 0;
      let vz = 0;
      if (Math.abs(inputX) > 0.04 || Math.abs(inputZ) > 0.04) {
        const length = Math.hypot(inputX, inputZ);
        const nx = inputX / length;
        const nz = inputZ / length;
        vx = nx * cos - nz * sin;
        vz = -nx * sin - nz * cos;
        this.movementTarget = null;
        this.pendingInteraction = null;
      } else if (this.movementTarget) {
        const dx = this.movementTarget.x - player.position.x;
        const dz = this.movementTarget.z - player.position.z;
        const distance = Math.hypot(dx, dz);
        if (distance < 0.2) {
          this.movementTarget = null;
          if (this.pendingInteraction) {
            const id = this.pendingInteraction;
            this.pendingInteraction = null;
            if (this.world.isNear(id, player.position, 0.35)) this.game.interact(id);
          }
        } else {
          vx = dx / distance;
          vz = dz / distance;
        }
      }

      if (Math.abs(vx) > 0.001 || Math.abs(vz) > 0.001) {
        const sprint = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? 1.55 : 1;
        const speed = 3.1 * sprint;
        const nextX = player.position.x + vx * speed * dt;
        const nextZ = player.position.z + vz * speed * dt;
        if (!this.world.collides(nextX, player.position.z)) player.position.x = nextX;
        if (!this.world.collides(player.position.x, nextZ)) player.position.z = nextZ;
        player.rotation.y = dampAngle(player.rotation.y, Math.atan2(vx, vz), 10, dt);
        moving = true;
      }
    }

    this.world.player.update(dt, moving && !blocked);
    const room = this.world.roomAt(player.position.x, player.position.z);
    if (room !== this.lastRoom) {
      this.lastRoom = room;
      this.game.visitRoom(room);
    }
    this.updateCamera(dt, blocked);
  }

  updateCamera(dt, blocked = false) {
    let targetX = this.world.player.group.position.x;
    let targetZ = this.world.player.group.position.z;
    let targetY = 1.05;
    if (this.focus && this.focus.remaining > 0) {
      this.focus.remaining -= dt;
      targetX = THREE.MathUtils.lerp(targetX, this.focus.x, 0.72);
      targetZ = THREE.MathUtils.lerp(targetZ, this.focus.z, 0.72);
      targetY = 1.15;
      if (this.focus.remaining <= 0) this.focus = null;
    }
    const target = new THREE.Vector3(targetX, targetY, targetZ);
    const blend = 1 - Math.exp(-dt * 6);
    this.cameraTarget.lerp(target, blend);

    const horizontal = Math.cos(this.pitch) * this.distance;
    const desired = new THREE.Vector3(
      this.cameraTarget.x + Math.sin(this.yaw) * horizontal,
      this.cameraTarget.y + Math.sin(this.pitch) * this.distance,
      this.cameraTarget.z + Math.cos(this.yaw) * horizontal,
    );
    this.camera.position.lerp(desired, 1 - Math.exp(-dt * 7));
    this.camera.lookAt(this.cameraTarget);
    if (blocked) this.ui.hideTooltip();
  }
}
