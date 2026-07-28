// Pieza 3D de la portada.
//
// El objeto no se saca extruyendo el SVG del icono (eso daba una chapa plana
// con bisel: de perfil se veía que no era un cuerpo). Aquí se modela un MOLAR
// con anatomía de verdad, para que aguante el giro de 360º y el primer plano.
//
// Qué lleva, y por qué cada cosa:
//   · Cuatro cúspides de tamaños DISTINTOS en sus posiciones reales
//     (mesiovestibular la más alta, distolingual la más baja). Cuatro bultos
//     iguales es lo que delata a un diente de dibujo.
//   · Surco de desarrollo entre cúspides y fosa central hundida.
//   · Ecuador del esmalte: la corona abomba en el tercio medio y se estrecha
//     en el cuello, como una corona real.
//   · Dos raíces aplanadas y con canaladura longitudinal (no conos lisos),
//     separadas y curvadas.
//   · Micro-relieve: perikymata (las líneas finísimas del esmalte), poro y
//     una pizca de asimetría. Sin esto la superficie se lee como plástico.
//   · Color por vértice: esmalte casi blanco en las cúspides, marfil en el
//     tercio medio, dentina ámbar en el cuello y raíz más oscura.
//   · Material con transmisión: el esmalte es TRANSLÚCIDO, no blanco opaco.
//
// Para el resto de especialidades se sigue extruyendo el SVG, pero con
// profundidad y bisel generosos para que también tenga cuerpo.

import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';

// --- Utilidades ------------------------------------------------------------

