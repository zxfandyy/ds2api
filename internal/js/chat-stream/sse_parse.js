'use strict';

const {
  SKIP_PATTERNS,
  SKIP_EXACT_PATHS,
} = require('../shared/deepseek-constants');

function parseChunkForContent(chunk, thinkingEnabled, currentType, stripReferenceMarkers = true) {
  if (!chunk || typeof chunk !== 'object' || !Object.prototype.hasOwnProperty.call(chunk, 'v')) {
    return { parts: [], finished: false, newType: currentType };
  }
  const pathValue = asString(chunk.p);
  if (shouldSkipPath(pathValue)) {
    return { parts: [], finished: false, newType: currentType };
  }
  if (pathValue === 'response/status' && asString(chunk.v) === 'FINISHED') {
    return { parts: [], finished: true, newType: currentType };
  }

  let newType = currentType;
  const parts = [];

  if (pathValue === 'response/fragments' && asString(chunk.o).toUpperCase() === 'APPEND' && Array.isArray(chunk.v)) {
    for (const frag of chunk.v) {
      if (!frag || typeof frag !== 'object') {
        continue;
      }
      const fragType = asString(frag.type).toUpperCase();
      const content = asContentString(frag.content, stripReferenceMarkers);
      if (!content) {
        continue;
      }
      if (fragType === 'THINK' || fragType === 'THINKING') {
        newType = 'thinking';
        parts.push({ text: content, type: 'thinking' });
      } else if (fragType === 'RESPONSE') {
        newType = 'text';
        parts.push({ text: content, type: 'text' });
      } else {
        parts.push({ text: content, type: 'text' });
      }
    }
  }

  if (pathValue === 'response' && Array.isArray(chunk.v)) {
    for (const item of chunk.v) {
      if (!item || typeof item !== 'object') {
        continue;
      }
      if (item.p === 'fragments' && item.o === 'APPEND' && Array.isArray(item.v)) {
        for (const frag of item.v) {
          const fragType = asString(frag && frag.type).toUpperCase();
          if (fragType === 'THINK' || fragType === 'THINKING') {
            newType = 'thinking';
          } else if (fragType === 'RESPONSE') {
            newType = 'text';
          }
        }
      }
    }
  }

  let partType = 'text';
  if (pathValue === 'response/thinking_content') {
    partType = 'thinking';
  } else if (pathValue === 'response/content') {
    partType = 'text';
  } else if (pathValue.includes('response/fragments') && pathValue.includes('/content')) {
    partType = newType;
  } else if (!pathValue && thinkingEnabled) {
    partType = newType;
  }

  const val = chunk.v;
  if (typeof val === 'string') {
    if (val === 'FINISHED' && (!pathValue || pathValue === 'status')) {
      return { parts: [], finished: true, newType };
    }
    const content = asContentString(val, stripReferenceMarkers);
    if (content) {
      parts.push({ text: content, type: partType });
    }
    return { parts, finished: false, newType };
  }

  if (Array.isArray(val)) {
    const extracted = extractContentRecursive(val, partType, stripReferenceMarkers);
    if (extracted.finished) {
      return { parts: [], finished: true, newType };
    }
    parts.push(...extracted.parts);
    return { parts, finished: false, newType };
  }

  if (val && typeof val === 'object') {
    const resp = val.response && typeof val.response === 'object' ? val.response : val;
    if (Array.isArray(resp.fragments)) {
      for (const frag of resp.fragments) {
        if (!frag || typeof frag !== 'object') {
          continue;
        }
        const content = asContentString(frag.content, stripReferenceMarkers);
        if (!content) {
          continue;
        }
        const t = asString(frag.type).toUpperCase();
        if (t === 'THINK' || t === 'THINKING') {
          newType = 'thinking';
          parts.push({ text: content, type: 'thinking' });
        } else if (t === 'RESPONSE') {
          newType = 'text';
          parts.push({ text: content, type: 'text' });
        } else {
          parts.push({ text: content, type: partType });
        }
      }
    }
  }
  return { parts, finished: false, newType };
}

