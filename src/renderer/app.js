/* Startshaper window. Everything it shows comes from the last check; changes go through window.ss. */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const IS_MAC = ss.platform === 'darwin';
if (!IS_MAC) document.body.classList.add('win');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const mb = (b) => (b >= 1e9 ? (b / 1073741824).toFixed(1) + ' GB' : Math.max(1, Math.round(b / 1048576)) + ' MB');
const secs = (ms) => (ms >= 10000 ? Math.round(ms / 1000) : (ms / 1000).toFixed(1)) + ' s';
let PC = IS_MAC ? 'Mac' : 'PC';
let OS = IS_MAC ? 'macOS' : 'Windows';
// Demo data is a Windows PC even when shown on a Mac.
const usePlatform = (p) => { PC = p === 'darwin' ? 'Mac' : 'PC'; OS = p === 'darwin' ? 'macOS' : 'Windows'; };

let R = null;            // last check
let history = [];
let view = 'startup';
let showKeep = false;
const openRows = new Set();

// ---------- start screen ----------
$('#homeTitle').textContent = `Why is my ${PC} slow?`;
$('#checkBtn').textContent = `Check my ${PC}`;
if (IS_MAC) $('#stepBoot').textContent = 'Finding login items and background helpers';
{
  const g = $('.g-ticks');
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI * (1 - i / 10), r1 = 74, r2 = i % 5 ? 80 : 84;
    g.insertAdjacentHTML('beforeend', `<line x1="${120 + r1 * Math.cos(a)}" y1="${124 - r1 * Math.sin(a)}" x2="${120 + r2 * Math.cos(a)}" y2="${124 - r2 * Math.sin(a)}"/>`);
  }
  requestAnimationFrame(() => { $('#gauge').classList.add('on'); $('.needle').style.transform = 'rotate(52deg)'; });
}

ss.settings().then((s) => { $('#autoUpd').checked = s.autoUpdate !== false; history = s.history || []; updateCount(); });
$('#autoUpd').addEventListener('change', (e) => ss.setSettings({ autoUpdate: e.target.checked }));

async function check() {
  document.body.classList.add('is-scanning');
  $('#checkBtn').disabled = true;
  $('#steps').hidden = false;
  $('#gauge').classList.add('scan');
  const steps = $$('#steps li');
  steps.forEach((l) => l.classList.remove('go', 'done'));
  let i = 0;
  steps[0].classList.add('go');
  const tick = setInterval(() => { if (i < steps.length - 1) { steps[i].classList.replace('go', 'done'); steps[++i].classList.add('go'); } }, 900);
  const t0 = performance.now();
  R = await ss.scan();
  usePlatform(R.platform);
  // Let the steps finish so it doesn't flash.
  const wait = Math.max(0, 2200 - (performance.now() - t0));
  await new Promise((r) => setTimeout(r, wait));
  clearInterval(tick);
  steps.forEach((l) => { l.classList.remove('go'); l.classList.add('done'); });
  history = R.history || history;
  await new Promise((r) => setTimeout(r, 350));
  $('#gauge').classList.remove('scan');
  $('#checkBtn').disabled = false;
  document.body.classList.remove('is-home', 'is-scanning');
  $('#seg').hidden = false; $('#again').hidden = false;
  show('startup');
}
$('#checkBtn').addEventListener('click', check);
$('#again').addEventListener('click', async () => {
  $('#again').disabled = true;
  R = await ss.scan();
  history = R.history || history;
  $('#again').disabled = false;
  render();
});

// ---------- views ----------
function show(v) {
  view = v;
  $$('.view').forEach((s) => s.classList.toggle('on', s.id === v));
  $$('#seg button').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
  movePill();
  $('#stage').scrollTop = 0;
  render();
}
function movePill() {
  const b = $(`#seg button[data-v="${view}"]`), seg = $('#seg');
  if (!b || seg.hidden) return;
  const pill = $('#segPill');
  pill.style.width = b.offsetWidth + 'px';
  pill.style.transform = `translateX(${b.offsetLeft}px)`;
}
$$('#seg button').forEach((b) => b.addEventListener('click', () => show(b.dataset.v)));
window.addEventListener('resize', movePill);

function render() {
  if (!R) return;
  if (view === 'startup') renderStartup();
  if (view === 'now') renderNow();
  if (view === 'changes') renderChanges();
  updateCount();
}