// Catmull-Rom sobre una tabla (v, valor). Con smoothstep por tramos la
// pendiente salta en cada nudo y se ven anillos facetados en la corona.
function perfil(tabla, v) {
  const n = tabla.length;
  let i = 0;
  while (i < n - 2 && v > tabla[i + 1][0]) i++;
  const p0 = tabla[Math.max(0, i - 1)][1], p1 = tabla[i][1];
  const p2 = tabla[i + 1][1], p3 = tabla[Math.min(n - 1, i + 2)][1];
  const t = Math.min(1, Math.max(0, (v - tabla[i][0]) / (tabla[i + 1][0] - tabla[i][0] || 1)));
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t
    + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
    + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

// Radio de una superelipse |x/a|^n + |z/b|^n = 1 en función del ángulo.
function superelipse(th, a, b, n) {
  const c = Math.abs(Math.cos(th)), s = Math.abs(Math.sin(th));
  return 1 / Math.pow(Math.pow(c / a, n) + Math.pow(s / b, n), 1 / n);
}

// Diferencia angular mínima (para las campanas de las cúspides).
function dAng(a, b) {
  const d = Math.abs(a - b) % (Math.PI * 2);
  return d > Math.PI ? Math.PI * 2 - d : d;
}

// Ruido de valor 3D, barato pero suficiente para romper la simetría perfecta.
function hash3(x, y, z) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
function ruido(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const lerp = (a, b, t) => a + (b - a) * t;
  const c = (i, j, k) => hash3(xi + i, yi + j, zi + k);
  return lerp(
    lerp(lerp(c(0,0,0), c(1,0,0), u), lerp(c(0,1,0), c(1,1,0), u), v),
    lerp(lerp(c(0,0,1), c(1,0,1), u), lerp(c(0,1,1), c(1,1,1), u), v), w);
}
function fbm(x, y, z) {
  return ruido(x, y, z) * 0.6 + ruido(x * 2.1, y * 2.1, z * 2.1) * 0.3
       + ruido(x * 4.3, y * 4.3, z * 4.3) * 0.1;
}

// Cose anillos en triángulos, con UV y color por vértice.
function coser(anillos, seg, apiceArriba, apiceAbajo, tono) {
  const pos = [], uv = [], col = [], idx = [];
  const filas = anillos.length;
  anillos.forEach((anillo, r) => {
    const v = r / (filas - 1);
    anillo.forEach((p, s) => {
      pos.push(p.x, p.y, p.z);
      uv.push(s / seg, v);
      const c = tono(p); col.push(c[0], c[1], c[2]);
    });
  });
  for (let r = 0; r < filas - 1; r++) {
    for (let s = 0; s < seg; s++) {
      const s2 = (s + 1) % seg;
      const a = r * seg + s, b = r * seg + s2;
      const c = (r + 1) * seg + s, d = (r + 1) * seg + s2;
      idx.push(a, c, b, b, c, d);
    }
  }
  const punta = (p, v, invertir) => {
    const i = pos.length / 3;
    pos.push(p.x, p.y, p.z); uv.push(0.5, v);
    const c = tono(p); col.push(c[0], c[1], c[2]);
    const base = invertir ? 0 : (filas - 1) * seg;
    for (let s = 0; s < seg; s++) {
      if (invertir) idx.push(i, (s + 1) % seg, s);
      else idx.push(i, base + s, base + (s + 1) % seg);
    }
  };
  if (apiceAbajo) punta(apiceAbajo, 0, true);
  if (apiceArriba) punta(apiceArriba, 1, false);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// --- Anatomía del molar -----------------------------------------------------

// Perfil de la corona. El abombamiento del tercio medio (el "ecuador" del
// esmalte) es lo que separa una corona real de un cilindro redondeado.
const RADIO_CORONA = [
  [0.00, 0.345], [0.10, 0.385], [0.24, 0.445], [0.40, 0.492],
  [0.56, 0.506], [0.70, 0.500], [0.84, 0.476], [0.94, 0.440], [1.00, 0.406],
];
const ALTURA_CORONA = [
  [0.00, -0.26], [0.10, -0.17], [0.24, -0.03], [0.40, 0.17],
  [0.56, 0.42], [0.70, 0.66], [0.84, 0.85], [0.94, 0.95], [1.00, 1.00],
];

// Cúspides: [ángulo, altura relativa, anchura]. Alturas distintas a propósito.
const CUSPIDES = [
  [0.72, 1.00, 0.60],   // mesiovestibular — la más alta
  [2.42, 0.86, 0.56],   // distovestibular
  [3.86, 0.78, 0.52],   // distolingual — la más baja
  [5.56, 0.94, 0.58],   // mesiolingual
];
const H_CUSPIDE = 0.185;

// Campo de la cara oclusal. rn = 1 en el borde, 0 en el centro.
function relieveOclusal(rn, th) {
  let h = 0;
  for (const [ang, amp, sig] of CUSPIDES) {
    const d = dAng(th, ang);
    h += amp * Math.exp(-(d * d) / (2 * sig * sig));
  }
  // Las cúspides culminan un poco por dentro del borde, no en el borde mismo.
  const anillo = Math.exp(-Math.pow(rn - 0.86, 2) / (2 * 0.30 * 0.30));
  // Fosa central: el centro queda HUNDIDO respecto al reborde.
  const fosa = -0.085 * Math.exp(-(rn * rn) / (2 * 0.36 * 0.36));
  // Surco de desarrollo: cruza la cara oclusal de mesial a distal.
  const eje = Math.min(dAng(th, Math.PI / 2), dAng(th, -Math.PI / 2));
  const surco = -0.05 * Math.exp(-(eje * eje) / (2 * 0.30 * 0.30))
                     * Math.exp(-Math.pow(rn - 0.35, 2) / (2 * 0.40 * 0.40));
  return H_CUSPIDE * h * anillo + fosa + surco;
}

// Color por vértice: raíz -> cuello -> esmalte.
const TONOS = [
  [0.00, [0.836, 0.760, 0.622]],   // ápice de la raíz, ámbar apagado
  [0.30, [0.894, 0.833, 0.712]],
  [0.52, [0.945, 0.902, 0.808]],   // cuello: la dentina asoma
  [0.68, [0.968, 0.945, 0.890]],
  [0.86, [0.984, 0.973, 0.945]],
  [1.00, [0.995, 0.992, 0.985]],   // cúspides: esmalte casi blanco
];
function tonoPorAltura(y) {
  const t = Math.min(1, Math.max(0, (y + 1.32) / 2.40));
  for (let i = 0; i < TONOS.length - 1; i++) {
    if (t <= TONOS[i + 1][0]) {
      const [a, ca] = TONOS[i], [b, cb] = TONOS[i + 1];
      const k = (t - a) / (b - a || 1), s = k * k * (3 - 2 * k);
      return [ca[0] + (cb[0] - ca[0]) * s, ca[1] + (cb[1] - ca[1]) * s, ca[2] + (cb[2] - ca[2]) * s];
    }
  }
  return TONOS[TONOS.length - 1][1];
}

export function construirDiente() {
  const SEG = 176, FILAS = 130, CAP = 30;
  const A = 1.17, B = 0.895, N = 3.5;     // sección: más ancha que profunda
  const anillos = [];
  const tono = (p) => tonoPorAltura(p.y);

  // --- Pared de la corona
  for (let f = 0; f < FILAS; f++) {
    const v = f / (FILAS - 1);
    const r = perfil(RADIO_CORONA, v);
    const y = perfil(ALTURA_CORONA, v);
    const rampa = v < 0.62 ? 0 : Math.pow((v - 0.62) / 0.38, 1.35);
    const anillo = [];
    for (let s = 0; s < SEG; s++) {
      const th = (s / SEG) * Math.PI * 2;
      let rr = r * superelipse(th, A, B, N);
      // Asimetría: ningún diente real es simétrico.
      rr *= 1 + (fbm(Math.cos(th) * 2.6, v * 3.4, Math.sin(th) * 2.6) - 0.5) * 0.026;
      anillo.push(new THREE.Vector3(
        Math.cos(th) * rr, y + rampa * relieveOclusal(1, th), Math.sin(th) * rr));
    }
    anillos.push(anillo);
  }

  // --- Cara oclusal: se sigue tejiendo hacia el centro con el mismo campo, así
  // los surcos y la fosa salen de la propia superficie y no de un parche.
  const yTop = perfil(ALTURA_CORONA, 1);
  const rTop = perfil(RADIO_CORONA, 1);
  for (let c = 1; c <= CAP; c++) {
    const u = c / CAP, rn = 1 - u;
    const anillo = [];
    for (let s = 0; s < SEG; s++) {
      const th = (s / SEG) * Math.PI * 2;
      let rr = rTop * superelipse(th, A, B, N) * Math.pow(rn, 0.72);
      rr *= 1 + (fbm(Math.cos(th) * 3.1, 6 + u * 2, Math.sin(th) * 3.1) - 0.5) * 0.03;
      anillo.push(new THREE.Vector3(
        Math.cos(th) * rr, yTop + relieveOclusal(rn, th), Math.sin(th) * rr));
    }
    anillos.push(anillo);
  }
  const corona = coser(anillos, SEG,
    new THREE.Vector3(0, yTop + relieveOclusal(0, 0), 0),
    new THREE.Vector3(0, perfil(ALTURA_CORONA, 0) - 0.05, 0), tono);

  // --- Raíces: aplanadas y con canaladura longitudinal en la cara que mira a
  // la otra raíz. Un cono liso se lee como un pincho, no como una raíz.
  const raices = [];
  for (const lado of [-1, 1]) {
    const RS = 88, RF = 96, LARGO = 1.08, anillosR = [];
    const haciaDentro = lado > 0 ? Math.PI : 0;
    for (let f = 0; f < RF; f++) {
      const t = f / (RF - 1);
      const y = 0.10 - t * LARGO;
      const sep = lado * (0.125 + Math.pow(t, 1.5) * 0.175);
      const z = Math.sin(t * 1.25) * 0.045;
      const r = 0.255 * Math.pow(1 - t * 0.90, 1.02) + 0.035;
      const anillo = [];
      for (let s = 0; s < RS; s++) {
        const th = (s / RS) * Math.PI * 2;
        const canal = 1 - 0.30 * Math.exp(-Math.pow(dAng(th, haciaDentro), 2) / (2 * 0.52 * 0.52))
                          * (1 - Math.pow(t, 1.5));
        let rr = r * canal;
        rr *= 1 + (fbm(Math.cos(th) * 2.2, 20 + t * 5, Math.sin(th) * 2.2) - 0.5) * 0.05;
        anillo.push(new THREE.Vector3(sep + Math.cos(th) * rr, y, z + Math.sin(th) * rr * 0.80));
      }
      anillosR.push(anillo);
    }
    const ult = anillosR[anillosR.length - 1][0];
    raices.push(coser(anillosR, RS, null,
      new THREE.Vector3(lado * 0.30, 0.10 - LARGO - 0.05, ult.z), tono));
  }

  return [corona, ...raices];
}

// --- Material: esmalte ------------------------------------------------------

// Mapas procedurales. El normal lleva las perikymata y el poro del esmalte; el
// de rugosidad hace la corona pulida y la raíz mate (el esmalte brilla, el
// cemento radicular no).
function mapasEsmalte() {
  const S = 512;
  const alt = new Float32Array(S * S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S;
      alt[y * S + x] =
        Math.sin(v * 620) * 0.055 +                         // perikymata (casi imperceptibles)
        (fbm(u * 26, v * 26, 3) - 0.5) * 0.85 +             // poro del esmalte
        (fbm(u * 90, v * 90, 7) - 0.5) * 0.35;
    }
  }
  const nrm = document.createElement('canvas'); nrm.width = nrm.height = S;
  const nctx = nrm.getContext('2d');
  const nd = nctx.createImageData(S, S);
  const FUERZA = 2.4;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const l = alt[y * S + (x - 1 + S) % S], r = alt[y * S + (x + 1) % S];
      const d = alt[((y - 1 + S) % S) * S + x], t = alt[((y + 1) % S) * S + x];
      let nx = (l - r) * FUERZA, ny = (d - t) * FUERZA;
      const m = Math.hypot(nx, ny, 1); nx /= m; ny /= m;
      const i = (y * S + x) * 4;
      nd.data[i] = (nx * 0.5 + 0.5) * 255;
      nd.data[i + 1] = (ny * 0.5 + 0.5) * 255;
      nd.data[i + 2] = (1 / m * 0.5 + 0.5) * 255;
      nd.data[i + 3] = 255;
    }
  }
  nctx.putImageData(nd, 0, 0);

  const rug = document.createElement('canvas'); rug.width = rug.height = S;
  const rctx = rug.getContext('2d');
  const rd = rctx.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    // v=0 abajo (raíz, mate) -> v=1 arriba (esmalte, pulido)
    const v = y / S;
    const base = 0.62 - 0.44 * Math.min(1, Math.max(0, (v - 0.42) / 0.30));
    for (let x = 0; x < S; x++) {
      const g = Math.min(1, Math.max(0, base + (fbm(x / S * 30, v * 30, 11) - 0.5) * 0.14));
      const i = (y * S + x) * 4;
      rd.data[i] = 255; rd.data[i + 1] = g * 255; rd.data[i + 2] = 0; rd.data[i + 3] = 255;
    }
  }
  rctx.putImageData(rd, 0, 0);

  const tn = new THREE.CanvasTexture(nrm), tr = new THREE.CanvasTexture(rug);
  tn.wrapS = tn.wrapT = tr.wrapS = tr.wrapT = THREE.RepeatWrapping;
  tn.repeat.set(3, 2);
  tn.anisotropy = tr.anisotropy = 8;
  return { normalMap: tn, roughnessMap: tr };
}

