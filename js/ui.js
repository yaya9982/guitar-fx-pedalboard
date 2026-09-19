import { PEDAL_TYPES, CATEGORIES } from './pedal-registry.js?v=1';
import { AMP_TYPES } from './amp-registry.js?v=1';

function stepFor(param) {
  if (param.step !== undefined) return param.step;
  const span = param.max - param.min;
  if (span <= 20) return Number.isInteger(param.min) && Number.isInteger(param.max) ? 1 : 0.1;
  return 1;
}

function formatValue(v) {
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(v < 10 ? 2 : 1);
}

function pedalColor(typeDef) {
  return typeDef.color || 'oklch(60% 0.1 250)';
}


// Pointer sweep, with generous mechanical overtravel past the printed tick range
// (ticks stay anchored to -120deg..120deg — see .knob-ticks in style.css).
const KNOB_MIN_ANGLE = -129.675;
const KNOB_MAX_ANGLE = 129.675;

function setKnobAngle(dialEl, paramDef, value) {
  const norm = (value - paramDef.min) / (paramDef.max - paramDef.min);
  const angle = KNOB_MIN_ANGLE + norm * (KNOB_MAX_ANGLE - KNOB_MIN_ANGLE);
  dialEl.style.setProperty('--knob-angle', `${angle}deg`);
}

function buildParamRow(paramDef, value, onChange) {
  const row = document.createElement('div');
  row.className = 'knob-row';

  if (paramDef.type === 'select') {
    const label = document.createElement('label');
    label.textContent = paramDef.label;
    row.appendChild(label);
    const select = document.createElement('select');
    select.className = 'pedal-select';
    paramDef.options.forEach((opt) => {
      const o = document.createElement('option');
      o.value = opt.value; o.textContent = opt.label;
      if (opt.value === value) o.selected = true;
      select.appendChild(o);
    });
    select.addEventListener('change', () => onChange(select.value));
    row.appendChild(select);
    return row;
  }

  const dialWrap = document.createElement('div');
  dialWrap.className = 'knob-dial-wrap';
  const ticks = document.createElement('div');
  ticks.className = 'knob-ticks';
  const dial = document.createElement('div');
  dial.className = 'knob-dial';
  const pointer = document.createElement('div');
  pointer.className = 'knob-pointer';
  dial.appendChild(pointer);
  setKnobAngle(dialWrap, paramDef, value);
  dialWrap.appendChild(ticks);
  dialWrap.appendChild(dial);
  row.appendChild(dialWrap);

  const label = document.createElement('label');
  const valueSpan = document.createElement('span');
  valueSpan.className = 'knob-value';
  valueSpan.textContent = formatValue(value) + (paramDef.unit || '');
  label.textContent = paramDef.label + ' ';
  label.appendChild(valueSpan);
  row.appendChild(label);

  const input = document.createElement('input');
  input.type = 'range';
  input.min = paramDef.min; input.max = paramDef.max; input.step = stepFor(paramDef);
  input.value = value;
  input.addEventListener('input', () => {
    const v = parseFloat(input.value);
    valueSpan.textContent = formatValue(v) + (paramDef.unit || '');
    setKnobAngle(dialWrap, paramDef, v);
    onChange(v);
  });
  row.appendChild(input);

  valueSpan.tabIndex = 0;
  valueSpan.title = 'Click to type an exact value';
  valueSpan.addEventListener('click', (e) => {
    e.stopPropagation();
    const previous = parseFloat(input.value);

    const editInput = document.createElement('input');
    editInput.type = 'text';
    editInput.inputMode = 'decimal';
    editInput.className = 'knob-value-edit';
    editInput.value = String(previous);
    label.replaceChild(editInput, valueSpan);
    editInput.focus();
    editInput.select();

    let settled = false;
    const commit = () => {
      if (settled) return;
      settled = true;
      const parsed = parseFloat(editInput.value);
      const valid = editInput.value.trim() !== '' && Number.isFinite(parsed) && parsed >= paramDef.min && parsed <= paramDef.max;
      const finalValue = valid ? parsed : previous;
      if (valid) {
        input.value = finalValue;
        setKnobAngle(dialWrap, paramDef, finalValue);
        onChange(finalValue);
      }
      valueSpan.textContent = formatValue(finalValue) + (paramDef.unit || '');
      label.replaceChild(valueSpan, editInput);
    };
    editInput.addEventListener('blur', commit);
    editInput.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') { ev.preventDefault(); commit(); }
      else if (ev.key === 'Escape') { ev.preventDefault(); editInput.value = String(previous); commit(); }
    });
  });
  return row;
}