// ---------- icons ----------
const iconCache = new Map();
function iconHTML(it, cls = '', extra = '') {
  const letter = esc((it.name || '?').trim().charAt(0).toUpperCase());
  const p = it.app || it.exe;
  let h = 0; for (const c of String(it.name || '')) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `<span class="ic ${cls}" style="--h:${h};${extra}" data-icon="${esc(p || '')}">${letter}</span>`;
}
async function fillIcons(root) {
  for (const el of $$('[data-icon]', root)) {
    const p = el.dataset.icon;
    if (!p) continue;
    if (!iconCache.has(p)) iconCache.set(p, ss.icon(p));
    const url = await iconCache.get(p);
    if (url && el.isConnected) { el.classList.add('has-img'); el.innerHTML = `<img src="${url}" alt="">`; }
  }
}

// ---------- startup ----------
const VERDICT = {
  safe: ['Safe to turn off', 'The apps still open when you click them.'],
  check: ['Your call', 'Fine to turn off if you don\'t need what it does the moment you log in.'],
  keep: ['Leave these on', 'Security, drivers and tools that only work while they run.'],
};
const cost = (it) => (it.slowMs != null ? it.slowMs : it.mem);
const onSafe = () => R.items.filter((i) => i.verdict === 'safe' && i.on && i.canToggle);

function renderStartup() {
  const items = R.items;
  const on = items.filter((i) => i.on);
  const safe = onSafe();
  const hasBoot = R.bootSeconds != null && items.some((i) => i.slowMs != null);

  // Headline
  if (hasBoot) {
    const safeMs = safe.reduce((s, i) => s + (i.slowMs || 0), 0);
    $('#heroTitle').innerHTML = `Your ${PC} takes <em>${R.bootSeconds} s</em> to start.`;
    $('#heroSub').innerHTML = safe.length
      ? `These <b>${safe.length} app${safe.length > 1 ? 's' : ''}</b> add about <b>${secs(safeMs)}</b>, and they're safe to switch off.`
      : `Nothing safe is left to switch off. ${on.length} item${on.length === 1 ? '' : 's'} still start${on.length === 1 ? 's' : ''} with ${OS}.`;
  } else {
    const safeMem = safe.reduce((s, i) => s + i.mem, 0);
    $('#heroTitle').innerHTML = `<em>${on.length} app${on.length === 1 ? '' : 's'}</em> start by themselves when you log in.`;
    $('#heroSub').innerHTML = safe.length
      ? `<b>${safe.length}</b> of them are safe to switch off${safeMem > 20e6 ? `, and they're using <b>${mb(safeMem)}</b> of memory right now` : ''}. The apps still open when you click them.`
      : 'Nothing safe is left to switch off. What is left is security, drivers or your own picks.';
  }
  const btn = $('#allSafe');
  btn.textContent = safe.length ? (safe.length === 1 ? 'Turn off the safe one' : `Turn off the ${safe.length} safe ones`) : 'All done';
  btn.disabled = !safe.length;
  $('#heroHint').textContent = safe.length ? 'Each app still opens when you click it. You can undo this any time.' : 'Everything you switched off is in Changes, ready to undo.';

  // Timeline: each app's share of the startup time, Windows' own part in grey.
  const tl = $('#timeline');
  tl.hidden = !hasBoot;
  if (hasBoot) {
    const total = R.bootSeconds * 1000;
    const segs = items.filter((i) => i.slowMs).sort((a, b) => ({ safe: 0, check: 1, keep: 2 }[a.verdict] - { safe: 0, check: 1, keep: 2 }[b.verdict]) || b.slowMs - a.slowMs);
    const bar = $('#tlBar');
    if (bar.dataset.at !== String(R.at)) {
      bar.dataset.at = String(R.at);
      bar.innerHTML = segs.map((i, n) => `<div class="tl-seg ${i.verdict}" data-id="${esc(i.id)}" style="flex-basis:${(i.slowMs / total) * 100}%;animation-delay:${n * 45}ms" title="${esc(i.name)}: ${secs(i.slowMs)}">${i.slowMs / total > 0.055 ? `<span>${esc(i.name)}</span>` : ''}</div>`).join('') + `<div class="tl-sys">${OS} itself</div>`;
    }
    for (const el of $$('.tl-seg', bar)) el.classList.toggle('off', !items.find((i) => i.id === el.dataset.id).on);
    const saved = items.filter((i) => !i.on && i.slowMs).reduce((s, i) => s + i.slowMs, 0);
    $('#tlEnd').textContent = `${R.bootSeconds} s`;
    const after = $('#tlAfter');
    after.textContent = saved ? `About ${Math.max(1, Math.round((total - saved) / 1000))} s next time` : '';
    after.classList.toggle('on', !!saved);
  }

  // Count tiles: click one to jump to its group
  const n = (v) => items.filter((i) => i.verdict === v);
  const sub = (list) => {
    const off = list.filter((i) => !i.on).length;
    if (off) return `${off} switched off`;
    const ms = list.reduce((t, i) => t + (i.slowMs || 0), 0);
    if (ms) return `+${secs(ms)} at startup`;
    const m = list.reduce((t, i) => t + i.mem, 0);
    return m > 5e6 ? `${mb(m)} in use now` : 'Not using much now';
  };
  $('#tiles').innerHTML = ['safe', 'check', 'keep'].map((v, k) => { const l = n(v); return l.length ? `<button class="tile t-${v}" data-jump="${v}" style="animation-delay:${80 + k * 60}ms"><div class="t-n">${l.length}</div><div class="t-l">${VERDICT[v][0]}</div><div class="t-s">${sub(l)}</div></button>` : ''; }).join('');

  // Groups
  const out = [];
  for (const v of ['safe', 'check', 'keep']) {
    const list = items.filter((i) => i.verdict === v).sort((a, b) => cost(b) - cost(a));
    if (!list.length) continue;
    const hide = v === 'keep' && !showKeep;
    out.push(`<div class="group g-${v}" id="g-${v}"><div class="group-h"><h3>${VERDICT[v][0]}</h3><p>${VERDICT[v][1]}</p>${v === 'keep' ? `<button class="more" id="keepMore">${hide ? `Show ${list.length}` : 'Hide'}</button>` : ''}</div>`);
    if (!hide) out.push(`<div class="list">${list.map((i) => rowHTML(i)).join('')}</div>`);
    out.push('</div>');
  }
  if (!items.length) out.push(`<div class="empty" style="margin-top:24px">Nothing starts by itself. Your ${PC} is already lean.</div>`);
  $('#groups').innerHTML = out.join('');
  for (const id of openRows) { const r = $(`[data-row="${CSS.escape(id)}"]`); if (r) r.classList.add('open'); }
  fillIcons($('#startup'));
  const km = $('#keepMore');
  if (km) km.addEventListener('click', () => { showKeep = !showKeep; renderStartup(); });
}

