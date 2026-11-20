import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clamp01,
  smoothstep,
  computeScrollChoreography,
  computeCardDepthTransform,
  dampValue,
  computeGlassScrollPose,
  getChapterScrollFraction,
  computePageFlightPose,
} from './scroll3dMath';

test('clamp01 bounds inputs and handles non-finite values', () => {
  assert.equal(clamp01(-0.4), 0);
  assert.equal(clamp01(0.5), 0.5);
  assert.equal(clamp01(2.2), 1);
  assert.equal(clamp01(Number.NaN), 0);
});

test('smoothstep produces smooth monotonic curve', () => {
  assert.equal(smoothstep(0, 1, 0), 0);
  assert.equal(smoothstep(0, 1, 0.5), 0.5);
  assert.equal(smoothstep(0, 1, 1), 1);
  assert.ok(smoothstep(0, 1, 0.25) < 0.25);
  assert.ok(smoothstep(0, 1, 0.75) > 0.75);
});

test('computeScrollChoreography progresses alignment monotonically from raw to converged', () => {
  const start = computeScrollChoreography(0);
  const mid = computeScrollChoreography(0.5);
  const end = computeScrollChoreography(1);

  assert.ok(start.alignmentFactor < mid.alignmentFactor);
  assert.ok(mid.alignmentFactor <= end.alignmentFactor);
  assert.equal(end.alignmentFactor, 1);
  assert.equal(start.activeStratum, 0);
  assert.equal(end.activeStratum, 3);
});

test('computeScrollChoreography respects selectedStageOverride', () => {
  const base = computeScrollChoreography(0.2);
  const overridden = computeScrollChoreography(0.2, 2);
  assert.equal(overridden.activeStratum, 2);
  assert.ok(overridden.rigRotationY > base.rigRotationY);
});

test('computeCardDepthTransform settles flat at viewport center', () => {
  const centered = computeCardDepthTransform(0);
  assert.equal(centered.rotateX, 0);
  assert.equal(centered.translateY, 0);
  assert.equal(centered.scale, 1);
  assert.equal(centered.opacity, 1);

  const offset = computeCardDepthTransform(0.8);
  assert.ok(offset.rotateX > 0 && offset.rotateX <= 4.5);
  assert.ok(offset.opacity >= 0.72 && offset.opacity < 1);
});

test('dampValue smoothly converges toward target without overshoot', () => {
  let value = 0;
  for (let i = 0; i < 60; i++) {
    value = dampValue(value, 1, 8, 1 / 60);
    assert.ok(value >= 0 && value <= 1);
  }
  assert.ok(value > 0.99);
  assert.equal(dampValue(0.4, 1.0, 8, 0), 0.4);
});

test('computeGlassScrollPose sweeps a full 360-degree 3D rotation across all 5 chapters', () => {
  const hero = computeGlassScrollPose(0);
  const ingest = computeGlassScrollPose(0.25);
  const profile = computeGlassScrollPose(0.5);
  const transform = computeGlassScrollPose(0.75);
  const exportPose = computeGlassScrollPose(1);

  assert.equal(hero.activeChapter, 0);
  assert.equal(ingest.activeChapter, 1);
  assert.equal(profile.activeChapter, 2);
  assert.equal(transform.activeChapter, 3);
  assert.equal(exportPose.activeChapter, 4);

  // Continuous full 360-degree 3D revolution
  assert.equal(hero.rotateY, 0);
  assert.equal(ingest.rotateY, 90);
  assert.equal(profile.rotateY, 180);
  assert.equal(transform.rotateY, 270);
  assert.equal(exportPose.rotateY, 360);

  // Outer strata spread widest during Ingest and lock tightly by Export
  assert.ok(ingest.layerSpread > hero.layerSpread);
  assert.ok(ingest.layerSpread > exportPose.layerSpread);
  assert.equal(exportPose.orbitAngleDeg, 540);

  // Scroll velocity tilt is bounded cleanly even for extreme inputs
  const fastScroll = computeGlassScrollPose(0.4, 99);
  assert.equal(fastScroll.velocityTiltX, 4.2);
});

test('getChapterScrollFraction maps every chapter into its active scroll window', () => {
  for (let i = 0; i <= 4; i++) {
    const fraction = getChapterScrollFraction(i);
    assert.equal(computeGlassScrollPose(fraction).activeChapter, i);
  }
});

test('computePageFlightPose glides side-to-side (right -> left -> right -> left) across full 360 degrees', () => {
  const hero = computePageFlightPose(0.0);
  const arch = computePageFlightPose(0.26);
  const caps = computePageFlightPose(0.56);
  const access = computePageFlightPose(1.0);

  // Alternating side choreography
  assert.ok(hero.posX > 1.5);
  assert.ok(arch.posX < -1.5);
  assert.ok(caps.posX > 1.5);
  assert.ok(access.posX < -1.5);

  // Full 360-degree revolution and tensor convergence
  assert.equal(hero.rotYDeg, 0);
  assert.equal(access.rotYDeg, 360);
  assert.ok(arch.explodeSpread > hero.explodeSpread);
  assert.ok(arch.explodeSpread > access.explodeSpread);
  assert.ok(hero.tensorAlignment < access.tensorAlignment);
  assert.equal(access.tensorAlignment, 1);
});


