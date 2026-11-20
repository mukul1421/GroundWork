/**
 * Pure deterministic math for scroll-choreographed 3D pipeline camera & assembly transforms.
 * Decoupled from Three.js runtime for fast, repeatable unit testing.
 */

export interface Scroll3DState {
  /** Normalized scroll progress in [0, 1] */
  progress: number;
  /** Camera world position [x, y, z] */
  cameraPos: [number, number, number];
  /** Camera look-at target [x, y, z] */
  cameraTarget: [number, number, number];
  /** Sculpture base rotation around Y axis (radians) */
  rigRotationY: number;
  /** Sculpture subtle pitch around X axis (radians) */
  rigRotationX: number;
  /** Vertical exploded-view separation between strata (0 = compact, 1 = wide) */
  strataSpread: number;
  /** Convergence factor (0 = raw scattered shards, 1 = neatly aligned columnar tensors) */
  alignmentFactor: number;
  /** Approval gimbal ring lock rotation (radians) */
  gateRingAngle: number;
  /** Active highlight stratum index (0=Ingest, 1=Profile, 2=Transform, 3=Export) */
  activeStratum: number;
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 === edge0) return x < edge0 ? 0 : 1;
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

interface Keyframe {
  t: number;
  cameraPos: [number, number, number];
  cameraTarget: [number, number, number];
  rigRotationY: number;
  rigRotationX: number;
  strataSpread: number;
  alignmentFactor: number;
  gateRingAngle: number;
}

const KEYFRAMES: Keyframe[] = [
  // 0.00 — Hero Vista: Dramatic elevated angle right-offset so headline left has clean negative space
  {
    t: 0.0,
    cameraPos: [-2.2, 2.4, 9.2],
    cameraTarget: [-1.1, 0.2, 0.0],
    rigRotationY: -0.35,
    rigRotationX: 0.14,
    strataSpread: 0.85,
    alignmentFactor: 0.18,
    gateRingAngle: 0.0,
  },
  // 0.30 — Architecture Chapter: Sweep around the DuckDB-Wasm Columnar Core
  {
    t: 0.3,
    cameraPos: [2.8, 1.3, 7.6],
    cameraTarget: [0.2, 0.0, 0.0],
    rigRotationY: 0.65,
    rigRotationX: 0.06,
    strataSpread: 1.0,
    alignmentFactor: 0.58,
    gateRingAngle: Math.PI * 0.45,
  },
  // 0.62 — Capabilities & Approval Gate: Close inspection of Verification Gimbal & aligned columns
  {
    t: 0.62,
    cameraPos: [-1.6, -0.7, 7.2],
    cameraTarget: [0.0, -0.25, 0.0],
    rigRotationY: 1.55,
    rigRotationX: -0.05,
    strataSpread: 0.52,
    alignmentFactor: 0.92,
    gateRingAngle: Math.PI,
  },
  // 1.00 — Access Workspace Footer Vista: Calm, unified, fully converged tensor core
  {
    t: 1.0,
    cameraPos: [0.8, 1.8, 8.8],
    cameraTarget: [0.0, -0.1, 0.0],
    rigRotationY: 2.35,
    rigRotationX: 0.1,
    strataSpread: 0.28,
    alignmentFactor: 1.0,
    gateRingAngle: Math.PI * 1.5,
  },
];

/**
 * Evaluates smooth 3D sculpture & camera choreography for any scroll progress [0..1]
 * and optional user-selected architecture stage [0..3].
 */
