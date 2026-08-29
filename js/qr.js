let utf8Ready = false;

function ensureUtf8() {
  if (utf8Ready || typeof qrcode !== 'function') return;
  if (qrcode.stringToBytesFuncs && qrcode.stringToBytesFuncs['UTF-8']) {
    qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
  }
  utf8Ready = true;
}

export function qrContent(mode, d, custom) {
  switch (mode) {
    case 'tel':
      return d.phoneRaw ? 'tel:' + d.phoneRaw : '';
    case 'url':
      if (!d.urlFull) return '';
      return /^https?:\/\//i.test(d.urlFull) ? d.urlFull : 'https://' + d.urlFull;
    case 'ids': {
      const rows = [];
      if (d.operatorId) rows.push('OPERATOR:' + d.operatorId);
      if (d.regId) rows.push('UAS:' + d.regId);
      if (d.serial) rows.push('SN:' + d.serial);
      return rows.join('\n');
    }
    case 'custom':
      return String(custom || '');
    default: {
      const l = ['BEGIN:VCARD', 'VERSION:3.0'];
      const name = d.owner || d.operatorId;
      l.push('N:' + name, 'FN:' + name);
      if (d.phoneRaw) l.push('TEL;TYPE=CELL:' + d.phoneRaw);
      if (d.email) l.push('EMAIL;TYPE=INTERNET:' + d.email);
      if (d.urlFull) l.push('URL:' + (/^https?:\/\//i.test(d.urlFull) ? d.urlFull : 'https://' + d.urlFull));
      const note = [d.operatorId && 'OPERATOR ' + d.operatorId, d.regId && 'UAS ' + d.regId]
        .filter(Boolean).join(' / ');
      if (note) l.push('NOTE:' + note);
      l.push('END:VCARD');
      return l.join('\n');
    }
  }
}

export function qrMatrix(text, ecl) {
  if (!text || typeof qrcode !== 'function') return null;
  ensureUtf8();
  for (const level of [ecl || 'M', 'M', 'L']) {
    try {
      const q = qrcode(0, level);
      q.addData(text);
      q.make();
      const n = q.getModuleCount();
      const rows = [];
      for (let r = 0; r < n; r++) {
        const row = new Array(n);
        for (let c = 0; c < n; c++) row[c] = q.isDark(r, c);
        rows.push(row);
      }
      return { n, rows, ecl: level };
    } catch (e) {
      continue;
    }
  }
  return null;
}

export function qrPath(matrix, unit, ox, oy) {
  const parts = [];
  for (let r = 0; r < matrix.n; r++) {
    let c = 0;
    while (c < matrix.n) {
      if (!matrix.rows[r][c]) { c++; continue; }
      let len = 1;
      while (c + len < matrix.n && matrix.rows[r][c + len]) len++;
      const x = round(ox + c * unit);
      const y = round(oy + r * unit);
      const w = round(len * unit);
      const h = round(unit);
      parts.push(`M${x} ${y}h${w}v${h}h${-w}z`);
      c += len;
    }
  }
  return parts.join('');
}

function round(v) {
  return Math.round(v * 1000) / 1000;
}
