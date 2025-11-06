// effects.js
// All effects operate on a p5.Image in-place using loadPixels() / updatePixels().
// Call: VideoEffects.apply(img, 'effectName', { ...params });

(function () {
  // ---------- helpers ----------
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function idx(x, y, w) { return 4 * (y * w + x); }
  function setPix(dst, w, x, y, r, g, b, a) {
    const i = idx(x, y, w);
    dst[i] = r; dst[i + 1] = g; dst[i + 2] = b; dst[i + 3] = a;
  }

  // ---------- 1) Threshold ----------
  function threshold(img, { t = 128 } = {}) {
    img.loadPixels();
    const p = img.pixels;
    for (let i = 0; i < p.length; i += 4) {
      const v = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
      const b = v >= t ? 255 : 0;
      p[i] = p[i + 1] = p[i + 2] = b;
    }
    img.updatePixels();
  }

  // ---------- 2) Posterize ----------
  function posterize(img, { levels = 4 } = {}) {
    levels = Math.max(2, Math.floor(levels));
    const step = 255 / (levels - 1);
    img.loadPixels();
    const p = img.pixels;
    for (let i = 0; i < p.length; i += 4) {
      p[i]     = Math.round(p[i]     / step) * step;
      p[i + 1] = Math.round(p[i + 1] / step) * step;
      p[i + 2] = Math.round(p[i + 2] / step) * step;
    }
    img.updatePixels();
  }

  // ---------- 3) Sobel Edge Detect (full-frame coverage, safe borders) ----------
  function sobel(img, { edge = 1.0 } = {}) {
    const w = img.width, h = img.height;

    img.loadPixels();
    const src = new Uint8ClampedArray(img.pixels);
    const gray = new Float32Array(w * h);

    const I = (x, y) => 4 * (y * w + x);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = I(x, y);
        gray[y * w + x] = 0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2];
      }
    }

    const gxK = [-1,0,1, -2,0,2, -1,0,1];
    const gyK = [-1,-2,-1, 0,0,0, 1,2,1];

    const out = img.pixels;

    // Fill borders with original luminance so we don't leave gutters
    for (let x = 0; x < w; x++) {
      const iTop = I(x, 0), iBot = I(x, h - 1);
      const vTop = gray[x], vBot = gray[(h - 1) * w + x];
      out[iTop] = out[iTop + 1] = out[iTop + 2] = vTop;   out[iTop + 3] = src[iTop + 3];
      out[iBot] = out[iBot + 1] = out[iBot + 2] = vBot;   out[iBot + 3] = src[iBot + 3];
    }
    for (let y = 0; y < h; y++) {
      const iL = I(0, y), iR = I(w - 1, y);
      const vL = gray[y * w], vR = gray[y * w + (w - 1)];
      out[iL] = out[iL + 1] = out[iL + 2] = vL;           out[iL + 3] = src[iL + 3];
      out[iR] = out[iR + 1] = out[iR + 2] = vR;           out[iR + 3] = src[iR + 3];
    }

    // Interior: proper Sobel
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        let gx = 0, gy = 0, k = 0;
        for (let j = -1; j <= 1; j++) {
          for (let i = -1; i <= 1; i++) {
            const v = gray[(y + j) * w + (x + i)];
            gx += v * gxK[k]; gy += v * gyK[k]; k++;
          }
        }
        const mag = Math.max(0, Math.min(255, Math.sqrt(gx * gx + gy * gy) * edge));
        const o = I(x, y);
        out[o] = out[o + 1] = out[o + 2] = mag;
        out[o + 3] = src[o + 3];
      }
    }

    img.updatePixels();
  }

  // ---------- 4) Pixelate (covers full frame; handles partial tiles at edges) ----------
  function pixelate(img, { size = 8 } = {}) {
    size = Math.max(1, Math.floor(size));
    const w = img.width, h = img.height;
    img.loadPixels();
    const p = img.pixels;

    for (let by = 0; by < h; by += size) {
      for (let bx = 0; bx < w; bx += size) {
        const i0 = idx(bx, by, w);
        const r = p[i0], g = p[i0 + 1], b = p[i0 + 2], a = p[i0 + 3];

        const maxY = Math.min(h, by + size);
        const maxX = Math.min(w, bx + size);
        for (let y = by; y < maxY; y++) {
          for (let x = bx; x < maxX; x++) {
            setPix(p, w, x, y, r, g, b, a);
          }
        }
      }
    }
    img.updatePixels();
  }

  // ---------- 5) Compound Eyes (full-frame tiling + seeded per-cell jitter) ----------
  // Params: { cols=6, rows=6, offset=4, jitter=1.5, lens=0.18, seed=1 }
  function compoundEyes(
    img,
    { cols = 6, rows = 6, offset = 4, jitter = 1.5, lens = 0.18, seed = 1 } = {}
  ) {
    const w = img.width, h = img.height;
    img.loadPixels();
    const src = new Uint8ClampedArray(img.pixels);
    const dst = img.pixels;

    const cw = Math.max(1, Math.floor(w / cols));
    const ch = Math.max(1, Math.floor(h / rows));
    const cx0 = w * 0.5, cy0 = h * 0.5;

    // seeded RNG (LCG)
    let s = (seed >>> 0) || 1;
    const rnd = () => (s = (1664525 * s + 1013904223) >>> 0, s / 0xffffffff);

    const I = (x, y) => 4 * (y * w + x);
    const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, v | 0));

    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        const x0 = gx * cw;
        const y0 = gy * ch;
        const x1 = (gx === cols - 1) ? w : x0 + cw;
        const y1 = (gy === rows - 1) ? h : y0 + ch;

        const cfx = (x0 + x1) >> 1;
        const cfy = (y0 + y1) >> 1;

        const dx0 = cfx - cx0, dy0 = cfy - cy0;
        const dist = Math.hypot(dx0, dy0) || 1;
        const nx = dx0 / dist, ny = dy0 / dist;

        // seeded, per-cell jitter (stable)
        const jx = (rnd() * 2 - 1) * jitter;
        const jy = (rnd() * 2 - 1) * jitter;

        const offX = nx * offset + jx;
        const offY = ny * offset + jy;

        for (let y = y0; y < y1; y++) {
          const ry = (y - cfy) / (ch * 0.5);
          for (let x = x0; x < x1; x++) {
            const rx = (x - cfx) / (cw * 0.5);
            const r2 = rx * rx + ry * ry;
            const lensScale = 1.0 - lens * r2;

            const sx = clampInt(Math.round(cfx + (x - cfx) * lensScale + offX), 0, w - 1);
            const sy = clampInt(Math.round(cfy + (y - cfy) * lensScale + offY), 0, h - 1);

            const si = I(sx, sy);
            const di = I(x, y);
            dst[di]     = src[si];
            dst[di + 1] = src[si + 1];
            dst[di + 2] = src[si + 2];
            dst[di + 3] = src[si + 3];
          }
        }
      }
    }

    img.updatePixels();
  }

  // ---------- 6) Video Grid (NEW) ----------
  // Tiles the full source frame into rows×cols tiles that cover the whole frame.
  // Params: { cols=3, rows=3 }
  function videoGrid(img, { cols = 3, rows = 3 } = {}) {
    cols = Math.max(1, Math.floor(cols));
    rows = Math.max(1, Math.floor(rows));

    const w = img.width, h = img.height;
    img.loadPixels();
    const src = new Uint8ClampedArray(img.pixels);
    const dst = img.pixels;

    const I = (x, y) => 4 * (y * w + x);
    const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, v | 0));

    // Base cell sizes; last row/col absorb remainder to cover full frame
    const baseCW = Math.floor(w / cols);
    const baseCH = Math.floor(h / rows);

    let y0 = 0;
    for (let gy = 0; gy < rows; gy++) {
      const y1 = (gy === rows - 1) ? h : y0 + baseCH;
      const tileH = y1 - y0;

      let x0 = 0;
      for (let gx = 0; gx < cols; gx++) {
        const x1 = (gx === cols - 1) ? w : x0 + baseCW;
        const tileW = x1 - x0;

        // Copy this tile by sampling the full source with linear mapping
        for (let y = y0; y < y1; y++) {
          const v = (y - y0) / (tileH - 1 || 1);                      // 0..1
          const sy = clampInt(Math.round(v * (h - 1)), 0, h - 1);

          for (let x = x0; x < x1; x++) {
            const u = (x - x0) / (tileW - 1 || 1);                    // 0..1
            const sx = clampInt(Math.round(u * (w - 1)), 0, w - 1);

            const si = I(sx, sy);
            const di = I(x, y);
            dst[di]     = src[si];
            dst[di + 1] = src[si + 1];
            dst[di + 2] = src[si + 2];
            dst[di + 3] = src[si + 3];
          }
        }

        x0 = x1;
      }
      y0 = y1;
    }

    img.updatePixels();
  }

  // ---------- registry & API ----------
  const registry = {
    threshold,
    posterize,
    sobel,
    pixelate,
    compoundEyes,
    videoGrid,       // NEW
  };

  function apply(img, name, params = {}) {
    const fx = registry[name];
    if (!fx) return;
    fx(img, params);
  }

  window.VideoEffects = { apply, registry };
})();
