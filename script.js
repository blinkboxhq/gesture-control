const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x050505, 0.02);
// --- State ---
const SETTINGS = {
  count: 20000,
  radius: 4,
  force: 2.0,
  shape: "sphere",
  returnSpeed: 0.08,
  damping: 0.9,
};

const HAND = {
  detected: false,
  isFist: false,
  x: 0,
  y: 0,

  pinch: 0, // zoom control
  openness: 0, // finger expansion
  lastSnapTime: 0, // snap cooldown
};

const SMOOTH = {
  x: 0,
  y: 0,
  openness: 0,
  pinch: 0,
};

function smooth(current, target, factor = 0.15) {
  return current + (target - current) * factor;
}

// --- 1. Three.js Setup ---
const container = document.getElementById("canvas-container");

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
camera.position.z = 25;

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true,
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
container.appendChild(renderer.domElement);

// --- 2. Particle System ---
let particlesMesh, geometry;
let positions, targetPositions, velocities;

function createTexture() {
  const c = document.createElement("canvas");
  c.width = 32;
  c.height = 32;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.4, "rgba(0,210,255,0.5)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  const t = new THREE.Texture(c);
  t.needsUpdate = true;
  return t;
}

function initParticles() {
  if (particlesMesh) scene.remove(particlesMesh);

  positions = new Float32Array(SETTINGS.count * 3);
  targetPositions = new Float32Array(SETTINGS.count * 3);
  velocities = new Float32Array(SETTINGS.count * 3);

  for (let i = 0; i < SETTINGS.count * 3; i++) {
    positions[i] = (Math.random() - 0.5) * 50;
    velocities[i] = 0;
  }

  geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    size: 0.2,
    map: createTexture(),
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  particlesMesh = new THREE.Points(geometry, material);
  scene.add(particlesMesh);
  updateTargets();
}

function updateTargets() {
  document
    .querySelectorAll(".btn-group button")
    .forEach((b) => b.classList.remove("active"));
  document.getElementById(`btn-${SETTINGS.shape}`).classList.add("active");

  const cnt = SETTINGS.count;
  for (let i = 0; i < cnt; i++) {
    const i3 = i * 3;
    let x, y, z;

    if (SETTINGS.shape === "sphere") {
      const phi = Math.acos(-1 + (2 * i) / cnt);
      const theta = Math.sqrt(cnt * Math.PI) * phi;
      const r = 10;
      x = r * Math.cos(theta) * Math.sin(phi);
      y = r * Math.sin(theta) * Math.sin(phi);
      z = r * Math.cos(phi);
    } else if (SETTINGS.shape === "cube") {
      const s = 12;
      x = (Math.random() - 0.5) * s;
      y = (Math.random() - 0.5) * s;
      z = (Math.random() - 0.5) * s;
    } else if (SETTINGS.shape === "heart") {
      const t = Math.random() * Math.PI * 2;
      x = 16 * Math.pow(Math.sin(t), 3) * 0.6;
      y =
        (13 * Math.cos(t) -
          5 * Math.cos(2 * t) -
          2 * Math.cos(3 * t) -
          Math.cos(4 * t)) *
        0.6;
      z = (Math.random() - 0.5) * 4;
    } else if (SETTINGS.shape === "spiral") {
      const angle = i * 0.1;
      const rad = i * 0.0005 * 12;
      x = rad * Math.cos(angle);
      z = rad * Math.sin(angle);
      y = i * 0.001 * 20 - 10;
    }

    targetPositions[i3] = x + (Math.random() - 0.5);
    targetPositions[i3 + 1] = y + (Math.random() - 0.5);
    targetPositions[i3 + 2] = z + (Math.random() - 0.5);
  }
}

// --- 3. Physics Loop ---
function updatePhysics() {
  const pos = geometry.attributes.position.array;

  // Map hand 0..1 to World Coordinates
  // Camera Z=25. At Z=0, visible width ~35 units
  const handX = (1 - HAND.x - 0.5) * 35;
  const handY = -(HAND.y - 0.5) * 25;
  const handZ = 0;

  for (let i = 0; i < SETTINGS.count; i++) {
    const i3 = i * 3;

    // Spring force to target
    velocities[i3] += (targetPositions[i3] - pos[i3]) * SETTINGS.returnSpeed;
    velocities[i3 + 1] +=
      (targetPositions[i3 + 1] - pos[i3 + 1]) * SETTINGS.returnSpeed;
    velocities[i3 + 2] +=
      (targetPositions[i3 + 2] - pos[i3 + 2]) * SETTINGS.returnSpeed;

    // Hand Interaction
    if (HAND.detected) {
      const dx = pos[i3] - handX;
      const dy = pos[i3 + 1] - handY;
      const dz = pos[i3 + 2] - handZ;
      const distSq = dx * dx + dy * dy + dz * dz;
      const r = 6;
      const rSq = r * r; // Interaction radius squared

      if (distSq > 0.0001 && distSq < rSq) {
        const dist = Math.sqrt(distSq);
        const dynamicForce =
          SETTINGS.force * THREE.MathUtils.clamp(HAND.openness * 1.2, 0.5, 3);

        const force = (1 - dist / Math.sqrt(rSq)) * dynamicForce;
        const dir = HAND.isFist ? -1 : 1;

        const nx = dx / dist;
        const ny = dy / dist;
        const nz = dz / dist;

        velocities[i3] += nx * force * dir;
        velocities[i3 + 1] += ny * force * dir;
        velocities[i3 + 2] += nz * force * dir;
      }
    }

    // Apply
    pos[i3] += velocities[i3];
    pos[i3 + 1] += velocities[i3 + 1];
    pos[i3 + 2] += velocities[i3 + 2];

    // Damping
    velocities[i3] *= SETTINGS.damping;
    velocities[i3 + 1] *= SETTINGS.damping;
    velocities[i3 + 2] *= SETTINGS.damping;
  }
  geometry.attributes.position.needsUpdate = true;
}

