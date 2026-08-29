import { t, setLang, applyI18n, lang } from './i18n.js';
import {
  BLOCKS, TYPE_IDS, typeMeta, defaultType, defaultBlocks,
  THEMES, FONTS, SIZE_PRESETS
} from './layouts.js';
import { derive, contrast, contrastLevel, mixOver } from './validate.js';
import { renderSticker } from './render.js';
import {
  exportPng, exportSvg, exportPdf, download, safeName,
  packSheets, perSheet, buildPrintDom, setPageSize
} from './export.js';
import {
  listProfiles, activeProfileId, saveProfile, deleteProfile,
  setActiveProfile, lastState, rememberState, encodeShare, decodeShare
} from './store.js';

const $ = id => document.getElementById(id);
const MM_PX = 96 / 25.4;

const SAMPLE = {
  operatorId: 'HUN87astt6ah1kj',
  regId: 'HA-DR1234',
  owner: 'Kovács János',
  phone: '30 123 4567',
  email: 'pilota@example.hu',
  text: 'Ha megtaláltad, kérlek hívj!',
  model: 'DJI Mini 4 Pro',
  serial: '1581F5FHD24CN0012',
  mtom: '249 g',
  cls: 'C0',
  batNo: '01',
  batCap: '2590 mAh'
};

function defaultState(demo) {
  const types = {};
  TYPE_IDS.forEach(id => { types[id] = defaultType(id); });
  return {
    v: 1,
    lang: 'hu',
    active: 'operator',
    data: {
      operatorId: demo ? SAMPLE.operatorId : '',
      regId: demo ? SAMPLE.regId : '',
      owner: demo ? SAMPLE.owner : '',
      dial: '+36',
      phone: demo ? SAMPLE.phone : '',
      email: demo ? SAMPLE.email : '',
      text: demo ? SAMPLE.text : '',
      model: demo ? SAMPLE.model : '',
      serial: demo ? SAMPLE.serial : '',
      mtom: demo ? SAMPLE.mtom : '',
      cls: demo ? SAMPLE.cls : '',
      url: '',
      batNo: demo ? SAMPLE.batNo : '',
      batCap: demo ? SAMPLE.batCap : '',
      batDate: ''
    },
    types,
    style: {
      theme: 'midnight',
      bg: '#0f172a', fg: '#ffffff', accent: '#38bdf8', borderColor: '#38bdf8',
      font: 'sans', fill: 92, tracking: 2, align: 'middle',
      upper: true, monoIds: true, bilingual: false,
      border: 0.35, padding: 2.2
    },
    qr: { mode: 'tel', text: '', ecl: 'M', pos: 'right', scale: 42 },
    media: { logo: null, logoScale: 60, bg: null, bgOpacity: 22 },
    print: {
      paper: 'A4', orientation: 'portrait', margin: 8, gap: 3,
      cut: true, outline: false, mirror: false,
      basket: [{ typeId: 'operator', count: 4 }, { typeId: 'reg', count: 4 }]
    },
    zoom: 340
  };
}

let state = defaultState(true);
let profileId = null;
let history = [];
let future = [];
let snapTimer = null;
let renderTimer = null;
let lastSvg = null;
let lastInfo = null;

function clone(o) { return JSON.parse(JSON.stringify(o)); }

function merge(target, src) {
  if (!src || typeof src !== 'object') return target;
  for (const k in src) {
    if (!(k in target)) { target[k] = src[k]; continue; }
    if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k]) && target[k] && typeof target[k] === 'object' && !Array.isArray(target[k])) {
      merge(target[k], src[k]);
    } else if (src[k] !== undefined) {
      target[k] = src[k];
    }
  }
  return target;
}

function adopt(raw) {
  const base = defaultState(false);
  const next = merge(base, raw || {});
  TYPE_IDS.forEach(id => {
    if (!next.types[id]) next.types[id] = defaultType(id);
    const known = defaultBlocks(id).map(b => b.id);
    const seen = new Set();
    next.types[id].blocks = (next.types[id].blocks || [])
      .filter(b => b && known.includes(b.id) && !seen.has(b.id) && seen.add(b.id))
      .map(b => ({ id: b.id, on: !!b.on }));
    known.forEach(bid => {
      if (!next.types[id].blocks.some(b => b.id === bid)) next.types[id].blocks.push({ id: bid, on: false });
    });
  });
  if (!TYPE_IDS.includes(next.active)) next.active = 'operator';
  next.print.basket = (next.print.basket || []).filter(b => TYPE_IDS.includes(b.typeId));
  return next;
}

