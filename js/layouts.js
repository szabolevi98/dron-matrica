export const BLOCKS = {
  'label.operator': { role: 'label', factor: 0.62, face: 'face.operator', pairs: 'operatorId' },
  'label.reg': { role: 'label', factor: 0.62, face: 'face.reg', pairs: 'regId' },
  'label.contact': { role: 'label', factor: 0.62, face: 'face.contact' },
  'label.battery': { role: 'label', factor: 0.62, face: 'face.battery', pairs: 'batNo' },
  'rule': { role: 'rule', factor: 0.24, i18n: 'blk.rule' },
  'rule2': { role: 'rule', factor: 0.24, i18n: 'blk.rule' },
  'rule3': { role: 'rule', factor: 0.24, i18n: 'blk.rule' },
  'logo': { role: 'logo', factor: 1.1, i18n: 'blk.logo' },
  'operatorId': { role: 'value', factor: 1.45, mono: true, key: 'operatorId', i18n: 'blk.operatorId' },
  'regId': { role: 'value', factor: 1.45, mono: true, key: 'regId', i18n: 'blk.regId' },
  'owner': { role: 'value', factor: 1.0, key: 'owner', i18n: 'blk.owner' },
  'phone': { role: 'value', factor: 1.22, mono: true, key: 'phone', prefix: 'face.tel', i18n: 'blk.phone' },
  'email': { role: 'meta', factor: 0.76, key: 'email', i18n: 'blk.email' },
  'text': { role: 'meta', factor: 0.68, key: 'text', i18n: 'blk.text' },
  'model': { role: 'meta', factor: 0.78, key: 'model', i18n: 'blk.model' },
  'serial': { role: 'meta', factor: 0.62, mono: true, key: 'serial', prefix: 'S/N', i18n: 'blk.serial' },
  'spec': { role: 'meta', factor: 0.62, key: 'spec', i18n: 'blk.spec' },
  'url': { role: 'meta', factor: 0.64, key: 'url', i18n: 'blk.url' },
  'batNo': { role: 'value', factor: 1.55, mono: true, key: 'batNo', prefix: '#', i18n: 'blk.batNo' },
  'batCap': { role: 'meta', factor: 0.8, mono: true, key: 'batCap', i18n: 'blk.batCap' },
  'batDate': { role: 'meta', factor: 0.62, mono: true, key: 'batDate', i18n: 'blk.batDate' }
};

const TYPE_DEFS = {
  mixed: {
    required: true,
    w: 55, h: 35, shape: 'round', radius: 14, qr: false,
    blocks: [
      ['label.operator', 1], ['operatorId', 1], ['rule', 1],
      ['label.reg', 1], ['regId', 1], ['rule2', 0],
      ['owner', 0], ['phone', 0], ['model', 0], ['spec', 0], ['rule3', 0],
      ['serial', 0], ['text', 0], ['logo', 0]
    ]
  },
  operator: {
    required: true,
    w: 55, h: 35, shape: 'round', radius: 14, qr: false,
    blocks: [
      ['label.operator', 1], ['operatorId', 1], ['rule', 1],
      ['owner', 1], ['phone', 1], ['email', 0], ['text', 0], ['logo', 0]
    ]
  },
  reg: {
    required: true,
    w: 55, h: 35, shape: 'round', radius: 14, qr: false,
    blocks: [
      ['label.reg', 1], ['regId', 1], ['rule', 1],
      ['model', 1], ['spec', 1], ['serial', 0], ['logo', 0]
    ]
  },
  mini: {
    required: true,
    w: 26, h: 10, shape: 'round', radius: 18, qr: false,
    blocks: [['operatorId', 1], ['label.operator', 0]]
  },
  miniReg: {
    required: true,
    w: 26, h: 10, shape: 'round', radius: 18, qr: false,
    blocks: [['regId', 1], ['label.reg', 0]]
  },
  contact: {
    w: 55, h: 35, shape: 'round', radius: 14, qr: true,
    blocks: [
      ['label.contact', 1], ['owner', 1], ['phone', 1],
      ['email', 1], ['text', 0], ['url', 0], ['logo', 0]
    ]
  },
  battery: {
    w: 40, h: 20, shape: 'round', radius: 12, qr: false,
    blocks: [
      ['label.battery', 1], ['batNo', 1], ['batCap', 1],
      ['batDate', 1], ['rule', 0], ['owner', 0]
    ]
  }
};

export const TYPE_IDS = Object.keys(TYPE_DEFS);

export function typeMeta(id) {
  return TYPE_DEFS[id];
}

export function defaultType(id) {
  const d = TYPE_DEFS[id];
  return {
    on: true,
    w: d.w,
    h: d.h,
    shape: d.shape,
    radius: d.radius,
    qr: d.qr,
    blocks: d.blocks.map(([bid, on]) => ({ id: bid, on: !!on }))
  };
}

export function defaultBlocks(id) {
  return TYPE_DEFS[id].blocks.map(([bid, on]) => ({ id: bid, on: !!on }));
}

export const THEMES = [
  { id: 'midnight', name: 'Midnight', bg: '#0f172a', fg: '#ffffff', accent: '#38bdf8', border: '#38bdf8' },
  { id: 'carbon', name: 'Carbon', bg: '#141414', fg: '#f4f4f4', accent: '#4ea3ff', border: '#3d3d3d' },
  { id: 'paper', name: 'Paper', bg: '#ffffff', fg: '#111827', accent: '#1d4ed8', border: '#1d4ed8' },
  { id: 'safety', name: 'Safety', bg: '#f7c600', fg: '#101010', accent: '#101010', border: '#101010' },
  { id: 'blueprint', name: 'Blueprint', bg: '#0b3f78', fg: '#eef6ff', accent: '#8ed5ff', border: '#8ed5ff' },
  { id: 'ink', name: 'Ink', bg: '#ffffff', fg: '#000000', accent: '#000000', border: '#000000' }
];

export const FONTS = [
  { id: 'sans', name: 'Helvetica / Arial', stack: 'Arial, Helvetica, "Liberation Sans", sans-serif' },
  { id: 'ui', name: 'Segoe UI / Verdana', stack: '"Segoe UI", Tahoma, Verdana, Geneva, sans-serif' },
  { id: 'narrow', name: 'Arial Narrow', stack: '"Arial Narrow", "Liberation Sans Narrow", Arial, sans-serif' },
  { id: 'impact', name: 'Impact', stack: 'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif' },
  { id: 'serif', name: 'Georgia / Times', stack: 'Georgia, "Times New Roman", serif' },
  { id: 'mono', name: 'Consolas / Courier', stack: 'Consolas, "Courier New", "Liberation Mono", monospace' }
];

export const MONO_STACK = 'Consolas, "Courier New", "Liberation Mono", monospace';

export const SIZE_PRESETS = [
  { w: 20, h: 8 }, { w: 26, h: 10 }, { w: 30, h: 15 }, { w: 40, h: 20 },
  { w: 40, h: 25 }, { w: 50, h: 20 }, { w: 55, h: 35 }, { w: 60, h: 30 },
  { w: 75, h: 45 }, { w: 90, h: 50 }, { w: 30, h: 30 }, { w: 45, h: 45 }
];

export const PAPERS = {
  A4: [210, 297],
  A5: [148, 210],
  A6: [105, 148],
  Letter: [215.9, 279.4]
};

export function fontStack(id) {
  const f = FONTS.find(x => x.id === id);
  return f ? f.stack : FONTS[0].stack;
}