export function computeScrollChoreography(
  rawProgress: number,
  selectedStageOverride?: number | null,
): Scroll3DState {
  const progress = clamp01(rawProgress);

  let lower = KEYFRAMES[0]!;
  let upper = KEYFRAMES[KEYFRAMES.length - 1]!;

  for (let i = 0; i < KEYFRAMES.length - 1; i++) {
    const cur = KEYFRAMES[i]!;
    const next = KEYFRAMES[i + 1]!;
    if (progress >= cur.t && progress <= next.t) {
      lower = cur;
      upper = next;
      break;
    }
  }

  const localT = smoothstep(lower.t, upper.t, progress);

  const stageBiasAngle =
    typeof selectedStageOverride === 'number' && selectedStageOverride >= 0 && selectedStageOverride <= 3
      ? selectedStageOverride * 0.35
      : 0;

  const activeStratum =
    typeof selectedStageOverride === 'number' && selectedStageOverride >= 0 && selectedStageOverride <= 3
      ? selectedStageOverride
      : Math.min(3, Math.floor(progress * 4));

  return {
    progress,
    cameraPos: [
      lerp(lower.cameraPos[0], upper.cameraPos[0], localT),
      lerp(lower.cameraPos[1], upper.cameraPos[1], localT),
      lerp(lower.cameraPos[2], upper.cameraPos[2], localT),
    ],
    cameraTarget: [
      lerp(lower.cameraTarget[0], upper.cameraTarget[0], localT),
      lerp(lower.cameraTarget[1], upper.cameraTarget[1], localT),
      lerp(lower.cameraTarget[2], upper.cameraTarget[2], localT),
    ],
    rigRotationY: lerp(lower.rigRotationY, upper.rigRotationY, localT) + stageBiasAngle,
    rigRotationX: lerp(lower.rigRotationX, upper.rigRotationX, localT),
    strataSpread: lerp(lower.strataSpread, upper.strataSpread, localT),
    alignmentFactor: lerp(lower.alignmentFactor, upper.alignmentFactor, localT),
    gateRingAngle: lerp(lower.gateRingAngle, upper.gateRingAngle, localT),
    activeStratum,
  };
}

/**
 * Computes subtle, compositor-only 3D CSS perspective tilt for a section card
 * based on its normalized position relative to viewport center (-1 = below, 0 = centered, 1 = above).
 */
export function computeCardDepthTransform(viewportOffset: number): {
  rotateX: number;
  translateY: number;
  scale: number;
  opacity: number;
} {
  const clamped = Math.max(-1, Math.min(1, Number.isFinite(viewportOffset) ? viewportOffset : 0));
  const absOffset = Math.abs(clamped);
  const rotateX = Number((clamped * 4.5).toFixed(2));
  const translateY = Number((absOffset * 14).toFixed(2));
  const scale = Number((1 - absOffset * 0.025).toFixed(4));
  const opacity = Number(Math.max(0.72, 1 - absOffset * 0.25).toFixed(3));
  return { rotateX, translateY, scale, opacity };
}

/**
 * Frame-rate independent exponential spring damper for silky-smooth scroll & pointer inertia.
 */
export function dampValue(current: number, target: number, lambda: number, dt: number): number {
  if (!Number.isFinite(current) || !Number.isFinite(target)) return 0;
  const safeDt = Math.max(0, Math.min(0.1, Number.isFinite(dt) ? dt : 0));
  const safeLambda = Math.max(0, Number.isFinite(lambda) ? lambda : 0);
  const factor = 1 - Math.exp(-safeLambda * safeDt);
  return current + (target - current) * factor;
}

export interface GlassScrollPose {
  /** Clamped normalized progress across the sticky 3D track [0..1] */
  progress: number;
  /** Active narrative chapter: 0 = Hero, 1 = Ingest, 2 = Profile, 3 = Transform, 4 = Export */
  activeChapter: 0 | 1 | 2 | 3 | 4;
  /** Full 360-degree continuous Y-axis spin in degrees [0..360] */
  spinYDeg: number;
  /** 3D pitch rotation in degrees */
  rotateX: number;
  /** 3D yaw rotation in degrees (full 360-degree sweep from 0 to 360) */
  rotateY: number;
  /** 3D roll rotation in degrees */
  rotateZ: number;
  /** Scale multiplier for optical depth breathing */
  scale: number;
  /** Vertical elevation offset in pixels / scene units */
  translateY: number;
  /** Horizontal studio composition drift */
  translateX: number;
  /** Outer 3D frosted glass strata & card expansion [0 = locked tight, 1 = wide exploded inspection] */
  layerSpread: number;
  /** Continuous orbital ring & spheres rotation in degrees */
  orbitAngleDeg: number;
  /** Specular optical light sweep position [-1..1] */
  sheenOffset: number;
  /** Clamped physical velocity tilt in degrees */
  velocityTiltX: number;
  /** Subtle ambient backlight shift */
  glowShiftX: number;
  glowShiftY: number;
}