function snapshot() {
  clearTimeout(snapTimer);
  snapTimer = setTimeout(() => {
    const json = JSON.stringify(state);
    if (history[history.length - 1] === json) return;
    history.push(json);
    if (history.length > 60) history.shift();
    future.length = 0;
    updateHistoryButtons();
  }, 350);
}

function updateHistoryButtons() {
  $('undoBtn').disabled = history.length < 2;
  $('redoBtn').disabled = future.length === 0;
}

function undo() {
  if (history.length < 2) return;
  future.push(history.pop());
  state = adopt(JSON.parse(history[history.length - 1]));
  syncAll();
  updateHistoryButtons();
}

function redo() {
  if (!future.length) return;
  const json = future.pop();
  history.push(json);
  state = adopt(JSON.parse(json));
  syncAll();
  updateHistoryButtons();
}

function toast(msg, kind) {
  const node = document.createElement('div');
  node.className = 'toast-msg' + (kind ? ' ' + kind : '');
  node.textContent = msg;
  $('toastStack').appendChild(node);
  setTimeout(() => node.remove(), 3200);
}

function typeName(id) { return t('type.' + id); }

function blockName(id) {
  const def = BLOCKS[id];
  if (!def) return id;
  if (def.i18n) return t(def.i18n);
  if (def.face) return t('blk.' + id);
  return id;
}

function buildTypeList() {
  const box = $('typeList');
  box.textContent = '';
  TYPE_IDS.forEach(id => {
    const cfg = state.types[id];
    const meta = typeMeta(id);
    const item = document.createElement('div');
    item.className = 'type-item' + (state.active === id ? ' active' : '');

    const body = document.createElement('div');
    body.className = 'ti-body';
    const name = document.createElement('span');
    name.className = 'ti-name';
    name.textContent = typeName(id);
    const dims = document.createElement('span');
    dims.className = 'ti-meta';
    dims.textContent = `${cfg.w} × ${cfg.h} mm`;
    body.appendChild(name);
    body.appendChild(dims);

    item.appendChild(body);

    if (meta.required) {
      const req = document.createElement('span');
      req.className = 'ti-req';
      req.textContent = t('type.required');
      item.appendChild(req);
    }

    const sw = document.createElement('label');
    sw.className = 'switch switch-bare';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = cfg.on;
    cb.addEventListener('click', e => e.stopPropagation());
    cb.addEventListener('change', () => {
      cfg.on = cb.checked;
      commit();
    });
    sw.appendChild(cb);
    sw.appendChild(document.createElement('span'));
    item.appendChild(sw);

    item.addEventListener('click', () => {
      state.active = id;
      commit();
    });
    box.appendChild(item);
  });
}

function buildStageTabs() {
  const box = $('stageTabs');
  box.textContent = '';
  TYPE_IDS.forEach(id => {
    const b = document.createElement('button');
    b.textContent = typeName(id);
    b.className = (state.active === id ? 'active' : '') + (state.types[id].on ? '' : ' off');
    b.addEventListener('click', () => { state.active = id; commit(); });
    box.appendChild(b);
  });
}

function buildSizePresets() {
  const box = $('sizePresets');
  box.textContent = '';
  const cfg = state.types[state.active];
  SIZE_PRESETS.forEach(p => {
    const c = document.createElement('button');
    c.className = 'chip' + (cfg.w === p.w && cfg.h === p.h ? ' active' : '');
    c.textContent = `${p.w}×${p.h}`;
    c.addEventListener('click', () => {
      cfg.w = p.w; cfg.h = p.h;
      commit();
    });
    box.appendChild(c);
  });
}

function buildTextPresets() {
  const box = $('textPresets');
  box.textContent = '';
  ['preset.found', 'preset.reward', 'preset.property', 'preset.noFly'].forEach(key => {
    const c = document.createElement('button');
    c.className = 'chip';
    c.textContent = t(key);
    c.addEventListener('click', () => {
      state.data.text = t(key);
      $('f-text').value = state.data.text;
      commit();
    });
    box.appendChild(c);
  });
}

