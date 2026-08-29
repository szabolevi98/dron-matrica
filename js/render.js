import { BLOCKS, fontStack, MONO_STACK } from './layouts.js';
import { t, tIn } from './i18n.js';
import { contrast } from './validate.js';
import { qrContent, qrMatrix, qrPath } from './qr.js';

const NS = 'http://www.w3.org/2000/svg';
const XLINK = 'http://www.w3.org/1999/xlink';
const LINE = 1.28;
const GAP = 0.34;

let host = null;

function measureHost() {
  if (!host) {
    host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-20000px;top:0;width:900px;height:900px;opacity:0;pointer-events:none;';
    document.body.appendChild(host);
  }
  return host;
}

function el(name, attrs) {
  const node = document.createElementNS(NS, name);
  for (const k in attrs) {
    if (attrs[k] === null || attrs[k] === undefined) continue;
    node.setAttribute(k, attrs[k]);
  }
  return node;
}

function num(v) {
  return Math.round(v * 1000) / 1000;
}

function shapeNode(shape, x, y, w, h, radius, attrs) {
  if (shape === 'circle') {
    const r = Math.min(w, h) / 2;
    return el('circle', { cx: num(x + w / 2), cy: num(y + h / 2), r: num(r), ...attrs });
  }
  if (shape === 'ellipse') {
    return el('ellipse', { cx: num(x + w / 2), cy: num(y + h / 2), rx: num(w / 2), ry: num(h / 2), ...attrs });
  }
  const rx = shape === 'rect' ? 0 : Math.min(w, h) * (radius / 100);
  return el('rect', { x: num(x), y: num(y), width: num(w), height: num(h), rx: num(rx), ry: num(rx), ...attrs });
}

function faceText(block, style) {
  if (!block.face) return '';
  if (style.bilingual) {
    const hu = tIn('hu', block.face);
    const en = tIn('en', block.face);
    return hu === en ? hu : hu + ' / ' + en;
  }
  return t(block.face);
}

function rowsFor(typeCfg, d, style, media) {
  const out = [];
  for (const b of typeCfg.blocks) {
    if (!b.on) continue;
    const def = BLOCKS[b.id];
    if (!def) continue;
    if (def.role === 'rule') { out.push({ def, text: '', prefix: '' }); continue; }
    if (def.role === 'logo') {
      if (!media.logo) continue;
      out.push({ def, text: '', prefix: '' });
      continue;
    }
    const raw = def.face ? faceText(def, style) : (d[def.key] || '');
    if (!raw) continue;
    let prefix = '';
    if (def.prefix) prefix = def.prefix.startsWith('face.') ? t(def.prefix) : def.prefix;
    out.push({ def, text: raw, prefix });
  }
  return out;
}

