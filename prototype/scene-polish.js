/* ---------- 3D view: polish ----------
 * A sky gradient whose horizon melts into the ground (distance fog), and soft textures for the ground, the house wall and
 * the deck. It only touches objects the scene already has (scene, renderer, ground, M) and does nothing at all if one of
 * them is missing, so a change in the scene code can never break the page because of this file. Colours of the pergola are
 * NOT touched (no tone mapping, no tinted light): a RAL colour must look like its sample.
 * Inlined by build.sh before the backend script, i.e. after the scene has been built. */
(function () {
  try {
    if (typeof THREE === 'undefined' || typeof scene === 'undefined' || typeof renderer === 'undefined') return;
    const aniso = Math.min(8, renderer.capabilities && renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 1);
    const tex = (w, h, draw, rep, srgb) => {
      const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
      const t = new THREE.CanvasTexture(c); if (srgb !== false) t.encoding = THREE.sRGBEncoding;
      if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); }
      t.anisotropy = aniso; return t;
    };
    const noise = (g, w, h, amp, base) => {                       // fine grain around a light base: multiplied with the material colour
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      const d = g.getImageData(0, 0, w, h), a = d.data;
      for (let i = 0; i < a.length; i += 4) { const n = (Math.random() - 0.5) * amp; a[i] += n; a[i + 1] += n; a[i + 2] += n; }
      g.putImageData(d, 0, 0);
    };

    /* sky: top -> horizon; the ground is a disk whose edge fades out, so it melts into the sky without a line (no fog: the pergola keeps its exact colours at any distance) */
    const SKY = { d: ['#a9c8e2', '#e2eaf0'], n: ['#0c131c', '#223040'] };
    const cache = {};
    const sky = (night) => cache[night ? 'n' : 'd'] || (cache[night ? 'n' : 'd'] = tex(2, 512, (g, w, h) => { const s = SKY[night ? 'n' : 'd'], gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, s[0]); gr.addColorStop(0.62, s[1]); gr.addColorStop(1, s[1]); g.fillStyle = gr; g.fillRect(0, 0, w, h); }));
    let disk = null;                                                      // the ground disk (made below)
    let cur = scene.background;
    const convert = (v) => {
      if (v && v.isColor) { const night = (v.r + v.g + v.b) / 3 < 0.25; if (disk) disk.material.color.setHex(night ? 0x2b3029 : 0x646a5c); return sky(night); }      // day / night sky and ground
      return v;                                                          // a customer's photo behind the model stays as it is
    };
    Object.defineProperty(scene, 'background', { configurable: true, get() { return cur; }, set(v) { cur = convert(v); } });
    scene.background = cur;

    /* ground: a disk with a soft transparent edge instead of the flat 200 m plane */
    if (typeof ground !== 'undefined' && ground.material) {
      const fade = tex(256, 256, (g, w, h) => { const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); r.addColorStop(0, '#fff'); r.addColorStop(0.4, '#fff'); r.addColorStop(1, '#000'); g.fillStyle = r; g.fillRect(0, 0, w, h); }, null, false);
      disk = new THREE.Mesh(new THREE.CircleGeometry(70, 72), new THREE.MeshStandardMaterial({ color: 0x646a5c, roughness: 1, transparent: true, alphaMap: fade, depthWrite: false }));
      disk.rotation.x = -Math.PI / 2; disk.position.copy(ground.position); disk.receiveShadow = true; disk.renderOrder = -1;   // drawn first among the transparent parts (glass blends over it)
      scene.add(disk);
      // the disk follows the old plane: hidden with it, and hidden while the plane carries the shadow-only material of the customer's photo mode
      const orig = ground.material; let gv = ground.visible, gm = orig; const sync = () => { disk.visible = gv && gm === orig; };
      Object.defineProperty(ground, 'visible', { configurable: true, get() { return gv; }, set(x) { gv = x; sync(); } });
      Object.defineProperty(ground, 'material', { configurable: true, get() { return gm; }, set(m) { gm = m; sync(); } });
      sync();
      if (cur === cache.n) disk.material.color.setHex(0x2b3029);   // the page opened in the night view
      orig.visible = false;                                        // the old plane stays for picking, but is not drawn
    }
    if (typeof M !== 'undefined') {
      /* house wall: plaster */
      if (M.wall) { M.wall.map = tex(256, 256, (g, w, h) => noise(g, w, h, 10, '#f6f6f4'), [10, 4]); M.wall.needsUpdate = true; }
      if (M.parapet) { M.parapet.map = M.wall && M.wall.map; M.parapet.needsUpdate = true; }
      /* deck: boards 20 cm wide with fine gaps and a slight tone change from board to board */
      if (M.deck) {
        if (M.deck.color) M.deck.color.setHex(0x6c5b49);
        M.deck.map = tex(256, 256, (g, w, h) => {
          const n = 8, bh = h / n;
          for (let i = 0; i < n; i++) { const v = 238 + Math.round(Math.random() * 14); g.fillStyle = `rgb(${v},${v - 2},${v - 5})`; g.fillRect(0, i * bh, w, bh); g.fillStyle = 'rgba(70,55,40,.28)'; g.fillRect(0, i * bh, w, 2); }
          const d = g.getImageData(0, 0, w, h), a = d.data;
          for (let i = 0; i < a.length; i += 4) { const k = (Math.random() - 0.5) * 8; a[i] += k; a[i + 1] += k; a[i + 2] += k; }
          g.putImageData(d, 0, 0);
        }, [1, 3]);
        M.deck.needsUpdate = true;
      }
    }
  } catch (e) { /* the polish is optional */ }
})();