function buildThemeGrid() {
  const box = $('themeGrid');
  box.textContent = '';
  THEMES.forEach(th => {
    const b = document.createElement('button');
    b.className = 'theme-swatch' + (state.style.theme === th.id ? ' active' : '');
    const face = document.createElement('span');
    face.className = 'sw-face';
    face.style.background = th.bg;
    face.style.color = th.accent;
    face.textContent = 'HUN';
    const nm = document.createElement('span');
    nm.className = 'sw-name';
    nm.textContent = th.name;
    b.appendChild(face);
    b.appendChild(nm);
    b.addEventListener('click', () => {
      Object.assign(state.style, {
        theme: th.id, bg: th.bg, fg: th.fg, accent: th.accent, borderColor: th.border
      });
      commit();
    });
    box.appendChild(b);
  });
}

function buildFontSelect() {
  const sel = $('d-font');
  sel.textContent = '';
  FONTS.forEach(f => {
    const o = document.createElement('option');
    o.value = f.id;
    o.textContent = f.name;
    o.style.fontFamily = f.stack;
    sel.appendChild(o);
  });
  sel.value = state.style.font;
}

function buildBlockList() {
  const box = $('blockList');
  box.textContent = '';
  const cfg = state.types[state.active];
  const d = derive(state.data, state.lang);

  cfg.blocks.forEach((b, i) => {
    const def = BLOCKS[b.id];
    if (!def) return;
    const row = document.createElement('div');
    row.className = 'block-item' + (b.on ? '' : ' off');

    const move = document.createElement('div');
    move.className = 'bi-move';
    const up = document.createElement('button');
    up.innerHTML = '<svg viewBox="0 0 10 10"><path d="M5 1l4 5H1z" fill="currentColor"/></svg>';
    up.disabled = i === 0;
    up.addEventListener('click', () => {
      const arr = cfg.blocks;
      [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
      commit();
    });
    const down = document.createElement('button');
    down.innerHTML = '<svg viewBox="0 0 10 10"><path d="M5 9L1 4h8z" fill="currentColor"/></svg>';
    down.disabled = i === cfg.blocks.length - 1;
    down.addEventListener('click', () => {
      const arr = cfg.blocks;
      [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]];
      commit();
    });
    move.appendChild(up);
    move.appendChild(down);
    row.appendChild(move);

    const name = document.createElement('span');
    name.className = 'bi-name';
    name.textContent = blockName(b.id);
    row.appendChild(name);

    const val = document.createElement('span');
    val.className = 'bi-val';
    val.textContent = def.key ? (d[def.key] || '—') : '';
    row.appendChild(val);

    const sw = document.createElement('label');
    sw.className = 'switch switch-bare';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = b.on;
    cb.addEventListener('change', () => { b.on = cb.checked; commit(); });
    sw.appendChild(cb);
    sw.appendChild(document.createElement('span'));
    row.appendChild(sw);

    box.appendChild(row);
  });
}

function buildBasket() {
  const box = $('basket');
  box.textContent = '';
  box.dataset.empty = t('p.empty');

  state.print.basket.forEach((item, i) => {
    const cfg = state.types[item.typeId];
    const row = document.createElement('div');
    row.className = 'basket-item';

    const sw = document.createElement('span');
    sw.className = 'bk-sw';
    sw.style.background = state.style.bg;
    sw.style.borderColor = state.style.accent;
    row.appendChild(sw);

    const name = document.createElement('span');
    name.className = 'bk-name';
    name.textContent = typeName(item.typeId);
    row.appendChild(name);

    const dim = document.createElement('span');
    dim.className = 'bk-dim';
    dim.textContent = `${cfg.w}×${cfg.h}`;
    row.appendChild(dim);

    const qty = document.createElement('input');
    qty.type = 'number';
    qty.className = 'form-control form-control-sm mono';
    qty.min = 1; qty.max = 300;
    qty.value = item.count;
    qty.addEventListener('change', () => {
      item.count = Math.max(1, Math.min(300, parseInt(qty.value, 10) || 1));
      commit();
    });
    row.appendChild(qty);

    const del = document.createElement('button');
    del.className = 'btn btn-icon';
    del.innerHTML = '<svg viewBox="0 0 16 16"><path d="M3.4 2.2 8 6.8l4.6-4.6 1.2 1.2L9.2 8l4.6 4.6-1.2 1.2L8 9.2l-4.6 4.6-1.2-1.2L6.8 8 2.2 3.4z" fill="currentColor"/></svg>';
    del.addEventListener('click', () => {
      state.print.basket.splice(i, 1);
      commit();
    });
    row.appendChild(del);

    box.appendChild(row);
  });

  const sel = $('basketType');
  const prev = sel.value;
  sel.textContent = '';
  TYPE_IDS.forEach(id => {
    const o = document.createElement('option');
    o.value = id;
    o.textContent = typeName(id);
    sel.appendChild(o);
  });
  sel.value = TYPE_IDS.includes(prev) ? prev : state.active;

  const total = state.print.basket.reduce((s, b) => s + b.count, 0);
  const packed = packSheets(
    state.print.basket.map(b => ({ typeId: b.typeId, count: b.count, w: state.types[b.typeId].w, h: state.types[b.typeId].h })),
    state.print
  );
  $('basketCount').textContent = total ? t('p.count', { n: total, s: packed.sheets.length }) : '';

  const cfg = state.types[state.active];
  $('sheetInfo').textContent = t('p.sheetInfo', { n: perSheet(cfg.w, cfg.h, state.print) });
}