export function renderSticker(typeId, state, d) {
  const cfg = state.types[typeId];
  const style = state.style;
  const media = state.media;
  const W = cfg.w;
  const H = cfg.h;
  const bw = style.border;

  const svg = el('svg', {
    xmlns: NS,
    width: W + 'mm',
    height: H + 'mm',
    viewBox: `0 0 ${num(W)} ${num(H)}`,
    'shape-rendering': 'geometricPrecision'
  });
  svg.setAttribute('xmlns:xlink', XLINK);

  const uid = 'c' + Math.random().toString(36).slice(2, 8);
  const defs = el('defs');
  const clip = el('clipPath', { id: uid });
  clip.appendChild(shapeNode(cfg.shape, 0, 0, W, H, cfg.radius, {}));
  defs.appendChild(clip);
  svg.appendChild(defs);

  const base = el('g', { 'clip-path': `url(#${uid})` });
  base.appendChild(shapeNode(cfg.shape, 0, 0, W, H, cfg.radius, { fill: style.bg }));

  if (media.bg) {
    const img = el('image', {
      x: 0, y: 0, width: num(W), height: num(H),
      preserveAspectRatio: 'xMidYMid slice',
      opacity: num(media.bgOpacity / 100)
    });
    img.setAttribute('href', media.bg);
    img.setAttributeNS(XLINK, 'xlink:href', media.bg);
    base.appendChild(img);
  }
  svg.appendChild(base);

  if (bw > 0) {
    svg.appendChild(shapeNode(cfg.shape, bw / 2, bw / 2, W - bw, H - bw, cfg.radius, {
      fill: 'none',
      stroke: style.borderColor,
      'stroke-width': num(bw)
    }));
  }

  const pad = style.padding + bw;
  let boxX = pad;
  let boxY = pad;
  let boxW = W - pad * 2;
  let boxH = H - pad * 2;

  if (cfg.shape === 'ellipse' || cfg.shape === 'circle') {
    const rw = (cfg.shape === 'circle' ? Math.min(W, H) : W) / Math.SQRT2;
    const rh = (cfg.shape === 'circle' ? Math.min(W, H) : H) / Math.SQRT2;
    boxW = rw - style.padding * 2;
    boxH = rh - style.padding * 2;
    boxX = (W - boxW) / 2;
    boxY = (H - boxH) / 2;
  }

  const info = { overflow: false, minFont: Infinity, qr: null, textFits: true };

  if (boxW <= 0 || boxH <= 0) return { svg, info };

  const content = el('g');
  svg.appendChild(content);

  let qr = null;
  if (cfg.qr) {
    const text = qrContent(state.qr.mode, d, state.qr.text);
    const m = qrMatrix(text, state.qr.ecl);
    if (m) {
      const only = state.qr.pos === 'only';
      const side = only
        ? Math.min(boxW, boxH)
        : Math.min(boxH, boxW * (state.qr.scale / 100));
      const quiet = side / (m.n + 4) * 2;
      const unit = (side - quiet * 2) / m.n;
      const qx = only
        ? boxX + (boxW - side) / 2
        : (state.qr.pos === 'left' ? boxX : boxX + boxW - side);
      const qy = boxY + (boxH - side) / 2;

      const light = contrast(style.bg, '#000000') >= 8;
      const plate = light ? null : '#ffffff';
      const dark = '#111111';

      const g = el('g');
      if (plate) {
        g.appendChild(el('rect', {
          x: num(qx), y: num(qy), width: num(side), height: num(side),
          rx: num(side * 0.06), fill: plate
        }));
      }
      g.appendChild(el('path', {
        d: qrPath(m, unit, qx + quiet, qy + quiet),
        fill: dark
      }));
      content.appendChild(g);

      qr = { side, x: qx, y: qy, unit, n: m.n, pos: state.qr.pos };
      info.qr = { n: m.n, module: unit, ecl: m.ecl };

      if (!only) {
        const gap = Math.max(0.7, side * 0.12);
        boxW = boxW - side - gap;
        if (state.qr.pos === 'left') boxX = boxX + side + gap;
      } else {
        boxW = 0;
      }
    }
  }

  if (boxW <= 1) return { svg, info, box: { boxX, boxY, boxW, boxH } };

  const rows = rowsFor(cfg, d, style, media);
  if (!rows.length) return { svg, info };

  const sumF = rows.reduce((s, r) => s + r.def.factor, 0);
  const denom = sumF * LINE + (rows.length - 1) * GAP;
  let unit = boxH / denom;
  unit *= style.fill / 100;

  const total = sumF * LINE * unit + (rows.length - 1) * GAP * unit;
  let y = boxY + (boxH - total) / 2;

  const anchor = style.align;
  const ax = anchor === 'start' ? boxX : anchor === 'end' ? boxX + boxW : boxX + boxW / 2;
  const baseStack = fontStack(style.font);

  const texts = [];

  for (const row of rows) {
    const def = row.def;
    const size = unit * def.factor;
    const rowH = size * LINE;

    if (def.role === 'rule') {
      const rw = boxW * (anchor === 'middle' ? 0.55 : 0.85);
      const rx0 = anchor === 'start' ? boxX : anchor === 'end' ? boxX + boxW - rw : boxX + (boxW - rw) / 2;
      content.appendChild(el('line', {
        x1: num(rx0), y1: num(y + rowH / 2), x2: num(rx0 + rw), y2: num(y + rowH / 2),
        stroke: style.accent, 'stroke-width': num(Math.max(0.12, unit * 0.06)), opacity: 0.55
      }));
      y += rowH + GAP * unit;
      continue;
    }

    if (def.role === 'logo') {
      const lh = rowH * (media.logoScale / 100) * 1.4;
      const lw = boxW * (media.logoScale / 100);
      const lx = anchor === 'start' ? boxX : anchor === 'end' ? boxX + boxW - lw : boxX + (boxW - lw) / 2;
      const img = el('image', {
        x: num(lx), y: num(y + (rowH - lh) / 2), width: num(lw), height: num(lh),
        preserveAspectRatio: `${anchor === 'start' ? 'xMinYMid' : anchor === 'end' ? 'xMaxYMid' : 'xMidYMid'} meet`
      });
      img.setAttribute('href', media.logo);
      img.setAttributeNS(XLINK, 'xlink:href', media.logo);
      content.appendChild(img);
      y += rowH + GAP * unit;
      continue;
    }

    const isLabel = def.role === 'label';
    const isMeta = def.role === 'meta';
    const fill = isLabel ? style.accent : style.fg;
    const family = def.mono && style.monoIds ? MONO_STACK : baseStack;
    let body = row.text;
    if (style.upper && isLabel) body = body.toLocaleUpperCase(state.lang === 'hu' ? 'hu-HU' : 'en-GB');

    const node = el('text', {
      x: num(ax),
      y: num(y + rowH / 2 + size * 0.35),
      'font-family': family,
      'font-size': num(size),
      'font-weight': isLabel ? 600 : def.role === 'value' ? 700 : 500,
      'text-anchor': anchor,
      fill,
      'letter-spacing': num(style.tracking / 100 + (isLabel ? size * 0.06 : 0)),
      opacity: isMeta ? 0.78 : 1
    });

    if (row.prefix) {
      const pre = el('tspan', { 'font-size': '68%', fill: style.accent, 'font-weight': 600 });
      pre.textContent = row.prefix + ' ';
      node.appendChild(pre);
      node.appendChild(document.createTextNode(body));
    } else {
      node.textContent = body;
    }

    content.appendChild(node);
    texts.push({ node, size, max: boxW });
    y += rowH + GAP * unit;
  }

  const h = measureHost();
  h.appendChild(svg);
  for (const item of texts) {
    let len = 0;
    try { len = item.node.getComputedTextLength(); } catch (e) { len = 0; }
    if (len > item.max && len > 0) {
      const next = Math.max(0.3, item.size * (item.max / len) * 0.995);
      item.node.setAttribute('font-size', num(next));
      const oldY = parseFloat(item.node.getAttribute('y'));
      item.node.setAttribute('y', num(oldY - (item.size - next) * 0.35));
      item.size = next;
      info.textFits = false;
    }
    info.minFont = Math.min(info.minFont, item.size);
  }
  h.removeChild(svg);

  if (!Number.isFinite(info.minFont)) info.minFont = 0;
  info.rows = rows.length;
  return { svg, info };
}

export function svgToString(svg) {
  const clone = svg.cloneNode(true);
  clone.setAttribute('xmlns', NS);
  clone.setAttribute('xmlns:xlink', XLINK);
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clone);
}