const KIND = { login: 'Login item', agent: 'Background helper', daemon: 'System helper', run: 'Startup app', folder: 'Startup folder shortcut' };
function rowHTML(i) {
  const stat = i.slowMs != null ? `<span class="r-stat slow">+${secs(i.slowMs)} at startup</span>`
    : i.running ? `<span class="r-stat run">Running${i.mem > 5e6 ? ` · ${mb(i.mem)}` : ''}</span>` : '<span class="r-stat">Not running</span>';
  const act = i.canToggle
    ? `<button class="sw ${i.on ? 'on' : ''}" data-tog="${esc(i.id)}" role="switch" aria-checked="${i.on}" aria-label="Start ${esc(i.name)} by itself"></button>`
    : `<button class="link-btn" data-sys title="Needs an admin password">${PC === 'Mac' ? 'Login Items ↗' : 'Task Manager ↗'}</button>`;
  const where = i.app || i.exe || (i.parts[0] && (i.parts[0].plist || i.parts[0].cmd));
  const kinds = [...new Set(i.parts.map((p) => KIND[p.kind] || p.kind))].join(', ');
  const word = { safe: 'Safe to turn off.', check: 'Your call.', keep: 'Leave it on.' }[i.verdict];
  return `<div class="row can-open ${i.on ? '' : 'off'}" data-row="${esc(i.id)}">
    <div class="r-top">${iconHTML(i)}
      <div class="r-main"><div class="r-name">${esc(i.name)}${i.type && i.type !== i.name ? `<span class="r-type">${esc(i.type)}</span>` : ''}</div>
        <div class="r-what">${esc(i.what)}</div></div>
      ${stat}
      <div class="r-act">${act}</div></div>
    <div class="r-more g-${i.verdict}"><div><div class="r-more-in">
      <div class="advice"><b>${word}</b>${esc(i.tip || (i.verdict === 'check' ? 'Not sure what it is? Leave it on, or switch it off and see if you miss anything. You can always turn it back on.' : ''))}</div>
      <div class="facts"><span><b>${i.parts.length > 1 ? `${i.parts.length} parts` : 'Kind'}:</b> ${esc(kinds)}</span>${i.procs ? `<span><b>Right now:</b> ${i.procs} process${i.procs > 1 ? 'es' : ''}, ${mb(i.mem)}</span>` : ''}${i.needsAdmin ? '<span><b>Needs:</b> an admin password</span>' : ''}
        ${where ? `<code title="${esc(where)}">${esc(where)}</code>` : ''}${R.demo ? '' : `<button class="link-btn" data-reveal="${esc(i.id)}">${PC === 'Mac' ? 'Show in Finder' : 'Show in folder'}</button>`}</div>
    </div></div></div></div>`;
}