function buildProfiles() {
  const sel = $('profileSelect');
  sel.textContent = '';
  listProfiles().forEach(p => {
    const o = document.createElement('option');
    o.value = p.id;
    o.textContent = p.name;
    sel.appendChild(o);
  });
  const n = document.createElement('option');
  n.value = '__new';
  n.textContent = t('profile.new');
  sel.appendChild(n);
  sel.value = profileId || '__new';
}

function setSegmented(container, attr, value) {
  container.querySelectorAll('button').forEach(b => {
    b.classList.toggle('active', b.dataset[attr] === value);
  });
}

function setVal(id, value) {
  const node = $(id);
  if (!node || document.activeElement === node) return;
  if (node.type === 'checkbox') node.checked = !!value;
  else node.value = value;
}

function syncInputs() {
  const d = state.data;
  setVal('f-operatorId', d.operatorId);
  setVal('f-regId', d.regId);
  setVal('f-owner', d.owner);
  setVal('f-dial', d.dial);
  setVal('f-phone', d.phone);
  setVal('f-email', d.email);
  setVal('f-text', d.text);
  setVal('f-model', d.model);
  setVal('f-serial', d.serial);
  setVal('f-mtom', d.mtom);
  setVal('f-class', d.cls);
  setVal('f-url', d.url);
  setVal('f-batNo', d.batNo);
  setVal('f-batCap', d.batCap);
  setVal('f-batDate', d.batDate);

  const cfg = state.types[state.active];
  setVal('s-w', cfg.w);
  setVal('s-h', cfg.h);
  setVal('s-radius', cfg.radius);
  $('s-radius-o').textContent = cfg.radius + '%';
  $('s-radius').disabled = cfg.shape === 'rect' || cfg.shape === 'ellipse' || cfg.shape === 'circle';
  setSegmented($('shapeSeg'), 'shape', cfg.shape);
  $('activeTypeName').textContent = typeName(state.active);

  const s = state.style;
  setVal('d-bg', s.bg);
  setVal('d-fg', s.fg);
  setVal('d-accent', s.accent);
  setVal('d-borderColor', s.borderColor);
  setVal('d-font', s.font);
  setVal('d-scale', s.fill);
  $('d-scale-o').textContent = s.fill + '%';
  setVal('d-tracking', s.tracking);
  $('d-tracking-o').textContent = (s.tracking / 100).toFixed(2) + ' mm';
  setVal('d-border', s.border);
  $('d-border-o').textContent = s.border.toFixed(2) + ' mm';
  setVal('d-padding', s.padding);
  $('d-padding-o').textContent = s.padding.toFixed(1) + ' mm';
  setVal('d-upper', s.upper);
  setVal('d-mono', s.monoIds);
  setVal('d-bilingual', s.bilingual);
  setSegmented($('alignSeg'), 'align', s.align);

  setVal('q-enabled', cfg.qr);
  $('qrSub').style.display = cfg.qr ? '' : 'none';
  setVal('q-mode', state.qr.mode);
  setVal('q-text', state.qr.text);
  setVal('q-ecl', state.qr.ecl);
  setVal('q-pos', state.qr.pos);
  setVal('q-scale', state.qr.scale);
  $('q-scale-o').textContent = state.qr.scale + '%';
  $('qrCustomWrap').style.display = state.qr.mode === 'custom' ? '' : 'none';
  $('q-scale').disabled = state.qr.pos === 'only';

  setVal('m-logoScale', state.media.logoScale);
  setVal('m-bgOpacity', state.media.bgOpacity);
  $('logoThumb').hidden = !state.media.logo;
  $('logoDrop').querySelector('.dz-empty').hidden = !!state.media.logo;
  if (state.media.logo) $('logoThumb').src = state.media.logo;
  $('logoActions').hidden = !state.media.logo;
  $('bgThumb').hidden = !state.media.bg;
  $('bgDrop').querySelector('.dz-empty').hidden = !!state.media.bg;
  if (state.media.bg) $('bgThumb').src = state.media.bg;
  $('bgActions').hidden = !state.media.bg;

  const p = state.print;
  setVal('p-paper', p.paper);
  setVal('p-orient', p.orientation);
  setVal('p-margin', p.margin);
  setVal('p-gap', p.gap);
  setVal('p-cut', p.cut);
  setVal('p-outline', p.outline);
  setVal('p-mirror', p.mirror);

  setVal('zoom', state.zoom);
}

