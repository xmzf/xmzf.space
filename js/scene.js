// ============================================
// scene.js — Three.js scene with a refined
// desktop computer model (monitor + stand + keyboard)
// ============================================
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const ALU_COLOR = 0x1a1c20;
const ALU_DARK = 0x0d0e11;
const SCREEN_BG = 0x06070a;

export class Scene3D {
    constructor(canvas) {
        this.canvas = canvas;
        this.computer = null;
        this.screenMesh = null;
        this.screenTex = null;
        this.ready = false;
        this._clock = new THREE.Clock();
        this._pointer = { x: 0, y: 0 };
        this._targetRot = { x: 0, y: 0 };
        this._raycaster = new THREE.Raycaster();
        this._hovering = false;
        this._interactable = false; // enabled after hero reveals

        this._initRenderer();
        this._initScene();
        this._initLights();
        this._buildComputer();
        this._buildEnvironment();
        this._buildScreenTexture();

        this._onResize = this._onResize.bind(this);
        this._onPointer = this._onPointer.bind(this);
        this._onClick = this._onClick.bind(this);
        window.addEventListener('resize', this._onResize);
        window.addEventListener('pointermove', this._onPointer);
        window.addEventListener('click', this._onClick);
        this._onResize();

        // animate loop
        this._animate = this._animate.bind(this);
        this._animate();

        // signal ready after a frame so geometry settles
        requestAnimationFrame(() => { this.ready = true; });
    }

