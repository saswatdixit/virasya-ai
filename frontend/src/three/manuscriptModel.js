
import * as THREE from 'three';

/**
 * Native manuscript contract:
 * update(open) takes a normalized hinge amount from 0 to 1.
 */
export async function createManuscriptModel(materials = {}) {
  const root = new THREE.Group();
  root.name = 'manuscript';

  const book = new THREE.Group();
  book.name = 'book';
  root.add(book);

  const cover = new THREE.MeshStandardMaterial({
    color: '#3c1908',
    roughness: 0.56,
    metalness: 0.08,
    envMapIntensity: 0.7,
  });

  const pages = new THREE.MeshStandardMaterial({
    color: '#f4ebdd',
    roughness: 0.82,
  });

  const spineMaterial = cover;

  function box(name, size, material, parent = book) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(...size),
      material
    );

    mesh.name = name;
    parent.add(mesh);

    return mesh;
  }

  const width = 2.55;
  const height = 3.02;

  // Keep the page block inside the closed-cover dimensions.
  const pageDepth = 0.08;

  const pageBlock = box(
    'page-block',
    [width * 0.92, height * 0.94, pageDepth],
    pages
  );

  pageBlock.position.set(0.08, 0, -0.135);

  const backCover = box(
    'back-cover',
    [width, height, 0.22],
    cover
  );

  backCover.position.z = -0.29;

  const spine = box(
    'spine',
    [0.22, height, 0.34],
    spineMaterial
  );

  spine.position.set(-width / 2 + 0.11, 0, -0.08);

  // The front cover rotates around this hinge.
  const frontPivot = new THREE.Group();
  frontPivot.name = 'front-cover-pivot';
  frontPivot.position.set(-width / 2, 0, 0.02);
  book.add(frontPivot);

  const frontCover = box(
    'front-cover',
    [width, height, 0.22],
    cover,
    frontPivot
  );

  frontCover.position.x = width / 2;

  // Load the logo texture from the public directory.
  const logoTexture = await loadTexture('/virasya-logo.png');

  const logoMaterial = new THREE.MeshStandardMaterial({
    color: '#c6a46a',
    roughness: 0.34,
    metalness: 0.52,
    envMapIntensity: 1.1,
    alphaMap: logoTexture,
    transparent: true,
    alphaTest: 0.02,
    depthWrite: false,
  });

  const logo = new THREE.Mesh(
    new THREE.PlaneGeometry(1.72, 1.72),
    logoMaterial
  );

  logo.name = 'virasya-front-cover-logo';
  logo.position.set(width / 2, 0, 0.116);
  frontPivot.add(logo);

  // Add artwork directly to the page block's front surface.
  const pageArtwork = createPageArtwork();

  pageArtwork.position.set(
    0,
    0,
    pageDepth / 2 + 0.002
  );

  pageBlock.add(pageArtwork);

  // Platform beneath the manuscript.
  const dock = new THREE.Group();
  dock.name = 'manuscript-dock';

  const plinth = new THREE.Mesh(
    new THREE.CylinderGeometry(1.55, 1.7, 0.12, 64),
    materials.dark || pages
  );

  plinth.name = 'dock-plinth';
  plinth.position.y = -1.76;
  dock.add(plinth);

  // Animate the front cover and page block.
  const update = (open) => {
    const amount = THREE.MathUtils.clamp(open, 0, 1);

    frontPivot.rotation.y = -amount * Math.PI * 0.88;
    pageBlock.position.x = 0.08 + amount * 0.08;
  };

  update(0);

  return {
    root,
    book,
    parts: {
      frontCover,
      backCover,
      spine,
      pageBlock,
      logo,
    },
    pivots: {
      front: frontPivot,
    },
    dock,
    update,
  };
}

function loadTexture(path) {
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(
      path,
      resolve,
      undefined,
      reject
    );
  });
}

function createPageArtwork() {
  const canvas = document.createElement('canvas');

  canvas.width = 1024;
  canvas.height = 1280;

  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error(
      'Unable to create manuscript page artwork'
    );
  }

  // Page background.
  context.fillStyle = '#f4ebdd';
  context.fillRect(0, 0, canvas.width, canvas.height);

  // Outer decorative border.
  context.strokeStyle = 'rgba(116, 73, 42, 0.32)';
  context.lineWidth = 5;
  context.strokeRect(
    70,
    70,
    canvas.width - 140,
    canvas.height - 140
  );

  // Divider beneath the heading.
  context.strokeStyle = 'rgba(116, 73, 42, 0.18)';
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(150, 400);
  context.lineTo(canvas.width - 150, 400);
  context.stroke();

  // Main heading.
  context.textAlign = 'center';
  context.fillStyle = '#573923';
  context.font = '600 58px Georgia, serif';
  context.fillText(
    'Where wisdom lives on.',
    canvas.width / 2,
    290
  );

  // Supporting text.
  context.fillStyle = '#76563b';
  context.font = 'italic 31px Georgia, serif';

  context.fillText(
    'Discover the knowledge, stories and traditions',
    canvas.width / 2,
    505
  );

  context.fillText(
    'that continue to shape us.',
    canvas.width / 2,
    550
  );

  // Small caption.
  context.fillStyle = '#9a7a4b';
  context.font = '600 18px Arial, sans-serif';
  context.letterSpacing = '4px';

  context.fillText(
    "A JOURNEY INTO INDIA'S LIVING HERITAGE",
    canvas.width / 2,
    710
  );

  const texture = new THREE.CanvasTexture(canvas);

  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    side: THREE.FrontSide,
  });

  const artwork = new THREE.Mesh(
    new THREE.PlaneGeometry(2.18, 2.76),
    material
  );

  artwork.name = 'page-artwork';
  artwork.userData.canvasTexture = texture;

  return artwork;
}
