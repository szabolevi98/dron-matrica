export function parseOperatorId(raw) {
  const value = String(raw || '').trim();
  if (!value) return { value: '', secret: '' };
  const match = value.match(/-([A-Za-z0-9]{1,6})$/);
  return { value, secret: match ? match[1] : '' };
}

export function formatPhone(dial, phone) {
  const p = String(phone || '').trim();
  if (!p) return '';
  if (p.startsWith('+')) return p.replace(/\s+/g, ' ');
  const d = String(dial || '').trim();
  return (d ? d + ' ' : '') + p.replace(/\s+/g, ' ');
}

export function phoneDigits(dial, phone) {
  const s = formatPhone(dial, phone);
  if (!s) return '';
  const plus = s.trim().startsWith('+') ? '+' : '';
  return plus + s.replace(/[^0-9]/g, '');
}

export function formatDate(iso, lang) {
  if (!iso) return '';
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  return lang === 'hu' ? `${parts[0]}. ${parts[1]}. ${parts[2]}.` : `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export function derive(data, lang) {
  const op = parseOperatorId(data.operatorId);
  const spec = [data.mtom, data.cls].filter(Boolean).join(' · ');
  return {
    operatorId: op.value,
    operatorSecret: op.secret,
    regId: String(data.regId || '').trim(),
    owner: String(data.owner || '').trim(),
    phone: formatPhone(data.dial, data.phone),
    phoneRaw: phoneDigits(data.dial, data.phone),
    email: String(data.email || '').trim(),
    text: String(data.text || '').trim(),
    model: String(data.model || '').trim(),
    serial: String(data.serial || '').trim(),
    spec,
    url: String(data.url || '').trim().replace(/^https?:\/\//, ''),
    urlFull: String(data.url || '').trim(),
    batNo: String(data.batNo || '').trim(),
    batCap: String(data.batCap || '').trim(),
    batDate: formatDate(data.batDate, lang)
  };
}

function hexToRgb(hex) {
  let h = String(hex || '').replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h, 16);
  if (Number.isNaN(n) || h.length !== 6) return [0, 0, 0];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map(v => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const l1 = luminance(a);
  const l2 = luminance(b);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

export function contrastLevel(ratio) {
  if (ratio >= 7) return 'ok';
  if (ratio >= 4.5) return 'warn';
  return 'bad';
}

export function mixOver(fg, bg, alpha) {
  const a = hexToRgb(fg);
  const b = hexToRgb(bg);
  const out = a.map((v, i) => Math.round(v * alpha + b[i] * (1 - alpha)));
  return '#' + out.map(v => v.toString(16).padStart(2, '0')).join('');
}