function updateContrast() {
  const s = state.style;
  const effBg = state.media.bg ? mixOver('#808080', s.bg, state.media.bgOpacity / 100) : s.bg;
  const ratio = contrast(s.fg, effBg);
  const level = contrastLevel(ratio);
  const bar = $('contrastBar');
  bar.className = 'contrast-bar ' + level;
  bar.textContent = '';
  const dot = document.createElement('span');
  dot.className = 'cb-dot';
  const label = document.createElement('span');
  label.textContent = t('contrast.' + level);
  const val = document.createElement('span');
  val.className = 'cb-val';
  val.textContent = ratio.toFixed(1) + ':1';
  bar.appendChild(dot);
  bar.appendChild(label);
  bar.appendChild(val);
  return { ratio, level };
}

function pill(kind, key) {
  const p = document.createElement('span');
  p.className = 'warn-pill ' + kind;
  const icon = kind === 'ok'
    ? '<svg viewBox="0 0 16 16"><path d="M6.4 11.2 3.2 8l1.2-1.2 2 2 4.8-4.8L12.4 5z" fill="currentColor"/></svg>'
    : '<svg viewBox="0 0 16 16"><path d="M8 1.6 15 14H1zm-.9 4v4h1.8v-4zm0 5.2V12.6h1.8v-1.8z" fill="currentColor"/></svg>';
  p.innerHTML = icon;
  const span = document.createElement('span');
  span.textContent = t(key);
  p.appendChild(span);
  return p;
}

function updateWarnings(info, d, cc) {
  const box = $('warnings');
  box.textContent = '';
  const list = [];

  if (!d.operatorId) list.push(['err', 'v.empty']);
  else if (d.operatorState === 'odd') list.push(['warn', 'v.opFormat']);
  if (!d.regId && (state.active === 'reg' || state.active === 'miniReg')) list.push(['warn', 'v.noReg']);
  if (info && Number.isFinite(info.minFont) && info.minFont > 0 && info.minFont < 1.8) list.push(['warn', 'v.tiny']);
  if (cc.level === 'bad') list.push(['warn', 'v.contrast']);
  if (info && info.qr && info.qr.module < 0.34) list.push(['warn', 'v.qrTight']);
  if (!list.length) list.push(['ok', 'v.ready']);

  list.slice(0, 4).forEach(([k, key]) => box.appendChild(pill(k, key)));

  const field = $('f-operatorId');
  field.classList.toggle('is-bad', !!d.operatorId && d.operatorState === 'odd');
  field.classList.toggle('is-good', d.operatorState === 'ok');
  $('hint-operatorId').textContent = !d.operatorId
    ? t('f.operatorId.hint')
    : d.operatorState === 'ok' ? t('v.opOk') : t('v.opFormat');
}

function updateQrInfo(info) {
  const cfg = state.types[state.active];
  if (!cfg.qr) { $('qrInfo').textContent = t('q.off'); return; }
  if (info && info.qr) {
    $('qrInfo').textContent = t('q.info', { v: info.qr.n, mm: info.qr.module.toFixed(2) });
  } else {
    $('qrInfo').textContent = '—';
  }
}

function applyZoom() {
  if (!lastSvg) return;
  const cfg = state.types[state.active];
  const scale = state.zoom / 100;
  lastSvg.style.width = (cfg.w * MM_PX * scale) + 'px';
  lastSvg.style.height = (cfg.h * MM_PX * scale) + 'px';
}

function fitZoom() {
  const cfg = state.types[state.active];
  const box = $('stageCanvas');
  const availW = box.clientWidth - 100;
  const availH = box.clientHeight - 130;
  const z = Math.min(availW / (cfg.w * MM_PX), availH / (cfg.h * MM_PX)) * 100;
  state.zoom = Math.max(60, Math.min(480, Math.round(z / 10) * 10));
  $('zoom').value = state.zoom;
  applyZoom();
}