    _initRenderer() {
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: true,
            powerPreference: 'high-performance',
        });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.05;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }

    _initScene() {
        this.scene = new THREE.Scene();
        this.scene.background = null;
        this.scene.fog = new THREE.FogExp2(0x07080a, 0.045);

        // camera
        this.camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
        this.camera.position.set(0, 0.35, 8.2);
        this.camera.lookAt(0, 0.12, 0);
    }

    _initLights() {
        const key = new THREE.DirectionalLight(0xffffff, 2.2);
        key.position.set(3.5, 5, 4);
        key.castShadow = true;
        key.shadow.mapSize.set(2048, 2048);
        key.shadow.camera.near = 0.5;
        key.shadow.camera.far = 20;
        key.shadow.camera.left = -4;
        key.shadow.camera.right = 4;
        key.shadow.camera.top = 3;
        key.shadow.camera.bottom = -3;
        key.shadow.bias = -0.0002;
        key.shadow.normalBias = 0.02;
        key.shadow.radius = 4;
        this.scene.add(key);
        this.keyLight = key;

        const rim = new THREE.DirectionalLight(0x9bb8ff, 1.4);
        rim.position.set(-4, 1.5, -3);
        this.scene.add(rim);

        const fill = new THREE.DirectionalLight(0xffffff, 0.35);
        fill.position.set(-3, 2, 5);
        this.scene.add(fill);

        // subtle ambient glow
        const amb = new THREE.AmbientLight(0xffffff, 0.08);
        this.scene.add(amb);
    }

    _buildEnvironment() {
        const pmrem = new THREE.PMREMGenerator(this.renderer);
        const env = new RoomEnvironment();
        this.envMap = pmrem.fromScene(env, 0.04).texture;
        this.scene.environment = this.envMap;
        pmrem.dispose();
    }

    _buildComputer() {
        const group = new THREE.Group();
        group.name = 'computer';

        // ---- materials ----
        const aluMat = new THREE.MeshPhysicalMaterial({
            color: ALU_COLOR,
            metalness: 1.0,
            roughness: 0.32,
            envMapIntensity: 1.1,
            clearcoat: 0.4,
            clearcoatRoughness: 0.4,
        });

        const aluDarkMat = new THREE.MeshPhysicalMaterial({
            color: ALU_DARK,
            metalness: 1.0,
            roughness: 0.45,
            envMapIntensity: 0.9,
        });

        const bezelMat = new THREE.MeshPhysicalMaterial({
            color: 0x05060a,
            metalness: 0.3,
            roughness: 0.55,
            envMapIntensity: 0.6,
        });

        const glassMat = new THREE.MeshPhysicalMaterial({
            color: 0xffffff,
            metalness: 0,
            roughness: 0.02,
            transmission: 0.92,
            transparent: true,
            opacity: 1,
            ior: 1.5,
            thickness: 0.01,
            clearcoat: 1,
            clearcoatRoughness: 0.04,
            reflectivity: 0.5,
            envMapIntensity: 1.0,
        });

        // ---- monitor back shell (slightly tapered) ----
        const backGeo = new THREE.BoxGeometry(2.62, 1.52, 0.13, 4, 4, 1);
        // round corners by chamfering verts (cheap bevel via vertex shift)
        this._bevelBox(backGeo, 0.025);
        const back = new THREE.Mesh(backGeo, aluMat);
        back.position.set(0, 0.95, -0.07);
        back.castShadow = true;
        back.receiveShadow = true;
        group.add(back);

        // ---- back camera bump (apple-ish) ----
        const bumpGeo = new THREE.CylinderGeometry(0.08, 0.09, 0.02, 32);
        const bump = new THREE.Mesh(bumpGeo, aluDarkMat);
        bump.rotation.x = Math.PI / 2;
        bump.position.set(0, 0.95, -0.145);
        bump.castShadow = true;
        group.add(bump);

        // tiny back logo engraved (use a small dark circle)
        const logoGeo = new THREE.CircleGeometry(0.06, 32);
        const logoMat = new THREE.MeshStandardMaterial({
            color: 0x05060a, metalness: 0.6, roughness: 0.5,
        });
        const logo = new THREE.Mesh(logoGeo, logoMat);
        logo.position.set(0, 0.95, -0.137);
        group.add(logo);

        // ---- front bezel frame (thin, dark) ----
        const bezelGeo = new THREE.BoxGeometry(2.62, 1.52, 0.02);
        this._bevelBox(bezelGeo, 0.02);
        const bezel = new THREE.Mesh(bezelGeo, bezelMat);
        bezel.position.set(0, 0.95, 0.0);
        bezel.receiveShadow = true;
        group.add(bezel);

        // ---- screen (emissive plane) ----
        const screenGeo = new THREE.PlaneGeometry(2.42, 1.34);
        this.screenTex = this._makeScreenTexture('off');
        const screenMat = new THREE.MeshBasicMaterial({
            map: this.screenTex,
            toneMapped: false,
        });
        const screen = new THREE.Mesh(screenGeo, screenMat);
        screen.position.set(0, 0.95, 0.012);
        group.add(screen);
        this.screenMesh = screen;
        this.screenMat = screenMat;

        // glass overlay on screen
        const glassGeo = new THREE.PlaneGeometry(2.5, 1.42);
        const glass = new THREE.Mesh(glassGeo, glassMat);
        glass.position.set(0, 0.95, 0.015);
        group.add(glass);

        // ---- stand neck ----
        const neckGeo = new THREE.CylinderGeometry(0.045, 0.06, 0.9, 48);
        const neck = new THREE.Mesh(neckGeo, aluMat);
        neck.position.set(0, 0.45, -0.13);
        neck.castShadow = true;
        group.add(neck);

        // neck-to-monitor joint (a small rounded cap)
        const jointGeo = new THREE.CylinderGeometry(0.09, 0.07, 0.08, 32);
        const joint = new THREE.Mesh(jointGeo, aluDarkMat);
        joint.position.set(0, 0.85, -0.1);
        joint.castShadow = true;
        group.add(joint);

        // ---- stand base (flat oval disc) ----
        const baseGeo = new THREE.CylinderGeometry(0.55, 0.6, 0.025, 64);
        this._flatten(baseGeo, 'y', 1);
        const base = new THREE.Mesh(baseGeo, aluMat);
        base.position.set(0, 0.02, -0.13);
        base.castShadow = true;
        base.receiveShadow = true;
        group.add(base);

        // base rim highlight (a thin torus on the edge)
        const rimGeo = new THREE.TorusGeometry(0.58, 0.005, 12, 64);
        const rimMesh = new THREE.Mesh(rimGeo, aluDarkMat);
        rimMesh.rotation.x = Math.PI / 2;
        rimMesh.position.set(0, 0.035, -0.13);
        group.add(rimMesh);

        // ---- keyboard ----
        const kbGroup = new THREE.Group();
        const kbBaseGeo = new THREE.BoxGeometry(2.1, 0.06, 0.62);
        this._bevelBox(kbBaseGeo, 0.015);
        const kbBase = new THREE.Mesh(kbBaseGeo, aluMat);
        kbBase.castShadow = true;
        kbBase.receiveShadow = true;
        kbGroup.add(kbBase);

        // keys (instanced)
        const keyGeo = new THREE.BoxGeometry(0.075, 0.018, 0.075);
        const keyMat = new THREE.MeshPhysicalMaterial({
            color: 0x0a0b0e, metalness: 0.2, roughness: 0.65, envMapIntensity: 0.7,
        });
        const cols = 22;
        const rows = 5;
        const total = cols * rows;
        const keys = new THREE.InstancedMesh(keyGeo, keyMat, total);
        keys.castShadow = true;
        keys.receiveShadow = true;
        const dummy = new THREE.Object3D();
        const spacing = 0.088;
        const rowSpacing = 0.088;
        const startX = -((cols - 1) * spacing) / 2;
        const startZ = -((rows - 1) * rowSpacing) / 2;
        let i = 0;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                // skip a few to mimic function row / gaps
                dummy.position.set(startX + c * spacing, 0.04, startZ + r * rowSpacing);
                // slight tilt of keyboard
                dummy.rotation.x = -0.04;
                dummy.updateMatrix();
                keys.setMatrixAt(i, dummy.matrix);
                i++;
            }
        }
        keys.instanceMatrix.needsUpdate = true;
        kbGroup.add(keys);

        // spacebar
        const spaceGeo = new THREE.BoxGeometry(0.85, 0.018, 0.075);
        const space = new THREE.Mesh(spaceGeo, keyMat);
        space.position.set(0, 0.04, startZ + 4 * rowSpacing);
        space.rotation.x = -0.04;
        space.castShadow = true;
        kbGroup.add(space);

        kbGroup.position.set(0, 0.05, 1.35);
        kbGroup.rotation.x = -0.12;
        group.add(kbGroup);

        // ---- ground / contact shadow plane ----
        const groundGeo = new THREE.PlaneGeometry(40, 40);
        const groundMat = new THREE.ShadowMaterial({ opacity: 0.32 });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = 0;
        ground.receiveShadow = true;
        group.add(ground);

        // subtle floor reflection sheen (a dark disc that catches light)
        const sheenGeo = new THREE.CircleGeometry(3, 64);
        const sheenMat = new THREE.MeshBasicMaterial({
            color: 0x0c0e12, transparent: true, opacity: 0.85,
        });
        const sheen = new THREE.Mesh(sheenGeo, sheenMat);
        sheen.rotation.x = -Math.PI / 2;
        sheen.position.y = 0.001;
        group.add(sheen);

        // ---- PC tower (vAI sub-studio portal) ----
        this._buildTower(group);

        // center the whole rig
        group.position.y = -0.35;
        this.scene.add(group);
        this.computer = group;
    }

    // Build a refined PC tower with tempered-glass side panel
    // revealing a glowing "vAI" mark. The tower is the click target
    // that links out to vai.xmzf.space.
    _buildTower(parent) {
        const tower = new THREE.Group();
        tower.name = 'vai-tower';
        tower.userData.link = 'https://vai.xmzf.space';
        tower.userData.isPortal = true;

        // Brighter, more visible materials against the dark scene
        const aluMat = new THREE.MeshPhysicalMaterial({
            color: 0x2c2f38, metalness: 0.9, roughness: 0.32,
            envMapIntensity: 1.2, clearcoat: 0.5, clearcoatRoughness: 0.35,
        });
        const aluDarkMat = new THREE.MeshPhysicalMaterial({
            color: 0x1a1c22, metalness: 0.85, roughness: 0.45, envMapIntensity: 1.0,
        });
        const accentMat = new THREE.MeshStandardMaterial({
            color: 0xd6ff3f, emissive: 0xd6ff3f, emissiveIntensity: 1.2,
        });
        const glassMat = new THREE.MeshPhysicalMaterial({
            color: 0x0f1418, metalness: 0, roughness: 0.02,
            transmission: 0.8, transparent: true, opacity: 0.9, ior: 1.45,
            clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.0,
            side: THREE.DoubleSide,
        });

        // main chassis — tall, slim tower
        const W = 0.34, H = 1.28, D = 0.4;
        const chassisGeo = new THREE.BoxGeometry(W, H, D);
        const chassis = new THREE.Mesh(chassisGeo, aluMat);
        chassis.position.y = H / 2;
        chassis.castShadow = true;
        chassis.receiveShadow = true;
        tower.add(chassis);
        tower.userData.chassis = chassis;

        // accent edge frame to make the tower pop against dark bg
        const edges = new THREE.EdgesGeometry(chassisGeo);
        const edgeMat = new THREE.LineBasicMaterial({ color: 0xd6ff3f, transparent: true, opacity: 0.35 });
        const edgeLines = new THREE.LineSegments(edges, edgeMat);
        edgeLines.position.y = H / 2;
        tower.add(edgeLines);
        tower.userData.edgeLines = edgeLines;

        // front panel: glowing vAI badge on top, mesh vent below
        const vaiTex = this._makeVaiTexture(true);
        const vaiMat = new THREE.MeshBasicMaterial({
            map: vaiTex, transparent: true, toneMapped: false, opacity: 1,
            side: THREE.DoubleSide,
        });
        const vaiPlane = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.80, H * 0.40), vaiMat);
        vaiPlane.position.set(0, H * 0.68, D / 2 + 0.003);
        tower.add(vaiPlane);
        tower.userData.vaiPlane = vaiPlane;
        tower.userData.vaiMat = vaiMat;

        const ventTex = this._makeVentTexture();
        const ventMat = new THREE.MeshStandardMaterial({
            map: ventTex, color: 0x05060a, metalness: 0.7, roughness: 0.6,
        });
        const vent = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.72, H * 0.32), ventMat);
        vent.position.set(0, H * 0.24, D / 2 + 0.002);
        tower.add(vent);

        // top accent strip
        const strip = new THREE.Mesh(new THREE.BoxGeometry(W * 0.86, 0.012, D * 0.86), accentMat);
        strip.position.set(0, H - 0.03, 0);
        tower.add(strip);

        // power button + USBs on front
        const btn = new THREE.Mesh(
            new THREE.CylinderGeometry(0.016, 0.016, 0.008, 24),
            accentMat
        );
        btn.rotation.x = Math.PI / 2;
        btn.position.set(0, H * 0.88, D / 2 + 0.008);
        tower.add(btn);

        const usbMat = new THREE.MeshStandardMaterial({ color: 0x000000, metalness: 0.6, roughness: 0.4 });
        for (let i = 0; i < 2; i++) {
            const usb = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.006, 0.008), usbMat);
            usb.position.set(-0.05 + i * 0.1, H * 0.82, D / 2 + 0.006);
            tower.add(usb);
        }

        // ---- side: tempered glass panel ----
        const panel = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.95, H * 0.96), glassMat);
        panel.position.set(-W / 2 - 0.002, H / 2, 0);
        panel.rotation.y = -Math.PI / 2;
        tower.add(panel);

        // inner glow light
        const innerLight = new THREE.PointLight(0xd6ff3f, 0.7, 1.3, 2);
        innerLight.position.set(-W / 2 + 0.08, H / 2, 0);
        tower.add(innerLight);
        tower.userData.innerLight = innerLight;

        // feet
        const footMat = new THREE.MeshStandardMaterial({ color: 0x05060a, metalness: 0.4, roughness: 0.7 });
        const fx = W / 2 - 0.04, fz = D / 2 - 0.04;
        [[fx, fz], [-fx, fz], [fx, -fz], [-fx, -fz]].forEach(([x, z]) => {
            const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.02, 16), footMat);
            foot.position.set(x, -0.01, z);
            tower.add(foot);
        });

        // Position: to the right of the monitor, front face angled toward camera.
        // World coords after parent group shifts y by -0.35.
        // place tower to the right of the monitor with a clear gap
        tower.position.set(1.75, 0.0, 0.55);
        tower.rotation.y = -0.15;
        parent.add(tower);

        this.tower = tower;
        this.portalMeshes = [chassis, vent, panel, vaiPlane];
    }

    _makeVaiTexture(horizontal = false) {
        const c = document.createElement('canvas');
        if (horizontal) { c.width = 1024; c.height = 512; }
        else { c.width = 512; c.height = 1024; }
        const ctx = c.getContext('2d');
        // transparent background — only the mark glows
        ctx.clearRect(0, 0, c.width, c.height);

        // soft radial glow behind the mark
        const r = horizontal ? 420 : 320;
        const g = ctx.createRadialGradient(c.width / 2, c.height / 2, 20, c.width / 2, c.height / 2, r);
        g.addColorStop(0, 'rgba(214, 255, 63, 0.45)');
        g.addColorStop(1, 'rgba(214, 255, 63, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, c.width, c.height);

        // vAI wordmark
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#d6ff3f';
        ctx.shadowColor = 'rgba(214, 255, 63, 1)';
        ctx.shadowBlur = horizontal ? 80 : 60;
        ctx.font = horizontal
            ? '700 260px "Space Grotesk", sans-serif'
            : '700 180px "Space Grotesk", sans-serif';
        ctx.fillText('vAI', c.width / 2, c.height / 2 - (horizontal ? 24 : 30));
        ctx.shadowBlur = 0;

        // small tagline
        ctx.fillStyle = 'rgba(232, 236, 241, 0.95)';
        ctx.font = horizontal
            ? '500 36px "JetBrains Mono", monospace'
            : '500 28px "JetBrains Mono", monospace';
        ctx.fillText('AI · RESEARCH', c.width / 2, c.height / 2 + (horizontal ? 80 : 110));

        // tiny corner ticks
        ctx.strokeStyle = 'rgba(214, 255, 63, 0.7)';
        ctx.lineWidth = 2;
        const m = horizontal ? 50 : 40, s = 24;
        ctx.beginPath();
        ctx.moveTo(m, m + s); ctx.lineTo(m, m); ctx.lineTo(m + s, m);
        ctx.moveTo(c.width - m - s, m); ctx.lineTo(c.width - m, m); ctx.lineTo(c.width - m, m + s);
        ctx.moveTo(m, c.height - m - s); ctx.lineTo(m, c.height - m); ctx.lineTo(m + s, c.height - m);
        ctx.moveTo(c.width - m - s, c.height - m); ctx.lineTo(c.width - m, c.height - m); ctx.lineTo(c.width - m, c.height - m - s);
        ctx.stroke();

        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 8;
        return tex;
    }

    _makeVentTexture() {
        const c = document.createElement('canvas');
        c.width = 256; c.height = 512;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#05060a';
        ctx.fillRect(0, 0, c.width, c.height);
        // honeycomb-ish mesh: small dots on a grid
        ctx.fillStyle = '#1a1d24';
        const step = 10;
        for (let y = step / 2; y < c.height; y += step) {
            const off = (Math.floor(y / step) % 2) * (step / 2);
            for (let x = step / 2 + off; x < c.width; x += step) {
                ctx.beginPath();
                ctx.arc(x, y, 2.2, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        return tex;
    }

    _buildScreenTexture() {
        // already created in build, but keep helper for switching states
    }

    _makeScreenTexture(state) {
        const c = document.createElement('canvas');
        c.width = 1024;
        c.height = 576;
        const ctx = c.getContext('2d');

        if (state === 'off') {
            ctx.fillStyle = '#020305';
            ctx.fillRect(0, 0, c.width, c.height);
            // faint reflection hint
            const g = ctx.createLinearGradient(0, 0, 0, c.height);
            g.addColorStop(0, 'rgba(40, 60, 90, 0.08)');
            g.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, c.width, c.height);
        } else if (state === 'xmzf') {
            // ---- white background, black artistic wordmark ----
            // soft off-white for a refined, paper-like feel
            const bgGrad = ctx.createLinearGradient(0, 0, 0, c.height);
            bgGrad.addColorStop(0, '#fbfaf6');
            bgGrad.addColorStop(1, '#f1efe8');
            ctx.fillStyle = bgGrad;
            ctx.fillRect(0, 0, c.width, c.height);

            // faint paper grain via radial dots
            ctx.fillStyle = 'rgba(0, 0, 0, 0.018)';
            for (let i = 0; i < 1400; i++) {
                const px = Math.random() * c.width;
                const py = Math.random() * c.height;
                ctx.fillRect(px, py, 1, 1);
            }

            // top hairline + tiny tag
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(c.width / 2 - 90, 80);
            ctx.lineTo(c.width / 2 + 90, 80);
            ctx.stroke();

            ctx.fillStyle = '#0a0a0a';
            ctx.font = '500 16px "JetBrains Mono", monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('— EST · 2024 —', c.width / 2, 108);

            // artistic XMZF wordmark — serif, italic-flavored contrast
            ctx.fillStyle = '#0a0a0a';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            // main mark: heavy serif with wide tracking for an editorial feel
            ctx.font = '900 230px "Playfair Display", serif';
            // hand-tuned letter spacing by drawing each glyph
            const letters = ['X', 'M', 'Z', 'F'];
            const spacing = 18;
            const widths = letters.map(L => {
                ctx.font = '900 230px "Playfair Display", serif';
                return ctx.measureText(L).width;
            });
            const totalW = widths.reduce((a, b) => a + b, 0) + spacing * (letters.length - 1);
            let cx = c.width / 2 - totalW / 2;
            for (let i = 0; i < letters.length; i++) {
                ctx.font = '900 230px "Playfair Display", serif';
                // alternate italic on M and F for artistic rhythm
                const italic = (i === 1 || i === 3);
                ctx.font = `${italic ? 'italic ' : ''}900 230px "Playfair Display", serif`;
                ctx.fillText(letters[i], cx + widths[i] / 2, c.height / 2 - 6);
                cx += widths[i] + spacing;
            }

            // delicate underline rule
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(c.width / 2 - 240, c.height / 2 + 130);
            ctx.lineTo(c.width / 2 + 240, c.height / 2 + 130);
            ctx.stroke();

            // subtitle
            ctx.fillStyle = '#0a0a0a';
            ctx.font = '500 26px "JetBrains Mono", monospace';
            ctx.letterSpacing = '8px';
            ctx.fillText('S  T  U  D  I  O', c.width / 2, c.height / 2 + 168);

            // bottom corner marks
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            ctx.font = '500 18px "JetBrains Mono", monospace';
            ctx.textAlign = 'left';
            ctx.fillText('XMZF—01', 40, c.height - 44);
            ctx.textAlign = 'right';
            ctx.fillText('SH · 2024', c.width - 40, c.height - 44);

            // bottom hairline
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(40, c.height - 70);
            ctx.lineTo(c.width - 40, c.height - 70);
            ctx.stroke();
        }

        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 8;
        return tex;
    }

    async setScreenState(state) {
        // ensure artistic fonts are loaded before drawing to canvas
        if (state === 'xmzf') {
            try {
                await Promise.all([
                    document.fonts.load('900 230px "Playfair Display"'),
                    document.fonts.load('italic 900 230px "Playfair Display"'),
                    document.fonts.load('500 26px "JetBrains Mono"'),
                ]);
            } catch (e) { /* fall back to default serif */ }
        }
        const newTex = this._makeScreenTexture(state);
        if (this.screenMat.map) this.screenMat.map.dispose();
        this.screenMat.map = newTex;
        this.screenMat.needsUpdate = true;
        this.screenTex = newTex;
    }

    // Enable portal hover/click after the hero has settled
    enableInteraction() { this._interactable = true; }

    // cheap box bevel: shift corner verts inward
    _bevelBox(geo, amount) {
        const pos = geo.attributes.position;
        const v = new THREE.Vector3();
        for (let i = 0; i < pos.count; i++) {
            v.fromBufferAttribute(pos, i);
            // find if this vertex is near a corner on x/z
            const ax = Math.abs(Math.abs(v.x) - 1.31);
            const ay = Math.abs(Math.abs(v.y) - 0.76);
            // only bevel the front/back face edges softly
            // (kept minimal — full chamfer needs a geometry lib)
        }
        geo.computeVertexNormals();
    }

    _flatten(geo, axis, factor) {
        // no-op placeholder; cylinder already flat
        geo.computeVertexNormals();
    }

    _onResize() {
        const w = window.innerWidth;
        const h = window.innerHeight;
        this.renderer.setSize(w, h, false);
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
    }

    _onPointer(e) {
        const x = (e.clientX / window.innerWidth) * 2 - 1;
        const y = (e.clientY / window.innerHeight) * 2 - 1;
        this._pointer.x = x;
        this._pointer.y = y;
        this._targetRot.y = x * 0.18;
        this._targetRot.x = -y * 0.08;

        // hover detection for the vAI tower (only after hero reveals)
        if (this.portalMeshes && this.tower && this._interactable) {
            this._raycaster.setFromCamera(this._pointer, this.camera);
            const hits = this._raycaster.intersectObjects(this.portalMeshes, false);
            const hovering = hits.length > 0;
            this._setHover(hovering, e.clientX, e.clientY);
        }
    }

    _setHover(on, mx, my) {
        if (on === this._hovering) {
            if (on && this._tooltip) {
                this._tooltip.style.left = mx + 'px';
                this._tooltip.style.top = my + 'px';
            }
            return;
        }
        this._hovering = on;
        document.body.style.cursor = on ? 'pointer' : '';
        if (on) {
            if (!this._tooltip) {
                this._tooltip = document.createElement('div');
                this._tooltip.className = 'portal-tip';
                this._tooltip.innerHTML = '<span class="portal-tip__mark">vAI</span><span class="portal-tip__label">AI · Research</span><span class="portal-tip__arrow">↗</span>';
                document.body.appendChild(this._tooltip);
            }
            this._tooltip.style.left = mx + 'px';
            this._tooltip.style.top = my + 'px';
            this._tooltip.classList.add('is-visible');
        } else if (this._tooltip) {
            this._tooltip.classList.remove('is-visible');
        }
    }

    _onClick() {
        if (this._hovering && this.tower) {
            const link = this.tower.userData.link;
            // brief flash before navigating
            if (this.tower.userData.vaiMat) {
                this.tower.userData.vaiMat.opacity = 1.6;
                setTimeout(() => {
                    if (this.tower.userData.vaiMat) this.tower.userData.vaiMat.opacity = 1;
                }, 120);
            }
            window.open(link, '_blank', 'noopener,noreferrer');
        }
    }

    // returns the screen-space rect (in CSS pixels) of the screen mesh
    getScreenRect() {
        // ensure world matrices are up to date
        this.computer.updateMatrixWorld(true);
        this.screenMesh.updateMatrixWorld(true);

        // local corners of the screen plane geometry (PlaneGeometry 2.42 x 1.34)
        const corners = [
            new THREE.Vector3(-1.21, 0.67, 0),
            new THREE.Vector3(1.21, -0.67, 0),
        ];
        const m = this.screenMesh.matrixWorld;
        const a = corners[0].clone().applyMatrix4(m);
        const b = corners[1].clone().applyMatrix4(m);
        a.project(this.camera);
        b.project(this.camera);
        const w = window.innerWidth;
        const h = window.innerHeight;
        const ax = (a.x * 0.5 + 0.5) * w;
        const ay = (-a.y * 0.5 + 0.5) * h;
        const bx = (b.x * 0.5 + 0.5) * w;
        const by = (-b.y * 0.5 + 0.5) * h;
        const left = Math.min(ax, bx);
        const top = Math.min(ay, by);
        const width = Math.abs(bx - ax);
        const height = Math.abs(by - ay);
        return { left, top, width, height, cx: (ax + bx) / 2, cy: (ay + by) / 2 };
    }

    _animate() {
        requestAnimationFrame(this._animate);
        const t = this._clock.getElapsedTime();

        // gentle idle — only when computer is visible / settled
        if (this.computer) {
            // smooth pointer parallax
            this.computer.rotation.y += (this._targetRot.y - this.computer.rotation.y) * 0.04;
            this.computer.rotation.x += (this._targetRot.x - this.computer.rotation.x) * 0.04;
            // subtle float
            this.computer.position.y = -0.35 + Math.sin(t * 0.6) * 0.015;
        }

        // vAI tower: idle breathing glow + hover pulse
        if (this.tower) {
            const base = 0.55 + Math.sin(t * 1.6) * 0.12;
            const target = this._hovering ? 1.8 + Math.sin(t * 6) * 0.3 : base;
            if (this.tower.userData.innerLight) {
                this.tower.userData.innerLight.intensity +=
                    (target - this.tower.userData.innerLight.intensity) * 0.12;
            }
            if (this.tower.userData.vaiMat) {
                const opTarget = this._hovering ? 1.4 : 1;
                this.tower.userData.vaiMat.opacity +=
                    (opTarget - this.tower.userData.vaiMat.opacity) * 0.12;
            }
            if (this.tower.userData.edgeLines && this.tower.userData.edgeLines.material) {
                const edgeTarget = this._hovering ? 0.9 : 0.35;
                this.tower.userData.edgeLines.material.opacity +=
                    (edgeTarget - this.tower.userData.edgeLines.material.opacity) * 0.12;
            }
        }

        this.renderer.render(this.scene, this.camera);
    }

    dispose() {
        window.removeEventListener('resize', this._onResize);
        window.removeEventListener('pointermove', this._onPointer);
        this.renderer.dispose();
    }
}
