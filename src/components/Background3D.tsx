import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface Background3DProps {
  progressRef: React.RefObject<number>;
  gameStateRef: React.RefObject<any>;
  isPaused: boolean;
  dimensions: { width: number; height: number };
}

const POWERUP_STEPS = ['SPEED', 'MISSILE', 'DOUBLE', 'LASER', 'OPTION'];

export const Background3D = React.memo(({ progressRef, gameStateRef, isPaused, dimensions }: Background3DProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const isPausedRef = useRef(isPaused);
  const zOffsetRef = useRef(0);
  const shipScaleRef = useRef(1.3);
  const shipYOffsetRef = useRef(0);
  const shipZOffsetRef = useRef(0);
  const keysPressed = useRef<{ [key: string]: boolean }>({});

  const dimensionsRef = useRef(dimensions);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);

  // Update the refs when props change
  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    dimensionsRef.current = dimensions;
    if (rendererRef.current && cameraRef.current) {
      const { width, height } = dimensions;
      rendererRef.current.setSize(width, height);
      cameraRef.current.aspect = width / height;
      
      // Keep horizontal FOV consistent
      if (cameraRef.current.aspect < 1) {
        cameraRef.current.fov = 2 * Math.atan(Math.tan((75 * Math.PI) / 360) / cameraRef.current.aspect) * (180 / Math.PI);
      } else {
        cameraRef.current.fov = 60;
      }
      cameraRef.current.updateProjectionMatrix();
    }
  }, [dimensions]);

  useEffect(() => {
    if (!containerRef.current) return;

    // --- Scene Setup ---
    // Ensure container is empty to avoid multiple canvases
    while (containerRef.current.firstChild) {
      containerRef.current.removeChild(containerRef.current.firstChild);
    }

    const scene = new THREE.Scene();
    // Camera at z=10, slightly above (y=1) for a "far" look
    const camera = new THREE.PerspectiveCamera(75, dimensions.width / dimensions.height, 0.1, 1000);
    camera.position.set(0, 1, 10);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ 
      antialias: true, 
      alpha: true,
      powerPreference: "high-performance" 
    });
    rendererRef.current = renderer;
    
    const updateSize = () => {
      const { width, height } = dimensionsRef.current;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      
      if (camera.aspect < 1) {
        camera.fov = 2 * Math.atan(Math.tan((75 * Math.PI) / 360) / camera.aspect) * (180 / Math.PI);
      } else {
        camera.fov = 60;
      }
      camera.updateProjectionMatrix();
    };

    updateSize();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    containerRef.current.appendChild(renderer.domElement);

    // --- Lights ---
    // Much brighter lighting for a vibrant, cheerful look
    const ambientLight = new THREE.AmbientLight(0xffffff, 2.0);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 5.0);
    sunLight.position.set(10, 10, 10);
    scene.add(sunLight);

    // Add a secondary fill light to brighten the shadows significantly
    const fillLight = new THREE.PointLight(0x00ffff, 2.0, 150);
    fillLight.position.set(-15, 10, 30);
    scene.add(fillLight);

    // --- One Small Planet ---
    // Procedural Texture Generation
    const createPlanetTexture = () => {
      const size = 1024;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;

      // Deep water base
      ctx.fillStyle = '#0a2a5a';
      ctx.fillRect(0, 0, size, size);

      // Add some water variation
      for (let i = 0; i < 100; i++) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        const r = 20 + Math.random() * 100;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, '#1a4a8a');
        g.addColorStop(1, 'transparent');
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }

      // Land masses (Brown/Earth tones)
      for (let i = 0; i < 50; i++) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        const r = 40 + Math.random() * 160;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        // Earth-like colors: brown, tan, dark green
        const colors = ['#5d4037', '#795548', '#4e342e', '#33691e', '#558b2f'];
        const color = colors[Math.floor(Math.random() * colors.length)];
        g.addColorStop(0, color);
        g.addColorStop(0.7, color + 'cc');
        g.addColorStop(1, 'transparent');
        ctx.fillStyle = g;
        
        // Draw irregular shapes by combining circles
        for(let j=0; j<3; j++) {
          const ox = (Math.random() - 0.5) * r;
          const oy = (Math.random() - 0.5) * r;
          ctx.beginPath();
          ctx.arc(x + ox, y + oy, r * (0.5 + Math.random() * 0.5), 0, Math.PI * 2);
          ctx.fill();
        }
      }

      return new THREE.CanvasTexture(canvas);
    };

    const createPlanetBump = () => {
      const size = 512;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, size, size);

      for (let i = 0; i < 60; i++) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        const r = 20 + Math.random() * 80;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        const gray = Math.floor(Math.random() * 150 + 100);
        g.addColorStop(0, `rgb(${gray},${gray},${gray})`);
        g.addColorStop(1, 'transparent');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      return new THREE.CanvasTexture(canvas);
    };

    const planetTexture = createPlanetTexture();
    const planetBump = createPlanetBump();

    // Triple the size: Radius 32.0
    const planetGroup = new THREE.Group();
    planetGroup.position.set(0, 0, 0); // Always at (0,0,0)
    scene.add(planetGroup);

    const planetGeometry = new THREE.SphereGeometry(32.0, 64, 64);
    const planetMaterial = new THREE.MeshStandardMaterial({
      map: planetTexture,
      bumpMap: planetBump,
      bumpScale: 0.8,
      roughness: 0.2,
      metalness: 0.4,
      emissive: 0x224488,
      emissiveIntensity: 0.5
    });
    const planet = new THREE.Mesh(planetGeometry, planetMaterial);
    planetGroup.add(planet);

    // Add a glow effect to the planet
    const planetGlowGeom = new THREE.SphereGeometry(33.0, 32, 32);
    const planetGlowMat = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.3,
      side: THREE.BackSide
    });
    const planetGlow = new THREE.Mesh(planetGlowGeom, planetGlowMat);
    planetGroup.add(planetGlow);

    // Add a simple ring - scaled up
    const ringGeometry = new THREE.TorusGeometry(48.0, 0.6, 2, 64);
    const ringMaterial = new THREE.MeshStandardMaterial({ color: 0x88aaff, transparent: true, opacity: 0.3 });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = Math.PI / 2.5;
    planetGroup.add(ring);

    // --- Satellite (Reference Object) ---
    const satelliteGroup = new THREE.Group();
    satelliteGroup.position.set(40, -10, -10);
    scene.add(satelliteGroup);
    
    const satBodyGeom = new THREE.BoxGeometry(2, 2, 2);
    const satBodyMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 0.3, metalness: 0.8 });
    const satBody = new THREE.Mesh(satBodyGeom, satBodyMat);
    satelliteGroup.add(satBody);
    
    const panelGeom = new THREE.PlaneGeometry(6, 1.5);
    const panelMat = new THREE.MeshStandardMaterial({ color: 0x0066ff, side: THREE.DoubleSide, emissive: 0x002244 });
    const panel1 = new THREE.Mesh(panelGeom, panelMat);
    panel1.position.x = 3.0;
    satelliteGroup.add(panel1);
    const panel2 = new THREE.Mesh(panelGeom, panelMat);
    panel2.position.x = -3.0;
    satelliteGroup.add(panel2);

    // --- Asteroid Field ---
    const asteroidGroup = new THREE.Group();
    scene.add(asteroidGroup);
    const asteroids: THREE.Mesh[] = [];
    const asteroidCount = 120;
    const asteroidGeom = new THREE.DodecahedronGeometry(1.0, 0);
    const asteroidMat = new THREE.MeshStandardMaterial({ 
      color: 0xccaa88, 
      roughness: 0.5,
      flatShading: true 
    });
    
    // Add a colorful Fog for depth blur effect without turning things black
    scene.fog = new THREE.FogExp2(0x110033, 0.008);
    
    for (let i = 0; i < asteroidCount; i++) {
      const asteroid = new THREE.Mesh(asteroidGeom, asteroidMat);
      // Distribute asteroids around the new camera path (Z=45)
      const x = (Math.random() - 0.5) * 300;
      const y = (Math.random() - 0.5) * 80;
      const z = (Math.random() - 0.5) * 60 + 20; 
      asteroid.position.set(x, y, z);
      
      const scale = 0.8 + Math.random() * 2.5;
      asteroid.scale.set(scale, scale, scale);
      asteroid.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      
      asteroid.userData.rotSpeed = {
        x: (Math.random() - 0.5) * 2.0,
        y: (Math.random() - 0.5) * 2.0,
        z: (Math.random() - 0.5) * 2.0
      };
      asteroid.userData.initialX = x;
      
      asteroidGroup.add(asteroid);
      asteroids.push(asteroid);
    }

    // --- Starfield & Nebulae ---
    const starCount = 3000;
    const starGeometry = new THREE.BufferGeometry();
    const starPositions = new Float32Array(starCount * 3);
    const starColors = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      starPositions[i * 3] = (Math.random() - 0.5) * 800; 
      starPositions[i * 3 + 1] = (Math.random() - 0.5) * 400; 
      starPositions[i * 3 + 2] = (Math.random() - 0.5) * 300 - 100; 
      
      // Add some color to stars
      const r = 0.8 + Math.random() * 0.2;
      const g = 0.8 + Math.random() * 0.2;
      const b = 0.8 + Math.random() * 0.2;
      starColors[i * 3] = r;
      starColors[i * 3 + 1] = g;
      starColors[i * 3 + 2] = b;
    }
    starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    starGeometry.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
    const starMaterial = new THREE.PointsMaterial({ size: 0.3, vertexColors: true, transparent: true, opacity: 0.9 });
    const stars = new THREE.Points(starGeometry, starMaterial);
    scene.add(stars);

    // Add colorful nebulae in the background
    const createNebula = (color: number, x: number, y: number, z: number, size: number) => {
      const geom = new THREE.SphereGeometry(size, 32, 32);
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.15,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(x, y, z);
      mesh.scale.set(2, 1, 1); // Stretch them horizontally
      scene.add(mesh);
    };

    createNebula(0x6600ff, -120, 30, -150, 90);
    createNebula(0xff00aa, 120, -40, -180, 110);
    createNebula(0x00ffff, 0, 60, -200, 130);
    createNebula(0xffcc00, -160, -60, -120, 70); 

    // --- Player Ship (3D Representation) ---
    const createPlayerShip = () => {
      const group = new THREE.Group();
      
      // Fuselage
      const bodyGeom = new THREE.CapsuleGeometry(0.15, 0.8, 4, 8);
      bodyGeom.rotateZ(-Math.PI / 2); // Point towards X+
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.8 });
      const body = new THREE.Mesh(bodyGeom, bodyMat);
      group.add(body);
      
      // Cockpit
      const cockGeom = new THREE.SphereGeometry(0.12, 16, 16);
      cockGeom.scale(1.5, 1, 1);
      const cockMat = new THREE.MeshStandardMaterial({ color: 0x00ffff, transparent: true, opacity: 0.7, emissive: 0x004444 });
      const cockpit = new THREE.Mesh(cockGeom, cockMat);
      cockpit.position.set(0.15, 0.05, 0); // In front
      group.add(cockpit);
      
      // Wings (V-Shape)
      const wingGeom = new THREE.BoxGeometry(0.4, 0.02, 0.8);
      const wingMat = new THREE.MeshStandardMaterial({ color: 0xcccccc });
      
      const topWing = new THREE.Mesh(wingGeom, wingMat);
      topWing.position.set(-0.1, 0.1, 0); // In back
      topWing.rotation.z = 0.2;
      group.add(topWing);
      
      const bottomWing = new THREE.Mesh(wingGeom, wingMat);
      bottomWing.position.set(-0.1, -0.1, 0); // In back
      bottomWing.rotation.z = -0.2;
      group.add(bottomWing);
      
      // Tail
      const tailGeom = new THREE.BoxGeometry(0.2, 0.3, 0.02);
      const tail = new THREE.Mesh(tailGeom, wingMat);
      tail.position.set(-0.3, 0.15, 0); // In back
      group.add(tail);
      
      // Engine Glow
      const engineGeom = new THREE.SphereGeometry(0.1, 8, 8);
      const engineMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
      const engine = new THREE.Mesh(engineGeom, engineMat);
      engine.position.set(-0.45, 0, 0); // In back
      group.add(engine);

      // Thruster Flame
      const thrusterGeom = new THREE.CylinderGeometry(0.02, 0.15, 0.6, 8);
      thrusterGeom.rotateZ(Math.PI / 2);
      const thrusterMat = new THREE.MeshBasicMaterial({ 
        color: 0x00ffff, 
        transparent: true, 
        opacity: 0.6,
        blending: THREE.AdditiveBlending
      });
      const thruster = new THREE.Mesh(thrusterGeom, thrusterMat);
      thruster.position.set(-0.7, 0, 0);
      group.add(thruster);
      group.userData.thruster = thruster;
      
      return group;
    };

    const playerShip = createPlayerShip();
    // Initial scale will be set in the animate loop
    
    // Add a small light to the ship to make it pop
    const shipLight = new THREE.PointLight(0x00ffff, 1.0, 5);
    shipLight.position.set(0, 0.2, 0);
    playerShip.add(shipLight);
    
    scene.add(playerShip);

    // --- Object Pools for 2D-to-3D elements ---
    const enemyPool: THREE.Group[] = [];
    const bulletPool: THREE.Mesh[] = [];
    const particlePool: THREE.Mesh[] = [];
    const debrisPool: THREE.Mesh[] = [];
    const shootableAsteroidPool: THREE.Mesh[] = [];
    const flashPool: THREE.Mesh[] = []; // Keep for compatibility but hide
    const shieldItemPool: THREE.Group[] = [];
    const optionPool: THREE.Mesh[] = [];

    // --- Boss Mesh ---
    const bossGroup = new THREE.Group();
    
    // Main body - more complex
    const bossBody = new THREE.Mesh(
      new THREE.IcosahedronGeometry(4, 1),
      new THREE.MeshStandardMaterial({ 
        color: 0x4a4a8e, 
        emissive: 0x660066, 
        emissiveIntensity: 1.2, 
        flatShading: true,
        metalness: 0.9,
        roughness: 0.1
      })
    );
    bossGroup.add(bossBody);
    
    // Outer spikes/wings
    const spikeGeom = new THREE.ConeGeometry(0.8, 6, 4);
    for (let i = 0; i < 8; i++) {
      const spike = new THREE.Mesh(
        spikeGeom,
        new THREE.MeshStandardMaterial({ 
          color: 0x222222, 
          emissive: 0xff0000,
          emissiveIntensity: 0.5,
          metalness: 0.9, 
          roughness: 0.1 
        })
      );
      const angle = (i / 8) * Math.PI * 2;
      spike.position.set(Math.cos(angle) * 4, Math.sin(angle) * 4, 0);
      spike.rotation.z = angle - Math.PI / 2;
      bossGroup.add(spike);
    }

    // Inner rotating ring
    const ringGeom = new THREE.TorusGeometry(5, 0.3, 12, 48);
    const bossRing = new THREE.Mesh(
      ringGeom,
      new THREE.MeshStandardMaterial({ 
        color: 0xff00ff, 
        emissive: 0xff00ff, 
        emissiveIntensity: 1.5,
        transparent: true,
        opacity: 0.9
      })
    );
    bossGroup.add(bossRing);
    
    const bossCore = new THREE.Mesh(
      new THREE.SphereGeometry(2, 24, 24),
      new THREE.MeshPhongMaterial({ 
        color: 0xff00ff, 
        emissive: 0xff00ff, 
        emissiveIntensity: 4,
        shininess: 100
      })
    );
    bossGroup.add(bossCore);
    
    // Add some extra glowing bits
    for (let i = 0; i < 12; i++) {
      const glow = new THREE.Mesh(
        new THREE.SphereGeometry(0.3, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0x00ffff })
      );
      const angle = (i / 12) * Math.PI * 2;
      glow.position.set(Math.cos(angle) * 3.5, Math.sin(angle) * 3.5, 1.5);
      bossGroup.add(glow);
    }
    
    // Charging effect mesh (hidden by default)
    const chargeEffect = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 })
    );
    bossGroup.add(chargeEffect);

    scene.add(bossGroup);
    const bossMesh = bossGroup;
    bossMesh.visible = false;
    bossMesh.userData = { ring: bossRing, chargeEffect };

    const createEnemyMesh = (type: string) => {
      const group = new THREE.Group();
      const bodyGeom = new THREE.ConeGeometry(0.4, 1, 8);
      bodyGeom.rotateX(Math.PI / 2);
      const bodyMat = new THREE.MeshStandardMaterial({ color: type === 'life' ? 0xffff00 : 0xff00ff });
      const body = new THREE.Mesh(bodyGeom, bodyMat);
      group.add(body);

      // Enemy Thruster
      const thrusterGeom = new THREE.CylinderGeometry(0.02, 0.15, 0.5, 8);
      thrusterGeom.rotateX(Math.PI / 2);
      const thrusterMat = new THREE.MeshBasicMaterial({ 
        color: type === 'life' ? 0xffff00 : 0xff00ff, 
        transparent: true, 
        opacity: 0.6,
        blending: THREE.AdditiveBlending
      });
      const thruster = new THREE.Mesh(thrusterGeom, thrusterMat);
      thruster.position.set(0, 0, -0.6);
      group.add(thruster);
      group.userData.thruster = thruster;
      group.userData.thrusterMat = thrusterMat;

      group.userData.type = type;
      return group;
    };

    const createBulletMesh = (color: string, type?: string) => {
      let geom;
      if (type === 'laser' || type === 'boss_laser') {
        const radius = type === 'boss_laser' ? 0.05 : 0.01;
        geom = new THREE.CylinderGeometry(radius, radius, 0.8, 8);
        geom.rotateZ(Math.PI / 2); // Point along X
      } else if (type === 'missile') {
        geom = new THREE.CylinderGeometry(0.02, 0.02, 0.4, 8);
        geom.rotateZ(Math.PI / 2);
      } else {
        geom = new THREE.SphereGeometry(0.02, 8, 8);
      }
      const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color) });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.userData.type = type;
      return mesh;
    };

    const createParticleMesh = (color: string) => {
      const geom = new THREE.SphereGeometry(0.5, 8, 8); // Unit radius 0.5, diameter 1
      const mat = new THREE.MeshStandardMaterial({ 
        color: new THREE.Color(color),
        emissive: new THREE.Color(color),
        emissiveIntensity: 5,
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending
      });
      return new THREE.Mesh(geom, mat);
    };

    const createDebrisMesh = (color: string) => {
      // Variety of debris shapes - reduced size to half
      const shapes = [
        new THREE.DodecahedronGeometry(0.2, 0),
        new THREE.TetrahedronGeometry(0.2, 0),
        new THREE.BoxGeometry(0.2, 0.2, 0.2)
      ];
      const geom = shapes[Math.floor(Math.random() * shapes.length)];
      const mat = new THREE.MeshPhongMaterial({ 
        color: new THREE.Color(color), 
        flatShading: true,
        emissive: new THREE.Color(color).multiplyScalar(0.2)
      });
      const mesh = new THREE.Mesh(geom, mat);
      scene.add(mesh);
      return mesh;
    };

    const createFlashMesh = () => {
      const geom = new THREE.SphereGeometry(1, 16, 16);
      const mat = new THREE.MeshBasicMaterial({ 
        color: 0xffffff, 
        transparent: true, 
        opacity: 0.8,
        blending: THREE.AdditiveBlending
      });
      const mesh = new THREE.Mesh(geom, mat);
      scene.add(mesh);
      return mesh;
    };

    const createTextLabel = (text: string, color: string) => {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d')!;
      canvas.width = 256;
      canvas.height = 64;
      context.font = 'Bold 48px Arial';
      context.fillStyle = color;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(text, 128, 32);
      
      const texture = new THREE.CanvasTexture(canvas);
      const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
      const sprite = new THREE.Sprite(material);
      sprite.scale.set(1.5, 0.375, 1);
      return sprite;
    };

    const createShieldItemMesh = (type: string, cycleIndex: number = 0) => {
      const group = new THREE.Group();
      const geom = new THREE.TorusGeometry(0.3, 0.05, 8, 16);
      const color = type === 'shield' ? 0x00ffff : 0xffaa00;
      const mat = new THREE.MeshPhongMaterial({ 
        color: color,
        emissive: color,
        emissiveIntensity: 0.5,
        transparent: true,
        opacity: 0.8
      });
      group.add(new THREE.Mesh(geom, mat));
      
      // Add label
      const labelText = type === 'shield' ? 'SHIELD' : POWERUP_STEPS[cycleIndex % POWERUP_STEPS.length];
      const label = createTextLabel(labelText, type === 'shield' ? '#00ffff' : '#ffaa00');
      label.position.y = 0.6;
      label.name = 'label';
      group.add(label);
      
      group.userData.type = type;
      group.userData.cycleIndex = cycleIndex;
      scene.add(group);
      return group;
    };

    const createOptionMesh = () => {
      const geom = new THREE.SphereGeometry(0.2, 16, 16);
      const mat = new THREE.MeshPhongMaterial({ 
        color: 0xff6400,
        emissive: 0xff6400,
        emissiveIntensity: 0.5
      });
      return new THREE.Mesh(geom, mat);
    };

    const createShootableAsteroidMesh = () => {
      const geom = new THREE.DodecahedronGeometry(1.0, 0);
      const mat = new THREE.MeshStandardMaterial({ 
        color: 0xff4444, // More reddish tone for danger
        emissive: 0x440000,
        roughness: 0.5,
        flatShading: true 
      });
      const mesh = new THREE.Mesh(geom, mat);
      scene.add(mesh);
      return mesh;
    };

    const TOTAL_DISTANCE = 500.0; 

    // --- Manual Camera Controls ---
    const handleKeyDown = (e: KeyboardEvent) => {
      keysPressed.current[e.key.toLowerCase()] = true;
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keysPressed.current[e.key.toLowerCase()] = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    // --- Animation ---
    let lastTime = performance.now();
    let accumulatedTime = 0;
    let frameCount = 0;

    const animate = () => {
      const now = performance.now();
      const deltaTime = (now - lastTime) * 0.001;
      lastTime = now;
      frameCount++;

      if (!isPausedRef.current) {
        accumulatedTime += deltaTime;
      }

      // Update Z offset based on keys (Zinc = 1)
      if (keysPressed.current['r']) {
        zOffsetRef.current += 1; 
      }
      if (keysPressed.current['f']) {
        zOffsetRef.current -= 1;
      }

      // Ship Scale Controls (+ and -)
      if (keysPressed.current['+'] || keysPressed.current['=']) {
        shipScaleRef.current += 0.1;
      }
      if (keysPressed.current['-'] || keysPressed.current['_']) {
        shipScaleRef.current = Math.max(0.1, shipScaleRef.current - 0.1);
      }

      // Ship Y Offset Controls (/ and *)
      if (keysPressed.current['/']) {
        shipYOffsetRef.current += 0.05;
      }
      if (keysPressed.current['*']) {
        shipYOffsetRef.current -= 0.05;
      }

      // Ship Z Offset Controls (, and .)
      if (keysPressed.current[',']) {
        shipZOffsetRef.current += 0.1;
      }
      if (keysPressed.current['.']) {
        shipZOffsetRef.current -= 0.1;
      }

      const progress = progressRef.current ?? 0;
      
      const constantOffset = accumulatedTime * 12.0; 
      const missionOffset = progress * TOTAL_DISTANCE;
      const totalOffset = constantOffset + missionOffset;
      
      // Camera moves in X from -88 to 120 to pass the planet at (0,0,0)
      // Z is set to 33 + manual offset
      const camX = -88 + (progress * 208);
      const jitter = isPausedRef.current ? 0 : (Math.random() - 0.5) * 0.02;
      const currentZ = 99 + zOffsetRef.current;
      camera.position.set(camX + jitter, 1 + jitter, currentZ);
      camera.lookAt(camX, 1, 0); // Look straight forward
      
      // Planet is fixed at (0,0,0)
      
      // Satellite: Drifts by
      satelliteGroup.position.x = 100 - (missionOffset * 0.8);
      satelliteGroup.position.z = 10;

      // Move asteroids: Relative to camera movement
      asteroids.forEach((ast, i) => {
        let currentX = ast.userData.initialX - (constantOffset * 1.5);
        const wrapWidth = 400;
        while (currentX < camX - 200) currentX += wrapWidth;
        while (currentX > camX + 200) currentX -= wrapWidth;
        ast.position.x = currentX;
        
        // Depth blur simulation: further objects are more faded/foggy
        // Spanning from behind the planet (Z < 0) to in front of the ship (Z > 85)
        const zDepth = (i % 20) * 8 - 60; // Range: -60 to 92
        ast.position.z = zDepth;

        if (!isPausedRef.current) {
          ast.rotation.x += ast.userData.rotSpeed.x * deltaTime;
          ast.rotation.y += ast.userData.rotSpeed.y * deltaTime;
          ast.rotation.z += ast.userData.rotSpeed.z * deltaTime;
        }
      });

      // Slow rotation for planet
      if (!isPausedRef.current) {
        planet.rotation.y += 0.00125 * deltaTime * 60;
        planetGroup.rotation.z += 0.00005 * deltaTime * 60;
        
        const pulse = Math.sin(accumulatedTime * 2) * 0.2 + 0.3;
        planetMaterial.emissiveIntensity = pulse;
      }

      // Parallax stars
      stars.position.x = camX * 0.9;

      // --- Update 3D Game Elements from 2D State ---
      const state = gameStateRef.current;
      if (state) {
        const dist = 14; 
        const vFov = (camera.fov * Math.PI) / 180;
        const visibleHeight = 2 * Math.tan(vFov / 2) * dist;
        const visibleWidth = visibleHeight * camera.aspect;
        const shipZ = 99 - dist + shipZOffsetRef.current;

        const mapTo3D = (nx: number, ny: number) => {
          return {
            x: camX + (nx - 0.5) * visibleWidth,
            y: 1 + (0.5 - ny) * visibleHeight
          };
        };

        // 1. Player Ship
        const p = state.player;
        if (p.isExploding) {
          playerShip.visible = false;
        } else {
          playerShip.visible = true;
          const pos = mapTo3D((p.x + p.width / 2) / dimensionsRef.current.width, (p.y + p.height / 2) / dimensionsRef.current.height);
          playerShip.position.set(pos.x, pos.y + shipYOffsetRef.current, shipZ);
          playerShip.scale.set(shipScaleRef.current, shipScaleRef.current, shipScaleRef.current);
          playerShip.rotation.z = (p.tilt || 0) * 0.5; // Pitch up/down
          playerShip.rotation.x = 0;
          playerShip.rotation.y = 0;

          // Flicker thruster
          if (playerShip.userData.thruster) {
            const s = 0.8 + Math.random() * 0.4;
            playerShip.userData.thruster.scale.set(s, s, s);
            playerShip.userData.thruster.visible = !p.isExploding;
          }
        }

        // 2. Enemies
        // Hide all in pool first
        enemyPool.forEach(e => e.visible = false);
        state.enemies.forEach((e: any, i: number) => {
          if (!enemyPool[i]) {
            enemyPool[i] = createEnemyMesh(e.type);
            scene.add(enemyPool[i]);
          }
          const mesh = enemyPool[i];
          mesh.visible = true;
          
          // Update color if type changed (pool reuse)
          if (mesh.userData.type !== e.type) {
            mesh.userData.type = e.type;
            const body = mesh.children[0] as THREE.Mesh;
            const color = e.type === 'life' ? 0xffff00 : 0xff00ff;
            (body.material as THREE.MeshStandardMaterial).color.set(color);
            if (mesh.userData.thrusterMat) {
              mesh.userData.thrusterMat.color.set(color);
            }
          }

          const pos = mapTo3D((e.x + e.width / 2) / dimensionsRef.current.width, (e.y + e.height / 2) / dimensionsRef.current.height);
          mesh.position.set(pos.x, pos.y + shipYOffsetRef.current, shipZ);
          
          // Face the player
          mesh.lookAt(playerShip.position);

          // Flicker thruster
          if (mesh.userData.thruster) {
            const s = 0.8 + Math.random() * 0.4;
            mesh.userData.thruster.scale.set(s, s, s);
          }
        });

      // 3. Boss
      const boss = state.boss;
      if (boss.active || (boss.isExploding && boss.explosionTimer > 0)) {
        bossMesh.visible = true;
        const nx = (boss.x + boss.width / 2) / dimensionsRef.current.width;
        const ny = (boss.y + boss.height / 2) / dimensionsRef.current.height;
        const pos = mapTo3D(nx, ny);
        bossMesh.position.set(pos.x, pos.y + shipYOffsetRef.current, shipZ);
        
        // Rotate body and ring
        bossMesh.children[0].rotation.y += deltaTime * 0.5;
        bossMesh.children[0].rotation.x += deltaTime * 0.3;
        if (bossMesh.userData.ring) {
          bossMesh.userData.ring.rotation.y += deltaTime * 2;
          bossMesh.userData.ring.rotation.x += deltaTime * 1.5;
        }

        // Pulse core
        const corePulse = Math.sin(accumulatedTime * 5) * 0.5 + 1.5;
        bossMesh.children[bossMesh.children.length - 2].scale.set(corePulse, corePulse, corePulse);
        
        // Laser Warning / Charging Effect
        const laserCycle = (state.frame - boss.lastLaser) % 360;
        const isWarning = laserCycle > 200 && laserCycle < 280;
        const chargeEffect = bossMesh.userData.chargeEffect;
        
        if (isWarning && chargeEffect) {
          chargeEffect.visible = true;
          const chargeProgress = (laserCycle - 200) / 80;
          const s = chargeProgress * 6;
          chargeEffect.scale.set(s, s, s);
          chargeEffect.material.opacity = 0.4 + Math.sin(accumulatedTime * 20) * 0.4;
        } else if (chargeEffect) {
          chargeEffect.visible = false;
        }

        if (boss.isExploding) {
          bossMesh.scale.setScalar(boss.explosionTimer / 180);
        } else {
          bossMesh.scale.setScalar(1);
        }
      } else {
        bossMesh.visible = false;
      }

        // 4. Bullets
        bulletPool.forEach(b => b.visible = false);
        state.bullets.forEach((b: any, i: number) => {
          if (!bulletPool[i]) {
            bulletPool[i] = createBulletMesh(b.color, b.type);
            scene.add(bulletPool[i]);
          }
          const mesh = bulletPool[i];
          mesh.visible = b.type === 'laser'; // Only show player laser mesh, others use trails
          
          // Update geometry if type changed (pool reuse)
          if (mesh.userData.type !== b.type) {
            mesh.userData.type = b.type;
            mesh.geometry.dispose();
            if (b.type === 'laser' || b.type === 'boss_laser') {
              const geom = new THREE.CylinderGeometry(0.05, 0.05, 0.8, 8);
              geom.rotateZ(Math.PI / 2);
              mesh.geometry = geom;
            } else if (b.type === 'missile') {
              const geom = new THREE.CylinderGeometry(0.08, 0.08, 0.4, 8);
              geom.rotateZ(Math.PI / 2);
              mesh.geometry = geom;
            } else {
              mesh.geometry = new THREE.SphereGeometry(0.15, 8, 8);
            }
          }

          const nx = (b.x + (b.width || 0) / 2) / dimensionsRef.current.width;
          const ny = (b.y + (b.height || 0) / 2) / dimensionsRef.current.height;
          const pos = mapTo3D(nx, ny);
          mesh.position.set(pos.x, pos.y + shipYOffsetRef.current, shipZ);
          (mesh.material as THREE.MeshBasicMaterial).color.set(b.color);

          // Scale bullets based on their 2D dimensions
          const pixelWidth = b.width || 4;
          const pixelHeight = b.height || 4;
          const worldWidth = pixelWidth * (visibleWidth / dimensionsRef.current.width);
          const worldHeight = pixelHeight * (visibleHeight / dimensionsRef.current.height);

          if (b.type === 'laser' || b.type === 'boss_laser' || b.type === 'missile') {
            if (b.type === 'missile') {
              // Missile was created with length 0.4 and radius 0.02 (diameter 0.04)
              const radiusScale = worldHeight / 0.04;
              mesh.scale.set(worldWidth / 0.4, radiusScale, radiusScale);
            } else {
              // Laser was created with length 0.8 and radius 0.01 or 0.05
              const baseRadius = b.type === 'boss_laser' ? 0.05 : 0.01;
              const radiusScale = worldHeight / (baseRadius * 2);
              mesh.scale.set(worldWidth / 0.8, radiusScale, radiusScale);
            }
          } else {
            // Sphere bullets - mesh radius 0.02 (diameter 0.04)
            const baseRadius = 0.02;
            const scale = worldWidth / (baseRadius * 2);
            mesh.scale.set(scale, scale, scale);
          }
        });

        // 5. Shield Items
        shieldItemPool.forEach(s => s.visible = false);
        state.shieldItems.forEach((item: any, i: number) => {
          if (!shieldItemPool[i]) {
            shieldItemPool[i] = createShieldItemMesh(item.type, item.cycleIndex);
            scene.add(shieldItemPool[i]);
          }
          const mesh = shieldItemPool[i];
          mesh.visible = true;
          
          // Update color and label if type or cycleIndex changed (pool reuse)
          if (mesh.userData.type !== item.type || mesh.userData.cycleIndex !== item.cycleIndex) {
            mesh.userData.type = item.type;
            mesh.userData.cycleIndex = item.cycleIndex;
            const torus = mesh.children[0] as THREE.Mesh;
            const mat = torus.material as THREE.MeshPhongMaterial;
            const color = item.type === 'shield' ? 0x00ffff : 0xffaa00;
            mat.color.set(color);
            mat.emissive.set(color);
            
            // Update label
            const label = mesh.getObjectByName('label') as THREE.Sprite;
            if (label) {
              mesh.remove(label);
              const labelText = item.type === 'shield' ? 'SHIELD' : POWERUP_STEPS[item.cycleIndex % POWERUP_STEPS.length];
              const newLabel = createTextLabel(labelText, item.type === 'shield' ? '#00ffff' : '#ffaa00');
              newLabel.position.y = 0.6;
              newLabel.name = 'label';
              mesh.add(newLabel);
            }
          }

          const nx = (item.x + item.width / 2) / dimensionsRef.current.width;
          const ny = (item.y + item.height / 2) / dimensionsRef.current.height;
          const pos = mapTo3D(nx, ny);
          mesh.position.set(pos.x, pos.y + shipYOffsetRef.current, shipZ);
          mesh.rotation.y += deltaTime * 2;
        });

        // 6. Options
        optionPool.forEach(o => o.visible = false);
        for (let i = 0; i < p.options; i++) {
          const histPos = p.history[Math.min((i + 1) * 10, p.history.length - 1)];
          if (histPos) {
            if (!optionPool[i]) {
              optionPool[i] = createOptionMesh();
              scene.add(optionPool[i]);
            }
            const mesh = optionPool[i];
            mesh.visible = true;
            const nx = (histPos.x + p.width / 2) / dimensionsRef.current.width;
            const ny = (histPos.y + p.height / 2) / dimensionsRef.current.height;
            const pos = mapTo3D(nx, ny);
            mesh.position.set(pos.x, pos.y + shipYOffsetRef.current, shipZ);
          }
        }

        // 7. Particles
        particlePool.forEach(p => p.visible = false);
        state.particles.forEach((p: any, i: number) => {
          if (!particlePool[i]) {
            particlePool[i] = createParticleMesh(p.color);
            scene.add(particlePool[i]);
          }
          const mesh = particlePool[i];
          mesh.visible = true;
          const nx = p.x / dimensionsRef.current.width;
          const ny = p.y / dimensionsRef.current.height;
          const pos = mapTo3D(nx, ny);
          mesh.position.set(pos.x, pos.y + shipYOffsetRef.current, shipZ);
          
          const baseSize = p.size || 0.05;
          mesh.scale.setScalar(baseSize * p.life * 1.2); // Further reduced multiplier to prevent huge spheres
          
          (mesh.material as THREE.MeshStandardMaterial).color.set(p.color);
          (mesh.material as THREE.MeshStandardMaterial).emissive.set(p.color);
          (mesh.material as THREE.MeshStandardMaterial).opacity = p.life * 1.0; // Maximum opacity
        });

        // 8. Debris
        debrisPool.forEach(d => d.visible = false);
        state.debris.forEach((d: any, i: number) => {
          if (!debrisPool[i]) {
            debrisPool[i] = createDebrisMesh(d.color);
          }
          const mesh = debrisPool[i];
          mesh.visible = true;
          const nx = d.x / dimensionsRef.current.width;
          const ny = d.y / dimensionsRef.current.height;
          const pos = mapTo3D(nx, ny);
          mesh.position.set(pos.x, pos.y + shipYOffsetRef.current, shipZ + (d.dz || 0));
          mesh.rotation.set(d.rotX, d.rotY, d.rotZ);
          mesh.scale.setScalar(d.size * d.life);
          (mesh.material as THREE.MeshPhongMaterial).color.set(d.color);
          (mesh.material as THREE.MeshPhongMaterial).opacity = d.life;
          (mesh.material as THREE.MeshPhongMaterial).transparent = true;
        });

        // 9. Explosion Flashes - Disabled as per user request
        flashPool.forEach(f => f.visible = false);

        // 10. Shootable Asteroids
        shootableAsteroidPool.forEach(a => a.visible = false);
        state.asteroids.forEach((a: any, i: number) => {
          if (!shootableAsteroidPool[i]) {
            shootableAsteroidPool[i] = createShootableAsteroidMesh();
          }
          const mesh = shootableAsteroidPool[i];
          mesh.visible = true;
          const nx = a.x / dimensionsRef.current.width;
          const ny = a.y / dimensionsRef.current.height;
          const pos = mapTo3D(nx, ny);
          mesh.position.set(pos.x, pos.y + shipYOffsetRef.current, shipZ);
          mesh.rotation.z = a.rot;
          mesh.scale.setScalar(a.scale);
        });
      }

      // Update global debug info
      if ((window as any).debugMode) {
        (window as any).debugInfo = {
          progress,
          frameCount,
          accumulatedTime: accumulatedTime.toFixed(2),
          shipScale: shipScaleRef.current.toFixed(2),
          shipYOffset: shipYOffsetRef.current.toFixed(2),
          shipZOffset: shipZOffsetRef.current.toFixed(2),
          trailSizeMultiplier: state.trailSizeMultiplier?.toFixed(2) || '1.00',
          camera: {
            pos: `(${camera.position.x.toFixed(2)}, ${camera.position.y.toFixed(2)}, ${camera.position.z.toFixed(2)})`,
            zOffset: zOffsetRef.current.toFixed(2)
          },
          targetX: missionOffset,
          totalDistance: TOTAL_DISTANCE,
          asteroids: asteroids.length,
          constantOffset: constantOffset.toFixed(2),
          isPaused: isPausedRef.current,
        };
      }

      renderer.render(scene, camera);
    };

    renderer.setAnimationLoop(animate);

    const handleResize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const aspect = width / height;
      
      camera.aspect = aspect;
      
      // Robust FOV calculation to keep the planet visible
      // We want to keep the horizontal FOV at least 75 degrees
      if (aspect < 1) {
        // Portrait: Increase vertical FOV to maintain horizontal width
        camera.fov = 2 * Math.atan(Math.tan((75 * Math.PI) / 360) / aspect) * (180 / Math.PI);
      } else {
        // Landscape: Standard FOV
        camera.fov = 60; // Slightly tighter for better focus in landscape
      }
      
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    // Use a small delay to ensure mobile dimensions are ready
    const debouncedResize = () => {
      setTimeout(handleResize, 100);
    };

    window.addEventListener('resize', updateSize);
    
    return () => {
      window.removeEventListener('resize', updateSize);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      renderer.setAnimationLoop(null);
      if (containerRef.current && renderer.domElement.parentNode === containerRef.current) {
        containerRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
      planetGeometry.dispose();
      planetMaterial.dispose();
      ringGeometry.dispose();
      ringMaterial.dispose();
      satBodyGeom.dispose();
      satBodyMat.dispose();
      panelGeom.dispose();
      panelMat.dispose();
      asteroidGeom.dispose();
      asteroidMat.dispose();
      starGeometry.dispose();
      starMaterial.dispose();
      sunLight.dispose();
      ambientLight.dispose();
    };
  }, []); // Empty dependency array - scene persists

  return (
    <div 
      ref={containerRef} 
      style={{ 
        position: 'absolute', 
        top: 0, 
        left: 0, 
        width: '100%', 
        height: '100%', 
        zIndex: 0,
        background: 'black'
      }} 
    />
  );
});

Background3D.displayName = 'Background3D';
