// Lucid Horizon radar-3 dashboard: board, filters, detail view.
// Data comes from ../data.js, written by main.ts from the sealed snapshot.
// No network: every byte the page needs is a local file.

(function () {
  'use strict';
  var DATA = window.RADAR_DATA;
  var rows = DATA.rows;

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function compactUsd(n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
    return '$' + n;
  }

  function fullUsd(n) {
    return '$' + n.toLocaleString('en-US');
  }

  function pct(v) {
    if (v === null || v === undefined) return '—';
    var sign = v > 0 ? '+' : '';
    return sign + v.toFixed(1) + '%';
  }

  function ageLabel(days) {
    if (days === null || days === undefined) return '—';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return days + 'd';
  }

  // ---- stats -------------------------------------------------------------
  var stats = document.getElementById('stats');
  stats.innerHTML =
    stat('Scanned', DATA.protocols_scanned) +
    stat('Record no token', DATA.records_no_token) +
    stat('Watchlist', DATA.watchlist_size) +
    stat('Ranked', rows.length) +
    stat('Snapshot', esc(DATA.as_of));
  function stat(label, value) {
    return '<div><dt>' + label + '</dt><dd>' + value + '</dd></div>';
  }

  // ---- filter controls ----------------------------------------------------
  var categories = [];
  var chains = [];
  rows.forEach(function (r) {
    if (r.category && categories.indexOf(r.category) === -1) categories.push(r.category);
    r.chains.forEach(function (c) {
      if (chains.indexOf(c) === -1) chains.push(c);
    });
  });
  categories.sort();
  chains.sort();
  fillSelect(document.getElementById('category'), categories);
  fillSelect(document.getElementById('chain'), chains);
  function fillSelect(el, values) {
    values.forEach(function (v) {
      var opt = document.createElement('option');
      opt.value = v;
      opt.textContent = v;
      el.appendChild(opt);
    });
  }

  var state = { q: '', category: '', chain: '', watchlist: false, sort: 'value' };

  function applyFilters() {
    var q = state.q.trim().toLowerCase();
    var list = rows.filter(function (r) {
      if (q && r.name.toLowerCase().indexOf(q) === -1 && r.slug.indexOf(q) === -1) return false;
      if (state.category && r.category !== state.category) return false;
      if (state.chain && r.chains.indexOf(state.chain) === -1) return false;
      if (state.watchlist && !r.watchlist) return false;
      return true;
    });
    list.sort(function (a, b) {
      if (state.sort === 'tvl') return b.tvl_usd - a.tvl_usd;
      if (state.sort === 'growth') return (b.change_7d || 0) - (a.change_7d || 0);
      if (state.sort === 'age') return (b.age_days || 0) - (a.age_days || 0);
      if (state.sort === 'name') return a.name < b.name ? -1 : 1;
      return a.rank - b.rank;
    });
    return list;
  }

  function renderBoard() {
    var list = applyFilters();
    document.getElementById('count').textContent =
      list.length + ' of ' + rows.length + ' ranked protocols shown';
    var html = list
      .map(function (r) {
        var changeClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'up' : 'down';
        return (
          '<tr data-slug="' + esc(r.slug) + '">' +
          '<td class="num">' + r.rank + '</td>' +
          '<td><span class="name">' + esc(r.name) + '</span> ' +
          (r.watchlist ? '<span class="star" title="On the watchlist">★</span>' : '') +
          '<br><span class="slug">' + esc(r.slug) + '</span></td>' +
          '<td><span class="pill">' + esc(r.category || '—') + '</span></td>' +
          '<td>' + r.chains.slice(0, 3).map(esc).join(', ') + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') + '</td>' +
          '<td class="num">' + compactUsd(r.tvl_usd) + '</td>' +
          '<td class="num ' + changeClass + '">' + pct(r.change_7d) + '</td>' +
          '<td class="num">' + ageLabel(r.age_days) + '</td>' +
          '<td class="num value">' + compactUsd(r.implied_value_usd) + '</td>' +
          '</tr>'
        );
      })
      .join('');
    document.getElementById('rows').innerHTML =
      html || '<tr><td colspan="8" class="empty">No protocol matches this filter.</td></tr>';
  }

  // ---- detail view ---------------------------------------------------------
  function findRow(slug) {
    for (var i = 0; i < rows.length; i++) if (rows[i].slug === slug) return rows[i];
    return null;
  }

  function showDetail(slug) {
    var r = findRow(slug);
    var panel = document.getElementById('detail');
    if (!r) {
      panel.hidden = true;
      return;
    }
    var m = r.model;
    document.getElementById('detail-body').innerHTML =
      '<h2>' + esc(r.name) + (r.watchlist ? ' <span class="star">★ Watchlist</span>' : '') + '</h2>' +
      '<p class="sub">Rank #' + r.rank + ' · ' + esc(r.slug) + ' · ' + esc(r.category || 'uncategorised') +
      ' · ' + r.chains.map(esc).join(', ') + ' · This protocol records no token.</p>' +
      '<dl class="kv">' +
      kv('Implied value', fullUsd(r.implied_value_usd)) +
      kv('TVL', fullUsd(r.tvl_usd)) +
      kv('7-day change', pct(r.change_7d)) +
      kv('Tracked since', esc(r.listed_at || 'unknown') + (r.age_days !== null ? ' (' + ageLabel(r.age_days) + ')' : '')) +
      kv('Model', 'TVL × 0.30 × ' + m.growth.toFixed(2) + ' × ' + m.maturity.toFixed(2) + ' × ' + m.chain.toFixed(2) + ' × ' + m.category.toFixed(2)) +
      '</dl>' +
      '<h3>How to farm it — 6 steps</h3>' +
      '<ol class="steps">' +
      r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') +
      '</ol>';
    panel.hidden = false;
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    markActive(slug);
  }

  function kv(label, value) {
    return '<div><dt>' + label + '</dt><dd>' + value + '</dd></div>';
  }

  function markActive(slug) {
    var trs = document.querySelectorAll('#rows tr');
    trs.forEach(function (tr) {
      tr.classList.toggle('active', tr.getAttribute('data-slug') === slug);
    });
  }

  function hideDetail() {
    document.getElementById('detail').hidden = true;
    markActive(null);
  }

  document.getElementById('rows').addEventListener('click', function (ev) {
    var tr = ev.target.closest('tr[data-slug]');
    if (tr) location.hash = '#/protocol/' + tr.getAttribute('data-slug');
  });
  document.getElementById('back').addEventListener('click', function () {
    syncHash();
    hideDetail();
  });

  // ---- launched table -------------------------------------------------------
  document.getElementById('launched-rows').innerHTML = DATA.launched
    .map(function (p) {
      return (
        '<tr><td><span class="name">' + esc(p.name) + '</span><br><span class="slug">' + esc(p.slug) + '</span></td>' +
        '<td><span class="pill">' + esc(p.category || '—') + '</span></td>' +
        '<td class="num">' + compactUsd(p.tvl_usd) + '</td>' +
        '<td class="num">' + (p.mcap_usd === null ? '—' : compactUsd(p.mcap_usd)) + '</td></tr>'
      );
    })
    .join('');

  // ---- shareable filter state -------------------------------------------
  // The board's filter lives in the URL hash, so a filtered view is a real
  // link: #/?category=Lending&watchlist=1. Changing a filter replaces the
  // hash without adding a history entry; opening such a link restores it.
  function syncHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category) params.set('category', state.category);
    if (state.chain) params.set('chain', state.chain);
    if (state.watchlist) params.set('watchlist', '1');
    if (state.sort !== 'value') params.set('sort', state.sort);
    var query = params.toString();
    var next = query ? '#/?' + query : '#/';
    if (location.hash !== next) history.replaceState(null, '', next);
  }

  function readHashFilters() {
    var hash = location.hash || '#/';
    var queryAt = hash.indexOf('?');
    if (queryAt === -1) return;
    var params = new URLSearchParams(hash.slice(queryAt + 1));
    state.q = params.get('q') || '';
    state.category = params.get('category') || '';
    state.chain = params.get('chain') || '';
    state.watchlist = params.get('watchlist') === '1';
    state.sort = params.get('sort') || 'value';
    document.getElementById('q').value = state.q;
    document.getElementById('category').value = state.category;
    document.getElementById('chain').value = state.chain;
    document.getElementById('watchlist').checked = state.watchlist;
    document.getElementById('sort').value = state.sort;
  }

  // ---- wiring ---------------------------------------------------------------
  document.getElementById('q').addEventListener('input', function (ev) {
    state.q = ev.target.value;
    renderBoard();
    syncHash();
  });
  document.getElementById('category').addEventListener('change', function (ev) {
    state.category = ev.target.value;
    renderBoard();
    syncHash();
  });
  document.getElementById('chain').addEventListener('change', function (ev) {
    state.chain = ev.target.value;
    renderBoard();
    syncHash();
  });
  document.getElementById('watchlist').addEventListener('change', function (ev) {
    state.watchlist = ev.target.checked;
    renderBoard();
    syncHash();
  });
  document.getElementById('sort').addEventListener('change', function (ev) {
    state.sort = ev.target.value;
    renderBoard();
    syncHash();
  });

  function route() {
    var hash = location.hash || '#/';
    var match = hash.match(/^#\/protocol\/([a-z0-9._-]+)$/);
    if (match) {
      showDetail(match[1]);
    } else {
      readHashFilters();
      renderBoard();
      hideDetail();
    }
  }
  window.addEventListener('hashchange', route);

  renderBoard();
  route();
})();