function animate() {
  requestAnimationFrame(animate);
  updatePhysics();
  particlesMesh.rotation.y += 0.001;
  renderer.render(scene, camera);
}

// --- 4. MediaPipe Initialization (Waits for Click) ---
const videoElement = document.getElementById("input-video");
videoElement.setAttribute("autoplay", "");
videoElement.setAttribute("muted", "");
videoElement.setAttribute("playsinline", "");
const sysStatus = document.getElementById("sys-status");
const handStatus = document.getElementById("hand-status");

function setupMediaPipe() {
  sysStatus.innerText = "Loading Model...";

  const hands = new Hands({
    locateFile: (file) => {
      return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
    },
  });

  hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });

  hands.onResults((results) => {
    console.log("MediaPipe running", results);
    sysStatus.innerText = "Tracking Active";
    sysStatus.className = "status-ok";

    // ---- ZOOM via pinch
    if (HAND.detected) {
      const zoomTarget = THREE.MathUtils.clamp(30 - HAND.pinch * 60, 15, 40);
      camera.position.z += (zoomTarget - camera.position.z) * 0.08;
    }

    // ---- SNAP gesture (open → fist → open)
    const now = performance.now();
    if (HAND.isFist && HAND.openness < 0.7 && now - HAND.lastSnapTime > 1200) {
      HAND.lastSnapTime = now;

      const shapes = ["sphere", "heart", "cube", "spiral"];
      const idx = shapes.indexOf(SETTINGS.shape);
      SETTINGS.shape = shapes[(idx + 1) % shapes.length];
      updateTargets();
    }

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      const lm = results.multiHandLandmarks[0];
      HAND.detected = true;
      HAND.x = lm[8].x; // index fingertip
      HAND.y = lm[8].y;

      // ---- PINCH (thumb tip 4 ↔ index tip 8)
      const pinchDx = lm[4].x - lm[8].x;
      const pinchDy = lm[4].y - lm[8].y;
      HAND.pinch = Math.sqrt(pinchDx * pinchDx + pinchDy * pinchDy);

      // ---- OPENNESS (finger spread)
      const wrist = lm[0];
      const tips = [8, 12, 16, 20];
      let openness = 0;
      tips.forEach((t) => {
        const dx = lm[t].x - wrist.x;
        const dy = lm[t].y - wrist.y;
        openness += Math.sqrt(dx * dx + dy * dy);
      });
      HAND.openness = openness;

      // ---- FIST DETECTION (sum of fingertip distances)
      let distSum = 0;
      [8, 12, 16, 20].forEach((i) => {
        const dx = lm[i].x - lm[0].x;
        const dy = lm[i].y - lm[0].y;
        distSum += Math.sqrt(dx * dx + dy * dy);
      });

      // Threshold for fist
      if (distSum < 0.8) {
        HAND.isFist = true;
        handStatus.innerHTML = "FIST <br>(Pulling)";
        handStatus.style.color = "#f44";
      } else {
        HAND.isFist = false;
        handStatus.innerHTML = "OPEN <br>(Pushing)";
        handStatus.style.color = "#4f4";
      }
    } else {
      HAND.detected = false;
      handStatus.innerText = "No Hand";
      handStatus.style.color = "#888";
    }
  });

  const cameraUtils = new Camera(videoElement, {
    onFrame: async () => {
      await hands.send({ image: videoElement });
    },
    width: 640,
    height: 480,
  });

  try {
    cameraUtils.start();
    console.log("✅ Camera started");
  } catch (err) {
    console.error("Camera error:", err);
    sysStatus.innerText = "Camera Error: " + err.message;
    sysStatus.className = "status-err";
  }
}

// --- 5. Boot Sequence ---
document.getElementById("start-btn").addEventListener("click", () => {
  document.getElementById("start-overlay").style.display = "none";
  setupMediaPipe();
});

// UI Bindings
window.setShape = (s) => {
  SETTINGS.shape = s;
  updateTargets();
};
document.getElementById("inp-count").addEventListener("input", (e) => {
  SETTINGS.count = parseInt(e.target.value);
  document.getElementById("val-count").innerText = SETTINGS.count;
  initParticles();
});
document
  .getElementById("inp-force")
  .addEventListener(
    "input",
    (e) => (SETTINGS.force = parseFloat(e.target.value))
  );

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

initParticles();
animate();
