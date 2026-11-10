/*
  The 3D take on the first-load intro (tv-boot.js loads this module and drives it; tv-boot.css holds .tv3d).

  A dark room lit by one warm lamp from above: a CRT TV with rabbit ears on a VHS deck, on a low wooden
  stand, with a few tapes beside it. Everything is built here from primitives, no model files. The TV's
  picture is a 2D canvas painted every frame (the deck's blue screen and the boot log from tv-boot.js's
  shared state S) and its light spills onto the room through an area light and a soft halo.

  Before the visitor turns the set on (tv-boot.js waits for a click, which also lets the sound play) it
  stands dark with its standby lamp lit. The way in: the camera flies into the glass until the picture fills
  the view and everything fades to black (zoom); tv-boot.js then hands the page over and unveil() lifts the
  black off it.
*/
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';

const FOV = 34;
const TAN = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

// the set, in metres; the floor is y = 0 and the TV faces +z
const TV_Y = 1.21, TV_W = 1.5, TV_H = 1.1, TV_D = 0.62, FRONT = TV_D / 2;
const SW = 1.0, SH = 0.75;                          // the glass, 4:3
const SC = new THREE.Vector3(-0.16, TV_Y + 0.04, FRONT + 0.027);   // the glass's centre, on its edges' plane
const BULGE = 0.03;
const LOOK = new THREE.Vector3(-0.05, 1.12, 0);
const DIR_START = new THREE.Vector3(-0.34, 0.2, 1).normalize();
const DIR_LOAD = new THREE.Vector3(-0.17, 0.1, 1).normalize();

