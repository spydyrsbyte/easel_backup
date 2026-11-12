import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
import * as THREE from "./vendor/three.mjs";

function createFaceTexture(sides, faceNumber, isTarget, baseColor) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx || typeof ctx.fillRect !== "function") {
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  // Base background
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, 256, 256);

  // Radial bevel gradient
  const grad = ctx.createRadialGradient(128, 128, 30, 128, 128, 140);
  grad.addColorStop(0, isTarget ? "rgba(255, 255, 255, 0.2)" : "rgba(0, 0, 0, 0)");
  grad.addColorStop(1, "rgba(0, 0, 0, 0.45)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  // Outer bevel border
  if (isTarget) {
    ctx.strokeStyle = "#d6ae65";
    ctx.lineWidth = 12;
    ctx.strokeRect(10, 10, 236, 236);
  } else {
    ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
    ctx.lineWidth = 4;
    ctx.strokeRect(8, 8, 240, 240);
  }

  // Number text
  let text = String(faceNumber);
  if (sides === 2) text = faceNumber === 1 ? "H" : "T";
  else if (sides === 100) text = String((faceNumber * 10) % 100);

  ctx.save();
  ctx.translate(128, 134);

  // Drop shadow
  ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
  ctx.font = isTarget
    ? "bold 105px 'Times New Roman', Georgia, serif"
    : "bold 90px 'Times New Roman', Georgia, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 4, 4);

  // Main text
  ctx.fillStyle = isTarget ? "#ffffff" : "#ece8de";
  ctx.fillText(text, 0, 0);

  // Underline for 6 and 9
  if (text === "6" || text === "9") {
    ctx.beginPath();
    ctx.moveTo(-28, 50);
    ctx.lineTo(28, 50);
    ctx.strokeStyle = isTarget ? "#d6ae65" : "#ece8de";
    ctx.lineWidth = 6;
    ctx.stroke();
  }
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createD10Geometry(radius = 6) {
  const vertices = [];
  const top = [0, radius * 1.25, 0];
  const bottom = [0, -radius * 1.25, 0];
  const ring = [];
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5;
    const y = (i % 2 === 0 ? 0.35 : -0.35) * radius;
    ring.push([Math.cos(a) * radius, y, Math.sin(a) * radius]);
  }
  for (let i = 0; i < 10; i++) {
    const next = (i + 1) % 10;
    if (i % 2 === 0) {
      vertices.push(...top, ...ring[i], ...ring[next]);
    } else {
      vertices.push(...bottom, ...ring[next], ...ring[i]);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  return geo;
}

function createDieMesh(sides, targetValue) {
  let geometry;
  let faceCount;
  let baseColorHex;
  let roughness = 0.22;
  let metalness = 0.12;
  const radius = 6.5;

  switch (sides) {
    case 20: {
      geometry = new THREE.IcosahedronGeometry(radius, 0);
      faceCount = 20;
      baseColorHex = "#9e1b28"; // Paizo Crimson
      roughness = 0.15;
      break;
    }
    case 12: {
      geometry = new THREE.DodecahedronGeometry(radius, 0);
      faceCount = 12;
      baseColorHex = "#1b4d3e"; // Emerald
      break;
    }
    case 8: {
      geometry = new THREE.OctahedronGeometry(radius, 0);
      faceCount = 8;
      baseColorHex = "#b8860b"; // Amber Brass
      metalness = 0.35;
      break;
    }
    case 4: {
      geometry = new THREE.TetrahedronGeometry(radius, 0);
      faceCount = 4;
      baseColorHex = "#4a235a"; // Amethyst
      break;
    }
    case 10:
    case 100: {
      geometry = createD10Geometry(radius);
      faceCount = 10;
      baseColorHex = "#2c3e50"; // Obsidian
      break;
    }
    case 6:
    default: {
      geometry = new THREE.BoxGeometry(radius * 1.45, radius * 1.45, radius * 1.45);
      faceCount = 6;
      baseColorHex = "#1b3b6f"; // Royal Navy
      break;
    }
  }

  const materials = [];
  if (sides === 6) {
    for (let f = 1; f <= 6; f++) {
      const tex = createFaceTexture(6, f, f === targetValue, baseColorHex);
      materials.push(new THREE.MeshStandardMaterial({
        map: tex,
        roughness,
        metalness
      }));
    }
  } else {
    const pos = geometry.attributes.position;
    const vertexCount = pos.count;
    const faces = Math.floor(vertexCount / 3);
    const uvs = new Float32Array(vertexCount * 2);

    for (let i = 0; i < faces; i++) {
      const base = i * 6;
      uvs[base] = 0.5; uvs[base + 1] = 0.95;
      uvs[base + 2] = 0.05; uvs[base + 3] = 0.15;
      uvs[base + 4] = 0.95; uvs[base + 5] = 0.15;
      geometry.addGroup(i * 3, 3, i);

      const faceNum = (i % faceCount) + 1;
      const isTarget = (faceNum === targetValue);
      const tex = createFaceTexture(sides, faceNum, isTarget, baseColorHex);
      materials.push(new THREE.MeshStandardMaterial({
        map: tex,
        roughness,
        metalness
      }));
    }
    geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  }

  geometry.computeVertexNormals();

  const mesh = new THREE.Mesh(geometry, materials);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  // Calculate target normal
  let targetFaceIdx = 0;
  if (sides === 6) {
    targetFaceIdx = Math.max(0, Math.min(5, targetValue - 1));
  } else {
    targetFaceIdx = Math.max(0, Math.min(faceCount - 1, targetValue - 1));
  }

  const normal = new THREE.Vector3();
  if (sides === 6) {
    const boxNormals = [
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, -1, 0),
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 0, -1)
    ];
    normal.copy(boxNormals[targetFaceIdx]);
  } else {
    const pos = geometry.attributes.position;
    const i0 = targetFaceIdx * 3;
    const v0 = new THREE.Vector3(pos.getX(i0), pos.getY(i0), pos.getZ(i0));
    const v1 = new THREE.Vector3(pos.getX(i0 + 1), pos.getY(i0 + 1), pos.getZ(i0 + 1));
    const v2 = new THREE.Vector3(pos.getX(i0 + 2), pos.getY(i0 + 2), pos.getZ(i0 + 2));
    normal.crossVectors(new THREE.Vector3().subVectors(v1, v0), new THREE.Vector3().subVectors(v2, v0)).normalize();
  }

  // Camera is at (0, 48, 62). Target facing vector pointing towards the camera:
  const targetDir = new THREE.Vector3(0, 0.65, 0.75).normalize();
  const targetQuat = new THREE.Quaternion().setFromUnitVectors(normal, targetDir);

  return { mesh, radius, targetQuat };
}