// `transmision` a false donde la GPU vaya justa: el render de transmisión
// añade una pasada extra por fotograma.
export function materialEsmalte(transmision = true) {
  const { normalMap, roughnessMap } = mapasEsmalte();
  const m = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    color: 0xffffff,
    roughness: 0.22,
    roughnessMap,
    normalMap,
    normalScale: new THREE.Vector2(0.22, 0.22),
    metalness: 0.0,
    clearcoat: 1.0,
    clearcoatRoughness: 0.055,     // el esmalte va siempre húmedo
    envMapIntensity: 1.35,
    sheen: 0.35,
    sheenRoughness: 0.5,
    sheenColor: new THREE.Color(0xFFF3E2),
  });
  if (transmision) {
    // El esmalte es TRANSLÚCIDO: la luz entra y se tiñe en la dentina. Sin
    // esto el diente se lee como plástico blanco.
    m.transmission = 0.22;
    m.thickness = 1.15;
    m.ior = 1.63;                  // índice de refracción del esmalte
    m.attenuationDistance = 0.75;
    m.attenuationColor = new THREE.Color(0xF6E4C4);
  }
  return m;
}

// Raíz: opaca, mate y más ámbar. Comparte los mapas para que el poro case.
export function materialRaiz() {
  const { normalMap, roughnessMap } = mapasEsmalte();
  return new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    color: 0xF2E6CE,
    roughness: 0.62,
    roughnessMap,
    normalMap,
    normalScale: new THREE.Vector2(0.5, 0.5),
    metalness: 0.0,
    clearcoat: 0.18,
    clearcoatRoughness: 0.6,
    envMapIntensity: 0.85,
    sheen: 0.2,
    sheenColor: new THREE.Color(0xE8D4AE),
  });
}

