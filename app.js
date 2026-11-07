(() => {
  'use strict';

  const API = 'api.php';
  const UREN_DOEL = 20;        // minimaal aantal effectieve beluren per week
  const SALE_WAARDE = 120;     // bruto waarde van één sale in euro
  const SALES_DOEL_WEEK = 15;  // streefaantal sales per week
  const DOEL_UURLOON = (SALES_DOEL_WEEK * SALE_WAARDE) / UREN_DOEL; // = € 90 per uur
  const TV_MS = 12000;         // tv-modus: tijd per scherm (ms)

  // ---------- Opmaak ----------
  const NBSP = ' ';
  const fmt = (n) => Number(n || 0).toLocaleString('nl-NL', { maximumFractionDigits: 1 });
  const euro = (n) => '€' + NBSP + Math.round(Number(n || 0)).toLocaleString('nl-NL');
  const euro2 = (n) => '€' + NBSP + Number(n || 0).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const FORMATS = { num: fmt, eur: euro, eur2: euro2 };
  const bruto = (b) => (b.salesTotaal || 0) * SALE_WAARDE;
  const rate = (b) => (b.urenTotaal > 0 ? bruto(b) / b.urenTotaal : 0);
  // Uren als 21u30
  const fmtH = (n) => {
    const tot = Math.round(Number(n || 0) * 60), h = Math.floor(tot / 60), m = tot % 60;
    return m ? `${h}u${String(m).padStart(2, '0')}` : `${h}u`;
  };
  const sales = (n) => `${fmt(n)} ${Number(n) === 1 ? 'sale' : 'sales'}`;

  // ---------- Pagina's en ranglijsten ----------
  const PAGES = {
    records: {
      title: 'Sales <span>Records</span>',
      intro: 'De beste resultaten van elke beller: op één dag, in één week en in één maand.',
      note: () => `Doel: minimaal <strong>${UREN_DOEL}</strong> effectieve beluren per week`,
      metrics: [
        { key: 'salesDag',   tile: 'Dagrecord',   list: 'Top 3 · beste dag',   lbl: 'sales op één dag',   val: (b) => b.salesDag || 0,   f: 'num' },
        { key: 'salesWeek',  tile: 'Weekrecord',  list: 'Top 3 · beste week',  lbl: 'sales in één week',  val: (b) => b.salesWeek || 0,  f: 'num' },
        { key: 'salesMaand', tile: 'Maandrecord', list: 'Top 3 · beste maand', lbl: 'sales in één maand', val: (b) => b.salesMaand || 0, f: 'num' },
      ],
    },
    earnings: {
      hash: '#verdiensten',
      title: 'Bruto <span>Verdiensten</span>',
      intro: `De totale bruto saleswaarde van elke beller sinds de start. Eén sale telt als € ${SALE_WAARDE}.`,
      note: () => `Eén sale = <strong>€ ${SALE_WAARDE}</strong> bruto`,
      metrics: [
        { key: 'bruto', tile: 'Hoogste totaal', list: 'Top 3 · bruto saleswaarde all-time', lbl: 'bruto saleswaarde all-time', val: bruto, f: 'eur' },
      ],
    },
    uurloon: {
      hash: '#uurloon',
      adminOnly: true,
      title: 'Gemiddeld <span>Uurloon</span>',
      intro: 'Alleen zichtbaar voor beheerders. De totale bruto saleswaarde van elke beller, gedeeld door zijn totale aantal effectieve beluren.',
      note: () => `Uurloon = sales × € ${SALE_WAARDE} ÷ effectieve beluren · doel <strong>${euro(DOEL_UURLOON)}</strong> per uur`,
      metrics: [
        { key: 'uurloon', tile: 'Hoogste uurloon', list: 'Top 3 · gemiddeld uurloon', lbl: 'gemiddeld per beluur', val: rate, f: 'eur2' },
      ],
    },
  };
  const ADMIN_FIELDS = ['salesDag', 'salesWeek', 'salesMaand', 'urenWeek', 'salesTotaal', 'urenTotaal'];
  const HOUR_FIELDS = ['urenWeek', 'urenTotaal'];
  const TV_STEPS = [
    ['records', 'salesDag'], ['records', 'salesWeek'], ['records', 'salesMaand'],
    ['earnings', 'bruto'],
  ];
  const pageFromHash = () => Object.keys(PAGES).find((k) => PAGES[k].hash === location.hash) || 'records';
  const allowed = (p) => PAGES[p] && (!PAGES[p].adminOnly || state.role === 'admin');

  const state = {
    role: null,
    data: { updatedAt: null, bellers: [] },
    page: 'records',
    metric: { records: 'salesWeek', earnings: 'bruto', uurloon: 'uurloon' },
    open: null,
    dirty: false,
  };

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtIn = (n) => String(n ?? 0).replace('.', ',');
  const joinNames = (a) => a.length <= 1 ? (a[0] || 'Nog niemand') : a.slice(0, -1).join(', ') + ' en ' + a[a.length - 1];
  const bolt = '<svg><use href="#bolt"/></svg>';
  const initials = (n) => n.trim().split(/\s+/).filter((w) => /^[A-Za-zÀ-ÿ]/.test(w) && !/^(van|de|der|den|het|ter|ten|te|in|op)$/i.test(w))
    .map((w) => w[0].toUpperCase()).filter((_, i, a) => i === 0 || i === a.length - 1).join('').slice(0, 2) || '?';

  function isoWeek(d) {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - day);
    return Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
  }

  async function api(action, body) {
    const res = await fetch(`${API}?action=${action}`, {
      method: body ? 'POST' : 'GET',
      credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    let json = {};
    try { json = await res.json(); } catch (_) {}
    if (!res.ok) { const e = new Error(json.error || 'Er ging iets mis'); e.status = res.status; throw e; }
    return json;
  }

  function toast(msg, err) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.toggle('err', !!err);
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), 2400);
  }

  function show(view) {
    $$('.view').forEach((v) => (v.hidden = v.id !== `view-${view}`));
    $('#top-actions').hidden = view === 'login';
    $$('[data-admin-only]').forEach((b) => (b.hidden = state.role !== 'admin' || b.dataset.go === view));
    $$('[data-board-only]').forEach((b) => (b.hidden = view !== 'board'));
    window.scrollTo(0, 0);
  }

  // ---------- Leaderboard ----------

  const page = () => PAGES[state.page];
  const metric = () => page().metrics.find((m) => m.key === state.metric[state.page]);

  const pool = () => state.page !== 'records'
    ? state.data.bellers.filter((b) => (b.urenTotaal || 0) > 0 || (b.salesTotaal || 0) > 0)
    : state.data.bellers;

  function ranked(m) {
    const list = pool().slice().sort((a, b) => m.val(b) - m.val(a) || a.name.localeCompare(b.name, 'nl'));
    let rank = 0, prev = null;
    return list.map((b, i) => {
      const v = Math.round(m.val(b) * 100) / 100;
      if (v !== prev) { rank = i + 1; prev = v; }
      return { b, v, rank };
    });
  }

  function segBar(v, max) {
    const isInt = Number.isInteger(max) && Number.isInteger(v);
    const exact = isInt && max > 0 && max <= 12;
    const count = exact ? max : 12;
    const filled = exact ? v : (max > 0 ? Math.round((v / max) * 12) : 0);
    let html = '';
    for (let i = 0; i < count; i++) html += `<span class="seg" style="--i:${i}" data-on="${i < filled ? 1 : 0}"></span>`;
    return `<div class="bar">${html}</div>`;
  }

  function hoursHtml(u, compact) {
    const ok = u >= UREN_DOEL;
    const pct = Math.min(100, (u / UREN_DOEL) * 100);
    const txt = compact ? `${fmtH(u)} / ${UREN_DOEL}u` : ok ? `${fmtH(u)} beluren deze week · doel gehaald` : `${fmtH(u)} / ${UREN_DOEL}u beluren deze week`;
    return `<div class="hours${ok ? ' ok' : ''}"><span class="mini"><i data-w="${pct}"></i></span>${txt}</div>`;
  }

  // Lichte regel onder de naam
  function subLine(b, compact) {
    if (state.page === 'records') return hoursHtml(b.urenWeek || 0, compact);
    if (state.page === 'earnings') return `<div class="hours plain">${sales(b.salesTotaal)}</div>`;
    const hit = rate(b) >= DOEL_UURLOON;
    const base = `${sales(b.salesTotaal)} · ${euro(bruto(b))}`;
    const txt = compact ? base : `${base} · ${fmtH(b.urenTotaal)} beluren`;
    return `<div class="hours plain${hit ? ' ok' : ''}">${txt}</div>`;
  }

  function renderHead() {
    const pg = page();
    $('#board-title').innerHTML = pg.title;
    let txt = pg.intro;
    if (state.data.updatedAt) {
      const d = new Date(state.data.updatedAt);
      txt += ' Laatst bijgewerkt op ' + d.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' }) + '.';
    }
    $('#board-intro').textContent = txt;
    $('#list-note').innerHTML = pg.note();
    $$('#tabs [data-view]').forEach((t) => {
      const on = t.dataset.view === state.page;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', on);
    });
  }

  function renderKpis() {
    const bellers = pool();
    const tiles = page().metrics.map((m) => {
      const max = Math.max(0, ...bellers.map(m.val));
      const holders = max > 0 ? bellers.filter((b) => Math.abs(m.val(b) - max) < 0.005).map((b) => b.name) : [];
      const active = m.key === state.metric[state.page];
      return `<button class="kpi${active ? ' active' : ''}" data-metric="${m.key}" aria-pressed="${active}">
        <span class="k">${m.tile}</span>
        <span class="v${m.f !== 'num' ? ' money' : ''}" data-count="${max}" data-f="${m.f}">${FORMATS[m.f](max)}</span>
        <span class="who" title="${esc(joinNames(holders))}">${esc(joinNames(holders))}</span>
      </button>`;
    }).join('');

    let extra;
    if (state.page === 'records') {
      const total = bellers.length;
      const ok = bellers.filter((b) => (b.urenWeek || 0) >= UREN_DOEL).length;
      extra = `<div class="kpi kpi-hours">
        <span class="k">Urendoel week ${isoWeek(new Date())}</span>
        <span class="v">${ok}<small> van ${total} bellers</small></span>
        <span class="who">hebben al ${UREN_DOEL}+ effectieve beluren</span>
        ${segBar(ok, total)}
      </div>`;
    } else {
      const n = bellers.reduce((a, b) => a + (b.salesTotaal || 0), 0);
      const sum = n * SALE_WAARDE;
      if (state.page === 'earnings') {
        extra = `<div class="kpi kpi-hours">
          <span class="k">Team totaal</span>
          <span class="v money" data-count="${sum}" data-f="eur">${euro(sum)}</span>
          <span class="who">${sales(n)} door ${bellers.length} bellers</span>
        </div>`;
      } else {
        const hrs = bellers.reduce((a, b) => a + (b.urenTotaal || 0), 0);
        const avg = hrs ? sum / hrs : 0;
        extra = `<div class="kpi kpi-hours">
          <span class="k">Teamgemiddelde</span>
          <span class="v money" data-count="${avg}" data-f="eur2">${euro2(avg)}</span>
          <span class="who">${sales(n)} in ${fmtH(hrs)} beluren · doel ${euro(DOEL_UURLOON)} per uur</span>
          ${segBar(Math.min(12, Math.round((avg / DOEL_UURLOON) * 12)), 12)}
        </div>`;
      }
    }
    const k = $('#kpis');
    k.classList.toggle('kpis-2', state.page !== 'records');
    k.innerHTML = tiles + extra;
  }

  function detail(b) {
    const maxOf = (fn) => Math.max(0, ...state.data.bellers.map(fn));
    const item = (label, v, f, fn) => {
      const top = fn && maxOf(fn) > 0 && Math.abs(fn(b) - maxOf(fn)) < 0.005;
      return `<div class="stat${top ? ' is-top' : ''}"><div class="k">${label}</div><div class="v">${FORMATS[f](v)}</div></div>`;
    };
    return [
      ...PAGES.records.metrics.map((m) => item(m.tile, m.val(b), 'num', m.val)),
      `<div class="stat"><div class="k">Beluren deze week</div><div class="v">${fmtH(b.urenWeek)} / ${UREN_DOEL}u</div></div>`,
      `<div class="stat"><div class="k">Sales totaal</div><div class="v">${fmt(b.salesTotaal)} <small>= ${euro(bruto(b))}</small></div></div>`,
      state.role === 'admin'
        ? `<div class="stat${rate(b) >= DOEL_UURLOON ? ' is-top' : ''}"><div class="k">Uurloon · ${fmtH(b.urenTotaal)}</div><div class="v">${euro2(rate(b))}</div></div>`
        : '',
    ].join('');
  }

  function renderList(animate) {
    const m = metric();
    const list = ranked(m);
    const max = list.length ? list[0].v : 0;
    const money = m.f !== 'num';
    const ol = $('#rows');
    $('#list-title').textContent = m.list;

    const before = new Map($$('.row', ol).map((el) => [el.dataset.id, el.getBoundingClientRect().top]));

    $('#podium').innerHTML = list.slice(0, 3).map(({ b, v, rank }, i) => {
      const lead = rank === 1 && v > 0;
      return `<div class="pod p${i + 1}${lead ? ' lead' : ''}" style="--d:${[1, 0, 2][i] * 120}ms">
        <div class="pod-card">
          ${lead ? `<span class="crown">${bolt}</span>` : ''}
          <div class="avatar">${esc(initials(b.name))}</div>
          <div class="pod-name">${esc(b.name)}</div>
          <div class="pod-score${money ? ' money' : ''}" data-count="${v}" data-f="${m.f}">${FORMATS[m.f](v)}</div>
          <div class="pod-lbl">${m.lbl}</div>
          ${subLine(b, true)}
        </div>
        <div class="step"><span>${rank}</span></div>
      </div>`;
    }).join('');

    const rest = list.slice(3);
    $('#rest-head').hidden = rest.length === 0;
    ol.innerHTML = rest.map(({ b, v, rank }) => {
      const open = state.open === b.id;
      return `<li class="row${open ? ' open' : ''}" data-id="${esc(b.id)}" tabindex="0" aria-expanded="${open}">
        <div class="row-main">
          <div class="rank">${rank}</div>
          <div class="who-cell">
            <div class="name"><span class="avatar sm">${esc(initials(b.name))}</span>${esc(b.name)}</div>
            ${subLine(b, false)}
          </div>
          ${segBar(v, max)}
          <div class="score"><div class="val${money ? ' money' : ''}" data-count="${v}" data-f="${m.f}">${FORMATS[m.f](v)}</div><div class="lbl">${m.lbl}</div></div>
        </div>
        <div class="detail">${detail(b)}</div>
      </li>`;
    }).join('');

    $('#board-empty').hidden = list.length > 0;

    $$('.row', ol).forEach((el) => {
      const old = before.get(el.dataset.id);
      if (old === undefined) return;
      const dy = old - el.getBoundingClientRect().top;
      if (dy) el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' });
    });

    if (animate) countUp($('#view-board'));
  }

  function fillBars() {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      $$('#view-board [data-w]').forEach((i) => (i.style.width = i.dataset.w + '%'));
      $$('#view-board .seg[data-on="1"]').forEach((sg) => sg.classList.add('on'));
    }));
  }

  function countUp(root) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    $$('[data-count]', root).forEach((el) => {
      const target = parseFloat(el.dataset.count) || 0;
      const f = FORMATS[el.dataset.f] || fmt;
      const t0 = performance.now(), dur = 700;
      const step = (t) => {
        const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
        el.textContent = f(k < 1 && Number.isInteger(target) ? Math.round(target * e) : target * e);
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  function renderBoard(animate = true) {
    renderHead();
    renderKpis();
    renderList(animate);
    fillBars();
  }

  function setPage(p, animate = true) {
    if (!allowed(p)) p = 'records';
    state.page = p;
    const hash = PAGES[p].hash || '#records';
    if (location.hash !== hash) history.replaceState(null, '', hash);
    renderBoard(animate);
  }

  $('#tabs').addEventListener('click', (e) => {
    const t = e.target.closest('[data-view]');
    if (t && t.dataset.view !== state.page) setPage(t.dataset.view);
  });
  window.addEventListener('hashchange', () => {
    const p = pageFromHash();
    if (p !== state.page && !$('#view-board').hidden) setPage(p);
  });

  $('#kpis').addEventListener('click', (e) => {
    const t = e.target.closest('[data-metric]');
    if (!t || t.dataset.metric === state.metric[state.page]) return;
    state.metric[state.page] = t.dataset.metric;
    renderBoard(true);
  });

  function toggleRow(row) {
    state.open = state.open === row.dataset.id ? null : row.dataset.id;
    $$('.row').forEach((r) => {
      const o = r.dataset.id === state.open;
      r.classList.toggle('open', o);
      r.setAttribute('aria-expanded', o);
    });
  }
  $('#rows').addEventListener('click', (e) => { const r = e.target.closest('.row'); if (r && !tvTimer) toggleRow(r); });
  $('#rows').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const r = e.target.closest('.row'); if (r) { e.preventDefault(); toggleRow(r); }
  });

  // ---------- TV-modus ----------

  let tvTimer = null, tvIdx = 0;

  function tvTick() {
    const bar = $('#tv-bar i');
    bar.style.transition = 'none'; bar.style.width = '0';
    requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.transition = `width ${TV_MS}ms linear`; bar.style.width = '100%'; }));
  }

  function tvShow() {
    const [p, m] = TV_STEPS[tvIdx];
    state.metric[p] = m;
    state.page = p;
    renderBoard(true);
    tvTick();
  }

  async function tvNext() {
    tvIdx = (tvIdx + 1) % TV_STEPS.length;
    if (tvIdx === 0) { try { await refresh(); } catch (e) { if (e.status === 401) return stopTv(); } }
    tvShow();
  }

  function startTv() {
    document.body.classList.add('tv');
    $('#tv-bar').hidden = false; $('#tv-exit').hidden = false;
    state.open = null;
    tvIdx = 0;
    document.documentElement.requestFullscreen?.().catch(() => {});
    tvShow();
    tvTimer = setInterval(tvNext, TV_MS);
  }

  function stopTv() {
    if (!tvTimer && !document.body.classList.contains('tv')) return;
    clearInterval(tvTimer); tvTimer = null;
    document.body.classList.remove('tv');
    $('#tv-bar').hidden = true; $('#tv-exit').hidden = true;
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  }

  $('#tv-start').addEventListener('click', startTv);
  $('#tv-exit').addEventListener('click', stopTv);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && tvTimer) stopTv(); });
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && tvTimer) stopTv(); });

  // ---------- Beheer ----------

  // Accepteert 12,5 / 12.5 / 12.450 / 12.450,50 / € 1.234
  function parseNum(raw) {
    let s = String(raw).replace(/[€\s ]/g, '');
    if (s === '') return 0;
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    return /^\d+(\.\d+)?$/.test(s) ? parseFloat(s) : NaN;
  }

  // Uren: 21h30m / 21u30 / 21:30 / 21 uur / 30m / 21,5
  function parseHours(raw) {
    const s = String(raw).trim().toLowerCase().replace(/\s+/g, '');
    if (s === '') return 0;
    let m = /^(\d+)(?:h|u|uur|:)(\d{1,2})?(?:m|min)?$/.exec(s);
    if (m) return (m[2] && +m[2] >= 60) ? NaN : +m[1] + (m[2] ? +m[2] / 60 : 0);
    m = /^(\d{1,3})(?:m|min)$/.exec(s);
    if (m) return +m[1] / 60;
    return parseNum(s);
  }
  const hoursIn = (n) => { const t = fmtH(n); return t.endsWith('u') ? t.slice(0, -1) : t; };
  const parseField = (k, raw) => (HOUR_FIELDS.includes(k) ? parseHours(raw) : parseNum(raw));

  function adminRow(b) {
    const cells = ADMIN_FIELDS.map((k) => {
      const cls = k === 'urenWeek' ? ' class="hours-cell"' : (k === 'salesTotaal' || k === 'urenTotaal') ? ' class="earn-cell"' : '';
      const val = HOUR_FIELDS.includes(k) ? hoursIn(b[k]) : fmtIn(b[k]);
      const ph = HOUR_FIELDS.includes(k) ? ' placeholder="21u30"' : '';
      return `<td${cls}><input class="num" type="text" inputmode="text" autocomplete="off" data-field="${k}" value="${val}" data-orig="${val}"${ph}></td>`;
    }).join('');
    return `<tr data-id="${esc(b.id)}">
      <td><input data-field="name" value="${esc(b.name)}" data-orig="${esc(b.name)}" placeholder="Naam van de beller" maxlength="60" aria-label="Naam"></td>
      ${cells}
      <td class="earn-cell calc" data-calc>${euro2(rate(b))}</td>
      <td><button class="del" title="Beller verwijderen" aria-label="Beller verwijderen">×</button></td>
    </tr>`;
  }

  function updateCalc(tr) {
    const n = parseNum($('[data-field="salesTotaal"]', tr).value);
    const uren = parseHours($('[data-field="urenTotaal"]', tr).value);
    $('[data-calc]', tr).textContent = uren > 0 && !isNaN(n) ? euro2((n * SALE_WAARDE) / uren) : '–';
  }

  function renderAdmin() {
    $('#admin-body').innerHTML = state.data.bellers.map(adminRow).join('');
    $$('#admin-body tr').forEach(updateCalc);
    setDirty(false);
  }

  function setDirty(v) { state.dirty = v; $('#dirty-note').hidden = !v; }

  function markChanged(inp) {
    inp.classList.toggle('changed', inp.value !== inp.dataset.orig);
    inp.classList.remove('invalid');
  }

  $('#admin-body').addEventListener('input', (e) => {
    const inp = e.target.closest('input'); if (!inp) return;
    markChanged(inp); setDirty(true);
    updateCalc(inp.closest('tr'));
  });

  $('#admin-body').addEventListener('click', (e) => {
    const del = e.target.closest('.del'); if (!del) return;
    const tr = del.closest('tr');
    const name = $('[data-field="name"]', tr).value || 'deze beller';
    if (!window.confirm(`Weet je zeker dat je ${name} wilt verwijderen?`)) return;
    tr.remove(); setDirty(true);
  });

  $('#add-row').addEventListener('click', () => {
    const id = 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    $('#admin-body').insertAdjacentHTML('beforeend', adminRow({ id, name: '' }));
    const tr = $(`tr[data-id="${id}"]`);
    updateCalc(tr);
    const inp = $('[data-field="name"]', tr);
    inp.dataset.orig = '\u0000';
    inp.focus();
    setDirty(true);
  });

  $('#new-week').addEventListener('click', () => {
    if (!window.confirm('De beluren van deze week worden voor alle bellers op 0 gezet. Records en totalen blijven staan. Doorgaan?')) return;
    $$('#admin-body [data-field="urenWeek"]').forEach((inp) => { inp.value = '0'; markChanged(inp); });
    setDirty(true);
    toast('Beluren op 0 gezet. Klik op Opslaan om te bevestigen.');
  });

  $('#save').addEventListener('click', async () => {
    const bellers = [];
    let ok = true;
    $$('#admin-body tr').forEach((tr) => {
      const nameInp = $('[data-field="name"]', tr);
      const name = nameInp.value.trim();
      if (!name) { nameInp.classList.add('invalid'); ok = false; return; }
      const b = { id: tr.dataset.id, name };
      ADMIN_FIELDS.forEach((k) => {
        const inp = $(`[data-field="${k}"]`, tr);
        const n = parseField(k, inp.value);
        if (isNaN(n)) { inp.classList.add('invalid'); ok = false; }
        b[k] = isNaN(n) ? 0 : Math.round(n * 100) / 100;
      });
      bellers.push(b);
    });
    if (!ok) { toast('Controleer de rood gemarkeerde velden', true); return; }

    const btn = $('#save');
    btn.disabled = true;
    try {
      state.data = await api('save', { bellers });
      renderAdmin();
      toast('Opgeslagen');
    } catch (err) {
      if (err.status === 401) return boot();
      toast(err.message || 'Opslaan is niet gelukt', true);
    } finally { btn.disabled = false; }
  });

  window.addEventListener('beforeunload', (e) => { if (state.dirty) { e.preventDefault(); e.returnValue = ''; } });

  // ---------- Navigatie en inloggen ----------

  const discard = () => !state.dirty || window.confirm('Je hebt wijzigingen die nog niet zijn opgeslagen. Toch doorgaan?');

  document.addEventListener('click', async (e) => {
    const go = e.target.closest('[data-go]');
    if (go) {
      if (go.dataset.go === 'admin') { await refresh(); renderAdmin(); show('admin'); }
      else { if (!discard()) return; setDirty(false); await refresh(); show('board'); renderBoard(true); }
      return;
    }
    if (e.target.closest('[data-logout]')) {
      if (!discard()) return;
      stopTv();
      setDirty(false);
      await api('logout', {}).catch(() => {});
      state.role = null;
      show('login');
    }
  });

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const btn = $('button', f);
    btn.disabled = true; $('#login-error').hidden = true;
    try {
      const r = await api('login', { user: f.user.value.trim(), pass: f.pass.value });
      state.role = r.role;
      f.reset();
      await enter();
    } catch (_) {
      $('#login-error').hidden = false;
    } finally { btn.disabled = false; }
  });

  async function refresh() { state.data = await api('data'); }

  async function enter() {
    await refresh();
    show('board');
    setPage(pageFromHash());
  }

  async function boot() {
    try {
      const me = await api('me');
      state.role = me.role;
      if (!state.role) return show('login');
      await enter();
    } catch (_) { show('login'); }
  }

  boot();
})();
