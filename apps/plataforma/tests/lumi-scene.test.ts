import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildLumiAvatar, clampMouthLevel, getLumiPose, type LumiMood } from '../lib/lumi-scene';

const moods: LumiMood[] = ['idle', 'thinking', 'listening', 'speaking'];

test('Lumi mouth amplitude rejects invalid samples and clamps to its articulation range', () => {
  assert.equal(clampMouthLevel(-2), 0);
  assert.equal(clampMouthLevel(0.37), 0.37);
  assert.equal(clampMouthLevel(4), 1);
  for (const sample of [NaN, Infinity, -Infinity]) assert.equal(clampMouthLevel(sample), 0);
  for (const mood of ['idle', 'thinking', 'listening'] as LumiMood[]) {
    assert.equal(getLumiPose(3, { mood, mouthLevel: 1, reducedMotion: false }).mouth, 0);
  }
  assert.equal(getLumiPose(3, { mood: 'speaking', mouthLevel: 0, reducedMotion: false }).mouth, 0, 'Silence must never manufacture lip motion');
  assert.equal(getLumiPose(3, { mood: 'speaking', mouthLevel: 0.6, reducedMotion: false }).mouth, 0.6);
});

test('Lumi animation remains finite and anatomically bounded across all moods', () => {
  for (const mood of moods) for (const time of [NaN, Infinity, -3, 0, 0.1, 0.9, 3.6, 5.4, 27, 86400]) {
    const pose = getLumiPose(time, { mood, mouthLevel: 99, reducedMotion: false }, 0.9);
    assert(Object.values(pose).every(Number.isFinite));
    assert(pose.eyeOpen >= 0.05 && pose.eyeOpen <= 1);
    assert(Math.abs(pose.headTilt) < 0.2);
    assert(Math.abs(pose.headNod) < 0.1);
    assert(Math.abs(pose.breath) <= 0.012);
    assert(pose.wing >= 0 && pose.wing < 2.5);
    assert(pose.mouth >= 0 && pose.mouth <= 1);
  }
});

test('reduced motion removes idle loops while retaining meaningful mood and speech cues', () => {
  for (const mood of moods) {
    const first = getLumiPose(0, { mood, mouthLevel: 0.5, reducedMotion: true });
    const later = getLumiPose(95, { mood, mouthLevel: 0.5, reducedMotion: true });
    assert.deepEqual(first, later);
    assert.equal(first.breath, 0); assert.equal(first.eyeOpen, 1); assert.equal(first.thoughtLift, 0);
  }
  const thinking = getLumiPose(1, { mood: 'thinking', mouthLevel: 0, reducedMotion: true });
  const listening = getLumiPose(1, { mood: 'listening', mouthLevel: 0, reducedMotion: true });
  assert.notEqual(thinking.headTilt, listening.headTilt);
  assert.equal(getLumiPose(1, { mood: 'speaking', mouthLevel: 0.4, reducedMotion: true }).mouth, 0.4);
});

test('a requested greeting finishes and reduced motion gives a steady acknowledgement', () => {
  const input = { mood: 'idle' as const, mouthLevel: 0, reducedMotion: false };
  assert.equal(getLumiPose(1, input, -1).wing, 0);
  assert(getLumiPose(1, input, 0.8).wing > 0);
  assert.equal(getLumiPose(1, input, 2).wing, 0);
  assert.equal(getLumiPose(1, { ...input, reducedMotion: true }, 0.2).wing, getLumiPose(1, { ...input, reducedMotion: true }, 1.2).wing);
});

test('the procedural owl has real depth, articulated parts and bounded geometry without textures', () => {
  const rig = buildLumiAvatar(THREE);
  try {
    const size = new THREE.Box3().setFromObject(rig.group).getSize(new THREE.Vector3());
    assert(size.x > 1.8 && size.x < 3.5); assert(size.y > 2.5 && size.y < 4); assert(size.z > 1 && size.z < 2.5);
    assert.equal(rig.eyes.length, 2);
    assert.equal(rig.lowerBeak.parent, rig.head);
    assert.equal(rig.leftWing.parent, rig.body); assert.equal(rig.rightWing.parent, rig.body);
    let meshCount = 0;
    rig.group.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      meshCount++;
      const materialList = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materialList) {
        for (const value of Object.values(material)) assert(!(value instanceof THREE.Texture), 'No external texture or image is required');
      }
    });
    assert(meshCount > 40, 'The avatar must be assembled from actual meshes');
  } finally { rig.dispose(); }
});

test('disposing a rig releases each shared geometry and material exactly once', () => {
  const rig = buildLumiAvatar(THREE), parent = new THREE.Group(); parent.add(rig.group);
  const geometry = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  rig.group.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    geometry.add(object.geometry);
    (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => materials.add(material));
  });
  let disposedGeometry = 0, disposedMaterials = 0;
  geometry.forEach(item => item.addEventListener('dispose', () => disposedGeometry++));
  materials.forEach(item => item.addEventListener('dispose', () => disposedMaterials++));
  rig.dispose(); rig.dispose();
  assert.equal(disposedGeometry, geometry.size); assert.equal(disposedMaterials, materials.size);
  assert.equal(parent.children.length, 0); assert.equal(rig.group.children.length, 0);
});
