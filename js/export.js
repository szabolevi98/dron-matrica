import { PAPERS } from './layouts.js?v=202608311748';
import { svgToString } from './render.js?v=202608311748';

const NS = 'http://www.w3.org/2000/svg';

export function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function safeName(parts) {
  return parts.filter(Boolean).join('-')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'matrica';
}

export function exportSvg(svg, name) {
  const blob = new Blob([svgToString(svg)], { type: 'image/svg+xml;charset=utf-8' });
  download(blob, name + '.svg');
}

function svgDataUrl(svg, wPx, hPx) {
  const clone = svg.cloneNode(true);
  clone.setAttribute('xmlns', NS);
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  clone.setAttribute('width', wPx);
  clone.setAttribute('height', hPx);
  const str = new XMLSerializer().serializeToString(clone);
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(str);
}

export function rasterize(svg, wMm, hMm, dpi) {
  const wPx = Math.max(1, Math.round(wMm / 25.4 * dpi));
  const hPx = Math.max(1, Math.round(hMm / 25.4 * dpi));
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = wPx;
      canvas.height = hPx;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, wPx, hPx);
      resolve(canvas);
    };
    img.onerror = () => reject(new Error('raster'));
    img.src = svgDataUrl(svg, wPx, hPx);
  });
}

export async function exportPng(svg, wMm, hMm, dpi, name) {
  const canvas = await rasterize(svg, wMm, hMm, dpi);
  const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
  download(blob, `${name}-${dpi}dpi.png`);
}

let pdfLoading = null;

function loadPdfLib() {
  if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
  if (!pdfLoading) {
    pdfLoading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'vendor/jspdf.umd.min.js';
      s.onload = () => resolve(window.jspdf && window.jspdf.jsPDF);
      s.onerror = () => reject(new Error('pdf'));
      document.head.appendChild(s);
    });
  }
  return pdfLoading;
}

export async function exportPdf(svg, wMm, hMm, name) {
  const JsPDF = await loadPdfLib();
  if (!JsPDF) throw new Error('pdf');
  const canvas = await rasterize(svg, wMm, hMm, 600);
  const doc = new JsPDF({
    unit: 'mm',
    format: [wMm, hMm],
    orientation: wMm >= hMm ? 'landscape' : 'portrait',
    compress: true
  });
  doc.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, wMm, hMm, undefined, 'FAST');
  doc.save(name + '.pdf');
}

export function paperSize(paper, orientation) {
  const [w, h] = PAPERS[paper] || PAPERS.A4;
  return orientation === 'landscape' ? [h, w] : [w, h];
}

export function packSheets(items, opts) {
  const [pw, ph] = paperSize(opts.paper, opts.orientation);
  const margin = opts.margin;
  const gap = opts.gap;
  const availW = pw - margin * 2;
  const availH = ph - margin * 2;
  const sheets = [];
  let cells = [];
  let cursorX = 0;
  let shelfY = 0;
  let shelfH = 0;
  let skipped = 0;

  const flush = () => {
    if (cells.length) sheets.push(cells);
    cells = [];
    cursorX = 0;
    shelfY = 0;
    shelfH = 0;
  };

  for (const item of items) {
    if (item.w > availW + 0.01 || item.h > availH + 0.01) { skipped += item.count; continue; }
    for (let i = 0; i < item.count; i++) {
      if (cursorX + item.w > availW + 0.01 && cursorX > 0) {
        shelfY += shelfH + gap;
        cursorX = 0;
        shelfH = 0;
      }
      if (shelfY + item.h > availH + 0.01) {
        flush();
      }
      cells.push({ typeId: item.typeId, x: margin + cursorX, y: margin + shelfY, w: item.w, h: item.h });
      cursorX += item.w + gap;
      shelfH = Math.max(shelfH, item.h);
    }
  }
  flush();
  return { sheets, pw, ph, skipped };
}

export function perSheet(w, h, opts) {
  const [pw, ph] = paperSize(opts.paper, opts.orientation);
  const availW = pw - opts.margin * 2;
  const availH = ph - opts.margin * 2;
  const cols = Math.floor((availW + opts.gap) / (w + opts.gap));
  const rows = Math.floor((availH + opts.gap) / (h + opts.gap));
  return Math.max(0, cols) * Math.max(0, rows);
}

function cutMarks(cell) {
  const frag = document.createDocumentFragment();
  const len = 2.2;
  const off = 0.9;
  const th = 0.12;
  const corners = [
    [cell.x, cell.y, -1, -1],
    [cell.x + cell.w, cell.y, 1, -1],
    [cell.x, cell.y + cell.h, -1, 1],
    [cell.x + cell.w, cell.y + cell.h, 1, 1]
  ];
  for (const [cx, cy, sx, sy] of corners) {
    const hMark = document.createElement('div');
    hMark.className = 'cut-mark';
    hMark.style.cssText = `left:${sx < 0 ? cx - off - len : cx + off}mm;top:${cy - th / 2}mm;width:${len}mm;height:${th}mm;`;
    const vMark = document.createElement('div');
    vMark.className = 'cut-mark';
    vMark.style.cssText = `left:${cx - th / 2}mm;top:${sy < 0 ? cy - off - len : cy + off}mm;width:${th}mm;height:${len}mm;`;
    frag.appendChild(hMark);
    frag.appendChild(vMark);
  }
  return frag;
}

export function buildPrintDom(root, packed, opts, svgFor) {
  root.textContent = '';
  for (const cells of packed.sheets) {
    const sheet = document.createElement('div');
    sheet.className = 'print-sheet';
    sheet.style.width = packed.pw + 'mm';
    sheet.style.height = packed.ph + 'mm';
    if (opts.mirror) sheet.style.transform = 'scaleX(-1)';

    for (const cell of cells) {
      const wrap = document.createElement('div');
      wrap.className = 'print-cell';
      wrap.style.cssText = `left:${cell.x}mm;top:${cell.y}mm;width:${cell.w}mm;height:${cell.h}mm;`;
      const svg = svgFor(cell.typeId);
      if (svg) wrap.appendChild(svg);
      sheet.appendChild(wrap);

      if (opts.outline) {
        const ol = document.createElement('div');
        ol.className = 'cut-outline';
        ol.style.cssText = `left:${cell.x}mm;top:${cell.y}mm;width:${cell.w}mm;height:${cell.h}mm;`;
        sheet.appendChild(ol);
      }
      if (opts.cut) sheet.appendChild(cutMarks(cell));
    }
    root.appendChild(sheet);
  }
}

export function setPageSize(paper, orientation) {
  let style = document.getElementById('pageStyle');
  if (!style) {
    style = document.createElement('style');
    style.id = 'pageStyle';
    document.head.appendChild(style);
  }
  const size = paper === 'Letter' ? 'letter' : paper.toLowerCase();
  style.textContent = `@page { size: ${size} ${orientation}; margin: 0; }`;
}