interface GlassKeyframe {
  t: number;
  rotateX: number;
  rotateY: number;
  rotateZ: number;
  scale: number;
  translateY: number;
  translateX: number;
  layerSpread: number;
  orbitAngleDeg: number;
  sheenOffset: number;
  glowShiftX: number;
  glowShiftY: number;
}

const GLASS_KEYFRAMES: GlassKeyframe[] = [
  // 0.00 — Hero (0°): Iconic 3/4 crystal studio hero pose
  {
    t: 0.0,
    rotateX: 16.0,
    rotateY: 0.0,
    rotateZ: -3.0,
    scale: 1.0,
    translateY: 0,
    translateX: 0,
    layerSpread: 0.28,
    orbitAngleDeg: 0,
    sheenOffset: -0.65,
    glowShiftX: 0,
    glowShiftY: 0,
  },
  // 0.25 — 01. Ingest (90°): Quarter-turn + elevated inspection as glass wrap shells expand open
  {
    t: 0.25,
    rotateX: 28.0,
    rotateY: 90.0,
    rotateZ: -9.5,
    scale: 0.96,
    translateY: 0.14,
    translateX: 0.08,
    layerSpread: 1.0,
    orbitAngleDeg: 135,
    sheenOffset: -0.2,
    glowShiftX: -22,
    glowShiftY: -14,
  },
  // 0.50 — 02. Profile (180°): Full backside crystal reveal with sweeping low-to-high refraction angle
  {
    t: 0.5,
    rotateX: -14.0,
    rotateY: 180.0,
    rotateZ: 10.5,
    scale: 1.05,
    translateY: -0.08,
    translateX: -0.08,
    layerSpread: 0.72,
    orbitAngleDeg: 270,
    sheenOffset: 0.28,
    glowShiftX: 24,
    glowShiftY: -8,
  },
  // 0.75 — 03. Transform (270°): Three-quarter lock-in as floating glass cards & wraps tighten
  {
    t: 0.75,
    rotateX: 22.0,
    rotateY: 270.0,
    rotateZ: -6.5,
    scale: 1.03,
    translateY: 0.08,
    translateX: 0.05,
    layerSpread: 0.2,
    orbitAngleDeg: 405,
    sheenOffset: 0.7,
    glowShiftX: -12,
    glowShiftY: 16,
  },
  // 1.00 — 04. Export (360°): Complete full 360-degree revolution back to luminous equilibrium
  {
    t: 1.0,
    rotateX: 16.0,
    rotateY: 360.0,
    rotateZ: -3.0,
    scale: 1.07,
    translateY: 0.0,
    translateX: 0.0,
    layerSpread: 0.14,
    orbitAngleDeg: 540,
    sheenOffset: 0.0,
    glowShiftX: 4,
    glowShiftY: 4,
  },
];

/**
 * Exact normalized scroll stops [0..1] for clicking directly to any of the 5 chapters.
 */
export function getChapterScrollFraction(chapterIndex: number): number {
  const stops = [0.0, 0.25, 0.5, 0.75, 1.0];
  const clampedIdx = Math.max(0, Math.min(stops.length - 1, Math.round(chapterIndex)));
  return stops[clampedIdx] ?? 0;
}

/**
 * Evaluates smooth full-360° 3D pose, exploded strata spread, orbital rotation, and velocity tilt
 * for the sticky Three.js glass cube across the 5-chapter scroll track.
 */
