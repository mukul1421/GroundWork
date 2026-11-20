import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { clamp01, computePageFlightPose, dampValue } from '@/utils/scroll3dMath';

// Pre-allocated scratch helper to guarantee zero GC inside the per-frame render loop
const _pinDummy = new THREE.Object3D();

/**
 * Generates a rich procedural sRGB sapphire-indigo optical crystal texture for the luminous core.
 */
function createSapphireCoreTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, size, size);
    grad.addColorStop(0, '#6366f1');
    grad.addColorStop(0.35, '#4f46e5');
    grad.addColorStop(0.7, '#3730a3');
    grad.addColorStop(1, '#7c3aed');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    // Subtle precision micro-grid etched into the crystal core
    ctx.strokeStyle = 'rgba(186, 230, 253, 0.22)';
    ctx.lineWidth = 1.5;
    const step = size / 8;
    for (let i = 1; i < 8; i++) {
      ctx.beginPath();
      ctx.moveTo(i * step, 0);
      ctx.lineTo(i * step, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * step);
      ctx.lineTo(size, i * step);
      ctx.stroke();
    }

    // Soft electric-sky optical sheen across the diagonal
    const glow = ctx.createRadialGradient(
      size * 0.36,
      size * 0.32,
      size * 0.04,
      size * 0.45,
      size * 0.45,
      size * 0.56,
    );
    glow.addColorStop(0, 'rgba(186, 230, 253, 0.85)');
    glow.addColorStop(0.35, 'rgba(125, 211, 252, 0.38)');
    glow.addColorStop(1, 'rgba(79, 70, 229, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates a subtle brushed metallic finish bump/color texture for the anodized titanium trim.
 */
function createBrushedCeramicTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, size, size);
    grad.addColorStop(0, '#fcfcff');
    grad.addColorStop(0.5, '#f4f3fa');
    grad.addColorStop(1, '#ebe9f6');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    ctx.fillStyle = 'rgba(79, 70, 229, 0.025)';
    for (let y = 0; y < size; y += 3) {
      ctx.fillRect(0, y, size, 1);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates a soft studio radial floor contact shadow texture.
 */
function createStudioShadowTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, size, size);
    const g = ctx.createRadialGradient(size / 2, size / 2, 8, size / 2, size / 2, size * 0.48);
    g.addColorStop(0, 'rgba(30, 27, 75, 0.24)');
    g.addColorStop(0.4, 'rgba(79, 70, 229, 0.13)');
    g.addColorStop(0.75, 'rgba(99, 102, 241, 0.04)');
    g.addColorStop(1, 'rgba(99, 102, 241, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export interface GroundworkSculpture3DProps {
  /** 'fixed' glides full-page side-to-side on desktop; 'inline' renders centered inside mobile Hero */
  variant: 'fixed' | 'inline';
  /** Optional external stage selection [0..3] subtly accentuating sculpture angle */
  selectedStage?: number;
}

/**
 * High-craft, ultra-smooth (1-pass PBR, zero transmission overhead) 3D industrial sculpture
 * for Groundwork: Pearl-Alabaster Ceramic & Piano-Obsidian Precision Data Monolith enclosing
 * an Iridescent Sapphire-Indigo Crystal Core, 16 Instanced Columnar Tensor Pins, and Dual
 * Machined Titanium-Chrome Orbital Rings.
 *
 * In `fixed` desktop mode, glides seamlessly down the entire landing page from
 * Right (Hero) -> Left (Architecture) -> Right (Capabilities) -> Left (Access)
 * while completing a full 360-degree 3D revolution with velvety damped physics.
 */