export function showInfoPopover(anchorEl, title, text) {
  document.querySelectorAll('.pedal-info-popover').forEach((p) => p.remove());
  const popover = document.createElement('div');
  popover.className = 'pedal-info-popover';
  const titleEl = document.createElement('span');
  titleEl.className = 'popover-title';
  titleEl.textContent = title;
  const bodyEl = document.createElement('span');
  bodyEl.textContent = text;
  popover.appendChild(titleEl);
  popover.appendChild(bodyEl);
  document.body.appendChild(popover);

  const rect = anchorEl.getBoundingClientRect();
  const left = Math.min(rect.left + window.scrollX, window.innerWidth - popover.offsetWidth - 16);
  popover.style.top = `${rect.bottom + window.scrollY + 6}px`;
  popover.style.left = `${Math.max(8, left)}px`;

  const closeOnOutside = (e) => {
    if (!popover.contains(e.target) && e.target !== anchorEl) {
      popover.remove();
      document.removeEventListener('click', closeOnOutside, true);
    }
  };
  setTimeout(() => document.addEventListener('click', closeOnOutside, true), 0);
}

const SVG_NS = 'http://www.w3.org/2000/svg';

// Jack points for a cable between two pedals, in coordinates relative to `container`.
function wireEndpoints(cardA, cardB, container) {
  const cRect = container.getBoundingClientRect();
  const a = cardA.getBoundingClientRect();
  const b = cardB.getBoundingClientRect();
  return {
    x1: a.right - cRect.left, y1: a.top - cRect.top + a.height * 0.64,
    x2: b.left - cRect.left, y2: b.top - cRect.top + b.height * 0.64,
    aBottom: a.bottom - cRect.top, bTop: b.top - cRect.top,
    sameRow: Math.abs(a.bottom - b.bottom) < 2,
  };
}

// Patch-cable path between two pedals' jack points. Pedals on the same flex row
// (same bottom edge, since the row is bottom-aligned) get a gently sagging cable.
// A pedal that wrapped to a new row gets an orthogonal "staple" instead of a wide
// diagonal sweep: a short straight lead out of the source jack (a real plug
// doesn't turn the instant it leaves the barrel), one rounded corner down into
// the row-gap, a level run parallel to the row tops, a rounded corner back up,
// and a matching straight lead into the destination — so both the leftmost and
// rightmost pedal in the bend get a visible straight run right at the jack
// before the cable actually bends, rather than kinking at the pedal edge.
function wirePathBetween({ x1, y1, x2, y2, sameRow, aBottom, bTop }) {
  if (sameRow) {
    const midX = (x1 + x2) / 2;
    const sag = 10;
    return `M ${x1} ${y1} C ${midX} ${y1 + sag}, ${midX} ${y2 + sag}, ${x2} ${y2}`;
  }
  const yh = (aBottom + bTop) / 2;
  const lead = Math.min(14, Math.abs(x2 - x1) / 4);
  // The source's own jack always points east (.jack-nub sits on the pedal's
  // right edge); the destination is entered at its left edge, so its lead runs
  // west, away from the pedal body — independent of which side x2 lands on.
  const sx = x1 + lead;
  const dx = x2 - lead;
  const r = Math.min(14, Math.abs(dx - sx) / 2, Math.abs(yh - y1) / 2, Math.abs(y2 - yh) / 2);
  const hx = Math.sign(dx - sx) || 1;
  return `M ${x1} ${y1} L ${sx} ${y1} L ${sx} ${yh - r} Q ${sx} ${yh}, ${sx + hx * r} ${yh} L ${dx - hx * r} ${yh} Q ${dx} ${yh}, ${dx} ${yh + r} L ${dx} ${y2} L ${x2} ${y2}`;
}