export function computeGlassScrollPose(rawProgress: number, rawVelocity = 0): GlassScrollPose {
  const progress = clamp01(rawProgress);
  const velocity = Number.isFinite(rawVelocity) ? Math.max(-1, Math.min(1, rawVelocity)) : 0;

  let lower = GLASS_KEYFRAMES[0]!;
  let upper = GLASS_KEYFRAMES[GLASS_KEYFRAMES.length - 1]!;

  for (let i = 0; i < GLASS_KEYFRAMES.length - 1; i++) {
    const cur = GLASS_KEYFRAMES[i]!;
    const next = GLASS_KEYFRAMES[i + 1]!;
    if (progress >= cur.t && progress <= next.t) {
      lower = cur;
      upper = next;
      break;
    }
  }

  const localT = smoothstep(lower.t, upper.t, progress);

  let activeChapter: 0 | 1 | 2 | 3 | 4 = 0;
  if (progress < 0.13) activeChapter = 0;
  else if (progress < 0.38) activeChapter = 1;
  else if (progress < 0.63) activeChapter = 2;
  else if (progress < 0.87) activeChapter = 3;
  else activeChapter = 4;

  const velocityTiltX = Number((velocity * 4.2).toFixed(2));
  // Smooth monotonic full 360-degree spin across 0..1 progress
  const spinYDeg = Number((progress * 360).toFixed(2));

  return {
    progress,
    activeChapter,
    spinYDeg,
    rotateX: Number((lerp(lower.rotateX, upper.rotateX, localT) + velocityTiltX).toFixed(2)),
    rotateY: spinYDeg,
    rotateZ: Number(lerp(lower.rotateZ, upper.rotateZ, localT).toFixed(2)),
    scale: Number(lerp(lower.scale, upper.scale, localT).toFixed(4)),
    translateY: Number(lerp(lower.translateY, upper.translateY, localT).toFixed(3)),
    translateX: Number(lerp(lower.translateX, upper.translateX, localT).toFixed(3)),
    layerSpread: Number(lerp(lower.layerSpread, upper.layerSpread, localT).toFixed(3)),
    orbitAngleDeg: Number(lerp(lower.orbitAngleDeg, upper.orbitAngleDeg, localT).toFixed(2)),
    sheenOffset: Number(lerp(lower.sheenOffset, upper.sheenOffset, localT).toFixed(3)),
    velocityTiltX,
    glowShiftX: Number(lerp(lower.glowShiftX, upper.glowShiftX, localT).toFixed(2)),
    glowShiftY: Number(lerp(lower.glowShiftY, upper.glowShiftY, localT).toFixed(2)),
  };
}

export interface PageFlightPose {
  /** Normalized full-page scroll progress [0..1] */
  progress: number;
  /** World X position gliding smoothly from right -> left -> right -> left across sections */
  posX: number;
  /** World Y gentle vertical drift */
  posY: number;
  /** World Z subtle depth push/pull */
  posZ: number;
  /** Continuous full 360-degree Y-axis rotation in degrees [0..360] */
  rotYDeg: number;
  /** Dynamic 3D pitch in degrees */
  rotXDeg: number;
  /** Dynamic 3D roll in degrees */
  rotZDeg: number;
  /** Overall scale factor */
  scale: number;
  /** Precision monolith strata separation [0 = locked tight, 1 = exploded inspection] */
  explodeSpread: number;
  /** Columnar tensor alignment [0 = raw staggered data, 1 = aligned production tensors] */
  tensorAlignment: number;
  /** Continuous gimbal & orbital satellite rotation in degrees */
  orbitDeg: number;
  /** Active landing section index (0=Hero, 1=Architecture, 2=Capabilities, 3=Benchmarks, 4=Access) */
  activeSection: 0 | 1 | 2 | 3 | 4;
}

interface FlightKeyframe {
  t: number;
  posX: number;
  posY: number;
  posZ: number;
  rotXDeg: number;
  rotZDeg: number;
  scale: number;
  explodeSpread: number;
  tensorAlignment: number;
  orbitDeg: number;
}

