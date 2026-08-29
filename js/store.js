const KEY = 'dronmatrica.v1';

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { profiles: [], activeId: null, last: null };
    const parsed = JSON.parse(raw);
    return {
      profiles: Array.isArray(parsed.profiles) ? parsed.profiles : [],
      activeId: parsed.activeId || null,
      last: parsed.last || null
    };
  } catch (e) {
    return { profiles: [], activeId: null, last: null };
  }
}

function write(db) {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch (e) {
    /* storage unavailable */
  }
}

export function listProfiles() {
  return read().profiles;
}

export function activeProfileId() {
  return read().activeId;
}

export function lastState() {
  return read().last;
}

export function rememberState(state) {
  const db = read();
  db.last = state;
  write(db);
}

export function saveProfile(name, state, id) {
  const db = read();
  const pid = id || 'p' + Date.now().toString(36);
  const idx = db.profiles.findIndex(p => p.id === pid);
  const entry = { id: pid, name, state, at: Date.now() };
  if (idx > -1) db.profiles[idx] = entry;
  else db.profiles.push(entry);
  db.activeId = pid;
  db.last = state;
  write(db);
  return pid;
}

export function deleteProfile(id) {
  const db = read();
  db.profiles = db.profiles.filter(p => p.id !== id);
  if (db.activeId === id) db.activeId = db.profiles.length ? db.profiles[0].id : null;
  write(db);
  return db.activeId;
}

export function setActiveProfile(id) {
  const db = read();
  db.activeId = id;
  write(db);
}

function toBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64(b64) {
  const norm = b64.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(norm);
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeShare(state) {
  const slim = JSON.parse(JSON.stringify(state));
  slim.media = { logo: null, logoScale: slim.media.logoScale, bg: null, bgOpacity: slim.media.bgOpacity };
  return toBase64(JSON.stringify(slim));
}

export function decodeShare(hash) {
  try {
    return JSON.parse(fromBase64(hash));
  } catch (e) {
    return null;
  }
}