export function createView(S, opts) {
    const q = opts.q;
    const small = matchMedia('(max-width: 720px)').matches;
    const rootCss = getComputedStyle(document.documentElement);
    const DISPLAY = rootCss.getPropertyValue('--display-font').trim() || 'monospace';
    const MONO = rootCss.getPropertyValue('--mono-font').trim() || 'monospace';
    const ACCENT = rootCss.getPropertyValue('--accent-color').trim() || '#66e8b7';

    // ---------- renderer ----------
    const host = document.createElement('div');
    host.className = 'tv3d';
    host.setAttribute('aria-hidden', 'true');
    const hint = document.createElement('div');
    hint.className = 'tv3d-hint';
    hint.innerHTML = '<span class="tv3d-hint-on">CLICK TO TURN ON</span><span class="tv3d-hint-ff">CLICK TO FAST-FORWARD</span>';
    const black = document.createElement('div');
    black.className = 'tv3d-black';

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2));
    renderer.setClearColor(0x050505, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.append(renderer.domElement, hint, black);
    document.body.appendChild(host);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x050505, 5.5, 13);
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.02, 40);

    const disposables = [];
    const keep = (x) => { disposables.push(x); return x; };
    const std = (color, roughness = 0.6, metalness = 0, extra = {}) =>
        keep(new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra }));
    const basic = (opts2) => keep(new THREE.MeshBasicMaterial(opts2));
    const mesh = (geo, mat, x = 0, y = 0, z = 0, parent = scene) => {
        const m = new THREE.Mesh(keep(geo), mat);
        m.position.set(x, y, z);
        parent.add(m);
        return m;
    };
    const canvasTex = (w, h, draw) => {
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        if (draw) draw(ctx, w, h);
        const tex = keep(new THREE.CanvasTexture(c));
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        return { c, ctx, tex };
    };
    const label = (text, w, h, x, y, z, { size = 0.62, color = '#8f8c84', font = MONO, spacing = 0.3 } = {}) => {
        const pxW = 512, pxH = Math.round(512 * h / w);
        const { tex } = canvasTex(pxW, pxH, (ctx) => {
            ctx.fillStyle = color;
            ctx.font = `600 ${Math.round(pxH * size)}px ${font}`;
            if ('letterSpacing' in ctx) ctx.letterSpacing = `${Math.round(pxH * size * spacing)}px`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, pxW / 2, pxH / 2);
        });
        return mesh(new THREE.PlaneGeometry(w, h), basic({ map: tex, transparent: true, depthWrite: false }), x, y, z);
    };

    // ---------- the room ----------
    const floor = mesh(new THREE.PlaneGeometry(30, 30), std(0x121110, 0.92), 0, 0, 0);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    const wall = mesh(new THREE.PlaneGeometry(30, 12), std(0x151413, 0.95), 0, 6, -1.75);
    wall.receiveShadow = true;

    const woodTex = canvasTex(512, 256, (ctx, w, h) => {
        ctx.fillStyle = '#3a281b';
        ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 90; i++) {
            const y = Math.random() * h;
            ctx.strokeStyle = `rgba(${Math.random() < 0.5 ? '20,12,6' : '90,62,40'},${0.15 + Math.random() * 0.25})`;
            ctx.lineWidth = 0.5 + Math.random() * 2;
            ctx.beginPath();
            ctx.moveTo(0, y);
            for (let x = 0; x <= w; x += 32) ctx.lineTo(x, y + Math.sin(x * 0.02 + i) * 3);
            ctx.stroke();
        }
    }).tex;
    const stand = mesh(new RoundedBoxGeometry(2.3, 0.5, 1.2, 3, 0.02), std(0xffffff, 0.62, 0, { map: woodTex }), 0, 0.25, -0.05);
    stand.castShadow = stand.receiveShadow = true;
    // the stand's dark recess under its top
    mesh(new THREE.PlaneGeometry(2.1, 0.3), std(0x070605, 0.9), 0, 0.22, 0.551);

    // ---------- the TV ----------
    const plastic = std(0x2c2b28, 0.48, 0.05);
    const plasticDark = std(0x161615, 0.5, 0.15);
    const body = mesh(new RoundedBoxGeometry(TV_W, TV_H, TV_D, 6, 0.08), plastic, 0, TV_Y, 0);
    body.castShadow = body.receiveShadow = true;

    const tubeGeo = new THREE.CylinderGeometry(0.42, 0.74, 0.5, 4, 1);
    tubeGeo.rotateY(Math.PI / 4);
    tubeGeo.rotateX(-Math.PI / 2);
    tubeGeo.scale(1.25, 0.95, 1);
    const tube = mesh(tubeGeo, plastic, 0, TV_Y - 0.03, -FRONT - 0.23);
    tube.castShadow = true;

    const bezel = mesh(new RoundedBoxGeometry(SW + 0.16, SH + 0.16, 0.05, 4, 0.05), std(0x0d0d0d, 0.32, 0.1), SC.x, SC.y, FRONT);
    bezel.receiveShadow = true;

    // the glass: a gently bulged plane whose edges stay on SC's plane
    const glassGeo = new THREE.PlaneGeometry(SW, SH, 32, 24);
    const gp = glassGeo.attributes.position;
    for (let i = 0; i < gp.count; i++) {
        const u = gp.getX(i) / (SW / 2), v = gp.getY(i) / (SH / 2);
        gp.setZ(i, BULGE * (1 - u * u) * (1 - v * v));
    }
    glassGeo.computeVertexNormals();

    const SCREEN_RES = small ? 0.75 : 1;
    const screenCv = canvasTex(Math.round(1024 * SCREEN_RES), Math.round(768 * SCREEN_RES));
    const screenMat = basic({ map: screenCv.tex, toneMapped: false });
    mesh(glassGeo, screenMat, SC.x, SC.y, SC.z);

    // scanlines, vignette and a reflection streak, laid on the glass
    const glassCv = canvasTex(1024, 768, (ctx, w, h) => {
        for (let y = 0; y < h; y += 4) { ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(0, y, w, 1.6); }
        const vg = ctx.createRadialGradient(w / 2, h / 2, h * 0.32, w / 2, h / 2, h * 0.78);
        vg.addColorStop(0, 'rgba(0,0,0,0)');
        vg.addColorStop(1, 'rgba(0,0,0,0.6)');
        ctx.fillStyle = vg;
        ctx.fillRect(0, 0, w, h);
        const rg = ctx.createLinearGradient(0, 0, w * 0.55, h * 0.75);
        rg.addColorStop(0, 'rgba(255,255,255,0.13)');
        rg.addColorStop(0.42, 'rgba(255,255,255,0.03)');
        rg.addColorStop(0.43, 'rgba(255,255,255,0)');
        ctx.fillStyle = rg;
        ctx.fillRect(0, 0, w, h);
    });
    const glassMat = basic({ map: glassCv.tex, transparent: true, depthWrite: false, toneMapped: false });
    const glassOverlay = mesh(glassGeo, glassMat, SC.x, SC.y, SC.z + 0.004);
    glassOverlay.renderOrder = 3;

    // the glow the picture throws: an area light on the room and a soft additive halo on the set
    RectAreaLightUniformsLib.init();
    const screenLight = new THREE.RectAreaLight(0x2f56e8, 0, SW, SH);
    screenLight.position.set(SC.x, SC.y, SC.z + 0.05);
    screenLight.lookAt(SC.x, SC.y, 5);
    scene.add(screenLight);
    const haloTex = canvasTex(256, 256, (ctx, w, h) => {
        const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
        g.addColorStop(0, 'rgba(255,255,255,0.55)');
        g.addColorStop(0.35, 'rgba(255,255,255,0.18)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
    }).tex;
    const haloMat = basic({ map: haloTex, color: 0x2f56e8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const halo = mesh(new THREE.PlaneGeometry(2.6, 2.1), haloMat, SC.x, SC.y, SC.z + 0.07);
    halo.renderOrder = 4;

    // the control panel
    const knobs = [];
    [[0.57, 0.28, 0.085], [0.57, 0.06, 0.06]].forEach(([x, y, r]) => {
        const g = new THREE.Group();
        g.position.set(x, TV_Y + y, FRONT + 0.03);
        scene.add(g);
        const k = mesh(new THREE.CylinderGeometry(r, r * 1.06, 0.06, 40), plasticDark, 0, 0, 0, g);
        k.rotation.x = Math.PI / 2;
        k.castShadow = true;
        mesh(new THREE.BoxGeometry(0.014, r * 0.7, 0.012), std(0xc9c5bb, 0.4), 0, r * 0.5, 0.031, g);
        g.rotation.z = 0.7;
        knobs.push(g);
    });
    for (let i = 0; i < 9; i++) mesh(new THREE.PlaneGeometry(0.2, 0.011), std(0x050505, 0.9), 0.57, TV_Y - 0.12 - i * 0.032, FRONT + 0.001);
    mesh(new THREE.BoxGeometry(0.075, 0.035, 0.025), plasticDark, 0.53, TV_Y - 0.44, FRONT + 0.012);
    const ledMat = std(0x220505, 0.3, 0, { emissive: new THREE.Color(0xff2a1a), emissiveIntensity: 0.6 });
    mesh(new THREE.SphereGeometry(0.011, 16, 12), ledMat, 0.625, TV_Y - 0.44, FRONT + 0.004);
    label('KA-90', 0.26, 0.045, -0.55, TV_Y - 0.475, FRONT + 0.001, { color: '#a7a49b' });
    label('COLOR · STEREO', 0.4, 0.04, 0.12, TV_Y - 0.475, FRONT + 0.001, { size: 0.5 });

    // rabbit ears
    const metal = std(0xc4c4c4, 0.28, 1);
    const earBase = mesh(new THREE.SphereGeometry(0.085, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), plasticDark, 0.2, TV_Y + TV_H / 2, -0.12);
    earBase.castShadow = true;
    [-1, 1].forEach((side) => {
        const g = new THREE.Group();
        g.position.set(0.2, TV_Y + TV_H / 2 + 0.06, -0.12);
        g.rotation.set(-0.22, 0, side * 0.55);
        scene.add(g);
        const rodGeo = new THREE.CylinderGeometry(0.0055, 0.007, 0.95, 10);
        rodGeo.translate(0, 0.475, 0);
        mesh(rodGeo, metal, 0, 0, 0, g).castShadow = true;
        mesh(new THREE.SphereGeometry(0.014, 12, 10), metal, 0, 0.95, 0, g);
    });

    // ---------- the VHS deck ----------
    const VCR_Y = 0.58, VCR_FRONT = 0.44;
    const vcr = mesh(new RoundedBoxGeometry(1.42, 0.16, 0.92, 3, 0.02), std(0x232220, 0.5, 0.1), 0, VCR_Y, -0.02);
    vcr.castShadow = vcr.receiveShadow = true;
    mesh(new THREE.PlaneGeometry(0.62, 0.05), std(0x020202, 0.9), -0.1, VCR_Y + 0.015, VCR_FRONT + 0.0005);
    const flap = mesh(new THREE.PlaneGeometry(0.58, 0.034), std(0x1c1b19, 0.45, 0.1), -0.1, VCR_Y + 0.015, VCR_FRONT + 0.001);
    const dispCv = canvasTex(256, 64);
    mesh(new THREE.PlaneGeometry(0.3, 0.075), basic({ map: dispCv.tex, toneMapped: false }), 0.36, VCR_Y + 0.005, VCR_FRONT + 0.001);
    [0.555, 0.61, 0.665].forEach((x) => mesh(new THREE.BoxGeometry(0.045, 0.022, 0.012), plasticDark, x, VCR_Y + 0.005, VCR_FRONT + 0.006));
    label('VIDEO DECK', 0.22, 0.04, -0.56, VCR_Y + 0.005, VCR_FRONT + 0.001, { size: 0.5 });

    // ---------- tapes ----------
    const tapeTop = (title, sub) => canvasTex(512, 284, (ctx, w, h) => {
        ctx.fillStyle = '#121212'; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#ece8dc'; ctx.fillRect(40, 26, w - 80, 92);
        ctx.fillStyle = '#1b1a18';
        ctx.font = `600 40px ${DISPLAY}`; ctx.textBaseline = 'middle';
        ctx.fillText(title, 62, 60);
        ctx.font = `500 22px ${MONO}`; ctx.fillStyle = '#0b7a55';
        ctx.fillText(sub, 62, 98);
        ctx.fillStyle = '#050505'; ctx.fillRect(130, 150, w - 260, 96);
        ctx.strokeStyle = '#3a3a3a'; ctx.lineWidth = 4; ctx.strokeRect(130, 150, w - 260, 96);
        [200, w - 200].forEach((x) => {
            ctx.beginPath(); ctx.arc(x, 198, 34, 0, Math.PI * 2); ctx.fillStyle = '#d9d4c7'; ctx.fill();
            ctx.beginPath(); ctx.arc(x, 198, 14, 0, Math.PI * 2); ctx.fillStyle = '#111'; ctx.fill();
        });
    }).tex;
    const tapeBody = std(0x101010, 0.45);
    const makeTape = (tex) => {
        const mats = [tapeBody, tapeBody, std(0xffffff, 0.5, 0, { map: tex }), tapeBody, tapeBody, tapeBody];
        const m = new THREE.Mesh(keep(new THREE.BoxGeometry(0.47, 0.03, 0.26)), mats);
        m.castShadow = true;
        scene.add(m);
        return m;
    };
    const cassette = makeTape(tapeTop('KHALED ALSYOUFI', 'PORTFOLIO · 2026 · SP'));
    cassette.position.set(-0.1, -1, 3);
    [['SHOWREEL', 'MOTION · SP'], ['BRANDING', 'IDENTITY · LP'], ['EDITORIAL', 'PRINT · SP']].forEach(([a, b], i) => {
        const t = makeTape(tapeTop(a, b));
        t.position.set(0.97, 0.515 + i * 0.031, 0.2);
        t.rotation.y = Math.PI / 2 + [-0.12, 0.05, -0.06][i];
    });

    // ---------- light ----------
    scene.add(new THREE.HemisphereLight(0x22324a, 0x080706, 0.4));
    const lamp = new THREE.SpotLight(0xffd6a0, 95, 0, 0.45, 0.8, 2);
    lamp.position.set(-1.5, 4.3, 2.1);
    lamp.target.position.set(0, 0.85, 0);
    lamp.castShadow = true;
    lamp.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
    lamp.shadow.bias = -0.0004;
    lamp.shadow.radius = 5;
    scene.add(lamp, lamp.target);
    const rim = new THREE.DirectionalLight(0x5a78ff, 0.45);
    rim.position.set(3, 2.6, -3);
    scene.add(rim);

    // dust in the lamp's cone
    const DUST = small ? 160 : 320;
    const dustPos = new Float32Array(DUST * 3), dustSeed = new Float32Array(DUST);
    for (let i = 0; i < DUST; i++) {
        dustPos[i * 3] = -2 + Math.random() * 3.4;
        dustPos[i * 3 + 1] = Math.random() * 3.6;
        dustPos[i * 3 + 2] = -0.8 + Math.random() * 3.4;
        dustSeed[i] = Math.random() * 100;
    }
    const dustGeo = keep(new THREE.BufferGeometry());
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    const dust = new THREE.Points(dustGeo, keep(new THREE.PointsMaterial({ color: 0xffe2bd, size: 0.011, transparent: true, opacity: 0.4, depthWrite: false })));
    scene.add(dust);

    // ---------- the picture ----------
    const noiseFrames = Array.from({ length: 4 }, () => {
        const c = document.createElement('canvas');
        c.width = 256; c.height = 192;
        const ctx = c.getContext('2d');
        const img = ctx.createImageData(256, 192);
        for (let i = 0; i < img.data.length; i += 4) {
            const v = Math.random() * 255;
            img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
            img.data[i + 3] = 255;
        }
        ctx.putImageData(img, 0, 0);
        return c;
    });

    const P = { phase: 'off', lineP: 0, noise: 0, on: false, cassette: 0, disp: '--:--' };
    const printed = [];   // { label, status, at }

    const sctx = screenCv.ctx;
    sctx.setTransform(SCREEN_RES, 0, 0, SCREEN_RES, 0, 0);
    const W = 1024, H = 768, PAD = 72;
    const chroma = (text, x, y, align = 'left') => {
        sctx.textAlign = align;
        sctx.fillStyle = 'rgba(255,40,90,0.55)'; sctx.fillText(text, x + 3, y);
        sctx.fillStyle = 'rgba(40,220,255,0.55)'; sctx.fillText(text, x - 3, y);
        sctx.fillStyle = '#eef3ff'; sctx.fillText(text, x, y);
    };
    const tri = (x, y, s, count) => {
        for (let i = 0; i < count; i++) {
            const ox = x + i * s * 0.85;
            [['rgba(255,40,90,0.55)', 3], ['rgba(40,220,255,0.55)', -3], ['#eef3ff', 0]].forEach(([c, d]) => {
                sctx.fillStyle = c;
                sctx.beginPath();
                sctx.moveTo(ox + d, y - s * 0.5); sctx.lineTo(ox + d + s * 0.8, y); sctx.lineTo(ox + d, y + s * 0.5);
                sctx.closePath(); sctx.fill();
            });
        }
    };
    const spacing = (px) => { if ('letterSpacing' in sctx) sctx.letterSpacing = `${px}px`; };

    function paintScreen(now) {
        sctx.globalAlpha = 1;
        if (P.phase === 'off' || P.phase === 'line') {
            const g = sctx.createRadialGradient(W / 2, H * 0.45, 40, W / 2, H / 2, W * 0.7);
            g.addColorStop(0, '#1b2320'); g.addColorStop(1, '#040505');
            sctx.fillStyle = g;
            sctx.fillRect(0, 0, W, H);
            if (P.phase === 'line') {
                const lw = W * P.lineP;
                sctx.shadowColor = ACCENT; sctx.shadowBlur = 40;
                sctx.fillStyle = '#f4fffb';
                sctx.fillRect(W / 2 - lw / 2, H / 2 - 4, lw, 8);
                sctx.shadowBlur = 0;
            }
            return;
        }
        if (P.phase === 'static') {
            sctx.imageSmoothingEnabled = false;
            sctx.drawImage(noiseFrames[Math.floor(now / 50) % 4], 0, 0, W, H);
            return;
        }
        // the deck's blue screen
        const bg = sctx.createRadialGradient(W / 2, H * 0.4, 60, W / 2, H / 2, W * 0.72);
        bg.addColorStop(0, '#2f56e8'); bg.addColorStop(0.6, '#1b37b8'); bg.addColorStop(1, '#0e1f73');
        sctx.fillStyle = bg;
        sctx.fillRect(0, 0, W, H);
        sctx.textBaseline = 'alphabetic';

        const blinkOff = S.done && Math.floor(now / 260) % 2;
        if (!blinkOff) {
            sctx.font = `56px ${DISPLAY}`; spacing(3);
            const word = S.ff ? 'FF' : 'PLAY';
            chroma(word, PAD, 112);
            tri(PAD + sctx.measureText(word).width + 26, 94, 34, S.ff ? 2 : 1);
        }
        sctx.font = `56px ${DISPLAY}`; spacing(3);
        chroma('CH 03', W - PAD, 112, 'right');

        sctx.font = `64px ${DISPLAY}`; spacing(2);
        chroma('KHALED ALSYOUFI', PAD, 206);
        sctx.font = `24px ${MONO}`; spacing(7);
        sctx.globalAlpha = 0.75;
        chroma('PORTFOLIO TAPE · SP', PAD, 248);
        sctx.globalAlpha = 1;

        sctx.font = `30px ${MONO}`; spacing(4);
        printed.forEach((p, i) => {
            const y = 318 + i * 42;
            const reveal = clamp01((now - p.at) / (180 * q()));
            sctx.save();
            sctx.beginPath(); sctx.rect(0, y - 34, PAD + (W - PAD * 2) * reveal, 46); sctx.clip();
            chroma(p.label, PAD, y);
            const statusW = sctx.measureText(p.status).width;
            const labelW = sctx.measureText(p.label).width;
            if (p.status !== 'OK') { sctx.fillStyle = '#ffd84a'; sctx.textAlign = 'right'; sctx.fillText(p.status, W - PAD, y); }
            else chroma(p.status, W - PAD, y, 'right');
            sctx.fillStyle = 'rgba(238,243,255,0.55)';
            for (let x = PAD + labelW + 22; x < W - PAD - statusW - 22; x += 12) sctx.fillRect(x, y - 6, 4, 4);
            sctx.restore();
        });

        sctx.font = `28px ${MONO}`; spacing(6);
        chroma('TRACKING', PAD, 572);
        chroma(String(Math.round(S.shown * 100)).padStart(3, '0') + '%', W - PAD, 572, 'right');
        const segs = 50, segW = (W - PAD * 2) / segs, lit = Math.round(S.shown * segs);
        for (let i = 0; i < segs; i++) {
            sctx.fillStyle = i < lit ? '#eef3ff' : 'rgba(238,243,255,0.2)';
            if (i < lit) { sctx.shadowColor = 'rgba(238,243,255,0.6)'; sctx.shadowBlur = 10; }
            sctx.fillRect(PAD + i * segW, 592, segW * 0.58, 36);
            sctx.shadowBlur = 0;
        }

        sctx.font = `46px ${DISPLAY}`; spacing(3);
        chroma(S.counter || '0:00:00', PAD, 700);
        chroma('SP', W - PAD, 700, 'right');
        spacing(0);

        // hum bar and a little snow
        const by = ((now / 3600) % 1) * H * 1.5 - H * 0.3;
        const band = sctx.createLinearGradient(0, by, 0, by + H * 0.28);
        band.addColorStop(0, 'rgba(255,255,255,0)'); band.addColorStop(0.5, 'rgba(255,255,255,0.08)'); band.addColorStop(1, 'rgba(255,255,255,0)');
        sctx.fillStyle = band;
        sctx.fillRect(0, by, W, H * 0.28);
        if (P.noise > 0.01) {
            sctx.globalAlpha = P.noise;
            sctx.imageSmoothingEnabled = false;
            sctx.drawImage(noiseFrames[Math.floor(now / 50) % 4], 0, 0, W, H);
            sctx.globalAlpha = 1;
        }
    }

    function paintDisplay(now) {
        const ctx = dispCv.ctx;
        ctx.fillStyle = '#040706';
        ctx.fillRect(0, 0, 256, 64);
        const on = P.cassette > 0.5;
        ctx.fillStyle = on ? ACCENT : 'rgba(102,232,183,0.14)';
        ctx.shadowColor = ACCENT; ctx.shadowBlur = on ? 12 : 0;
        ctx.beginPath(); ctx.moveTo(22, 20); ctx.lineTo(40, 32); ctx.lineTo(22, 44); ctx.fill();
        if (S.ff) { ctx.beginPath(); ctx.moveTo(40, 20); ctx.lineTo(58, 32); ctx.lineTo(40, 44); ctx.fill(); }
        ctx.font = `600 34px ${MONO}`;
        ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        const text = P.phase === 'play' ? (S.counter || '0:00:00').slice(-5) : P.disp;
        ctx.fillText(text, 236, 34);
        ctx.shadowBlur = 0;
        dispCv.tex.needsUpdate = true;
    }

    // ---------- tweens ----------
    const tweens = [];
    const tween = (obj, key, to, ms, ease = easeOut) => new Promise((resolve) => {
        tweens.push({ obj, key, from: obj[key], to, ms: Math.max(1, ms * q()), t0: performance.now(), ease, resolve });
    });
    const runTweens = (now) => {
        for (let i = tweens.length - 1; i >= 0; i--) {
            const tw = tweens[i];
            const t = clamp01((now - tw.t0) / tw.ms);
            tw.obj[tw.key] = tw.from + (tw.to - tw.from) * tw.ease(t);
            if (t >= 1) { tweens.splice(i, 1); tw.resolve(); }
        }
    };

    // ---------- camera ----------
    const camPos = new THREE.Vector3(), camLook = LOOK.clone();
    const mouse = { x: 0, y: 0, sx: 0, sy: 0 };
    const onMove = (e) => { mouse.x = (e.clientX / innerWidth) * 2 - 1; mouse.y = (e.clientY / innerHeight) * 2 - 1; };
    window.addEventListener('pointermove', onMove, { passive: true });
    const t0 = performance.now();
    let zoom = null;

    const viewport = () => ({ w: document.documentElement.clientWidth, h: window.innerHeight });
    function framing() {
        const { w, h } = viewport();
        const aspect = w / h;
        const d = Math.max(4.6, 1.75 / (TAN * aspect));
        return {
            start: LOOK.clone().addScaledVector(DIR_START, d * 1.32),
            load: LOOK.clone().addScaledVector(DIR_LOAD, d),
        };
    }
    // the largest viewport-shaped part of the glass: where the flight ends, it just fills the view
    function fillRect() {
        const { w, h } = viewport();
        const aspect = w / h;
        return aspect > SW / SH ? { w: SW, h: SW / aspect } : { w: SH * aspect, h: SH };
    }

    const resize = () => {
        const { w, h } = viewport();
        renderer.setSize(w, h, false);
        renderer.domElement.style.width = w + 'px';
        renderer.domElement.style.height = h + 'px';
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener('resize', resize);

    // ---------- the frame loop ----------
    const blue = new THREE.Color(0x2f56e8), white = new THREE.Color(0xdfe6ff), lightCol = new THREE.Color();
    let raf = 0, last = performance.now(), alive = true;
    function loop(now) {
        if (!alive) return;
        raf = requestAnimationFrame(loop);
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        runTweens(now);

        // camera: a slow push in while the tape loads, a little parallax, then the flight into the glass
        mouse.sx += (mouse.x - mouse.sx) * 0.04;
        mouse.sy += (mouse.y - mouse.sy) * 0.04;
        if (P.parked) {
            // the flight is over: hold where it ended until tv-boot.js takes the set away
        } else if (!zoom) {
            const f = framing();
            const p = easeOut(clamp01((now - t0) / (5200 * q())));
            camPos.lerpVectors(f.start, f.load, p);
            camPos.x += mouse.sx * 0.16;
            camPos.y -= mouse.sy * 0.08;
            camLook.copy(LOOK);
        } else {
            const t = clamp01((now - zoom.t0) / zoom.ms);
            const e = easeInOut(t);
            const r = fillRect();
            const end = SC.clone().add(new THREE.Vector3(0, 0, (r.h / 2) / TAN * 0.8));
            camPos.lerpVectors(zoom.from, end, e);
            camLook.lerpVectors(zoom.look, SC, Math.min(1, easeOut(t) * 1.25));
            // the picture breaks up as the glass comes close, then everything goes to black
            P.noise = 0.06 + 0.5 * clamp01((t - 0.45) / 0.45);
            black.style.opacity = easeInOut(clamp01((t - 0.55) / 0.42)).toFixed(3);
            if (t >= 1) {
                camPos.copy(end); camLook.copy(SC);
                const done = zoom.resolve;
                zoom = null;
                P.parked = true;
                camera.position.copy(camPos); camera.lookAt(camLook);
                renderer.render(scene, camera);
                done();
                return;
            }
        }
        camera.position.copy(camPos);
        camera.lookAt(camLook);
        camera.updateMatrixWorld();

        // the cassette: held up in front of the deck, then pushed into the slot
        if (P.cassette > 0 && P.cassette < 1) {
            const c = P.cassette;
            const a = easeInOut(clamp01(c / 0.6)), b = clamp01((c - 0.6) / 0.4);
            cassette.position.set(-0.1, THREE.MathUtils.lerp(0.95, VCR_Y + 0.015, a), THREE.MathUtils.lerp(1.5, VCR_FRONT + 0.15, a) - b * b * 0.6);
            cassette.rotation.set(THREE.MathUtils.lerp(0.5, 0, a), THREE.MathUtils.lerp(0.35, 0, a), 0);
            flap.rotation.x = -Math.sin(Math.PI * clamp01((c - 0.5) / 0.5)) * 1.3;
        } else if (P.cassette >= 1) {
            cassette.visible = false;
            flap.rotation.x = 0;
        }

        // the picture and the light it throws
        let level = 0;
        if (P.phase === 'line') { level = 0.35 * P.lineP; lightCol.copy(white); }
        else if (P.phase === 'static') { level = 0.75 + Math.random() * 0.3; lightCol.copy(white); }
        else if (P.phase === 'play') { level = 0.85 + Math.sin(now * 0.02) * 0.03 + Math.random() * 0.04; lightCol.copy(blue); }
        screenLight.color.copy(lightCol);
        screenLight.intensity = level * 9;
        haloMat.color.copy(lightCol);
        haloMat.opacity = level * 0.42;
        paintScreen(now);
        screenCv.tex.needsUpdate = true;
        paintDisplay(now);
        ledMat.emissive.set(P.on ? ACCENT : 0xff2a1a);
        ledMat.emissiveIntensity = P.on ? 2.2 : 0.6;
        knobs.forEach((k, i) => { k.rotation.z += ((P.on ? [-0.5, -1.4][i] : 0.7) - k.rotation.z) * 0.12; });

        for (let i = 0; i < DUST; i++) {
            dustPos[i * 3 + 1] += Math.sin(now * 0.0003 + dustSeed[i]) * 0.0006 - 0.0002;
            dustPos[i * 3] += Math.cos(now * 0.0002 + dustSeed[i]) * 0.0004;
            if (dustPos[i * 3 + 1] < 0) dustPos[i * 3 + 1] = 3.6;
        }
        dustGeo.attributes.position.needsUpdate = true;

        renderer.render(scene, camera);
        void dt;
    }

    // first frame, then fade the room up from black
    camPos.copy(framing().start);
    raf = requestAnimationFrame(loop);
    requestAnimationFrame(() => host.classList.add('is-in'));

    const wait = (ms) => new Promise((r) => setTimeout(r, ms * q()));
    return {
        // the set stands dark, its standby lamp lit, until the visitor turns it on
        gate() { host.classList.add('is-gate'); },
        started() { host.classList.remove('is-gate'); },
        async tapeIn() {
            P.disp = 'LOAD';
            P.cassette = 0.0001;
            await tween(P, 'cassette', 1, 1150, (t) => t);
            P.cassette = 1;
        },
        async powerOn() {
            P.on = true;
            P.phase = 'line';
            await tween(P, 'lineP', 1, 240);
            await wait(160);
            P.phase = 'static';
            await wait(380);
            P.phase = 'play';
            P.noise = 1;
            host.classList.add('is-play');
            tween(P, 'noise', 0.06, 520);
        },
        addLine(part) {
            printed.push({ label: part.label, status: part.status, at: performance.now() });
        },
        fastForward() { host.classList.add('is-ff'); },
        done() {},
        // flies into the glass; resolves once the view has gone to black
        zoom() {
            host.classList.add('is-zoom');
            return new Promise((resolve) => {
                zoom = { t0: performance.now(), ms: 2100 * q(), from: camPos.clone(), look: camLook.clone(), resolve };
            });
        },
        // the page is under the black now: drop the set and lift the black off it
        async unveil() {
            alive = false;
            cancelAnimationFrame(raf);
            renderer.domElement.style.visibility = 'hidden';
            black.style.transition = 'opacity 0.9s ease';
            black.style.opacity = '0';
            await new Promise((r) => setTimeout(r, 950));
        },
        dispose() {
            alive = false;
            cancelAnimationFrame(raf);
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('resize', resize);
            disposables.forEach((d) => d.dispose && d.dispose());
            renderer.dispose();
            renderer.forceContextLoss();
            host.remove();
        },
    };
}