export function GroundworkSculpture3D({
  variant,
  selectedStage = 0,
}: GroundworkSculpture3DProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const selectedStageRef = useRef<number>(selectedStage);
  selectedStageRef.current = selectedStage;
  const [webglReady, setWebglReady] = useState(true);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    if (typeof WebGL2RenderingContext === 'undefined') {
      setWebglReady(false);
      return;
    }

    // Detect software WebGL strictly via GPU renderer string (never user-agent)
    const probeCanvas = document.createElement('canvas');
    const probeGl = probeCanvas.getContext('webgl2');
    if (!probeGl) {
      setWebglReady(false);
      return;
    }
    const debugExt = probeGl.getExtension('WEBGL_debug_renderer_info');
    const rendererParam = debugExt ? debugExt.UNMASKED_RENDERER_WEBGL : probeGl.RENDERER;
    const gpuName = String(probeGl.getParameter(rendererParam) ?? '');
    probeGl.getExtension('WEBGL_lose_context')?.loseContext();
    const isSoftwareGl = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpuName);

    const reducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglReady(false);
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = false;

    const getSize = () => ({
      w: Math.max(260, container.clientWidth || window.innerWidth),
      h: Math.max(260, container.clientHeight || window.innerHeight),
    });

    const initSize = getSize();
    renderer.setSize(initSize.w, initSize.h, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();

    // Procedural studio environment reflections for crisp metallic, ceramic & obsidian speculars
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTarget = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(
      variant === 'fixed' ? 35 : 38,
      initSize.w / initSize.h,
      0.1,
      50,
    );
    camera.position.set(0, 0.2, variant === 'fixed' ? 9.4 : 7.6);
    camera.lookAt(0, 0, 0);

    // Warm/Cool 3-Point Studio Lighting Rig (fast, crisp, zero RectAreaLight overhead)
    const hemiLight = new THREE.HemisphereLight(0xf8f9ff, 0xcbd5e1, 1.05);
    hemiLight.position.set(0, 14, 0);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfffaf2, 2.3);
    keyLight.position.set(6, 9, 7);
    scene.add(keyLight);

    const coolFillLight = new THREE.DirectionalLight(0x93c5fd, 1.45);
    coolFillLight.position.set(-7, 3, 5);
    scene.add(coolFillLight);

    const indigoRimLight = new THREE.DirectionalLight(0x818cf8, 1.75);
    indigoRimLight.position.set(3, -5, -6);
    scene.add(indigoRimLight);

    // Track disposable GPU resources
    const geometries: THREE.BufferGeometry[] = [];
    const materials: THREE.Material[] = [];
    const textures: THREE.Texture[] = [];

    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const coreTex = createSapphireCoreTexture(maxAniso);
    const ceramicTex = createBrushedCeramicTexture(maxAniso);
    const shadowTex = createStudioShadowTexture();
    textures.push(coreTex, ceramicTex, shadowTex);

    // === MATERIALS (High-Contrast Luxury Industrial Palette) ===
    const pearlCeramicMat = new THREE.MeshPhysicalMaterial({
      color: 0xf7f6fc,
      map: ceramicTex,
      roughness: 0.24,
      metalness: 0.05,
      clearcoat: 0.85,
      clearcoatRoughness: 0.12,
      envMapIntensity: 1.2,
    });

    const pianoObsidianMat = new THREE.MeshPhysicalMaterial({
      color: 0x0f172a,
      roughness: 0.09,
      metalness: 0.28,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      envMapIntensity: 1.55,
    });

    const brushedTitaniumMat = new THREE.MeshStandardMaterial({
      color: 0xdbe2ee,
      roughness: 0.22,
      metalness: 0.94,
      envMapIntensity: 1.45,
    });

    const sapphireCrystalMat = new THREE.MeshPhysicalMaterial({
      color: 0x5b4ef0,
      map: coreTex,
      emissive: 0x4338ca,
      emissiveIntensity: 0.58,
      roughness: 0.07,
      metalness: 0.26,
      clearcoat: 1.0,
      clearcoatRoughness: 0.03,
      iridescence: 1.0,
      iridescenceIOR: 1.42,
      iridescenceThicknessMinimum: 180,
      iridescenceThicknessMaximum: 520,
      envMapIntensity: 1.75,
    });

    const anodizedIndigoMat = new THREE.MeshPhysicalMaterial({
      color: 0x4f46e5,
      emissive: 0x3730a3,
      emissiveIntensity: 0.22,
      roughness: 0.16,
      metalness: 0.82,
      clearcoat: 0.85,
      clearcoatRoughness: 0.08,
      envMapIntensity: 1.5,
    });

    const chromeGimbalMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.09,
      metalness: 0.96,
      envMapIntensity: 1.65,
    });

    const tensorPinMat = new THREE.MeshStandardMaterial({
      color: 0xc7d2fe,
      roughness: 0.18,
      metalness: 0.88,
      envMapIntensity: 1.5,
    });

    materials.push(
      pearlCeramicMat,
      pianoObsidianMat,
      brushedTitaniumMat,
      sapphireCrystalMat,
      anodizedIndigoMat,
      chromeGimbalMat,
      tensorPinMat,
    );

    // === COMPOSITE 10-PART PROCEDURAL SCULPTURE ("The Groundwork Core") ===
    const flightRig = new THREE.Group();
    scene.add(flightRig);

    const spinAssembly = new THREE.Group();
    flightRig.add(spinAssembly);

    // Part 1: Luminous Sapphire-Indigo Iridescent Crystal Heart
    const coreGeom = new RoundedBoxGeometry(1.16, 1.16, 1.16, 6, 0.14);
    geometries.push(coreGeom);
    const coreMesh = new THREE.Mesh(coreGeom, sapphireCrystalMat);
    spinAssembly.add(coreMesh);

    // Part 2: Mid Piano-Obsidian Machined Collar Frame (4 architectural corner brackets framing the heart)
    const midCollarGroup = new THREE.Group();
    spinAssembly.add(midCollarGroup);
    const cornerPillarGeom = new RoundedBoxGeometry(0.32, 1.38, 0.32, 4, 0.06);
    geometries.push(cornerPillarGeom);
    const pillarOffsets: Array<[number, number]> = [
      [0.86, 0.86],
      [-0.86, 0.86],
      [0.86, -0.86],
      [-0.86, -0.86],
    ];
    const guideRodGeom = new THREE.CylinderGeometry(0.028, 0.028, 2.28, 14);
    geometries.push(guideRodGeom);
    for (const [px, pz] of pillarOffsets) {
      const pillar = new THREE.Mesh(cornerPillarGeom, pianoObsidianMat);
      pillar.position.set(px, 0, pz);
      midCollarGroup.add(pillar);

      const rod = new THREE.Mesh(guideRodGeom, brushedTitaniumMat);
      rod.position.set(px, 0, pz);
      midCollarGroup.add(rod);
    }

    // Part 3: Top Satin Pearl-Ceramic Monolith Slab + Brushed Titanium Bezel
    const topStratum = new THREE.Group();
    const capSlabGeom = new RoundedBoxGeometry(2.14, 0.34, 2.14, 6, 0.11);
    const bezelGeom = new RoundedBoxGeometry(2.2, 0.075, 2.2, 4, 0.03);
    const insetObsidianGeom = new RoundedBoxGeometry(1.48, 0.09, 1.48, 4, 0.04);
    geometries.push(capSlabGeom, bezelGeom, insetObsidianGeom);

    const topSlab = new THREE.Mesh(capSlabGeom, pearlCeramicMat);
    const topBezel = new THREE.Mesh(bezelGeom, brushedTitaniumMat);
    topBezel.position.y = -0.15;
    const topInset = new THREE.Mesh(insetObsidianGeom, pianoObsidianMat);
    topInset.position.y = 0.15;
    topStratum.add(topSlab, topBezel, topInset);
    topStratum.position.y = 0.92;
    spinAssembly.add(topStratum);

    // Part 4: Bottom Satin Pearl-Ceramic Monolith Base + Brushed Titanium Bezel
    const bottomStratum = new THREE.Group();
    const botSlab = new THREE.Mesh(capSlabGeom, pearlCeramicMat);
    const botBezel = new THREE.Mesh(bezelGeom, brushedTitaniumMat);
    botBezel.position.y = 0.15;
    const botInset = new THREE.Mesh(insetObsidianGeom, pianoObsidianMat);
    botInset.position.y = -0.15;
    bottomStratum.add(botSlab, botBezel, botInset);
    bottomStratum.position.y = -0.92;
    spinAssembly.add(bottomStratum);

    // Part 5: 16 Precision Machined Columnar Tensor Pins (InstancedMesh, 4x4 grid on top deck)
    const pinGeom = new THREE.CylinderGeometry(0.064, 0.064, 0.28, 20);
    geometries.push(pinGeom);
    const tensorPins = new THREE.InstancedMesh(pinGeom, tensorPinMat, 16);
    tensorPins.frustumCulled = false;
    topStratum.add(tensorPins);

    // Deterministic raw-data stagger offsets that converge cleanly into uniform ML tensors on scroll
    const pinRawHeights = [
      0.38, 1.05, 0.58, 1.18, 0.86, 0.44, 1.12, 0.68, 1.08, 0.52, 0.82, 1.22, 0.46, 0.98, 0.64,
      0.84,
    ];

    // Part 6 & 7: Two Floating Precision Obsidian + Titanium Side Wings (Expand on Scroll)
    const wingGeom = new RoundedBoxGeometry(0.14, 0.78, 1.16, 4, 0.045);
    const wingAccentGeom = new RoundedBoxGeometry(0.16, 0.16, 0.62, 3, 0.03);
    geometries.push(wingGeom, wingAccentGeom);

    const leftWing = new THREE.Group();
    const lwBody = new THREE.Mesh(wingGeom, pearlCeramicMat);
    const lwTrim = new THREE.Mesh(wingAccentGeom, anodizedIndigoMat);
    leftWing.add(lwBody, lwTrim);
    leftWing.position.set(-1.32, 0.06, 0);
    spinAssembly.add(leftWing);

    const rightWing = new THREE.Group();
    const rwBody = new THREE.Mesh(wingGeom, pianoObsidianMat);
    const rwTrim = new THREE.Mesh(wingAccentGeom, brushedTitaniumMat);
    rightWing.add(rwBody, rwTrim);
    rightWing.position.set(1.32, -0.06, 0);
    spinAssembly.add(rightWing);

    // Part 8 & 9: Dual Precision Orbital Rings (Anodized Indigo Titanium + Mirror Chrome Gimbal)
    const outerRingGroup = new THREE.Group();
    outerRingGroup.rotation.set(0.32, 0.2, -0.26);
    flightRig.add(outerRingGroup);

    const outerTorusGeom = new THREE.TorusGeometry(1.96, 0.028, 18, 128);
    geometries.push(outerTorusGeom);
    const outerRingMesh = new THREE.Mesh(outerTorusGeom, anodizedIndigoMat);
    outerRingMesh.rotation.x = Math.PI / 2;
    outerRingMesh.scale.set(1.06, 0.92, 1);
    outerRingGroup.add(outerRingMesh);

    const innerGimbalGroup = new THREE.Group();
    innerGimbalGroup.rotation.set(-0.42, 0.15, 0.34);
    flightRig.add(innerGimbalGroup);

    const innerTorusGeom = new THREE.TorusGeometry(1.72, 0.015, 14, 112);
    geometries.push(innerTorusGeom);
    const innerRingMesh = new THREE.Mesh(innerTorusGeom, chromeGimbalMat);
    innerRingMesh.rotation.x = Math.PI / 2;
    innerGimbalGroup.add(innerRingMesh);

    // Part 10: Two Glossy Sapphire-Indigo Orbital Satellites Riding the Outer Ring
    const satGeomA = new THREE.SphereGeometry(0.125, 28, 28);
    const satGeomB = new THREE.SphereGeometry(0.095, 28, 28);
    geometries.push(satGeomA, satGeomB);

    const satA = new THREE.Mesh(satGeomA, sapphireCrystalMat);
    const satB = new THREE.Mesh(satGeomB, brushedTitaniumMat);
    outerRingGroup.add(satA, satB);

    // Part 11: Soft Studio Floor Contact Shadow (Follows X Glide!)
    const shadowGeom = new THREE.PlaneGeometry(4.4, 2.2);
    geometries.push(shadowGeom);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    materials.push(shadowMat);
    const shadowPlane = new THREE.Mesh(shadowGeom, shadowMat);
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.set(variant === 'fixed' ? 2.15 : 0, -2.05, 0);
    scene.add(shadowPlane);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // === ULTRA-SMOOTH CONTINUOUS SPRING-DAMPED ANIMATION ENGINE ===
    let targetScroll = 0;
    let currentScroll = 0;
    let pointerTargetX = 0;
    let pointerTargetY = 0;
    let pointerCurrentX = 0;
    let pointerCurrentY = 0;
    let stageAngleCurrent = selectedStageRef.current * 0.22;
    let lastTime = performance.now();
    let elapsed = 0;
    let frameId = 0;
    let disposed = false;

    const readScrollTarget = () => {
      const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      targetScroll = clamp01(window.scrollY / maxScroll);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (reducedMotion) return;
      pointerTargetX = (e.clientX / Math.max(1, window.innerWidth) - 0.5) * 2;
      pointerTargetY = (e.clientY / Math.max(1, window.innerHeight) - 0.5) * 2;
    };

    const onPointerLeave = () => {
      pointerTargetX = 0;
      pointerTargetY = 0;
    };

    readScrollTarget();
    currentScroll = targetScroll;

    window.addEventListener('scroll', readScrollTarget, { passive: true });
    if (variant === 'fixed') {
      window.addEventListener('pointermove', onPointerMove, { passive: true });
      window.addEventListener('pointerleave', onPointerLeave, { passive: true });
    }

    const DEG2RAD = Math.PI / 180;
    const BASE_YAW = 0.62;

    const updateScene = (dt: number) => {
      elapsed += dt;
      const prevScroll = currentScroll;

      const stageAngleTarget = selectedStageRef.current * 0.22;
      if (reducedMotion) {
        currentScroll = targetScroll;
        pointerCurrentX = 0;
        pointerCurrentY = 0;
        stageAngleCurrent = stageAngleTarget;
      } else {
        // Silky heavy-silk damping on GPU; crisp fast settle on software WebGL
        const scrollLambda = isSoftwareGl ? 14.0 : 4.8;
        currentScroll = dampValue(currentScroll, targetScroll, scrollLambda, dt);
        pointerCurrentX = dampValue(pointerCurrentX, pointerTargetX, 5.5, dt);
        pointerCurrentY = dampValue(pointerCurrentY, pointerTargetY, 5.5, dt);
        stageAngleCurrent = dampValue(stageAngleCurrent, stageAngleTarget, 6.0, dt);
      }

      const vel = Math.max(-1, Math.min(1, (targetScroll - prevScroll) * 18));
      const pose = computePageFlightPose(currentScroll, reducedMotion ? 0 : vel);

      // Gentle ambient Studio levitation breathing
      const floatY = reducedMotion ? 0 : Math.sin(elapsed * 1.05) * 0.065;
      const aspect = camera.aspect;
      const xResponsiveScale = Math.max(0.76, Math.min(1.16, aspect / 1.6));

      const worldX = variant === 'fixed' ? pose.posX * xResponsiveScale : 0;
      const worldY = (variant === 'fixed' ? pose.posY : 0) + floatY;
      const worldZ = variant === 'fixed' ? pose.posZ : 0;

      flightRig.position.set(worldX, worldY, worldZ);

      const stageScale = variant === 'fixed' ? pose.scale : 0.96;
      flightRig.scale.set(stageScale, stageScale, stageScale);

      // Full 360-degree rotation + damped stage bias + silky pointer parallax
      const spinRad = reducedMotion ? 0 : pose.rotYDeg * DEG2RAD + stageAngleCurrent;
      const pitchRad = reducedMotion ? 18 * DEG2RAD : pose.rotXDeg * DEG2RAD;
      const rollRad = reducedMotion ? -5 * DEG2RAD : pose.rotZDeg * DEG2RAD;

      spinAssembly.rotation.set(
        pitchRad - pointerCurrentY * 0.16,
        BASE_YAW + spinRad + pointerCurrentX * 0.24,
        rollRad,
      );

      // Inner sapphire crystal core gently counter-pulses inside the obsidian chamber
      coreMesh.rotation.y = reducedMotion ? 0 : -elapsed * 0.25 + spinRad * 0.35;

      // Exploded strata separation across sections
      const spread = reducedMotion ? 0.2 : pose.explodeSpread;
      topStratum.position.y = 0.92 + spread * 0.44;
      bottomStratum.position.y = -0.92 - spread * 0.44;
      leftWing.position.x = -1.32 - spread * 0.36;
      rightWing.position.x = 1.32 + spread * 0.36;

      // 16 Instanced Columnar Tensor Pins converge smoothly from raw stagger -> clean ML bars
      const align = reducedMotion ? 1 : pose.tensorAlignment;
      let idx = 0;
      for (let gx = 0; gx < 4; gx++) {
        for (let gz = 0; gz < 4; gz++) {
          const rawH = pinRawHeights[idx] ?? 0.8;
          const targetH = 0.68 + ((gx + gz) % 2) * 0.08;
          const hScale = rawH + (targetH - rawH) * align;
          _pinDummy.position.set(-0.45 + gx * 0.3, 0.2 + hScale * 0.12, -0.45 + gz * 0.3);
          _pinDummy.scale.set(1, hScale, 1);
          _pinDummy.updateMatrix();
          tensorPins.setMatrixAt(idx, _pinDummy.matrix);
          idx++;
        }
      }
      tensorPins.instanceMatrix.needsUpdate = true;

      // Dual Orbital Rings & Satellites
      const orbitRad = (reducedMotion ? 25 : pose.orbitDeg + elapsed * 14) * DEG2RAD;
      outerRingGroup.rotation.set(
        0.32 + (reducedMotion ? 0 : Math.sin(spinRad) * 0.18),
        0.2 + (reducedMotion ? 0 : spinRad * 0.45 + pointerCurrentX * 0.3),
        -0.26 + (reducedMotion ? 0 : Math.cos(spinRad) * 0.12),
      );
      innerGimbalGroup.rotation.set(
        -0.42 + (reducedMotion ? 0 : Math.cos(spinRad) * 0.2),
        0.15 - (reducedMotion ? 0 : spinRad * 0.6),
        0.34,
      );

      satA.position.set(Math.cos(orbitRad) * 1.96 * 1.06, 0, Math.sin(orbitRad) * 1.96 * 0.92);
      satB.position.set(
        Math.cos(orbitRad + Math.PI) * 1.96 * 1.06,
        0,
        Math.sin(orbitRad + Math.PI) * 1.96 * 0.92,
      );

      // Grounded shadow follows the sculpture horizontally as it glides side to side
      shadowPlane.position.set(worldX, -1.92, worldZ);
      const sShadow = (1 - floatY * 0.8) * stageScale;
      shadowPlane.scale.set(sShadow, sShadow, 1);

      // Expose deterministic test attributes on the host container
      if (hostRef.current) {
        hostRef.current.dataset.scrollProgress = currentScroll.toFixed(3);
        hostRef.current.dataset.worldX = worldX.toFixed(2);
        hostRef.current.dataset.spinDeg = String(Math.round(pose.rotYDeg));
      }
    };

    const afterDraw = (cb: () => void) => {
      if (disposed) return;
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const status: unknown = sync
          ? (gl.getSyncParameter(sync, gl.SYNC_STATUS) as unknown)
          : gl.SIGNALED;
        if (status === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    };

    const tick = () => {
      if (disposed) return;
      const now = performance.now();
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;

      updateScene(dt);
      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };

    // Start smooth animation loop
    updateScene(0.016);
    renderer.render(scene, camera);
    if (isSoftwareGl) {
      afterDraw(tick);
    } else {
      frameId = requestAnimationFrame(tick);
    }

    const resizeObserver = new ResizeObserver(() => {
      if (disposed || !container) return;
      const { w, h } = getSize();
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    });
    resizeObserver.observe(container);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      window.removeEventListener('scroll', readScrollTarget);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerleave', onPointerLeave);
      envTarget.dispose();
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      for (const t of textures) t.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [variant]);

  if (variant === 'fixed') {
    return (
      <div
        ref={hostRef}
        role="img"
        aria-label="Interactive 3D Groundwork data prism sculpture gliding across the page on scroll"
        data-testid="groundwork-3d-stage"
        data-scroll-progress="0.000"
        data-world-x="2.15"
        data-spin-deg="0"
        className="pointer-events-none fixed inset-0 z-10 hidden lg:block"
      >
        <div ref={mountRef} className="h-full w-full" />
      </div>
    );
  }

  return (
    <div
      ref={hostRef}
      role="img"
      aria-label="Interactive 3D Groundwork data prism sculpture"
      data-testid="groundwork-3d-mobile"
      className="relative mx-auto aspect-[5/4] w-full max-w-[440px] lg:hidden"
    >
      <div ref={mountRef} className="h-full w-full" />
      {!webglReady && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <svg
            className="h-36 w-36 text-indigo-500/80"
            viewBox="0 0 160 160"
            fill="none"
            aria-hidden="true"
          >
            <ellipse
              cx="80"
              cy="84"
              rx="68"
              ry="22"
              stroke="#4f46e5"
              strokeWidth="1.4"
              transform="rotate(-14 80 84)"
            />
            <polygon
              points="80,24 130,52 130,108 80,136 30,108 30,52"
              stroke="#0f172a"
              strokeWidth="1.6"
              fill="rgba(79, 70, 229, 0.14)"
            />
            <path d="M80 24v112M30 52l50 28 50-28" stroke="#6366f1" strokeWidth="1.4" />
          </svg>
        </div>
      )}
    </div>
  );
}
