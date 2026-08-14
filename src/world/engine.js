import * as THREE from 'three';

/** Shared so the control label and the actual sun agree on the current phase. */
export function phaseLabel(timeT) {
  const up = -Math.cos(timeT * Math.PI * 2.0);
  if (up > 0.2) return 'Day';
  if (up < -0.08) return 'Night';
  return timeT < 0.5 ? 'Dawn' : 'Dusk';
}

/**
 * Build the Tiny Planet world inside `container` and return an imperative handle.
 * Sizes to the container (not the window) and frees everything on dispose().
 */
export function createWorld(container, opts = {}) {
  let curvature = opts.curvature ?? 0.0016;
  let camDist = opts.cameraDistance ?? 12;
  let camYaw = 0.0, camPitch = 0.4;
  let timeT = opts.timeOfDay ?? 0.5;
  const reduceMotion = (opts.reducedMotion != null) ? opts.reducedMotion
    : (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  let autoWander = false, wanderT = 0, bobPhase = 0, bobAmt = 0;
  const WORLD_R = 178, MOVE_SPEED = 14, PATH_HW = 1.7;
  const player = new THREE.Vector3(0, 0, 0);
  const keys = { f:false, b:false, l:false, r:false };
  const materials = [], clouds = [];
  let scene, camera, renderer, clock, avatar, avatarShadow, sky, pathSamples = [];
  let rafId = 0, disposed = false, resizeObserver = null;
  const SUN = new THREE.Vector3(0.45, 0.6, 0.5).normalize();
  const ss = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

  let P;
  const curHorizon = new THREE.Color(), curZenith = new THREE.Color(), curSunCol = new THREE.Color();
  const curLight = new THREE.Color(), curAmbient = new THREE.Color(), curTint = new THREE.Color();
  const sunDir = new THREE.Vector3();

  const vert = `
    uniform vec3 uPlayer; uniform float uCurvature;
    varying vec3 vNormalW; varying vec3 vWorldPos; varying float vFogDepth; varying float vUp;
    void main(){
      vec4 wp = modelMatrix * vec4(position, 1.0);
      float d = distance(wp.xz, uPlayer.xz);
      wp.y -= d * d * uCurvature;
      vWorldPos = wp.xyz;
      vNormalW = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
      vUp = vNormalW.y;
      vec4 mv = viewMatrix * wp; vFogDepth = -mv.z;
      gl_Position = projectionMatrix * mv;
    }`;
  const fragLit = `
    precision highp float;
    uniform vec3 uColor, uLightDir, uLightColor, uAmbient, uFog; uniform float uFogNear, uFogFar;
    varying vec3 vNormalW; varying float vFogDepth; varying float vUp;
    void main(){
      vec3 N = normalize(vNormalW); float diff = max(dot(N, normalize(uLightDir)), 0.0);
      float light = smoothstep(0.12, 0.5, diff);
      vec3 col = uColor * (uAmbient * (0.78 + 0.22*vUp) + uLightColor * light);
      col = col / (1.0 + col * 0.6);
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col = clamp(mix(vec3(lum), col, 1.35), 0.0, 1.0);
      float f = clamp((vFogDepth - uFogNear)/(uFogFar - uFogNear), 0.0, 1.0);
      gl_FragColor = vec4(mix(col, uFog, f), 1.0);
    }`;
  const fragGround = `
    precision highp float;
    uniform vec3 uLightDir, uLightColor, uAmbient, uFog; uniform float uFogNear, uFogFar;
    varying vec3 vNormalW; varying vec3 vWorldPos; varying float vFogDepth; varying float vUp;
    void main(){
      vec3 N = normalize(vNormalW); float diff = max(dot(N, normalize(uLightDir)), 0.0);
      float light = smoothstep(0.12, 0.55, diff);
      float n = sin(vWorldPos.x*0.06)*sin(vWorldPos.z*0.06) + 0.5*sin(vWorldPos.x*0.13+1.3)*sin(vWorldPos.z*0.11-0.7);
      vec3 base = mix(vec3(0.49,0.71,0.39), vec3(0.60,0.80,0.47), clamp(n*0.5+0.5, 0.0, 1.0));
      vec3 col = base * (uAmbient * (0.85 + 0.15*vUp) + uLightColor * light);
      col = col / (1.0 + col * 0.6);
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col = clamp(mix(vec3(lum), col, 1.35), 0.0, 1.0);
      float f = clamp((vFogDepth - uFogNear)/(uFogFar - uFogNear), 0.0, 1.0);
      gl_FragColor = vec4(mix(col, uFog, f), 1.0);
    }`;
  const fragFlat = `
    precision highp float;
    uniform vec3 uColor; uniform float uAlpha; uniform vec3 uFog; uniform float uFogNear, uFogFar;
    varying float vFogDepth;
    void main(){
      float f = clamp((vFogDepth - uFogNear)/(uFogFar - uFogNear), 0.0, 1.0);
      gl_FragColor = vec4(mix(uColor, uFog, f), uAlpha);
    }`;
  const fragGlow = `
    precision highp float;
    uniform vec3 uDayColor, uNightColor, uFog; uniform float uGlow, uFogNear, uFogFar;
    varying float vFogDepth;
    void main(){
      vec3 c = mix(uDayColor, uNightColor, uGlow);
      float f = clamp((vFogDepth - uFogNear)/(uFogFar - uFogNear), 0.0, 1.0);
      gl_FragColor = vec4(mix(c, uFog, f), 1.0);
    }`;
  const vertPath = `
    uniform vec3 uPlayer; uniform float uCurvature;
    attribute float aEdge;
    varying vec3 vWorldPos; varying float vFogDepth; varying float vEdge;
    void main(){
      vec4 wp = modelMatrix * vec4(position, 1.0);
      float d = distance(wp.xz, uPlayer.xz);
      wp.y -= d * d * uCurvature;
      vWorldPos = wp.xyz; vEdge = aEdge;
      vec4 mv = viewMatrix * wp; vFogDepth = -mv.z;
      gl_Position = projectionMatrix * mv;
    }`;
  const fragPath = `
    precision highp float;
    uniform vec3 uTint, uFog; uniform float uFogNear, uFogFar;
    varying vec3 vWorldPos; varying float vFogDepth; varying float vEdge;
    void main(){
      float a = smoothstep(1.0, 0.72, abs(vEdge));
      float v = 0.5 + 0.5*sin(vWorldPos.x*0.35)*sin(vWorldPos.z*0.35);
      vec3 dirt = mix(vec3(0.60,0.48,0.33), vec3(0.70,0.57,0.40), v) * uTint;
      float f = clamp((vFogDepth - uFogNear)/(uFogFar - uFogNear), 0.0, 1.0);
      gl_FragColor = vec4(mix(dirt, uFog, f), a * 0.97);
    }`;
  const skyVert = `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
  const skyFrag = `
    precision highp float;
    uniform vec3 uHorizon, uZenith, uSun, uSunCol;
    varying vec3 vDir;
    void main(){
      vec3 d = normalize(vDir);
      vec3 col = mix(uHorizon, uZenith, pow(clamp(d.y*0.5+0.5, 0.0, 1.0), 0.9));
      float s = max(dot(d, normalize(uSun)), 0.0);
      col += uSunCol * pow(s, 300.0) * 1.3 + uSunCol * pow(s, 7.0) * 0.12;
      gl_FragColor = vec4(col, 1.0);
    }`;

  function common(){ return {
    uPlayer:{value:new THREE.Vector3()}, uCurvature:{value:curvature},
    uFog:{value:new THREE.Color('#cfe7e6')}, uFogNear:{value:60}, uFogFar:{value:270} }; }
  const litCache = {};
  function litMat(hex){
    if (litCache[hex]) return litCache[hex];
    const m = new THREE.ShaderMaterial({ vertexShader:vert, fragmentShader:fragLit, uniforms: Object.assign(common(), {
      uColor:{value:new THREE.Color(hex)}, uLightDir:{value:SUN.clone()}, uLightColor:{value:new THREE.Color(1,1,1)}, uAmbient:{value:new THREE.Color(0.4,0.45,0.5)} }) });
    litCache[hex] = m; materials.push(m); return m;
  }
  function groundMat(){
    const m = new THREE.ShaderMaterial({ vertexShader:vert, fragmentShader:fragGround, uniforms: Object.assign(common(), {
      uLightDir:{value:SUN.clone()}, uLightColor:{value:new THREE.Color(1,1,1)}, uAmbient:{value:new THREE.Color(0.4,0.45,0.5)} }) });
    materials.push(m); return m;
  }
  const flatCache = {};
  function flatMat(hex, alpha){
    const k = hex + '_' + alpha; if (flatCache[k]) return flatCache[k];
    const m = new THREE.ShaderMaterial({ vertexShader:vert, fragmentShader:fragFlat, transparent: alpha < 1.0, depthWrite: alpha >= 1.0,
      uniforms: Object.assign(common(), { uColor:{value:new THREE.Color(hex)}, uAlpha:{value:alpha} }) });
    flatCache[k] = m; materials.push(m); return m;
  }
  const glowCache = {};
  function glowMat(dayHex, nightHex){
    const k = dayHex + '_' + nightHex; if (glowCache[k]) return glowCache[k];
    const m = new THREE.ShaderMaterial({ vertexShader:vert, fragmentShader:fragGlow, uniforms: Object.assign(common(), {
      uDayColor:{value:new THREE.Color(dayHex)}, uNightColor:{value:new THREE.Color(nightHex)}, uGlow:{value:0} }) });
    glowCache[k] = m; materials.push(m); return m;
  }
  function pathMat(){
    const m = new THREE.ShaderMaterial({ vertexShader:vertPath, fragmentShader:fragPath, transparent:true, depthWrite:false, side:THREE.DoubleSide,
      uniforms: Object.assign(common(), { uTint:{value:new THREE.Color(1,1,1)} }) });
    materials.push(m); return m;
  }

  const rand = (a, b) => a + Math.random() * (b - a);
  function scatter(minR, maxR){ const a = Math.random()*Math.PI*2, r = Math.sqrt(rand(minR*minR, maxR*maxR)); return [Math.cos(a)*r, Math.sin(a)*r]; }
  function distToPath(x, z){ let m = 1e9; for (const p of pathSamples){ const dx = x-p.x, dz = z-p.z, d = dx*dx + dz*dz; if (d < m) m = d; } return Math.sqrt(m); }
  function addShadow(x, z, r){ const g = new THREE.CircleGeometry(r, 16); g.rotateX(-Math.PI/2); const s = new THREE.Mesh(g, flatMat('#2a1f14', 0.22)); s.position.set(x, 0.02, z); scene.add(s); }
  function perpXZ(t){ const v = new THREE.Vector3(t.z, 0, -t.x); return v.normalize(); }

  function treeBroad(){
    const g = new THREE.Group();
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.28, 1.5, 8), litMat('#8a674a')); tr.position.y = 0.75; g.add(tr);
    const fc = ['#4f9a48','#5aa84f','#46913f'][(Math.random()*3)|0];
    const b1 = new THREE.Mesh(new THREE.IcosahedronGeometry(1.3, 1), litMat(fc)); b1.position.y = 2.25; b1.rotation.set(Math.random(), Math.random(), Math.random()); g.add(b1);
    const b2 = new THREE.Mesh(new THREE.IcosahedronGeometry(1.0, 1), litMat(fc)); b2.position.set(0.75, 2.7, 0.25); g.add(b2);
    const b3 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.95, 1), litMat(fc)); b3.position.set(-0.65, 2.6, -0.3); g.add(b3);
    const b4 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 1), litMat(fc)); b4.position.set(0.1, 3.15, -0.5); g.add(b4);
    return g;
  }
  function treePine(){
    const g = new THREE.Group();
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.26, 1.2, 8), litMat('#7a5a3e')); tr.position.y = 0.6; g.add(tr);
    const c1 = new THREE.Mesh(new THREE.ConeGeometry(1.3, 1.8, 10), litMat('#3f7d3a')); c1.position.y = 1.8; g.add(c1);
    const c2 = new THREE.Mesh(new THREE.ConeGeometry(1.0, 1.5, 10), litMat('#458a40')); c2.position.y = 2.7; g.add(c2);
    const c3 = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.2, 10), litMat('#4d9647')); c3.position.y = 3.5; g.add(c3);
    return g;
  }
  function house(){
    const g = new THREE.Group();
    const wc = ['#e8b4a0','#ecd49b','#a9cbe3','#cdb4e0','#e6c0b0'][(Math.random()*5)|0];
    const rc = ['#6b4a3a','#8a5a42','#5f6e46'][(Math.random()*3)|0];
    const w = rand(2.2, 2.8), dp = rand(2.0, 2.6), hh = rand(1.8, 2.4);
    const base = new THREE.Mesh(new THREE.BoxGeometry(w, hh, dp), litMat(wc)); base.position.y = hh/2; g.add(base);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(w+0.06, 0.22, dp+0.06), litMat('#6a5138')); trim.position.y = 0.11; g.add(trim);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, dp)*0.72, 1.3, 4), litMat(rc)); roof.position.y = hh + 0.55; roof.rotation.y = Math.PI/4; g.add(roof);
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.1), litMat('#5a3a2a')); door.position.set(0, 0.45, dp/2+0.02); g.add(door);
    const winFrame = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.58, 0.06), litMat('#6a5138')); winFrame.position.set(w/2-0.55, hh*0.6, dp/2+0.01); g.add(winFrame);
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.08), glowMat('#bfe6ef', '#ffdf8a')); win.position.set(w/2-0.55, hh*0.6, dp/2+0.03); g.add(win);
    const winFrame2 = winFrame.clone(); winFrame2.position.set(-(w/2-0.55), hh*0.6, dp/2+0.01); g.add(winFrame2);
    const win2 = win.clone(); win2.position.set(-(w/2-0.55), hh*0.6, dp/2+0.03); g.add(win2);
    const chim = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.7, 0.3), litMat('#8a6a5a')); chim.position.set(w/2-0.5, hh+0.7, -(dp/2-0.5)); g.add(chim);
    return { group: g, foot: Math.max(w, dp)*0.85 };
  }
  function torii(){
    const g = new THREE.Group(); const red = '#d94b3a';
    const p1 = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 4, 10), litMat(red)); p1.position.set(-1.4, 2, 0); g.add(p1);
    const p2 = p1.clone(); p2.position.x = 1.4; g.add(p2);
    const top = new THREE.Mesh(new THREE.BoxGeometry(4.3, 0.35, 0.5), litMat(red)); top.position.y = 4.1; g.add(top);
    const tie = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.25, 0.4), litMat(red)); tie.position.y = 3.4; g.add(tie);
    return g;
  }
  function mailbox(){
    const g = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.0, 8), litMat('#6a4f3a')); post.position.y = 0.5; g.add(post);
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.3), litMat('#cf4636')); box.position.y = 1.1; g.add(box);
    return g;
  }
  function lamp(){
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.6, 8), litMat('#3a3f44')); pole.position.y = 1.3; g.add(pole);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), glowMat('#7a7252', '#ffe6a0')); glow.position.y = 2.65; g.add(glow);
    return g;
  }
  function pond(x, z){
    const wg = new THREE.CircleGeometry(rand(3, 4.5), 28); wg.rotateX(-Math.PI/2);
    const w = new THREE.Mesh(wg, flatMat('#5aa6c8', 0.6)); w.position.set(x, 0.06, z); scene.add(w);
    for (let i = 0; i < 4; i++){ const lg = new THREE.CircleGeometry(0.35, 10); lg.rotateX(-Math.PI/2);
      const lp = new THREE.Mesh(lg, litMat('#5fae57')); const a = Math.random()*6.28, r = rand(0.5, 2.2);
      lp.position.set(x + Math.cos(a)*r, 0.08, z + Math.sin(a)*r); scene.add(lp); }
  }
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92 });
  function makeCloud(x, y, z){
    const g = new THREE.Group();
    for (let i = 0; i < 4; i++){ const p = new THREE.Mesh(new THREE.IcosahedronGeometry(rand(2, 3.4), 0), cloudMat);
      p.position.set(rand(-3, 3), rand(-0.6, 0.6), rand(-2, 2)); p.scale.y = 0.6; g.add(p); }
    g.position.set(x, y, z); scene.add(g); clouds.push(g);
  }
  function buildPathMesh(curve){
    const N = 240, pos = [], edge = [], idx = [];
    for (let i = 0; i <= N; i++){
      const t = i / N, p = curve.getPoint(t), tan = curve.getTangent(t); tan.y = 0; tan.normalize();
      const pp = perpXZ(tan);
      pos.push(p.x + pp.x*PATH_HW, 0.04, p.z + pp.z*PATH_HW,  p.x - pp.x*PATH_HW, 0.04, p.z - pp.z*PATH_HW);
      edge.push(-1, 1);
    }
    for (let i = 0; i < N; i++){ const a = i*2, b = i*2+1, c = i*2+2, d = i*2+3; idx.push(a, b, d, a, d, c); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aEdge', new THREE.Float32BufferAttribute(edge, 1));
    g.setIndex(idx);
    return new THREE.Mesh(g, pathMat());
  }

  function init(){
    P = {
      horizon: { d:new THREE.Color('#cfe7e6'), t:new THREE.Color('#f3c89a'), n:new THREE.Color('#16223c') },
      zenith:  { d:new THREE.Color('#6ea7d6'), t:new THREE.Color('#8a6f9e'), n:new THREE.Color('#0a1024') },
      sunCol:  { d:new THREE.Color('#fff2cf'), t:new THREE.Color('#ffb060'), n:new THREE.Color('#9fb0cf') },
      light:   { d:new THREE.Color(0.97,0.93,0.82), t:new THREE.Color(0.95,0.55,0.30), n:new THREE.Color(0.10,0.13,0.22) },
      ambient: { d:new THREE.Color(0.45,0.48,0.46), t:new THREE.Color(0.32,0.27,0.30), n:new THREE.Color(0.11,0.13,0.20) }
    };
    scene = new THREE.Scene(); clock = new THREE.Clock();
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    camera = new THREE.PerspectiveCamera(55, 1, 0.1, 2000);
    size();
    const skyMat = new THREE.ShaderMaterial({ vertexShader: skyVert, fragmentShader: skyFrag, side: THREE.BackSide, depthWrite: false,
      uniforms: { uHorizon:{value:new THREE.Color('#cfe7e6')}, uZenith:{value:new THREE.Color('#6ea7d6')}, uSun:{value:SUN.clone()}, uSunCol:{value:new THREE.Color('#fff2cf')} } });
    sky = new THREE.Mesh(new THREE.SphereGeometry(1200, 32, 16), skyMat); sky.renderOrder = -1; scene.add(sky);

    const gg = new THREE.PlaneGeometry(720, 720, 200, 200); gg.rotateX(-Math.PI/2);
    scene.add(new THREE.Mesh(gg, groundMat()));

    const cpts = [[-130,-60],[-85,-78],[-48,-42],[-18,-58],[12,-26],[26,16],[-6,46],[-36,66],[-14,96],[36,112],[80,98],[122,124]]
      .map(c => new THREE.Vector3(c[0], 0, c[1]));
    const curve = new THREE.CatmullRomCurve3(cpts, false, 'centripetal');
    for (let i = 0; i <= 120; i++) pathSamples.push(curve.getPoint(i/120));
    scene.add(buildPathMesh(curve));

    const nH = 11;
    for (let k = 0; k < nH; k++){
      const t = Math.min(0.97, Math.max(0.03, (k + 0.5)/nH + rand(-0.02, 0.02)));
      const p = curve.getPoint(t), tan = curve.getTangent(t); tan.y = 0; tan.normalize();
      const pp = perpXZ(tan), side = (k % 2) ? 1 : -1, off = PATH_HW + rand(2.2, 3.0);
      const hx = p.x + pp.x*off*side, hz = p.z + pp.z*off*side;
      const h = house(); h.group.position.set(hx, 0, hz);
      const dir = new THREE.Vector3(p.x - hx, 0, p.z - hz).normalize();
      h.group.rotation.y = Math.atan2(dir.x, dir.z);
      scene.add(h.group); addShadow(hx, hz, h.foot);
      if (k % 2 === 0){ const mb = mailbox(); const mx = hx + dir.x*(off - 1.0), mz = hz + dir.z*(off - 1.0);
        mb.position.set(mx, 0, mz); mb.rotation.y = Math.atan2(dir.x, dir.z); scene.add(mb); addShadow(mx, mz, 0.4); }
    }
    for (let s = 0; s < 7; s++){
      const t = (s + 0.5)/7, p = curve.getPoint(t), tan = curve.getTangent(t); tan.y = 0; tan.normalize();
      const pp = perpXZ(tan), side = (s % 2) ? 1 : -1;
      const lx = p.x + pp.x*(PATH_HW + 0.5)*side, lz = p.z + pp.z*(PATH_HW + 0.5)*side;
      const l = lamp(); l.position.set(lx, 0, lz); scene.add(l); addShadow(lx, lz, 0.5);
    }
    [0.06, 0.94].forEach(t => {
      const p = curve.getPoint(t), tan = curve.getTangent(t); tan.y = 0; tan.normalize();
      const g = torii(); g.position.set(p.x, 0, p.z); g.rotation.y = Math.atan2(tan.x, tan.z); scene.add(g); addShadow(p.x, p.z, 2.4);
    });
    let placed = 0, tries = 0;
    while (placed < 46 && tries < 3000){ tries++;
      const [x, z] = scatter(8, WORLD_R); if (distToPath(x, z) < 6) continue;
      const t = (Math.random() < 0.65) ? treeBroad() : treePine(); const sc = rand(0.8, 1.3);
      t.position.set(x, 0, z); t.rotation.y = Math.random()*6.28; t.scale.setScalar(sc);
      scene.add(t); addShadow(x, z, 1.5*sc); placed++;
    }
    pond(...scatter(26, 70)); pond(...scatter(30, 100));
    for (let i = 0; i < 34; i++){ const c = ['#e8643c','#f0c64a','#f4f4f4','#e86ca0'][(Math.random()*4)|0];
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), litMat(c)); const [x, z] = scatter(4, WORLD_R); f.position.set(x, 0.15, z); scene.add(f); }
    for (let i = 0; i < 10; i++){ const k = new THREE.Mesh(new THREE.IcosahedronGeometry(rand(0.4, 0.9), 0), litMat('#9aa3a0'));
      const [x, z] = scatter(8, WORLD_R); k.position.set(x, 0.2, z); k.rotation.y = Math.random()*6.28; scene.add(k); }
    for (let i = 0; i < 7; i++){ const [x, z] = scatter(20, 150); makeCloud(x, rand(34, 58), z); }

    avatar = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.42, 1.0, 10), litMat('#e8643c')); body.position.y = 0.7; avatar.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.36, 14, 10), litMat('#f0c9a8')); head.position.y = 1.45; avatar.add(head);
    const bag  = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.3), litMat('#c63f2c')); bag.position.set(0, 0.85, -0.38); avatar.add(bag);
    scene.add(avatar);
    const sg = new THREE.CircleGeometry(0.55, 16); sg.rotateX(-Math.PI/2);
    avatarShadow = new THREE.Mesh(sg, flatMat('#2a1f14', 0.26)); scene.add(avatarShadow);

    bindInput();
    setupResize();
    rafId = requestAnimationFrame(animate);
  }

  function size(){
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  function setupResize(){
    if (typeof ResizeObserver !== 'undefined'){
      resizeObserver = new ResizeObserver(() => size());
      resizeObserver.observe(container);
    } else {
      window.addEventListener('resize', size);
    }
  }

  const km = { KeyW:'f', ArrowUp:'f', KeyS:'b', ArrowDown:'b', KeyA:'l', ArrowLeft:'l', KeyD:'r', ArrowRight:'r' };
  let dragging = false, lx = 0, ly = 0;
  function onKeyDown(e){ if (km[e.code]){ keys[km[e.code]] = true; e.preventDefault(); } }
  function onKeyUp(e){ if (km[e.code]) keys[km[e.code]] = false; }
  function onPointerDown(e){ dragging = true; lx = e.clientX; ly = e.clientY; const d = renderer.domElement; if (d.setPointerCapture) d.setPointerCapture(e.pointerId); }
  function onPointerMove(e){ if (!dragging) return; camYaw -= (e.clientX - lx)*0.005; camPitch = Math.min(1.15, Math.max(0.08, camPitch + (e.clientY - ly)*0.004)); lx = e.clientX; ly = e.clientY; }
  function onPointerUp(){ dragging = false; }
  function bindInput(){
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    const d = renderer.domElement;
    d.addEventListener('pointerdown', onPointerDown);
    d.addEventListener('pointermove', onPointerMove);
    d.addEventListener('pointerup', onPointerUp);
    d.addEventListener('pointercancel', onPointerUp);
  }

  function blend(field, out, wN, wT, wD){ const a = P[field].n, b = P[field].t, c = P[field].d;
    out.setRGB(a.r*wN + b.r*wT + c.r*wD, a.g*wN + b.g*wT + c.g*wD, a.b*wN + b.b*wT + c.b*wD); }

  function animate(){
    if (disposed) return;
    rafId = requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);

    const ang = timeT * Math.PI * 2.0;
    sunDir.set(Math.sin(ang)*0.6, -Math.cos(ang), 0.32).normalize();
    const up = sunDir.y;
    let wD = ss(0.10, 0.40, up), wN = 1.0 - ss(-0.28, 0.06, up), wT = Math.max(0, 1.0 - wD - wN);
    const sum = wD + wN + wT || 1; wD /= sum; wN /= sum; wT /= sum;
    blend('horizon', curHorizon, wN, wT, wD); blend('zenith', curZenith, wN, wT, wD); blend('sunCol', curSunCol, wN, wT, wD);
    blend('light', curLight, wN, wT, wD); blend('ambient', curAmbient, wN, wT, wD);
    curTint.setRGB(Math.min(1, curAmbient.r + curLight.r*0.6), Math.min(1, curAmbient.g + curLight.g*0.6), Math.min(1, curAmbient.b + curLight.b*0.6));
    const glow = ss(0.15, -0.10, up);
    const su = sky.material.uniforms;
    su.uSun.value.copy(sunDir); su.uHorizon.value.copy(curHorizon); su.uZenith.value.copy(curZenith); su.uSunCol.value.copy(curSunCol);
    renderer.setClearColor(curHorizon, 1);

    let mx = 0, mz = 0;
    if (autoWander){ wanderT += dt; const h = wanderT*0.22 + Math.sin(wanderT*0.3)*0.9; mx = Math.sin(h); mz = Math.cos(h); }
    else {
      const fX = -Math.sin(camYaw), fZ = -Math.cos(camYaw), rX = Math.cos(camYaw), rZ = -Math.sin(camYaw);
      if (keys.f){ mx += fX; mz += fZ; } if (keys.b){ mx -= fX; mz -= fZ; }
      if (keys.r){ mx += rX; mz += rZ; } if (keys.l){ mx -= rX; mz -= rZ; }
    }
    const len = Math.hypot(mx, mz), moving = len > 1e-4;
    if (moving){ mx /= len; mz /= len;
      player.x += mx*MOVE_SPEED*dt; player.z += mz*MOVE_SPEED*dt;
      const pr = Math.hypot(player.x, player.z); if (pr > WORLD_R){ player.x *= WORLD_R/pr; player.z *= WORLD_R/pr; }
      avatar.rotation.y = Math.atan2(mx, mz);
    }
    avatar.position.set(player.x, 0, player.z);
    avatarShadow.position.set(player.x, 0.03, player.z);

    for (const m of materials){ const u = m.uniforms;
      u.uPlayer.value.set(player.x, 0, player.z); u.uCurvature.value = curvature;
      if (u.uFog) u.uFog.value.copy(curHorizon);
      if (u.uLightDir) u.uLightDir.value.copy(sunDir);
      if (u.uLightColor) u.uLightColor.value.copy(curLight);
      if (u.uAmbient) u.uAmbient.value.copy(curAmbient);
      if (u.uGlow) u.uGlow.value = glow;
      if (u.uTint) u.uTint.value.copy(curTint);
    }
    if (!reduceMotion) for (const c of clouds){ c.position.x += 1.2*dt; if (c.position.x > 200) c.position.x = -200; }

    bobAmt += (((moving && !reduceMotion) ? 1 : 0) - bobAmt) * Math.min(1, dt*8);
    if (moving) bobPhase += dt*8.2;
    const bobY = Math.sin(bobPhase)*0.08*bobAmt, bobS = Math.cos(bobPhase*0.5)*0.05*bobAmt;
    const cp = Math.cos(camPitch), sp = Math.sin(camPitch), tx = player.x, ty = 1.2, tz = player.z;
    camera.position.set(tx + Math.sin(camYaw)*cp*camDist, ty + sp*camDist, tz + Math.cos(camYaw)*cp*camDist);
    camera.position.y += bobY;
    camera.position.x += Math.cos(camYaw)*bobS; camera.position.z += -Math.sin(camYaw)*bobS;
    camera.lookAt(tx, ty, tz);
    sky.position.copy(camera.position);

    renderer.render(scene, camera);
  }

  function dispose(){
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(rafId);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('resize', size);
    if (resizeObserver){ resizeObserver.disconnect(); resizeObserver = null; }
    if (renderer){
      const d = renderer.domElement;
      d.removeEventListener('pointerdown', onPointerDown);
      d.removeEventListener('pointermove', onPointerMove);
      d.removeEventListener('pointerup', onPointerUp);
      d.removeEventListener('pointercancel', onPointerUp);
    }
    if (scene){
      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        const mat = obj.material;
        if (Array.isArray(mat)) mat.forEach((m) => m && m.dispose());
        else if (mat) mat.dispose();
      });
    }
    if (renderer){
      renderer.dispose();
      const el = renderer.domElement;
      if (el && el.parentNode) el.parentNode.removeChild(el);
    }
  }

  const handle = {
    setCurvature(v){ curvature = v; },
    setTimeOfDay(v){ timeT = v; },
    setCameraDistance(v){ camDist = v; },
    setAutoWander(on){ autoWander = on; wanderT = 0; },
    press(dir, down){ if (dir === 'f' || dir === 'b' || dir === 'l' || dir === 'r') keys[dir] = down; },
    dispose,
  };
  init();
  return handle;
}
