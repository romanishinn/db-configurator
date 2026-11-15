/* ---------- 3D view: polish ----------
 * A sky gradient and a plaster texture for the house wall. The lawn, the fence and the tile joints belong to the scene itself. It only touches objects the scene already has (scene, renderer, M) and does nothing at all if one of
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

    /* sky: top -> horizon (no fog: the pergola keeps its exact colours at any distance) */
    const SKY = { d: ['#a9c8e2', '#e2eaf0'], n: ['#0c131c', '#223040'] };
    const cache = {};
    const sky = (night) => cache[night ? 'n' : 'd'] || (cache[night ? 'n' : 'd'] = tex(2, 512, (g, w, h) => { const s = SKY[night ? 'n' : 'd'], gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, s[0]); gr.addColorStop(0.62, s[1]); gr.addColorStop(1, s[1]); g.fillStyle = gr; g.fillRect(0, 0, w, h); }));
    let cur = scene.background;
    const convert = (v) => {
      if (v && v.isColor) { const night = (v.r + v.g + v.b) / 3 < 0.25; return sky(night); }      // day / night sky
      return v;                                                          // a customer's photo behind the model stays as it is
    };
    Object.defineProperty(scene, 'background', { configurable: true, get() { return cur; }, set(v) { cur = convert(v); } });
    scene.background = cur;

    if (typeof M !== 'undefined') {
      /* house wall: plaster */
      if (M.wall) { M.wall.map = tex(256, 256, (g, w, h) => noise(g, w, h, 10, '#f6f6f4'), [10, 4]); M.wall.needsUpdate = true; }
      if (M.parapet) { M.parapet.map = M.wall && M.wall.map; M.parapet.needsUpdate = true; }
    }
  } catch (e) { /* the polish is optional */ }
})();