export default class DiceBox extends Base {
  constructor() {
    super("easel.dice.dicebox", ["overlay"]);
    this.settledRolls = new Set();
    this.canvas = el("canvas", "kit-dicebox-canvas");
    this.canvas.style.display = "block";
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    this.canvas.style.pointerEvents = "none";
    this.element.style.pointerEvents = "none";
    this.content.style.pointerEvents = "none";

    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.animId = null;
    this.activeRolls = [];
    this.activeMeshes = [];
  }

  destroy() {
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
    this.clearDice();
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer = null;
    }
    super.destroy?.();
  }

  initWebGL(w, h) {
    if (this.renderer) {
      this.renderer.setSize(w, h);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      return;
    }

    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        alpha: true,
        antialias: true,
        powerPreference: "high-performance"
      });
    } catch {
      return;
    }
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, w / h, 1, 500);
    this.camera.position.set(0, 48, 62);
    this.camera.lookAt(0, 2, 0);

    // Ambient light
    const amb = new THREE.AmbientLight(0xffffff, 0.95);
    this.scene.add(amb);

    // Main key light with shadow
    const dir = new THREE.DirectionalLight(0xfff5ea, 2.2);
    dir.position.set(25, 55, 35);
    dir.castShadow = true;
    dir.shadow.mapSize.width = 1024;
    dir.shadow.mapSize.height = 1024;
    dir.shadow.camera.near = 10;
    dir.shadow.camera.far = 150;
    dir.shadow.camera.left = -50;
    dir.shadow.camera.right = 50;
    dir.shadow.camera.top = 50;
    dir.shadow.camera.bottom = -50;
    dir.shadow.bias = -0.001;
    this.scene.add(dir);

    // Rim blue light
    const rim = new THREE.DirectionalLight(0x88ccff, 0.8);
    rim.position.set(-30, 25, -25);
    this.scene.add(rim);

    // Shadow receiver plane
    const floorGeo = new THREE.PlaneGeometry(250, 250);
    const floorMat = new THREE.ShadowMaterial({ opacity: 0.45 });
    this.floor = new THREE.Mesh(floorGeo, floorMat);
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = 0;
    this.floor.receiveShadow = true;
    this.scene.add(this.floor);
  }

  clearDice() {
    for (const item of this.activeMeshes) {
      if (item.mesh) {
        this.scene?.remove(item.mesh);
        item.mesh.geometry?.dispose();
        if (Array.isArray(item.mesh.material)) {
          for (const m of item.mesh.material) {
            m.map?.dispose();
            m.dispose();
          }
        } else if (item.mesh.material) {
          item.mesh.material.map?.dispose();
          item.mesh.material.dispose();
        }
      }
    }
    this.activeMeshes = [];
    this.activeRolls = [];
    if (this.floor) {
      this.floor.material.opacity = 0.45;
    }
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  playSound() {
    try {
      if (typeof Audio !== "undefined") {
        const sfx = new Audio("/library/dice/client/assets/dicehit.mp3");
        sfx.volume = 0.4;
        sfx.play().catch(() => {});
      }
    } catch {}
  }

  update(p) {
    this.begin(p);
    this.element.style.pointerEvents = "none";
    this.content.style.pointerEvents = "none";
    if (p.enabled === false) {
      this.element.hidden = true;
      return;
    }

    const wrap = el("div", "kit-dicebox-container");
    wrap.style.position = "relative";
    wrap.style.width = "100%";
    wrap.style.height = "100%";
    wrap.style.minHeight = "200px";
    wrap.style.overflow = "hidden";
    wrap.style.pointerEvents = "none";

    const controls = el("div", "kit-dicebox-controls");
    controls.style.position = "absolute";
    controls.style.top = "8px";
    controls.style.right = "8px";
    controls.style.zIndex = "10";
    controls.style.display = "none";

    const clearBtn = this.button("Clear Dice", "clear", {});
    clearBtn.className = "kit-dice-clear";
    clearBtn.onclick = () => {
      this.clearDice();
      this.settledRolls.clear();
      this.emit("clear", {});
    };
    controls.append(clearBtn);

    wrap.append(controls);
    wrap.append(this.canvas);
    this.content.append(wrap);
    this.content.append(this.slots.overlay);

    const w = this.canvas.clientWidth || 800;
    const h = this.canvas.clientHeight || 500;
    this.initWebGL(w, h);

    const rolls = Array.isArray(p.rolls) ? p.rolls : [];
    const rollIds = new Set(rolls.map((r) => r.id));
    for (const sid of Array.from(this.settledRolls)) {
      if (!rollIds.has(sid)) this.settledRolls.delete(sid);
    }

    for (const roll of rolls) {
      if (!this.settledRolls.has(roll.id)) {
        this.startRoll(roll, p);
      }
    }
  }

  startRoll(roll, p) {
    const dice = Array.isArray(roll.dice) ? roll.dice : [];
    const count = dice.length;
    if (count === 0) return;

    if (!this.scene) {
      this.settledRolls.add(roll.id);
      this.emit("settled", { rollId: roll.id });
      return;
    }

    const speed = typeof p.speed === "number" && p.speed > 0 ? p.speed : 1;
    const duration = 1400 / speed;
    const startTime = performance.now();

    this.clearDice();

    const rollItems = [];
    for (let i = 0; i < count; i++) {
      const d = dice[i];
      const sides = d.sides || 6;
      const val = d.value || 1;

      const { mesh, radius, targetQuat } = createDieMesh(sides, val);
      this.scene.add(mesh);

      // Spacing on table
      const restX = (i - (count - 1) / 2) * 16.5;
      const restY = radius;
      const restZ = (i % 2 === 0 ? -3 : 3);

      // Start toss position (arcs in from bottom-left / corner)
      const startX = restX + (Math.sin((i + 1) * 2.3) * 28);
      const startY = 38 + (i * 6);
      const startZ = 25 + (i * 4);

      // Random spin tumble axis & speed
      const spinAxis = new THREE.Vector3(
        Math.sin(i * 1.5 + 0.3),
        Math.cos(i * 2.1 + 0.7),
        Math.sin(i * 0.9 + 1.2)
      ).normalize();
      const initialSpinSpeed = (4 + (i % 3) * 2) * Math.PI * 2;

      rollItems.push({
        mesh,
        radius,
        targetQuat,
        startX,
        startY,
        startZ,
        restX,
        restY,
        restZ,
        spinAxis,
        initialSpinSpeed,
        currentQuat: new THREE.Quaternion().setFromAxisAngle(spinAxis, Math.random() * Math.PI)
      });
      this.activeMeshes.push({ mesh });
    }

    if (p.sound !== false && roll.sound !== false) {
      this.playSound();
    }

    this.activeRolls.push({
      rollId: roll.id,
      items: rollItems,
      state: "rolling",
      startTime,
      duration,
      settledTime: null,
      holdDuration: 1800,
      fadeDuration: 600,
      b1Played: false,
      b2Played: false
    });

    this.loop();
  }

  loop() {
    if (this.animId) return;

    const tick = (now) => {
      this.animId = null;
      const remaining = [];

      for (const anim of this.activeRolls) {
        if (anim.state === "rolling") {
          const elapsed = now - anim.startTime;
          const progress = Math.min(1, elapsed / anim.duration);

          // Sound triggers on table bounce
          if (progress >= 0.45 && !anim.b1Played) {
            anim.b1Played = true;
            this.playSound();
          }
          if (progress >= 0.72 && !anim.b2Played) {
            anim.b2Played = true;
            this.playSound();
          }

          // Update each die's 3D position and rotation
          for (const item of anim.items) {
            const { mesh, radius, targetQuat } = item;

            // Horizontal / Depth motion
            const moveP = Math.min(1, Math.pow(progress, 0.85));
            const curX = item.startX + (item.restX - item.startX) * moveP;
            const curZ = item.startZ + (item.restZ - item.startZ) * moveP;

            // Vertical bouncing trajectory
            let curY = item.restY;
            if (progress < 0.45) {
              const t = progress / 0.45;
              const apex = 28;
              curY = item.startY * (1 - t) + item.restY * t + apex * Math.sin(t * Math.PI);
            } else if (progress < 0.72) {
              const t = (progress - 0.45) / 0.27;
              curY = item.restY + 12 * Math.sin(t * Math.PI);
            } else if (progress < 0.90) {
              const t = (progress - 0.72) / 0.18;
              curY = item.restY + 4 * Math.sin(t * Math.PI);
            } else {
              curY = item.restY;
            }

            mesh.position.set(curX, curY, curZ);

            // 3D Quaternion Rotation & Tumbling
            if (progress < 0.70) {
              const tumbleRate = (1 - progress / 0.70) * 0.28;
              const deltaQ = new THREE.Quaternion().setFromAxisAngle(item.spinAxis, tumbleRate);
              item.currentQuat.multiply(deltaQ);
              mesh.quaternion.copy(item.currentQuat);
            } else {
              // Smoothly slerp towards exact target winning face orientation
              const t = (progress - 0.70) / 0.30;
              const ease = 1 - Math.pow(1 - t, 3);
              mesh.quaternion.copy(item.currentQuat).slerp(targetQuat, ease);
            }
          }

          if (progress >= 1) {
            // Lock exact target orientations
            for (const item of anim.items) {
              item.mesh.position.set(item.restX, item.restY, item.restZ);
              item.mesh.quaternion.copy(item.targetQuat);
            }
            this.settledRolls.add(anim.rollId);
            this.emit("settled", { rollId: anim.rollId });
            anim.state = "settled";
            anim.settledTime = now;
            remaining.push(anim);
          } else {
            remaining.push(anim);
          }
        } else if (anim.state === "settled") {
          const timeSinceSettle = now - anim.settledTime;
          if (timeSinceSettle < anim.holdDuration) {
            remaining.push(anim);
          } else {
            const fadeElapsed = timeSinceSettle - anim.holdDuration;
            const fadeProgress = Math.min(1, fadeElapsed / anim.fadeDuration);
            const alpha = 1 - fadeProgress;

            for (const item of anim.items) {
              item.mesh.position.y = item.restY - fadeProgress * 2.5;
              if (Array.isArray(item.mesh.material)) {
                for (const m of item.mesh.material) {
                  m.transparent = true;
                  m.opacity = alpha;
                }
              } else if (item.mesh.material) {
                item.mesh.material.transparent = true;
                item.mesh.material.opacity = alpha;
              }
            }

            if (this.floor) {
              this.floor.material.opacity = 0.45 * alpha;
            }

            if (fadeProgress < 1) {
              remaining.push(anim);
            } else {
              // Fade complete: dispose meshes and clean table
              for (const item of anim.items) {
                if (item.mesh) {
                  this.scene?.remove(item.mesh);
                  item.mesh.geometry?.dispose();
                  if (Array.isArray(item.mesh.material)) {
                    for (const m of item.mesh.material) {
                      m.map?.dispose();
                      m.dispose();
                    }
                  } else if (item.mesh.material) {
                    item.mesh.material.map?.dispose();
                    item.mesh.material.dispose();
                  }
                }
              }
              this.activeMeshes = this.activeMeshes.filter(
                (m) => !anim.items.some((it) => it.mesh === m.mesh)
              );
              if (this.floor) {
                this.floor.material.opacity = 0.45;
              }
            }
          }
        }
      }

      this.activeRolls = remaining;

      if (this.renderer && this.scene && this.camera) {
        this.renderer.render(this.scene, this.camera);
      }

      if (this.activeRolls.length > 0) {
        this.animId = requestAnimationFrame(tick);
      }
    };

    this.animId = requestAnimationFrame(tick);
  }
}