function extractContentRecursive(items, defaultType, stripReferenceMarkers = true) {
  const parts = [];
  for (const it of items) {
    if (!it || typeof it !== 'object') {
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(it, 'v')) {
      continue;
    }
    const itemPath = asString(it.p);
    const itemV = it.v;
    if (itemPath === 'status' && asString(itemV) === 'FINISHED') {
      return { parts: [], finished: true };
    }
    if (shouldSkipPath(itemPath)) {
      continue;
    }
    const content = asContentString(it.content, stripReferenceMarkers);
    if (content) {
      const typeName = asString(it.type).toUpperCase();
      if (typeName === 'THINK' || typeName === 'THINKING') {
        parts.push({ text: content, type: 'thinking' });
      } else if (typeName === 'RESPONSE') {
        parts.push({ text: content, type: 'text' });
      } else {
        parts.push({ text: content, type: defaultType });
      }
      continue;
    }

    let partType = defaultType;
    if (itemPath.includes('thinking')) {
      partType = 'thinking';
    } else if (itemPath.includes('content') || itemPath === 'response' || itemPath === 'fragments') {
      partType = 'text';
    }

    if (typeof itemV === 'string') {
      if (itemV && itemV !== 'FINISHED') {
        const content = asContentString(itemV, stripReferenceMarkers);
        if (content) {
          parts.push({ text: content, type: partType });
        }
      }
      continue;
    }

    if (!Array.isArray(itemV)) {
      continue;
    }
    for (const inner of itemV) {
      if (typeof inner === 'string') {
        if (inner) {
          const content = asContentString(inner, stripReferenceMarkers);
          if (content) {
            parts.push({ text: content, type: partType });
          }
        }
        continue;
      }
      if (!inner || typeof inner !== 'object') {
        continue;
      }
      const ct = asContentString(inner.content, stripReferenceMarkers);
      if (!ct) {
        continue;
      }
      const typeName = asString(inner.type).toUpperCase();
      if (typeName === 'THINK' || typeName === 'THINKING') {
        parts.push({ text: ct, type: 'thinking' });
      } else if (typeName === 'RESPONSE') {
        parts.push({ text: ct, type: 'text' });
      } else {
        parts.push({ text: ct, type: partType });
      }
    }
  }
  return { parts, finished: false };
}

function shouldSkipPath(pathValue) {
  if (isFragmentStatusPath(pathValue)) {
    return true;
  }
  if (SKIP_EXACT_PATHS.has(pathValue)) {
    return true;
  }
  for (const p of SKIP_PATTERNS) {
    if (pathValue.includes(p)) {
      return true;
    }
  }
  return false;
}

function isFragmentStatusPath(pathValue) {
  if (!pathValue || pathValue === 'response/status') {
    return false;
  }
  return /^response\/fragments\/-?\d+\/status$/i.test(pathValue);
}

function isCitation(text) {
  return asString(text).trim().startsWith('[citation:');
}

function asContentString(v, stripReferenceMarkers = true) {
  if (typeof v === 'string') {
    return stripReferenceMarkers ? stripReferenceMarkersText(v) : v;
  }
  if (Array.isArray(v)) {
    let out = '';
    for (const item of v) {
      out += asContentString(item, stripReferenceMarkers);
    }
    return out;
  }
  if (v && typeof v === 'object') {
    if (Object.prototype.hasOwnProperty.call(v, 'content')) {
      return asContentString(v.content, stripReferenceMarkers);
    }
    if (Object.prototype.hasOwnProperty.call(v, 'v')) {
      return asContentString(v.v, stripReferenceMarkers);
    }
    return '';
  }
  if (v == null) {
    return '';
  }
  const text = String(v);
  return stripReferenceMarkers ? stripReferenceMarkersText(text) : text;
}

function stripReferenceMarkersText(text) {
  if (!text) {
    return text;
  }
  return text.replace(/\[reference:\s*\d+\]/gi, '');
}

function asString(v) {
  if (typeof v === 'string') {
    return v.trim();
  }
  if (Array.isArray(v)) {
    return asString(v[0]);
  }
  if (v == null) {
    return '';
  }
  return String(v).trim();
}

module.exports = {
  parseChunkForContent,
  extractContentRecursive,
  shouldSkipPath,
  isFragmentStatusPath,
  isCitation,
  stripReferenceMarkers: stripReferenceMarkersText,
};