const PAGE_FLIGHT_KEYFRAMES: FlightKeyframe[] = [
  // 0.00 — Hero (Right side, iconic 3/4 view, 0°)
  {
    t: 0.0,
    posX: 2.32,
    posY: 0.04,
    posZ: 0.0,
    rotXDeg: 18,
    rotZDeg: -6,
    scale: 0.85,
    explodeSpread: 0.2,
    tensorAlignment: 0.15,
    orbitDeg: 0,
  },
  // 0.25 — Execution Architecture (Glides smoothly to LEFT gallery lane, explodes open, ~90°)
  {
    t: 0.25,
    posX: -2.36,
    posY: 0.02,
    posZ: 0.1,
    rotXDeg: 24,
    rotZDeg: 7,
    scale: 0.81,
    explodeSpread: 0.92,
    tensorAlignment: 0.48,
    orbitDeg: 150,
  },
  // 0.55 — Core Capabilities (Sweeps gracefully across to RIGHT gallery lane, ~198°)
  {
    t: 0.55,
    posX: 2.38,
    posY: -0.02,
    posZ: 0.08,
    rotXDeg: -10,
    rotZDeg: -8,
    scale: 0.82,
    explodeSpread: 0.56,
    tensorAlignment: 0.82,
    orbitDeg: 320,
  },
  // 0.78 — Benchmarks transition (Glides smoothly toward LEFT gallery depth while locking strata, ~281°)
  {
    t: 0.78,
    posX: -2.1,
    posY: 0.08,
    posZ: -0.35,
    rotXDeg: 14,
    rotZDeg: 5,
    scale: 0.78,
    explodeSpread: 0.16,
    tensorAlignment: 0.96,
    orbitDeg: 440,
  },
  // 1.00 — Access Workspace (Settles calmly in LEFT gallery lane at full 360° converged equilibrium)
  {
    t: 1.0,
    posX: -2.34,
    posY: 0.06,
    posZ: 0.0,
    rotXDeg: 18,
    rotZDeg: -4,
    scale: 0.82,
    explodeSpread: 0.08,
    tensorAlignment: 1.0,
    orbitDeg: 540,
  },
];

/**
 * Computes the full-page 3D flight path, side-to-side glide, full 360° rotation,
 * strata explosion, and tensor alignment for normalized page scroll progress [0..1].
 */
export function computePageFlightPose(rawProgress: number, rawVelocity = 0): PageFlightPose {
  const progress = clamp01(rawProgress);
  const velocity = Number.isFinite(rawVelocity) ? Math.max(-1, Math.min(1, rawVelocity)) : 0;

  let lower = PAGE_FLIGHT_KEYFRAMES[0]!;
  let upper = PAGE_FLIGHT_KEYFRAMES[PAGE_FLIGHT_KEYFRAMES.length - 1]!;

  for (let i = 0; i < PAGE_FLIGHT_KEYFRAMES.length - 1; i++) {
    const cur = PAGE_FLIGHT_KEYFRAMES[i]!;
    const next = PAGE_FLIGHT_KEYFRAMES[i + 1]!;
    if (progress >= cur.t && progress <= next.t) {
      lower = cur;
      upper = next;
      break;
    }
  }

  const localT = smoothstep(lower.t, upper.t, progress);

  let activeSection: 0 | 1 | 2 | 3 | 4 = 0;
  if (progress < 0.14) activeSection = 0;
  else if (progress < 0.42) activeSection = 1;
  else if (progress < 0.7) activeSection = 2;
  else if (progress < 0.88) activeSection = 3;
  else activeSection = 4;

  const velPitch = velocity * 5.0;

  return {
    progress,
    posX: Number(lerp(lower.posX, upper.posX, localT).toFixed(3)),
    posY: Number(lerp(lower.posY, upper.posY, localT).toFixed(3)),
    posZ: Number(lerp(lower.posZ, upper.posZ, localT).toFixed(3)),
    rotYDeg: Number((progress * 360).toFixed(2)),
    rotXDeg: Number((lerp(lower.rotXDeg, upper.rotXDeg, localT) + velPitch).toFixed(2)),
    rotZDeg: Number(lerp(lower.rotZDeg, upper.rotZDeg, localT).toFixed(2)),
    scale: Number(lerp(lower.scale, upper.scale, localT).toFixed(4)),
    explodeSpread: Number(lerp(lower.explodeSpread, upper.explodeSpread, localT).toFixed(3)),
    tensorAlignment: Number(lerp(lower.tensorAlignment, upper.tensorAlignment, localT).toFixed(3)),
    orbitDeg: Number(lerp(lower.orbitDeg, upper.orbitDeg, localT).toFixed(2)),
    activeSection,
  };
}