document.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-tog]');
  if (t) return toggle(t.dataset.tog, !t.classList.contains('on'), t);
  if (e.target.closest('[data-sys]')) return ss.openSystem();
  const rv = e.target.closest('[data-reveal]');
  if (rv) return ss.reveal(rv.dataset.reveal);
  const j = e.target.closest('[data-jump]');
  if (j) { if (j.dataset.jump === 'keep' && !showKeep) { showKeep = true; renderStartup(); } return $('#g-' + j.dataset.jump)?.scrollIntoView({ behavior: 'smooth' }); }
  const top = e.target.closest('.row.can-open .r-top');
  if (top) { const row = top.parentElement, id = row.dataset.row; row.classList.toggle('open'); row.classList.contains('open') ? openRows.add(id) : openRows.delete(id); return; }
  const u = e.target.closest('[data-undo]');
  if (u) return toggle(u.dataset.undo, true);
});

async function toggle(id, on, sw) {
  const it = R.items.find((i) => i.id === id);
  if (!it) return;
  if (sw) { sw.classList.add('busy'); sw.classList.toggle('on', on); }
  const r = await ss.toggle(id, on);
  if (sw) sw.classList.remove('busy');
  if (!r.ok) {
    if (sw) sw.classList.toggle('on', !on);
    toast(`Couldn't change ${it.name}: ${r.error || 'unknown error'}`);
    return;
  }
  it.on = r.item.on; it.parts = r.item.parts;
  history = r.history;
  render();
  if (!on) toast(`${it.name} won't start by itself next time.`, () => toggle(id, true));
  else toast(`${it.name} will start by itself again.`);
}

$('#allSafe').addEventListener('click', async () => {
  const list = onSafe();
  if (!list.length) return;
  $('#allSafe').disabled = true;
  const done = [];
  for (const it of list) {
    const r = await ss.toggle(it.id, false);
    if (r.ok) { it.on = r.item.on; history = r.history; done.push(it); renderStartup(); await new Promise((x) => setTimeout(x, 90)); }
  }
  render();
  const ms = done.reduce((s, i) => s + (i.slowMs || 0), 0);
  toast(`${done.length} app${done.length === 1 ? '' : 's'} switched off${ms ? `, about ${secs(ms)} faster next start` : ''}.`, async () => {
    for (const it of done) { const r = await ss.toggle(it.id, true); if (r.ok) { it.on = r.item.on; history = r.history; } }
    render();
  });
});

