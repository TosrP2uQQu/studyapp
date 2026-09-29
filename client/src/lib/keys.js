// keys.js — browser-only AI key store. Session storage by default;
// "Remember on this device" opts into localStorage. Keys never touch
// the repo, the build, or our server: they go straight from this
// browser to the provider the user chose.
import { STORAGE_VERSION } from './storage';

function stores() {
  const out = {};
  try {
    if (typeof sessionStorage !== 'undefined') {
      out.session = sessionStorage;
    }
  } catch {
    /* blocked */
  }
  try {
    if (typeof localStorage !== 'undefined') {
      out.local = localStorage;
    }
  } catch {
    /* blocked */
  }
  return out;
}

function keyName(provider) {
  return `${STORAGE_VERSION}.key.${provider}`;
}

export function getBrowserKey(provider) {
  const s = stores();
  try {
    if (s.session) {
      const v = s.session.getItem(keyName(provider));
      if (v) return v;
    }
    if (s.local) return s.local.getItem(keyName(provider)) || '';
  } catch {
    /* blocked */
  }
  return '';
}

export function setBrowserKey(provider, key, remember) {
  const s = stores();
  try {
    if (s.session) {
      if (key) s.session.setItem(keyName(provider), key);
      else s.session.removeItem(keyName(provider));
    }
    if (s.local) {
      if (remember && key) {
        s.local.setItem(keyName(provider), key);
      } else {
        s.local.removeItem(keyName(provider));
      }
    }
  } catch {
    /* blocked: keys simply do not persist */
  }
}

export function clearBrowserKey(provider) {
  setBrowserKey(provider, '', false);
}

export function isRemembered(provider) {
  const s = stores();
  try {
    return Boolean(s.local && s.local.getItem(keyName(provider)));
  } catch {
    return false;
  }
}
