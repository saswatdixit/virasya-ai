import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/**
 * Creates premium 3D floating decorative elements around the Virasya manuscript,
 * matching the visual treatment from the reference camera hero scene:
 * - Polished gold metallic spheres with realistic envMap reflections
 * - Smooth warm-white porcelain rounded cubes / rectangular cushions
 * - Delicate thin gold ring
 * - Varied heights, depths, and distances for cinematic space
 */
export function createFloatingDecorations(materials = {}, opticalMap = null) {
  const group = new THREE.Group();
  group.name = 'floating-decorations';

  // Realistic materials matching the scene lighting & reflection environment
  const goldMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#dfb15b').convertSRGBToLinear(),
    roughness: 0.14,
    metalness: 0.88,
    envMapIntensity: 2.4,
  });

  const whiteMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#fff7ec').convertSRGBToLinear(),
    roughness: 0.18,
    metalness: 0.06,
    envMapIntensity: 1.3,
  });

  if (opticalMap) {
    goldMaterial.envMap = opticalMap;
    whiteMaterial.envMap = opticalMap;
  } else if (materials.gold?.envMap) {
    goldMaterial.envMap = materials.gold.envMap;
    whiteMaterial.envMap = materials.gold.envMap;
  }

  // Curated collection of floating objects arranged gracefully around the book
  const items = [
    // 1. Hero Polished Gold Sphere (Left midground - primary reference element)
    {
      name: 'decor-gold-sphere-hero',
      mesh: new THREE.Mesh(new THREE.SphereGeometry(0.38, 32, 32), goldMaterial),
      basePos: new THREE.Vector3(-2.25, 0.05, 0.90),
      baseRot: new THREE.Euler(0, 0, 0),
      bobSpeed: 0.0009,
      bobPhase: 0.0,
      bobAmpY: 0.055,
      driftAmpX: 0.022,
      rotSpeed: new THREE.Vector3(0.0002, 0.0003, 0.0001),
    },
    // 2. Top-Left Warm-White Rounded Cube (Matches reference squircle)
    {
      name: 'decor-white-cube-top-left',
      mesh: new THREE.Mesh(new RoundedBoxGeometry(0.46, 0.46, 0.34, 2, 0.10), whiteMaterial),
      basePos: new THREE.Vector3(-2.45, 0.92, 0.25),
      baseRot: new THREE.Euler(0.32, 0.42, 0.20),
      bobSpeed: 0.0008,
      bobPhase: 1.8,
      bobAmpY: 0.045,
      driftAmpX: 0.018,
      rotSpeed: new THREE.Vector3(0.00015, 0.00022, -0.0001),
    },
    // 3. Right Warm-White Rounded Cube (Matches reference squircle)
    {
      name: 'decor-white-cube-right',
      mesh: new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.42, 0.32, 2, 0.09), whiteMaterial),
      basePos: new THREE.Vector3(2.35, 0.25, -0.15),
      baseRot: new THREE.Euler(-0.22, 0.55, 0.25),
      bobSpeed: 0.0011,
      bobPhase: 3.2,
      bobAmpY: 0.05,
      driftAmpX: -0.02,
      rotSpeed: new THREE.Vector3(-0.00018, 0.0002, 0.00012),
    },
    // 4. Elegant Thin Gold Ring (Top-Right Depth)
    {
      name: 'decor-gold-ring-top-right',
      mesh: new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.022, 20, 40), goldMaterial),
      basePos: new THREE.Vector3(2.45, 1.15, -0.35),
      baseRot: new THREE.Euler(0.65, -0.45, 0.50),
      bobSpeed: 0.00095,
      bobPhase: 4.5,
      bobAmpY: 0.04,
      driftAmpX: 0.016,
      rotSpeed: new THREE.Vector3(0.00025, 0.00035, 0.00018),
    },
    // 5. Foreground Warm-White Sphere (Depth Cue)
    {
      name: 'decor-white-sphere-foreground',
      mesh: new THREE.Mesh(new THREE.SphereGeometry(0.20, 28, 28), whiteMaterial),
      basePos: new THREE.Vector3(-1.95, -0.78, 1.15),
      baseRot: new THREE.Euler(0, 0, 0),
      bobSpeed: 0.0012,
      bobPhase: 2.4,
      bobAmpY: 0.038,
      driftAmpX: -0.014,
      rotSpeed: new THREE.Vector3(0.0001, 0.0002, 0.0001),
    },
    // 6. Deep Background Mini Gold Sphere (Space Depth)
    {
      name: 'decor-gold-sphere-deep',
      mesh: new THREE.Mesh(new THREE.SphereGeometry(0.16, 24, 24), goldMaterial),
      basePos: new THREE.Vector3(2.25, -0.65, -0.70),
      baseRot: new THREE.Euler(0, 0, 0),
      bobSpeed: 0.00085,
      bobPhase: 5.1,
      bobAmpY: 0.032,
      driftAmpX: 0.018,
      rotSpeed: new THREE.Vector3(0.00018, -0.0001, 0.00025),
    },
  ];

  for (const item of items) {
    item.mesh.name = item.name;
    item.mesh.position.copy(item.basePos);
    item.mesh.rotation.copy(item.baseRot);
    group.add(item.mesh);
  }

  function update(time, open = 0, reduced = false) {
    const t = time || 0;
    const expand = 1 + open * 0.14;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (reduced) {
        item.mesh.position.set(
          item.basePos.x * expand,
          item.basePos.y,
          item.basePos.z * expand
        );
        continue;
      }

      // Smooth floating bob and subtle lateral drift
      const waveY = Math.sin(t * item.bobSpeed + item.bobPhase) * item.bobAmpY;
      const waveX = Math.cos(t * item.bobSpeed * 0.8 + item.bobPhase) * item.driftAmpX;
      const waveZ = Math.sin(t * item.bobSpeed * 0.6 + item.bobPhase) * (item.driftAmpX * 0.8);

      item.mesh.position.set(
        (item.basePos.x + waveX) * expand,
        item.basePos.y + waveY,
        (item.basePos.z + waveZ) * expand
      );

      // Gentle continuous rotation
      item.mesh.rotation.x = item.baseRot.x + t * item.rotSpeed.x;
      item.mesh.rotation.y = item.baseRot.y + t * item.rotSpeed.y;
      item.mesh.rotation.z = item.baseRot.z + t * item.rotSpeed.z;
    }
  }

  return {
    group,
    items,
    materials: { gold: goldMaterial, white: whiteMaterial },
    update,
  };
}