// Mallas listas, con el material que le toca a cada parte. Es lo que usan las
// plantillas: así no tienen que saber qué índice es corona y cuál raíz.
export function construirMallas(esDental, svgTexto, transmision = true) {
  if (esDental) {
    const [corona, ...raices] = construirDiente();
    const mEsmalte = materialEsmalte(transmision), mRaiz = materialRaiz();
    return [new THREE.Mesh(corona, mEsmalte), ...raices.map((g) => new THREE.Mesh(g, mRaiz))];
  }
  const mat = materialEsmalte(false);
  mat.vertexColors = false;
  mat.color = new THREE.Color(0xF7F5F1);
  return construirDesdeSVG(svgTexto).map((g) => new THREE.Mesh(g, mat));
}

// --- Extrusión del SVG (resto de especialidades) ---------------------------

export function construirDesdeSVG(svgTexto) {
  const geos = [];
  new SVGLoader().parse(svgTexto).paths.forEach((path) => {
    path.subPaths.forEach((sub) => {
      const pts = sub.getPoints(72).map((p) => new THREE.Vector2(p.x, -p.y));
      if (pts.length < 3) return;
      if (pts[0].distanceTo(pts[pts.length - 1]) < 0.6) {
        const geo = new THREE.ExtrudeGeometry(new THREE.Shape(pts), {
          depth: 6.0, bevelEnabled: true, bevelThickness: 1.1,
          bevelSize: 0.85, bevelSegments: 6, curveSegments: 22,
        });
        geo.translate(0, 0, -3.0);
        geos.push(geo);
      } else {
        const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p.x, p.y, 0)));
        geos.push(new THREE.TubeGeometry(curve, Math.max(24, pts.length), 0.62, 16, false));
      }
    });
  });
  return geos;
}

// Devuelve las geometrías de la pieza que toca según la especialidad.
export function construirPieza(esDental, svgTexto) {
  const geos = esDental ? construirDiente() : construirDesdeSVG(svgTexto);
  return geos.length ? geos : construirDesdeSVG(svgTexto);
}