export function updateChainWires(container) {
  let svg = container.querySelector(':scope > svg.chain-wires');
  if (!svg) {
    svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'chain-wires');
  }
  container.insertBefore(svg, container.firstChild); // stays behind the cards
  // While a card is mid-drag it's position:fixed (no longer part of the flex
  // flow), so its dashed placeholder stands in for it at the landing slot.
  const cards = [...container.querySelectorAll(':scope > .pedal-stompbox:not(.dragging), :scope > .pedal-card-placeholder')];
  const cRect = container.getBoundingClientRect();
  svg.setAttribute('width', cRect.width);
  svg.setAttribute('height', cRect.height);
  svg.innerHTML = '';

  // Braided nylon jacket, referenced from sources/photos/cable.jpg and cable2.jpg:
  // a diagonal weave with three interleaved tones (not a flat cord, and not a
  // clean two-tone candy stripe) so it reads as woven fiber, not printed pattern.
  const defs = document.createElementNS(SVG_NS, 'defs');
  const pattern = document.createElementNS(SVG_NS, 'pattern');
  pattern.setAttribute('id', 'cableBraid');
  pattern.setAttribute('width', '6');
  pattern.setAttribute('height', '6');
  pattern.setAttribute('patternUnits', 'userSpaceOnUse');
  pattern.setAttribute('patternTransform', 'rotate(45)');
  const swatches = [
    ['cable-braid-dark', 0, 6, 6],
    ['cable-braid-mid', 0, 3.4, 6],
    ['cable-braid-light', 0, 2, 6],
  ];
  for (const [cls, x, w, h] of swatches) {
    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', x);
    rect.setAttribute('width', w);
    rect.setAttribute('height', h);
    rect.setAttribute('class', cls);
    pattern.appendChild(rect);
  }
  // Grain flecks — fixed, hand-placed positions (not runtime randomness or a
  // per-pixel filter) so the weave reads as matte spun fiber instead of a clean
  // printed/glossy stripe.
  const flecks = [
    [1, 1, 0.55, 'cable-grain-dark'], [4.2, 0.8, 0.4, 'cable-grain-light'],
    [2.6, 3.1, 0.45, 'cable-grain-light'], [0.6, 4.6, 0.4, 'cable-grain-dark'],
    [5.2, 4.2, 0.5, 'cable-grain-dark'], [3.4, 5.4, 0.4, 'cable-grain-light'],
  ];
  for (const [cx, cy, r, cls] of flecks) {
    const fleck = document.createElementNS(SVG_NS, 'circle');
    fleck.setAttribute('cx', cx);
    fleck.setAttribute('cy', cy);
    fleck.setAttribute('r', r);
    fleck.setAttribute('class', cls);
    pattern.appendChild(fleck);
  }
  defs.appendChild(pattern);
  svg.appendChild(defs);

  // Draws one cable as the same layered-fake-material stack used for the knob
  // dial and footswitch, back to front: a two-distance ground shadow (soft far +
  // tight near, same vocabulary as .pedal-stompbox's own rest shadow), a fuzzy
  // halo of stray fiber ends (cotton/nylon jackets are never a crisp silhouette),
  // a dark rim so the woven jacket reads as a rounded cord, the braided body
  // itself, an under-shade, and a specular highlight — then a gold-plated 1/4"
  // plug tip (see sources/photos/cable.jpg/cable2.jpg) at each given point.
  function drawWire(d, tipPoints) {
    const group = document.createElementNS(SVG_NS, 'g');
    group.setAttribute('class', 'chain-wire');
    for (const cls of ['chain-wire-shadow-far', 'chain-wire-shadow-near', 'chain-wire-fuzz', 'chain-wire-rim', 'chain-wire-body', 'chain-wire-undershade', 'chain-wire-highlight']) {
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('class', cls);
      path.setAttribute('d', d);
      group.appendChild(path);
    }
    for (const [x, y] of tipPoints) {
      const tip = document.createElementNS(SVG_NS, 'circle');
      tip.setAttribute('class', 'chain-wire-tip');
      tip.setAttribute('cx', x);
      tip.setAttribute('cy', y);
      tip.setAttribute('r', 3.2);
      group.appendChild(tip);
    }
    svg.appendChild(group);
  }

  for (let i = 0; i < cards.length - 1; i++) {
    const ends = wireEndpoints(cards[i], cards[i + 1], container);
    drawWire(wirePathBetween(ends), [[ends.x1, ends.y1], [ends.x2, ends.y2]]);
  }

  // Input/output stubs: a short run of cable heading off the first and last
  // pedal, into the extra board padding either side (see .pedal-chain), so the
  // chain reads as visibly wired even when it's short enough to need no bend.
  if (cards.length > 0) {
    const stub = 24;
    const first = cards[0].getBoundingClientRect();
    const last = cards[cards.length - 1].getBoundingClientRect();
    const y1 = first.top - cRect.top + first.height * 0.64;
    const x1 = first.left - cRect.left;
    drawWire(`M ${Math.max(0, x1 - stub)} ${y1} L ${x1} ${y1}`, [[Math.max(0, x1 - stub), y1]]);
    const y2 = last.top - cRect.top + last.height * 0.64;
    const x2 = last.right - cRect.left;
    drawWire(`M ${x2} ${y2} L ${x2 + stub} ${y2}`, [[x2 + stub, y2]]);
  }
}