function renderPreview() {
  const d = derive(state.data, state.lang);
  const cfg = state.types[state.active];
  const result = renderSticker(state.active, state, d);
  lastSvg = result.svg;
  lastInfo = result.info;

  const wrap = $('previewWrap');
  wrap.textContent = '';
  wrap.appendChild(result.svg);
  applyZoom();

  const meta = $('previewMeta');
  meta.textContent = '';
  const bits = [
    `${cfg.w} × ${cfg.h} mm`,
    `${(cfg.w / 25.4 * 300).toFixed(0)} × ${(cfg.h / 25.4 * 300).toFixed(0)} px @300dpi`
  ];
  if (Number.isFinite(result.info.minFont) && result.info.minFont > 0) {
    bits.push(`min ${result.info.minFont.toFixed(2)} mm`);
  }
  if (result.info.qr) bits.push(`QR ${result.info.qr.n}×${result.info.qr.n}`);
  bits.forEach(b => {
    const s = document.createElement('span');
    s.textContent = b;
    meta.appendChild(s);
  });

  const cc = updateContrast();
  updateWarnings(result.info, d, cc);
  updateQrInfo(result.info);
}

function syncAll() {
  setLang(state.lang);
  applyI18n();
  $('langSwitch').querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.lang === state.lang));
  syncInputs();
  buildTypeList();
  buildStageTabs();
  buildSizePresets();
  buildBlockList();
  buildThemeGrid();
  buildTextPresets();
  buildBasket();
  renderPreview();
}

function commit(light) {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(() => {
    syncAll();
    rememberState(state);
    snapshot();
  }, light ? 90 : 0);
}

function onInput(id, apply, light) {
  const node = $(id);
  const handler = () => {
    apply(node);
    commit(light);
  };
  node.addEventListener(node.type === 'range' ? 'input' : 'change', handler);
  if (node.tagName === 'INPUT' && ['text', 'tel', 'email', 'url', 'number'].includes(node.type)) {
    node.addEventListener('input', handler);
  }
  if (node.tagName === 'TEXTAREA') node.addEventListener('input', handler);
}

function dataInput(id, key) {
  onInput(id, node => {
    state.data[key] = node.value;
  }, true);
}

function readImage(file, cb) {
  if (!file) return;
  if (file.size > 4 * 1024 * 1024) { toast(t('toast.imgTooBig'), 'bad'); return; }
  const fr = new FileReader();
  fr.onload = () => cb(fr.result);
  fr.readAsDataURL(file);
}

function wireDropzone(zoneId, inputId, apply) {
  const zone = $(zoneId);
  const input = $(inputId);
  zone.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    readImage(input.files[0], data => { apply(data); commit(); });
    input.value = '';
  });
  ['dragenter', 'dragover'].forEach(ev => zone.addEventListener(ev, e => {
    e.preventDefault();
    zone.classList.add('over');
  }));
  ['dragleave', 'drop'].forEach(ev => zone.addEventListener(ev, e => {
    e.preventDefault();
    zone.classList.remove('over');
  }));
  zone.addEventListener('drop', e => {
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    readImage(file, data => { apply(data); commit(); });
  });
}

function currentName() {
  const d = derive(state.data, state.lang);
  return safeName([d.operatorId || d.regId || 'dron', state.active]);
}

function svgCache() {
  const cache = {};
  const d = derive(state.data, state.lang);
  return typeId => {
    if (!cache[typeId]) cache[typeId] = renderSticker(typeId, state, d).svg;
    return cache[typeId].cloneNode(true);
  };
}

function doPrint() {
  const items = state.print.basket
    .filter(b => b.count > 0)
    .map(b => ({ typeId: b.typeId, count: b.count, w: state.types[b.typeId].w, h: state.types[b.typeId].h }));
  if (!items.length) { toast(t('toast.basketEmpty'), 'bad'); return; }
  const packed = packSheets(items, state.print);
  setPageSize(state.print.paper, state.print.orientation);
  buildPrintDom($('printRoot'), packed, state.print, svgCache());
  setTimeout(() => window.print(), 60);
}

async function handleExport(kind, dpi) {
  const cfg = state.types[state.active];
  const d = derive(state.data, state.lang);
  const { svg } = renderSticker(state.active, state, d);
  const name = currentName();
  try {
    if (kind === 'svg') { exportSvg(svg, name); }
    else if (kind === 'png') { await exportPng(svg, cfg.w, cfg.h, dpi, name); }
    else if (kind === 'pdf') { await exportPdf(svg, cfg.w, cfg.h, name); }
    toast(t('toast.exported', { n: name }), 'good');
  } catch (e) {
    toast(kind === 'pdf' ? t('toast.pdfMissing') : t('toast.badFile'), 'bad');
  }
}