// ---------- right now ----------
const PALETTE = ['#ffb35c', '#c8b2ff', '#8fb8ff', '#6fe0b0', '#ff8f8f', '#f9a8d4', '#ffd76a'];
function renderNow() {
  const { total, used } = R.memory;
  $('#memUsed').textContent = (used / 1073741824).toFixed(1);
  $('#memOf').textContent = `of ${Math.round(total / 1073741824)} GB`;
  const share = used / total;
  $('#memNote').textContent = share > 0.85 ? `Your ${PC} is short on memory, so it keeps shuffling things around. Closing one of the apps below helps the most.`
    : share > 0.65 ? 'Busy but fine. Apps that start by themselves add to this all day.' : 'Plenty of room. Memory isn\'t what slows you down right now.';
  const top = R.apps.slice(0, 6);
  let c = 0;
  const col = top.map((a) => (a.system ? '#5a586a' : PALETTE[c++ % PALETTE.length]));
  const shown = top.reduce((s, a) => s + a.mem, 0);
  $('#memBar').innerHTML = top.map((a, n) => `<i style="flex-basis:${(a.mem / total) * 100}%;background:${col[n]};animation-delay:${n * 40}ms" title="${esc(a.name)}: ${mb(a.mem)}"></i>`).join('')
    + `<i style="flex-basis:${Math.max(0, (used - shown) / total) * 100}%;background:#3a3846;animation-delay:${top.length * 40}ms" title="Everything else"></i>`;
  $('#memLegend').innerHTML = top.map((a, n) => `<span><i style="background:${col[n]}"></i>${esc(a.name)}</span>`).join('') + '<span><i style="background:#3a3846"></i>Everything else</span><span><i style="background:rgba(255,255,255,.08)"></i>Free</span>';
  const max = Math.max(...R.apps.map((a) => a.mem), 1);
  $('#apps').innerHTML = `<div class="list">${R.apps.map((a, n) => `<div class="row app"><div class="r-top">
    ${a.system ? `<span class="ic sys">${OS === 'macOS' ? '' : '⊞'}</span>` : iconHTML(a)}
    <div class="r-main"><div class="r-name">${esc(a.name)}${a.count > 1 ? `<span class="r-type">${a.count} processes</span>` : ''}</div>
      ${a.what ? `<div class="r-what">${esc(a.what)}</div>` : ''}</div>
    <div class="r-mem"><b>${mb(a.mem)}</b><span>${a.cpu != null ? `${a.cpu.toFixed(a.cpu < 10 ? 1 : 0)}% processor` : 'memory'}</span><div class="bar-mini"><i style="width:${(a.mem / max) * 100}%;animation-delay:${n * 40}ms"></i></div></div></div></div>`).join('')}</div>`;
  fillIcons($('#apps'));
}

// ---------- changes ----------
function updateCount() {
  const off = latestOff();
  const c = $('#changesCount');
  c.textContent = off.length; c.hidden = !off.length;
}
// The newest record per item that is still switched off.
function latestOff() {
  const seen = new Set(), out = [];
  for (const h of history) { if (seen.has(h.id)) continue; seen.add(h.id); if (!h.on) out.push(h); }
  return out;
}
function renderChanges() {
  const off = latestOff();
  $('#undoAll').hidden = off.length < 2;
  if (!history.length) { $('#history').innerHTML = '<div class="empty">No changes yet. Switch something off in Startup and it shows up here.</div>'; return; }
  const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : new Date(t).toLocaleDateString(); };
  const offIds = new Set(off.map((h) => h.id));
  $('#history').innerHTML = '<div class="list">' + history.slice(0, 60).map((h, n) => {
    const it = R.items.find((i) => i.id === h.id) || { name: h.name };
    const current = offIds.has(h.id) && off.find((o) => o.id === h.id) === h;
    return `<div class="row hist ${h.on ? '' : 'off-rec'}"><div class="r-top">${iconHTML(it)}
      <div class="r-main"><div class="r-name">${esc(h.name)}</div><div class="r-what">${h.on ? 'Turned back on' : 'Switched off'} · ${ago(h.at)}${!h.on && h.slowMs ? ` · was adding ${secs(h.slowMs)} to startup` : ''}</div></div>
      <div class="r-act">${current && it.id ? `<button class="link-btn" data-undo="${esc(h.id)}">Turn back on</button>` : ''}</div></div></div>`;
  }).join('') + '</div>';
  fillIcons($('#history'));
}
$('#undoAll').addEventListener('click', async () => {
  for (const h of latestOff()) { const it = R.items.find((i) => i.id === h.id); if (!it) continue; const r = await ss.toggle(h.id, true); if (r.ok) { it.on = r.item.on; history = r.history; } }
  render();
  toast('Everything is back how it was.');
});

// ---------- toast ----------
let toastTimer;
function toast(text, undo) {
  const t = $('#toast');
  $('#toastText').textContent = text;
  $('#toastUndo').hidden = !undo;
  $('#toastUndo').onclick = () => { t.hidden = true; undo && undo(); };
  t.hidden = true; void t.offsetWidth; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 6000);
}

// ---------- updates ----------
ss.onUpdate((u) => {
  if (u.state !== 'available') return;
  $('#updText').textContent = `Startshaper ${u.version} is out.`;
  $('#upd').hidden = false;
  $('#updGet').onclick = () => { ss.openUpdate(u.url); $('#upd').hidden = true; };
  $('#updSkip').onclick = () => { ss.setSettings({ skipVersion: u.version }); $('#upd').hidden = true; };
});