// Redraw the most recently rendered chain's wires on viewport/layout changes
// (pedals reflow to a different number of rows as the window is resized).
let lastWireContainer = null;
window.addEventListener('resize', () => {
  if (lastWireContainer && lastWireContainer.isConnected) updateChainWires(lastWireContainer);
});

export function renderChain(engine, container, template, callbacks) {
  lastWireContainer = container;
  container.innerHTML = '';
  engine.chain.forEach((inst) => {
    const frag = template.content.cloneNode(true);
    const card = frag.querySelector('.pedal-stompbox');
    card.dataset.instanceId = inst.instanceId;
    card.style.setProperty('--pedal-color', pedalColor(inst.typeDef));
    if (inst.kind === 'amp') {
      card.classList.add('amp-card');
      if (inst.typeDef.accent) card.style.setProperty('--pedal-accent', inst.typeDef.accent);
      if (inst.typeDef.trim) card.style.setProperty('--pedal-trim', inst.typeDef.trim);
    } else if (inst.typeDef.category) {
      card.dataset.category = inst.typeDef.category;
    }
    if (!inst.enabled) card.classList.add('disabled-pedal');

    card.querySelector('.pedal-label').textContent = inst.typeDef.label;

    const knobsHost = card.querySelector('.pedal-knobs');
    inst.typeDef.params.forEach((paramDef) => {
      const row = buildParamRow(paramDef, inst.params[paramDef.key], (v) => callbacks.onParamChange(inst.instanceId, paramDef.key, v));
      knobsHost.appendChild(row);
    });

    card.querySelector('.pedal-footswitch').addEventListener('click', () => callbacks.onToggle(inst.instanceId));
    card.querySelector('.pedal-remove').addEventListener('click', (e) => { e.stopPropagation(); callbacks.onRemove(inst.instanceId); });
    const infoBtn = card.querySelector('.pedal-info');
    infoBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      showInfoPopover(infoBtn, inst.typeDef.label, inst.typeDef.about || 'No description available.');
    });

    // Handle-only reorder, built on Pointer Events rather than native HTML5 drag-and-drop.
    // Native DnD requires the browser to recognize a precise drag gesture over the exact
    // element (finicky in practice, inconsistent across browsers, and not something we can
    // even simulate for testing) — pointer events give full, reliable, testable control,
    // and only the grip's pointerdown can start a drag at all.
    const grip = card.querySelector('.pedal-grip');
    grip.addEventListener('pointerdown', (e) => {
      if (e.button !== undefined && e.button !== 0) return; // left click / primary touch only
      e.preventDefault();
      startCardDrag(card, container, callbacks, e);
    });

    container.appendChild(frag);
  });
  updateChainWires(container);
}