function wire() {
  ['operatorId', 'regId', 'owner', 'phone', 'email', 'text', 'model', 'serial', 'mtom', 'url', 'batNo', 'batCap', 'batDate']
    .forEach(k => dataInput('f-' + k, k));
  dataInput('f-dial', 'dial');
  dataInput('f-class', 'cls');

  onInput('s-w', n => { state.types[state.active].w = clampNum(n.value, 8, 200, 55); }, true);
  onInput('s-h', n => { state.types[state.active].h = clampNum(n.value, 5, 200, 35); }, true);
  onInput('s-radius', n => { state.types[state.active].radius = parseInt(n.value, 10); }, true);

  $('swapDims').addEventListener('click', () => {
    const cfg = state.types[state.active];
    [cfg.w, cfg.h] = [cfg.h, cfg.w];
    commit();
  });

  $('shapeSeg').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    state.types[state.active].shape = b.dataset.shape;
    commit();
  });

  $('alignSeg').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    state.style.align = b.dataset.align;
    commit();
  });

  $('resetBlocks').addEventListener('click', () => {
    state.types[state.active].blocks = defaultBlocks(state.active);
    commit();
  });

  onInput('d-bg', n => { state.style.bg = n.value; state.style.theme = ''; }, true);
  onInput('d-fg', n => { state.style.fg = n.value; state.style.theme = ''; }, true);
  onInput('d-accent', n => { state.style.accent = n.value; state.style.theme = ''; }, true);
  onInput('d-borderColor', n => { state.style.borderColor = n.value; }, true);
  onInput('d-font', n => { state.style.font = n.value; });
  onInput('d-scale', n => { state.style.fill = parseInt(n.value, 10); }, true);
  onInput('d-tracking', n => { state.style.tracking = parseInt(n.value, 10); }, true);
  onInput('d-border', n => { state.style.border = parseFloat(n.value); }, true);
  onInput('d-padding', n => { state.style.padding = parseFloat(n.value); }, true);
  onInput('d-upper', n => { state.style.upper = n.checked; });
  onInput('d-mono', n => { state.style.monoIds = n.checked; });
  onInput('d-bilingual', n => { state.style.bilingual = n.checked; });

  onInput('q-enabled', n => { state.types[state.active].qr = n.checked; });
  onInput('q-mode', n => { state.qr.mode = n.value; });
  onInput('q-text', n => { state.qr.text = n.value; }, true);
  onInput('q-ecl', n => { state.qr.ecl = n.value; });
  onInput('q-pos', n => { state.qr.pos = n.value; });
  onInput('q-scale', n => { state.qr.scale = parseInt(n.value, 10); }, true);

  onInput('m-logoScale', n => { state.media.logoScale = parseInt(n.value, 10); }, true);
  onInput('m-bgOpacity', n => { state.media.bgOpacity = parseInt(n.value, 10); }, true);
  $('logoClear').addEventListener('click', e => { e.stopPropagation(); state.media.logo = null; commit(); });
  $('bgClear').addEventListener('click', e => { e.stopPropagation(); state.media.bg = null; commit(); });
  wireDropzone('logoDrop', 'm-logo', data => { state.media.logo = data; });
  wireDropzone('bgDrop', 'm-bg', data => { state.media.bg = data; });

  onInput('p-paper', n => { state.print.paper = n.value; });
  onInput('p-orient', n => { state.print.orientation = n.value; });
  onInput('p-margin', n => { state.print.margin = clampNum(n.value, 0, 30, 8); }, true);
  onInput('p-gap', n => { state.print.gap = clampNum(n.value, 0, 30, 3); }, true);
  onInput('p-cut', n => { state.print.cut = n.checked; });
  onInput('p-outline', n => { state.print.outline = n.checked; });
  onInput('p-mirror', n => { state.print.mirror = n.checked; });

  $('basketAdd').addEventListener('click', () => {
    const typeId = $('basketType').value;
    const count = Math.max(1, Math.min(300, parseInt($('basketQty').value, 10) || 1));
    const found = state.print.basket.find(b => b.typeId === typeId);
    if (found) found.count = Math.min(300, found.count + count);
    else state.print.basket.push({ typeId, count });
    commit();
  });

  $('basketFill').addEventListener('click', () => {
    const cfg = state.types[state.active];
    const n = perSheet(cfg.w, cfg.h, state.print);
    if (!n) return;
    state.print.basket = [{ typeId: state.active, count: n }];
    commit();
  });

  $('sideTabs').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    $('sideTabs').querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
    document.querySelectorAll('.pane').forEach(p => p.classList.toggle('active', p.id === b.dataset.pane));
  });

  $('langSwitch').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    state.lang = b.dataset.lang;
    commit();
  });

  $('zoom').addEventListener('input', () => {
    state.zoom = parseInt($('zoom').value, 10);
    applyZoom();
  });
  $('zoomIn').addEventListener('click', () => { state.zoom = Math.min(900, state.zoom + 40); $('zoom').value = state.zoom; applyZoom(); });
  $('zoomOut').addEventListener('click', () => { state.zoom = Math.max(60, state.zoom - 40); $('zoom').value = state.zoom; applyZoom(); });
  $('zoomReal').addEventListener('click', () => { state.zoom = 100; $('zoom').value = 100; applyZoom(); });
  $('zoomFit').addEventListener('click', fitZoom);

  $('printBtn').addEventListener('click', doPrint);
  $('undoBtn').addEventListener('click', undo);
  $('redoBtn').addEventListener('click', redo);

  document.querySelectorAll('[data-export]').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      const kind = a.dataset.export;
      if (kind === 'json') {
        const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
        download(blob, currentName() + '.json');
      } else if (kind === 'import') {
        $('jsonImport').click();
      } else if (kind === 'link') {
        const url = location.origin + location.pathname + '#c=' + encodeShare(state);
        navigator.clipboard.writeText(url).then(
          () => toast(t('toast.copied'), 'good'),
          () => toast(url)
        );
      } else {
        handleExport(kind, parseInt(a.dataset.dpi, 10) || 300);
      }
    });
  });

  $('jsonImport').addEventListener('change', () => {
    const file = $('jsonImport').files[0];
    if (!file) return;
    const fr = new FileReader();
    fr.onload = () => {
      try {
        state = adopt(JSON.parse(fr.result));
        history.length = 0;
        commit();
        toast(t('toast.imported'), 'good');
      } catch (e) {
        toast(t('toast.badFile'), 'bad');
      }
    };
    fr.readAsText(file);
    $('jsonImport').value = '';
  });

  $('profileSelect').addEventListener('change', e => {
    const id = e.target.value;
    if (id === '__new') {
      profileId = null;
      buildProfiles();
      return;
    }
    const p = listProfiles().find(x => x.id === id);
    if (!p) return;
    profileId = id;
    setActiveProfile(id);
    state = adopt(p.state);
    history.length = 0;
    commit();
  });

  $('profileSave').addEventListener('click', () => {
    const existing = listProfiles().find(p => p.id === profileId);
    const suggested = existing ? existing.name : (derive(state.data, state.lang).model || t('profile.default'));
    const name = window.prompt(t('toast.newProfile'), suggested);
    if (!name) return;
    profileId = saveProfile(name, state, existing && existing.name === name ? profileId : null);
    buildProfiles();
    toast(t('toast.saved', { n: name }), 'good');
  });

  $('profileDelete').addEventListener('click', () => {
    if (!profileId) return;
    profileId = deleteProfile(profileId);
    buildProfiles();
    toast(t('toast.deleted'));
  });

  document.addEventListener('keydown', e => {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
    else if (k === 'p') { e.preventDefault(); doPrint(); }
    else if (k === 's') { e.preventDefault(); $('profileSave').click(); }
  });

  window.addEventListener('resize', () => { applyZoom(); });
}

function clampNum(v, min, max, fallback) {
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function boot() {
  const hash = location.hash.match(/#c=(.+)$/);
  let loaded = null;
  if (hash) loaded = decodeShare(hash[1]);
  if (!loaded) {
    const saved = lastState();
    if (saved) loaded = saved;
  }
  if (loaded) state = adopt(loaded);
  profileId = activeProfileId();

  const d = state.style;
  $('d-scale').min = 55;
  $('d-scale').max = 100;
  if (d.fill > 100) d.fill = 92;

  const yearNode = $('creditYear');
  if (yearNode) yearNode.textContent = new Date().getFullYear();

  wire();
  buildFontSelect();
  buildProfiles();
  syncAll();
  history.push(JSON.stringify(state));
  updateHistoryButtons();
  setTimeout(fitZoom, 80);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
