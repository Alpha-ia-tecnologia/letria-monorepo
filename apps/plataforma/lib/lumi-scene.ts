import type * as Three from 'three';

export type LumiMood = 'idle' | 'thinking' | 'listening' | 'speaking';
export type LumiFrameInput = { mood: LumiMood; mouthLevel: number; reducedMotion: boolean };
export type LumiPose = { breath: number; headTilt: number; headNod: number; eyeOpen: number; mouth: number; wing: number; brow: number; thoughtLift: number };

export function clampMouthLevel(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

/** Deterministic poses keep animation bounded, testable, and independent of frame rate. */
export function getLumiPose(time: number, input: LumiFrameInput, waveAge = Infinity): LumiPose {
  const t = Number.isFinite(time) ? Math.max(0, time) : 0;
  const moving = !input.reducedMotion;
  const blinkPhase = (t + 1.9) % 5.4;
  const blink = moving && blinkPhase < 0.2 ? Math.sin(Math.PI * blinkPhase / 0.2) * 0.94 : 0;
  const waving = waveAge >= 0 && waveAge < 1.8;
  const waveEnvelope = waving ? Math.sin(Math.PI * Math.min(1, waveAge / 1.8)) : 0;
  return {
    breath: moving ? Math.sin(t * 1.8) * 0.012 : 0,
    headTilt: (input.mood === 'thinking' ? -0.15 : input.mood === 'listening' ? 0.14 : 0) + (moving ? Math.sin(t * 0.8) * 0.018 : 0),
    headNod: input.mood === 'listening' ? -0.055 : input.mood === 'speaking' && moving ? Math.sin(t * 3.4) * 0.018 : 0,
    eyeOpen: 1 - blink,
    mouth: input.mood === 'speaking' ? clampMouthLevel(input.mouthLevel) : 0,
    wing: waving ? input.reducedMotion ? 1.55 : waveEnvelope * (2.1 + Math.sin(waveAge * 15) * 0.23) : 0,
    brow: input.mood === 'thinking' ? 0.07 : input.mood === 'listening' ? 0.035 : 0,
    thoughtLift: moving ? Math.sin(t * 2.2) * 0.045 : 0,
  };
}

export type LumiRig = {
  group: Three.Group; body: Three.Group; head: Three.Group; eyes: Three.Group[];
  rightWing: Three.Group; leftWing: Three.Group; lowerBeak: Three.Group;
  brows: Three.Mesh[]; thoughts: Three.Group; ring: Three.Mesh<Three.TorusGeometry, Three.MeshStandardMaterial>;
  dispose: () => void;
};

/** All meshes are local procedural geometry. No models, images, or network loaders. */
export function buildLumiAvatar(T: typeof Three): LumiRig {
  const group = new T.Group();
  group.name = 'Lumi procedural owl';
  const geometries = new Set<Three.BufferGeometry>();
  const materials = new Set<Three.Material>();
  const geometry = <G extends Three.BufferGeometry>(value: G): G => { geometries.add(value); return value; };
  const clay = (color: string, roughness = 0.7) => {
    const material = new T.MeshStandardMaterial({ color, roughness, metalness: 0 });
    materials.add(material); return material;
  };
  const lavender = clay('#ac8ce2'), wingColor = clay('#9773ce'), darkFeather = clay('#8162b5');
  const cream = clay('#fff2df'), eyeWhite = clay('#fffaf1'), eyeBlack = clay('#211828', 0.13);
  const iris = clay('#47304b', 0.26), gleam = clay('#ffffff', 0.1), cheek = clay('#dfabc9');
  const yellow = clay('#f5c849', 0.5), gold = clay('#e6a838', 0.6), orange = clay('#df9a4b');
  const backpackColor = clay('#788fad'), strapColor = clay('#647d9d');
  const grass = clay('#c1dec3'), rock = clay('#bbb1ce'), foliage = clay('#91ba9a');
  const sphere = geometry(new T.SphereGeometry(1, 28, 20));
  const smallSphere = geometry(new T.SphereGeometry(1, 16, 12));
  const ellipsoid = (parent: Three.Object3D, material: Three.Material, position: [number, number, number], scale: [number, number, number], detail = false) => {
    const mesh = new T.Mesh(detail ? sphere : smallSphere, material);
    mesh.position.set(...position); mesh.scale.set(...scale); mesh.castShadow = true; mesh.receiveShadow = true;
    parent.add(mesh); return mesh;
  };

  // A small floating garden makes the figure feel grounded without a backdrop texture.
  ellipsoid(group, rock, [0, 0.03, 0], [1.01, 0.105, 0.67]);
  ellipsoid(group, grass, [0, 0.105, 0], [0.98, 0.105, 0.65]);
  const ringMaterial = clay('#b7a0e2', 0.55);
  const ring = new T.Mesh(geometry(new T.TorusGeometry(1.12, 0.023, 8, 64)), ringMaterial);
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04; group.add(ring);
  for (const side of [-1, 1]) {
    const leaf = ellipsoid(group, foliage, [side * 0.78, 0.24, 0.15], [0.07, 0.14, 0.045]);
    leaf.rotation.z = side * -0.5;
    const second = ellipsoid(group, foliage, [side * 0.85, 0.205, 0.19], [0.085, 0.07, 0.04]);
    second.rotation.z = side * 0.4;
    ellipsoid(group, cream, [side * 0.72, 0.2, 0.38], [0.075, 0.035, 0.07]);
    ellipsoid(group, yellow, [side * 0.72, 0.23, 0.38], [0.025, 0.017, 0.025]);
  }

  const body = new T.Group(); body.name = 'breathing torso'; group.add(body);
  ellipsoid(body, lavender, [0, 1.06, 0], [0.66, 0.79, 0.49], true);
  ellipsoid(body, cream, [0, 0.94, 0.4], [0.43, 0.48, 0.12], true);
  // A rounded backpack and straps stay visible when the avatar is turned.
  ellipsoid(body, backpackColor, [0, 1.06, -0.45], [0.48, 0.54, 0.24], true);
  ellipsoid(body, strapColor, [0, 1.25, -0.64], [0.42, 0.19, 0.1]);
  ellipsoid(body, gold, [0, 1.2, -0.745], [0.065, 0.085, 0.018]);
  for (const side of [-1, 1]) {
    const strap = ellipsoid(body, strapColor, [side * 0.45, 1.3, -0.1], [0.07, 0.34, 0.27]);
    strap.rotation.z = side * -0.14;
    ellipsoid(body, orange, [side * 0.26, 0.27, 0.16], [0.18, 0.095, 0.21]);
    for (const toe of [-1, 0, 1]) ellipsoid(body, orange, [side * 0.26 + toe * 0.085, 0.235, 0.3], [0.046, 0.046, 0.135]);
  }

  const wing = (side: number) => {
    const pivot = new T.Group(); pivot.name = side > 0 ? 'right wing pivot' : 'left wing pivot';
    pivot.position.set(side * 0.6, 1.28, -0.01); body.add(pivot);
    const main = ellipsoid(pivot, wingColor, [side * 0.11, -0.24, 0.04], [0.205, 0.43, 0.185], true);
    main.rotation.z = side * 0.14;
    for (let index = 0; index < 3; index++) {
      const feather = ellipsoid(pivot, lavender, [side * (0.04 + index * 0.069), -0.49 + index * 0.025, 0.13], [0.054, 0.155, 0.065]);
      feather.rotation.z = side * (index - 1) * 0.12;
    }
    return pivot;
  };
  const leftWing = wing(-1), rightWing = wing(1);
  const scarf = new T.Mesh(geometry(new T.TorusGeometry(0.45, 0.082, 12, 44)), yellow);
  scarf.rotation.x = Math.PI / 2; scarf.scale.set(1.19, 0.96, 1); scarf.position.set(0, 1.48, 0.01); body.add(scarf);
  ellipsoid(body, gold, [0.33, 1.43, 0.43], [0.13, 0.13, 0.1]);
  const scarfTail = ellipsoid(body, yellow, [0.3, 1.17, 0.51], [0.1, 0.26, 0.055]); scarfTail.rotation.z = -0.19;
  const otherTail = ellipsoid(body, yellow, [0.49, 1.27, 0.41], [0.1, 0.21, 0.05]); otherTail.rotation.z = 0.39;

  const head = new T.Group(); head.name = 'expressive head'; head.position.set(0, 1.91, 0.005); body.add(head);
  ellipsoid(head, lavender, [0, 0.15, 0], [0.855, 0.735, 0.62], true);
  for (const side of [-1, 1]) {
    const tuft = ellipsoid(head, wingColor, [side * 0.55, 0.75, -0.07], [0.16, 0.36, 0.16]); tuft.rotation.z = side * -0.38;
    const innerTuft = ellipsoid(head, lavender, [side * 0.43, 0.79, 0.045], [0.1, 0.28, 0.11]); innerTuft.rotation.z = side * -0.27;
    const mask = ellipsoid(head, cream, [side * 0.33, 0.14, 0.46], [0.403, 0.47, 0.19], true); mask.rotation.z = side * -0.07;
    ellipsoid(head, cheek, [side * 0.585, -0.064, 0.56], [0.11, 0.062, 0.028]);
  }
  const eyes: Three.Group[] = [], brows: Three.Mesh[] = [];
  for (const side of [-1, 1]) {
    ellipsoid(head, eyeWhite, [side * 0.33, 0.21, 0.604], [0.254, 0.303, 0.09], true);
    const eye = new T.Group(); eye.name = side < 0 ? 'left blinking eye' : 'right blinking eye'; eye.position.set(side * 0.33, 0.2, 0.675); head.add(eye); eyes.push(eye);
    ellipsoid(eye, iris, [0, 0, 0], [0.198, 0.249, 0.077], true);
    ellipsoid(eye, eyeBlack, [0, 0.008, 0.039], [0.175, 0.221, 0.059], true);
    const shine = ellipsoid(eye, gleam, [-0.053, 0.078, 0.095], [0.049, 0.058, 0.024]); shine.castShadow = false;
    const tinyShine = ellipsoid(eye, gleam, [0.055, -0.065, 0.091], [0.024, 0.027, 0.016]); tinyShine.castShadow = false;
    const brow = ellipsoid(head, darkFeather, [side * 0.33, 0.558, 0.559], [0.175, 0.039, 0.054]); brow.rotation.z = side * -0.09; brows.push(brow);
  }
  // The mouth interior is revealed by a real hinge in the lower half of the beak.
  ellipsoid(head, eyeBlack, [0, -0.136, 0.738], [0.128, 0.065, 0.125]);
  const upperBeak = ellipsoid(head, yellow, [0, -0.084, 0.766], [0.151, 0.084, 0.181], true); upperBeak.rotation.x = -0.11;
  for (const side of [-1, 1]) ellipsoid(head, gold, [side * 0.052, -0.064, 0.925], [0.014, 0.008, 0.01]);
  const lowerBeak = new T.Group(); lowerBeak.name = 'articulated lower beak'; lowerBeak.position.set(0, -0.143, 0.67); head.add(lowerBeak);
  ellipsoid(lowerBeak, gold, [0, -0.019, 0.102], [0.132, 0.046, 0.145], true);

  const thoughts = new T.Group(); thoughts.name = 'thinking lights'; thoughts.position.set(-0.99, 2.39, 0); group.add(thoughts);
  for (let index = 0; index < 3; index++) ellipsoid(thoughts, index === 2 ? yellow : cream, [-index * 0.08, index * 0.15, 0.04], [0.036 + index * 0.012, 0.036 + index * 0.012, 0.036 + index * 0.012]);
  thoughts.visible = false;
  let disposed = false;
  return { group, body, head, eyes, rightWing, leftWing, lowerBeak, brows, thoughts, ring, dispose: () => {
    if (disposed) return; disposed = true;
    group.removeFromParent(); geometries.forEach(item => item.dispose()); materials.forEach(item => item.dispose()); group.clear();
  } };
}

export type LumiScene = {
  resize: (width: number, height: number, pixelRatio: number) => void;
  frame: (delta: number, input: LumiFrameInput) => boolean;
  turn: (radians: number) => void;
  wave: () => void;
  dispose: () => void;
};

export function createLumiScene(T: typeof Three, canvas: HTMLCanvasElement): LumiScene {
  const renderer = new T.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  const cleanupTasks: Array<() => void> = [() => renderer.renderLists.dispose(), () => renderer.dispose(), () => renderer.forceContextLoss()];
  let released = false;
  const release = () => {
    if (released) return; released = true;
    for (const cleanup of cleanupTasks) { try { cleanup(); } catch { /* Release the remaining resources even after context loss. */ } }
  };
  try {
  renderer.setClearColor(0x000000, 0); renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
  const scene = new T.Scene(); cleanupTasks.unshift(() => scene.clear());
  const camera = new T.OrthographicCamera(-2, 2, 1.85, -1.85, 0.1, 30);
  camera.position.set(0, 2.25, 6.5); camera.lookAt(0, 1.5, 0);
  scene.add(new T.AmbientLight('#f5eaff', 1.65));
  scene.add(new T.HemisphereLight('#fffcf2', '#8b78a8', 1.4));
  const key = new T.DirectionalLight('#fff5dd', 3.3); key.position.set(-3, 6, 5); key.castShadow = true; cleanupTasks.unshift(() => key.shadow.map?.dispose());
  key.shadow.mapSize.set(512, 512); key.shadow.camera.left = -2; key.shadow.camera.right = 2; key.shadow.camera.top = 4; key.shadow.camera.bottom = -1;
  key.shadow.camera.near = 0.1; key.shadow.camera.far = 15; key.shadow.normalBias = 0.025; key.shadow.bias = -0.0002; scene.add(key);
  const fill = new T.DirectionalLight('#d2c3ff', 1.9); fill.position.set(4, 3, -3); scene.add(fill);
  const rig = buildLumiAvatar(T); cleanupTasks.unshift(() => rig.dispose()); scene.add(rig.group);
  const shadowGeometry = new T.CircleGeometry(1.4, 48); cleanupTasks.unshift(() => shadowGeometry.dispose());
  const shadowMaterial = new T.ShadowMaterial({ opacity: 0.15 }); cleanupTasks.unshift(() => shadowMaterial.dispose());
  const shadow = new T.Mesh(shadowGeometry, shadowMaterial); shadow.rotation.x = -Math.PI / 2; shadow.position.y = -0.085; shadow.receiveShadow = true; scene.add(shadow);
  let elapsed = 0, waveStarted = -100, targetYaw = 0.13, yaw = 0.13, mouth = 0, disposed = false;
  let previousMood: LumiMood | null = null;
  return {
    resize(width, height, pixelRatio) {
      if (disposed) return;
      const w = Math.max(1, width), h = Math.max(1, height), aspect = w / h;
      const halfHeight = Math.max(1.83, 1.38 / aspect);
      camera.left = -halfHeight * aspect; camera.right = halfHeight * aspect; camera.top = halfHeight; camera.bottom = -halfHeight; camera.updateProjectionMatrix();
      renderer.setPixelRatio(Math.min(1.75, Math.max(1, Number.isFinite(pixelRatio) ? pixelRatio : 1))); renderer.setSize(w, h, false);
    },
    frame(delta, input) {
      if (disposed) return false;
      if (renderer.getContext().isContextLost()) throw new Error('WebGL context lost');
      const dt = Math.max(0, Math.min(0.1, Number.isFinite(delta) ? delta : 0)); elapsed += dt;
      const targetMouth = input.mood === 'speaking' ? clampMouthLevel(input.mouthLevel) : 0;
      mouth += (targetMouth - mouth) * (1 - Math.exp(-dt * (targetMouth > mouth ? 24 : 15)));
      if (input.mood !== 'speaking') mouth = 0;
      yaw = input.reducedMotion ? targetYaw : yaw + (targetYaw - yaw) * (1 - Math.exp(-dt * 12));
      const pose = getLumiPose(elapsed, { ...input, mouthLevel: mouth }, elapsed - waveStarted);
      rig.group.rotation.y = yaw; rig.body.position.y = pose.breath;
      rig.body.scale.set(1 + pose.breath * 0.3, 1 + pose.breath * 0.5, 1 + pose.breath * 0.3);
      rig.head.rotation.z = pose.headTilt; rig.head.rotation.x = pose.headNod;
      rig.eyes.forEach(eye => { eye.scale.y = pose.eyeOpen; });
      rig.lowerBeak.rotation.x = pose.mouth * 0.5; rig.lowerBeak.position.y = -0.143 - pose.mouth * 0.03;
      rig.rightWing.rotation.z = 0.12 + pose.wing; rig.leftWing.rotation.z = -0.12 - (input.reducedMotion ? 0 : pose.breath * 2);
      rig.brows[0].position.y = 0.558 + pose.brow; rig.brows[1].position.y = 0.558;
      rig.thoughts.visible = input.mood === 'thinking'; rig.thoughts.position.y = 2.39 + pose.thoughtLift;
      if (previousMood !== input.mood) { rig.ring.material.color.set(input.mood === 'listening' ? '#87bdba' : input.mood === 'speaking' ? '#e3bd62' : '#b7a0e2'); previousMood = input.mood; }
      renderer.render(scene, camera);
      return !input.reducedMotion || input.mood === 'speaking' || elapsed - waveStarted < 1.8;
    },
    turn(radians) { if (Number.isFinite(radians)) targetYaw = Math.max(-0.66, Math.min(0.66, targetYaw + radians)); },
    wave() { waveStarted = elapsed; },
    dispose() {
      if (disposed) return; disposed = true;
      release();
    },
  };
  } catch (error) { release(); throw error; }
}