function getDragAfterElement(container, x) {
  const cards = [...container.querySelectorAll('.pedal-stompbox:not(.dragging)')];
  return cards.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = x - box.left - box.width / 2;
    if (offset < 0 && offset > closest.offset) return { offset, element: child };
    return closest;
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function startCardDrag(card, container, callbacks, startEvent) {
  const pointerId = startEvent.pointerId;
  const startRect = card.getBoundingClientRect();
  // Where the pointer grabbed the card, relative to its own top-left — kept constant so
  // the card doesn't jump under the cursor when it lifts off the layout.
  const grabOffsetX = startEvent.clientX - startRect.left;
  const grabOffsetY = startEvent.clientY - startRect.top;

  // A dashed placeholder takes the card's place in the flex flow and is what actually
  // moves as you drag — it's the "here's where this will land" preview. The real card
  // is lifted out of flow entirely (fixed-positioned) and just follows the cursor.
  const placeholder = document.createElement('div');
  placeholder.className = 'pedal-card-placeholder';
  placeholder.style.width = `${startRect.width}px`;
  placeholder.style.height = `${startRect.height}px`;
  placeholder.style.setProperty('--pedal-color', card.style.getPropertyValue('--pedal-color'));
  card.parentNode.insertBefore(placeholder, card);

  card.classList.add('dragging');
  card.style.position = 'fixed';
  card.style.left = `${startRect.left}px`;
  card.style.top = `${startRect.top}px`;
  card.style.width = `${startRect.width}px`;
  card.style.margin = '0';
  card.style.zIndex = '200';

  const onPointerMove = (e) => {
    if (e.pointerId !== pointerId) return;
    card.style.left = `${e.clientX - grabOffsetX}px`;
    card.style.top = `${e.clientY - grabOffsetY}px`;
    const afterElement = getDragAfterElement(container, e.clientX);
    if (afterElement == null) container.appendChild(placeholder);
    else if (afterElement !== placeholder) container.insertBefore(placeholder, afterElement);
    updateChainWires(container);
  };

  const finish = (e) => {
    if (e.pointerId !== pointerId) return;
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', finish);
    document.removeEventListener('pointercancel', finish);
    card.classList.remove('dragging');
    card.style.position = '';
    card.style.left = '';
    card.style.top = '';
    card.style.width = '';
    card.style.margin = '';
    card.style.zIndex = '';
    container.insertBefore(card, placeholder);
    placeholder.remove();
    updateChainWires(container);
    const newOrder = [...container.querySelectorAll('.pedal-stompbox')].map((el) => el.dataset.instanceId);
    callbacks.onReorder(newOrder);
  };

  document.addEventListener('pointermove', onPointerMove);
  document.addEventListener('pointerup', finish);
  document.addEventListener('pointercancel', finish);
}

// ---------------------------------------------------------------------------

export function buildAddMenu(onPick) {
  const menu = document.createElement('div');
  menu.className = 'add-pedal-menu';

  const ampGroups = [
    { title: 'Amps', items: AMP_TYPES.filter((a) => a.group === 'standard'), color: 'oklch(70% 0.08 80)' },
    { title: 'Signature', items: AMP_TYPES.filter((a) => a.group === 'signature'), color: 'oklch(75% 0.13 85)' },
  ];
  ampGroups.forEach((group) => {
    const heading = document.createElement('div');
    heading.className = 'add-menu-heading';
    heading.textContent = group.title;
    heading.style.setProperty('--cat-color', group.color);
    menu.appendChild(heading);
    group.items.forEach((item) => {
      const btn = document.createElement('button');
      btn.className = 'add-menu-item';
      btn.style.setProperty('--pedal-color', item.color);
      btn.textContent = item.label;
      if (item.blurb) btn.title = item.blurb;
      btn.addEventListener('click', () => onPick('amp', item.id));
      menu.appendChild(btn);
    });
  });

  Object.entries(CATEGORIES).forEach(([catId, catInfo]) => {
    const items = PEDAL_TYPES.filter((p) => p.category === catId);
    if (!items.length) return;
    const heading = document.createElement('div');
    heading.className = 'add-menu-heading';
    heading.textContent = catInfo.label;
    heading.style.setProperty('--cat-color', catInfo.swatch);
    menu.appendChild(heading);
    items.forEach((item) => {
      const btn = document.createElement('button');
      btn.className = 'add-menu-item';
      btn.style.setProperty('--pedal-color', pedalColor(item));
      btn.textContent = item.label;
      if (item.blurb) btn.title = item.blurb;
      btn.addEventListener('click', () => onPick('pedal', item.id));
      menu.appendChild(btn);
    });
  });

  return menu;
}

export function showAddMenu(anchorEl, onPick) {
  document.querySelectorAll('.add-pedal-menu').forEach((m) => m.remove());
  const menu = buildAddMenu((kind, typeId) => { onPick(kind, typeId); menu.remove(); });
  document.body.appendChild(menu);
  const rect = anchorEl.getBoundingClientRect();
  menu.style.top = `${rect.bottom + window.scrollY + 6}px`;
  menu.style.left = `${Math.min(rect.left + window.scrollX, window.innerWidth - menu.offsetWidth - 320)}px`;

  const closeOnOutside = (e) => {
    if (!menu.contains(e.target) && e.target !== anchorEl) {
      menu.remove();
      document.removeEventListener('click', closeOnOutside, true);
    }
  };
  setTimeout(() => document.addEventListener('click', closeOnOutside, true), 0);
}

// ---------------------------------------------------------------------------

export function showDemoMenu(anchorEl, demos, onPick) {
  document.querySelectorAll('.demo-menu').forEach((m) => m.remove());
  const menu = document.createElement('div');
  menu.className = 'demo-menu';
  demos.forEach((demo) => {
    const btn = document.createElement('button');
    btn.className = 'demo-menu-item';
    const name = document.createElement('span');
    name.className = 'demo-name'; name.textContent = demo.name;
    const blurb = document.createElement('span');
    blurb.className = 'demo-blurb'; blurb.textContent = demo.blurb;
    btn.appendChild(name); btn.appendChild(blurb);
    btn.addEventListener('click', () => { onPick(demo); menu.remove(); });
    menu.appendChild(btn);
  });
  document.body.appendChild(menu);
  const rect = anchorEl.getBoundingClientRect();
  menu.style.top = `${rect.bottom + window.scrollY + 6}px`;
  menu.style.left = `${Math.min(rect.left + window.scrollX, window.innerWidth - menu.offsetWidth - 320)}px`;

  const closeOnOutside = (e) => {
    if (!menu.contains(e.target) && e.target !== anchorEl) {
      menu.remove();
      document.removeEventListener('click', closeOnOutside, true);
    }
  };
  setTimeout(() => document.addEventListener('click', closeOnOutside, true), 0);
}

export function updateLevelMeter(analyser, barEl) {
  const data = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(data);
  let peak = 0;
  for (let i = 0; i < data.length; i++) {
    const v = Math.abs(data[i] - 128) / 128;
    if (v > peak) peak = v;
  }
  barEl.style.transform = `scaleX(${Math.min(1, peak * 1.3)})`;
}

// Static min/max-per-column waveform of a fully-recorded buffer (distinct from
// drawScope's live scrolling scope of the pre-effects input signal).
export function drawWaveform(buffer, canvas) {
  const ctx2d = canvas.getContext('2d');
  const { width, height } = canvas;
  ctx2d.clearRect(0, 0, width, height);
  if (!buffer) return;
  const data = buffer.getChannelData(0);
  const mid = height / 2;
  const samplesPerPixel = Math.max(1, Math.floor(data.length / width));
  ctx2d.fillStyle = 'rgba(226, 163, 62, 0.18)';
  ctx2d.strokeStyle = '#e2a33e';
  ctx2d.lineWidth = 1;
  ctx2d.beginPath();
  ctx2d.moveTo(0, mid);
  for (let x = 0; x < width; x++) {
    let max = 0;
    const start = x * samplesPerPixel;
    const end = Math.min(data.length, start + samplesPerPixel);
    for (let i = start; i < end; i++) {
      const v = Math.abs(data[i]);
      if (v > max) max = v;
    }
    const h = max * (mid - 3);
    ctx2d.lineTo(x, mid - h);
  }
  for (let x = width - 1; x >= 0; x--) {
    let max = 0;
    const start = x * samplesPerPixel;
    const end = Math.min(data.length, start + samplesPerPixel);
    for (let i = start; i < end; i++) {
      const v = Math.abs(data[i]);
      if (v > max) max = v;
    }
    const h = max * (mid - 3);
    ctx2d.lineTo(x, mid + h);
  }
  ctx2d.closePath();
  ctx2d.fill();
  ctx2d.stroke();
  ctx2d.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx2d.beginPath();
  ctx2d.moveTo(0, mid);
  ctx2d.lineTo(width, mid);
  ctx2d.stroke();
}

export function drawScope(analyser, canvas) {
  const ctx2d = canvas.getContext('2d');
  const data = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(data);
  const { width, height } = canvas;
  ctx2d.clearRect(0, 0, width, height);
  ctx2d.strokeStyle = '#e2a33e';
  ctx2d.lineWidth = 1.5;
  ctx2d.beginPath();
  const step = data.length / width;
  for (let x = 0; x < width; x++) {
    const v = data[Math.floor(x * step)] / 128 - 1;
    const y = height / 2 + v * (height / 2 - 2);
    if (x === 0) ctx2d.moveTo(x, y); else ctx2d.lineTo(x, y);
  }
  ctx2d.stroke();
}

// Static trace of an already-rendered sample array (distinct from drawScope's
// live analyser read) — used for the toolbar's offline "signal preview".
// Auto-scaled to its own peak (like a scope's autoranging) rather than a fixed
// +/-1 — a pedal chain's output level varies hugely (a compressor/EQ-heavy chain
// might peak at 0.04, a cranked overdrive well past 1), and at a fixed scale
// most setups would just draw as a flat, seemingly unreacting line.
export function drawStaticWave(samples, canvas) {
  const ctx2d = canvas.getContext('2d');
  const { width, height } = canvas;
  ctx2d.clearRect(0, 0, width, height);
  if (!samples || !samples.length) return;
  let peak = 0;
  for (let i = 0; i < samples.length; i++) { const a = Math.abs(samples[i]); if (a > peak) peak = a; }
  if (peak < 1e-4) peak = 1e-4; // silence stays a flat centered line instead of divide-by-near-zero noise
  ctx2d.strokeStyle = '#e2a33e'; // same amber trace as drawScope, for the same .scope bezel
  ctx2d.lineWidth = 1.3;
  ctx2d.beginPath();
  const step = samples.length / width;
  for (let x = 0; x < width; x++) {
    const v = Math.max(-1, Math.min(1, samples[Math.floor(x * step)] / peak));
    const y = height / 2 - v * (height / 2 - 2);
    if (x === 0) ctx2d.moveTo(x, y); else ctx2d.lineTo(x, y);
  }
  ctx2d.stroke();
}
