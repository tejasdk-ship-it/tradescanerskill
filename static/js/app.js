/**
 * TradeScanner Frontend Application Logic
 * Integrates real-time market scans, interactive charts, and live engine status.
 */

// Application State
const state = {
  currentMode: 'daily',        // 'daily' | 'orb'
  sourceType: 'presets',       // 'presets' | 'custom' | 'universe' | 'watchlist'
  selectedPreset: 'mega_tech',
  presetsData: {},
  currentHits: [],
  filteredHits: [],
  activeFilter: 'all',
  searchQuery: '',
  isScanning: false,
  scanPollInterval: null,
  activeChartInstance: null,
  selectedStockSymbol: null
};

// Setup human-readable descriptions for traders
const SETUP_DEFINITIONS = {
  breakout_20d: {
    title: '20-Day Closing-High Breakout',
    desc: 'The last completed close is higher than every single close of the prior 20 trading sessions. Indicates fresh institutional momentum and trend expansion.'
  },
  bull_flag: {
    title: 'Bull Flag Consolidation',
    desc: 'Gained over 10% in the 10 sessions prior to the last 5, followed by tight orderly consolidation within a 5% range. Classic continuation setup.'
  },
  reclaim_ma20: {
    title: 'Reclaimed 20-Day Moving Average',
    desc: 'Closed under the 20-day simple moving average yesterday, then closed back above it with conviction today. Signals momentum recovery.'
  },
  oversold: {
    title: 'Oversold Condition (RSI < 30)',
    desc: 'Wilder 14-period Relative Strength Index closed below 30.0. Indicates extreme panic selling and potential mean-reversion opportunity.'
  },
  oversold_bounce: {
    title: 'Oversold Bounce Trigger',
    desc: 'RSI 14 was below 30 yesterday, and today closed green/higher, confirming that buyers have stepped in to defend the lows.'
  },
  orb: {
    title: 'Opening-Range Breakout (ORB)',
    desc: 'A completed 5-minute intraday bar closed strictly above the highest high established during the initial 15-minute opening period.'
  }
};

// DOM Content Loaded Handler
document.addEventListener('DOMContentLoaded', () => {
  initLucide();
  bindEventListeners();
  loadPresets();
  checkSystemStatus();
  loadSavedWatchlist();

  // Periodically refresh market clock & status every 15s
  setInterval(checkSystemStatus, 15000);
});

function initLucide() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// Bind UI Events
function bindEventListeners() {
  // Mode selection
  document.getElementById('mode-tab-daily').addEventListener('click', () => setMode('daily'));
  document.getElementById('mode-tab-orb').addEventListener('click', () => setMode('orb'));

  // Universe source segmented buttons
  document.querySelectorAll('.segment-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.segment-btn').forEach(b => b.classList.remove('active'));
      e.currentTarget.classList.add('active');
      setSourceType(e.currentTarget.dataset.source);
    });
  });

  // Preset dropdown change
  const presetSelect = document.getElementById('preset-select');
  presetSelect.addEventListener('change', (e) => {
    state.selectedPreset = e.target.value;
    renderPresetPills();
  });

  // Scan trigger button
  document.getElementById('btn-run-scan').addEventListener('click', executeScan);

  // Quick start button in empty state
  const quickStartBtn = document.getElementById('btn-quick-start');
  if (quickStartBtn) {
    quickStartBtn.addEventListener('click', () => {
      setMode('daily');
      setSourceType('presets');
      document.getElementById('preset-select').value = 'mega_tech';
      state.selectedPreset = 'mega_tech';
      renderPresetPills();
      executeScan();
    });
  }

  // Filter chips
  document.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
      document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      e.currentTarget.classList.add('active');
      state.activeFilter = e.currentTarget.dataset.filter;
      applyFilters();
    });
  });

  // Search input filter
  const searchInput = document.getElementById('filter-search-input');
  searchInput.addEventListener('input', (e) => {
    state.searchQuery = e.target.value.trim().toUpperCase();
    applyFilters();
  });

  // Reload watchlist button
  document.getElementById('btn-reload-watchlist').addEventListener('click', loadSavedWatchlist);

  // Export CSV button
  document.getElementById('btn-export-csv').addEventListener('click', exportResultsToCSV);

  // Reset config button
  document.getElementById('btn-reset-config').addEventListener('click', resetConfig);

  // Engine log accordion toggle
  const logToggle = document.getElementById('log-drawer-toggle');
  const logBody = document.getElementById('log-drawer-body');
  const logChevron = document.getElementById('log-chevron');
  logToggle.addEventListener('click', () => {
    if (logBody.classList.contains('hidden')) {
      logBody.classList.remove('hidden');
      logChevron.setAttribute('data-lucide', 'chevron-down');
    } else {
      logBody.classList.add('hidden');
      logChevron.setAttribute('data-lucide', 'chevron-right');
    }
    initLucide();
  });

  // Guide Modal
  document.getElementById('btn-open-guide').addEventListener('click', openGuideModal);
  document.getElementById('btn-close-guide-modal').addEventListener('click', closeGuideModal);
  document.getElementById('btn-guide-start-scan').addEventListener('click', () => {
    closeGuideModal();
    executeScan();
  });

  // Chart Modal
  document.getElementById('btn-close-chart-modal').addEventListener('click', closeChartModal);

  // Universe Modal
  document.getElementById('btn-universe-modal').addEventListener('click', openUniverseModal);
  document.getElementById('btn-close-universe-modal').addEventListener('click', closeUniverseModal);
  document.getElementById('btn-rebuild-universe').addEventListener('click', rebuildUniverse);
  
  const universeSearch = document.getElementById('universe-search-input');
  let universeDebounce = null;
  universeSearch.addEventListener('input', (e) => {
    clearTimeout(universeDebounce);
    universeDebounce = setTimeout(() => {
      searchUniverse(e.target.value);
    }, 300);
  });
}

// Mode Switcher
function setMode(mode) {
  state.currentMode = mode;
  document.getElementById('mode-tab-daily').classList.toggle('active', mode === 'daily');
  document.getElementById('mode-tab-orb').classList.toggle('active', mode === 'orb');

  // Toggle ORB specific parameter inputs
  const orbGroup = document.getElementById('orb-options-group');
  if (mode === 'orb') {
    orbGroup.classList.remove('hidden');
  } else {
    orbGroup.classList.add('hidden');
  }

  initLucide();
}

// Source Type Switcher
function setSourceType(source) {
  state.sourceType = source;
  const presetGroup = document.getElementById('preset-selector-group');
  const customGroup = document.getElementById('custom-symbols-group');
  const limitGroup = document.getElementById('universe-limit-group');

  presetGroup.classList.add('hidden');
  customGroup.classList.add('hidden');
  limitGroup.classList.add('hidden');

  if (source === 'presets') {
    presetGroup.classList.remove('hidden');
  } else if (source === 'custom') {
    customGroup.classList.remove('hidden');
  } else if (source === 'universe') {
    limitGroup.classList.remove('hidden');
  }
}

// Fetch Presets
async function loadPresets() {
  try {
    const res = await fetch('/api/presets');
    const data = await res.json();
    state.presetsData = data;
    renderPresetPills();
  } catch (err) {
    console.error('Failed to load presets:', err);
  }
}

function renderPresetPills() {
  const container = document.getElementById('preset-preview-pills');
  container.innerHTML = '';
  const current = state.presetsData[state.selectedPreset];
  if (!current || !current.symbols) return;

  current.symbols.slice(0, 12).forEach(sym => {
    const pill = document.createElement('span');
    pill.className = 'ticker-pill';
    pill.textContent = sym;
    container.appendChild(pill);
  });

  if (current.symbols.length > 12) {
    const morePill = document.createElement('span');
    morePill.className = 'ticker-pill';
    morePill.textContent = `+${current.symbols.length - 12} more`;
    container.appendChild(morePill);
  }
}

// Check Backend & Market Status
async function checkSystemStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();

    // Market pill update
    const dot = document.getElementById('market-dot');
    const phaseText = document.getElementById('market-phase-text');
    const timeText = document.getElementById('market-time-text');

    if (data.market) {
      phaseText.textContent = data.market.session_phase;
      timeText.textContent = data.market.time_str;
      if (data.market.is_market_open) {
        dot.className = 'status-indicator-dot online';
      } else {
        dot.className = 'status-indicator-dot offline';
      }
    }

    // Universe count in navbar
    if (data.universe && data.universe.count) {
      document.getElementById('nav-universe-count').textContent = Number(data.universe.count).toLocaleString();
      document.getElementById('stat-universe-sub').textContent = `Universe: ${Number(data.universe.count).toLocaleString()}`;
    }

    // Check if background job is already running
    if (data.active_job && data.active_job.running && !state.isScanning) {
      startScanPolling();
    }
  } catch (err) {
    console.warn('Backend status check failed:', err);
  }
}

// Load Saved Watchlist
async function loadSavedWatchlist() {
  try {
    const res = await fetch('/api/watchlist');
    const data = await res.json();
    if (data && data.hits && data.hits.length > 0) {
      state.currentHits = data.hits;
      updateMetrics(data);
      applyFilters();
    }
  } catch (err) {
    console.warn('No existing watchlist to load:', err);
  }
}

// Trigger Live Scan
async function executeScan() {
  if (state.isScanning) return;

  const btn = document.getElementById('btn-run-scan');
  const btnText = document.getElementById('btn-scan-text');
  const btnIcon = document.getElementById('btn-scan-icon');
  const progressBox = document.getElementById('scan-progress-box');
  const progressMsg = document.getElementById('progress-status-msg');

  // Build payload
  const payload = {
    mode: state.currentMode,
    source_type: state.sourceType,
    preset_key: state.selectedPreset,
    custom_symbols: document.getElementById('custom-symbols-input').value,
    limit: state.sourceType === 'universe' ? document.getElementById('universe-limit-select').value : null,
    min_price: document.getElementById('min-price-input').value || 5,
    min_volume: document.getElementById('min-volume-select').value || 1000000
  };

  if (state.currentMode === 'orb') {
    payload.or_minutes = document.getElementById('orb-minutes-select').value || 15;
    const atVal = document.getElementById('orb-at-input').value.trim();
    if (atVal) payload.at = atVal;
  }

  try {
    state.isScanning = true;
    btn.disabled = true;
    btn.classList.add('running');
    btnText.textContent = 'Scanning Markets...';
    btnIcon.setAttribute('data-lucide', 'loader-2');
    btnIcon.classList.add('spin-anim');
    progressBox.classList.remove('hidden');
    progressMsg.textContent = 'Connecting to Yahoo market spark data...';
    initLucide();

    const res = await fetch('/api/scan/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const resp = await res.json();
    if (!resp.success) {
      alert(`Error starting scan: ${resp.error}`);
      finishScan(null);
      return;
    }

    startScanPolling();
  } catch (err) {
    alert(`Failed to trigger scan: ${err.message}`);
    finishScan(null);
  }
}

// Poll Active Scan Status
function startScanPolling() {
  state.isScanning = true;
  clearInterval(state.scanPollInterval);

  const logConsole = document.getElementById('log-console');
  const progressMsg = document.getElementById('progress-status-msg');

  state.scanPollInterval = setInterval(async () => {
    try {
      const res = await fetch('/api/scan/status');
      const data = await res.json();

      if (data.progress_message) {
        progressMsg.textContent = data.progress_message;
      }

      // Update log drawer
      if (data.logs && data.logs.length > 0) {
        logConsole.innerHTML = '';
        data.logs.forEach(line => {
          const div = document.createElement('div');
          div.className = 'log-line';
          div.textContent = `> ${line}`;
          logConsole.appendChild(div);
        });
        logConsole.scrollTop = logConsole.scrollHeight;
      }

      // If job is finished
      if (!data.running) {
        clearInterval(state.scanPollInterval);
        state.scanPollInterval = null;
        finishScan(data.result, data.error);
      }
    } catch (err) {
      console.error('Error polling status:', err);
    }
  }, 1000);
}

function finishScan(result, errorMsg) {
  state.isScanning = false;
  const btn = document.getElementById('btn-run-scan');
  const btnText = document.getElementById('btn-scan-text');
  const btnIcon = document.getElementById('btn-scan-icon');
  const progressBox = document.getElementById('scan-progress-box');

  btn.disabled = false;
  btn.classList.remove('running');
  btnText.textContent = 'Execute Live Scan';
  btnIcon.setAttribute('data-lucide', 'play');
  btnIcon.classList.remove('spin-anim');
  progressBox.classList.add('hidden');
  initLucide();

  if (errorMsg && (!result || !result.hits)) {
    alert(`Scan warning: ${errorMsg}`);
  }

  if (result && result.hits) {
    state.currentHits = result.hits;
    updateMetrics(result);
    applyFilters();
  } else {
    // Attempt reloading watchlist
    loadSavedWatchlist();
  }
}

// Update Top Metrics Cards
function updateMetrics(doc) {
  const hits = doc.hits || [];
  const scanned = doc.scanned || doc.universe || hits.length;

  document.getElementById('stat-hits-count').textContent = hits.length;
  document.getElementById('stat-scanned-count').textContent = Number(scanned).toLocaleString();

  // Breakout count
  const breakouts = hits.filter(h => {
    const s = h.setups || [];
    return s.includes('breakout_20d') || doc.mode === 'orb';
  }).length;
  document.getElementById('stat-breakouts-count').textContent = breakouts;

  // Oversold count
  const oversold = hits.filter(h => {
    const s = h.setups || [];
    return s.includes('oversold') || s.includes('oversold_bounce') || (h.rsi && h.rsi < 35);
  }).length;
  document.getElementById('stat-oversold-count').textContent = oversold;

  // Update chip count labels
  updateFilterChipCounts(hits, doc.mode);
}

function updateFilterChipCounts(hits, mode) {
  document.getElementById('chip-count-all').textContent = hits.length;

  let cBreakout = 0, cFlag = 0, cReclaim = 0, cOversold = 0, cOrb = 0;

  hits.forEach(h => {
    const s = h.setups || [];
    if (s.includes('breakout_20d')) cBreakout++;
    if (s.includes('bull_flag')) cFlag++;
    if (s.includes('reclaim_ma20')) cReclaim++;
    if (s.includes('oversold') || s.includes('oversold_bounce')) cOversold++;
    if (mode === 'orb' || h.at) cOrb++;
  });

  document.getElementById('chip-count-breakout').textContent = cBreakout;
  document.getElementById('chip-count-flag').textContent = cFlag;
  document.getElementById('chip-count-reclaim').textContent = cReclaim;
  document.getElementById('chip-count-oversold').textContent = cOversold;
  document.getElementById('chip-count-orb').textContent = cOrb;
}

// Apply Filter & Search to Table
function applyFilters() {
  const filter = state.activeFilter;
  const q = state.searchQuery;

  state.filteredHits = state.currentHits.filter(hit => {
    // Search query match
    const symMatch = !q || hit.symbol.toUpperCase().includes(q);
    if (!symMatch) return false;

    // Setup filter match
    if (filter === 'all') return true;
    if (filter === 'orb') return hit.at !== undefined;
    const setups = hit.setups || [];
    if (filter === 'oversold') {
      return setups.includes('oversold') || setups.includes('oversold_bounce');
    }
    return setups.includes(filter);
  });

  renderTableRows();
}

// Render Results Table Rows
function renderTableRows() {
  const tbody = document.getElementById('results-table-body');
  tbody.innerHTML = '';

  if (state.filteredHits.length === 0) {
    const tr = document.createElement('tr');
    tr.className = 'empty-state-row';
    tr.innerHTML = `
      <td colspan="6">
        <div class="empty-state-card">
          <div class="empty-icon"><i data-lucide="filter-x"></i></div>
          <h3>No Setups Found For This Filter</h3>
          <p>No symbols matched the selected filter or search term. Try switching to "All Setups" or expanding your liquidity limits.</p>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
    initLucide();
    return;
  }

  state.filteredHits.forEach(item => {
    const tr = document.createElement('tr');

    // Ticker & Name
    const tdTicker = document.createElement('td');
    tdTicker.innerHTML = `
      <div class="ticker-cell-main">
        <span class="ticker-symbol" onclick="openChartModal('${item.symbol}')">${item.symbol}</span>
      </div>
    `;

    // Price
    const tdPrice = document.createElement('td');
    const priceFormatted = item.price ? `$${Number(item.price).toFixed(2)}` : '--';
    tdPrice.innerHTML = `<span class="price-val">${priceFormatted}</span>`;

    // Setups
    const tdSetups = document.createElement('td');
    const setupsWrap = document.createElement('div');
    setupsWrap.className = 'setups-wrap';

    if (item.at) {
      const orbTag = document.createElement('span');
      orbTag.className = 'setup-tag tag-orb';
      orbTag.innerHTML = `<i data-lucide="zap"></i> ORB @ ${item.at} (${item.pct_over ? '+' + item.pct_over.toFixed(2) + '%' : ''})`;
      setupsWrap.appendChild(orbTag);
    }

    if (item.setups && item.setups.length > 0) {
      item.setups.forEach(setupKey => {
        const tag = document.createElement('span');
        tag.className = `setup-tag tag-${setupKey}`;
        const def = SETUP_DEFINITIONS[setupKey];
        tag.textContent = def ? def.title : setupKey;
        setupsWrap.appendChild(tag);
      });
    }
    tdSetups.appendChild(setupsWrap);

    // RSI
    const tdRsi = document.createElement('td');
    if (item.rsi !== undefined && item.rsi !== null) {
      let rsiClass = 'rsi-neutral';
      if (item.rsi < 30) rsiClass = 'rsi-oversold';
      else if (item.rsi > 70) rsiClass = 'rsi-high';
      tdRsi.innerHTML = `<span class="rsi-badge ${rsiClass}">RSI ${Number(item.rsi).toFixed(1)}</span>`;
    } else {
      tdRsi.innerHTML = `<span class="text-muted">--</span>`;
    }

    // Volume
    const tdVol = document.createElement('td');
    const volFormatted = item.volume ? formatVolume(item.volume) : '--';
    tdVol.innerHTML = `<span class="font-mono">${volFormatted}</span>`;

    // Actions
    const tdActions = document.createElement('td');
    tdActions.style.textAlign = 'right';
    tdActions.innerHTML = `
      <div class="row-actions">
        <button class="btn-chart-view" onclick="openChartModal('${item.symbol}')">
          <i data-lucide="line-chart"></i> View Chart
        </button>
      </div>
    `;

    tr.appendChild(tdTicker);
    tr.appendChild(tdPrice);
    tr.appendChild(tdSetups);
    tr.appendChild(tdRsi);
    tr.appendChild(tdVol);
    tr.appendChild(tdActions);

    tbody.appendChild(tr);
  });

  initLucide();
}

function formatVolume(val) {
  if (val >= 1e9) return (val / 1e9).toFixed(2) + 'B';
  if (val >= 1e6) return (val / 1e6).toFixed(2) + 'M';
  if (val >= 1e3) return (val / 1e3).toFixed(1) + 'K';
  return Number(val).toLocaleString();
}

// Reset Configuration to Clean Defaults
function resetConfig() {
  setMode('daily');
  setSourceType('presets');
  document.getElementById('preset-select').value = 'mega_tech';
  state.selectedPreset = 'mega_tech';
  renderPresetPills();
  document.getElementById('min-price-input').value = 5;
  document.getElementById('min-volume-select').value = 1000000;
  document.getElementById('orb-minutes-select').value = 15;
  document.getElementById('orb-at-input').value = '';
}

// Interactive Chart Modal
async function openChartModal(symbol) {
  state.selectedStockSymbol = symbol;
  const modal = document.getElementById('chart-modal');
  modal.classList.remove('hidden');

  document.getElementById('modal-sym-badge').textContent = symbol;
  document.getElementById('modal-stock-title').textContent = `${symbol} Stock`;
  document.getElementById('modal-stock-meta').textContent = 'Loading live chart data...';
  document.getElementById('modal-setup-desc').textContent = 'Fetching indicators and recent price action...';

  // Set external links
  document.getElementById('modal-btn-tradingview').href = `https://www.tradingview.com/chart/?symbol=${symbol}`;
  document.getElementById('modal-btn-yahoo').href = `https://finance.yahoo.com/quote/${symbol}`;

  // Find match in current hits to provide setup explanation
  const hit = state.currentHits.find(h => h.symbol === symbol);
  if (hit) {
    let explanation = '';
    if (hit.setups && hit.setups.length > 0) {
      explanation = hit.setups.map(s => {
        const def = SETUP_DEFINITIONS[s];
        return `<strong>${def ? def.title : s}:</strong> ${def ? def.desc : ''}`;
      }).join('<br><br>');
    }
    if (hit.at) {
      explanation += `<br><br><strong>ORB Breakout Trigger:</strong> Closed above opening range high (${hit.or_high}) at ${hit.at} ET with +${hit.pct_over ? hit.pct_over.toFixed(2) : ''}% expansion.`;
    }
    document.getElementById('modal-setup-desc').innerHTML = explanation || 'Standard algorithmic liquidity scan.';
  }

  try {
    const res = await fetch(`/api/quote/${symbol}`);
    const data = await res.json();

    if (data.points && data.points.length > 0) {
      document.getElementById('modal-stat-price').textContent = `$${Number(data.regularMarketPrice || data.points[data.points.length - 1].close).toFixed(2)}`;
      document.getElementById('modal-stat-52h').textContent = data.fiftyTwoWeekHigh ? `$${Number(data.fiftyTwoWeekHigh).toFixed(2)}` : '--';
      document.getElementById('modal-stat-52l').textContent = data.fiftyTwoWeekLow ? `$${Number(data.fiftyTwoWeekLow).toFixed(2)}` : '--';
      document.getElementById('modal-stat-volume').textContent = data.regularMarketVolume ? formatVolume(data.regularMarketVolume) : '--';
      document.getElementById('modal-stock-meta').textContent = `Currency: ${data.currency} | Sessions: ${data.points.length} bars`;

      renderStockChart(data.points, symbol);
    }
  } catch (err) {
    document.getElementById('modal-stock-meta').textContent = 'Chart data unavailable offline.';
    console.warn('Failed to load chart points:', err);
  }

  initLucide();
}

function renderStockChart(points, symbol) {
  const ctx = document.getElementById('stock-chart-canvas').getContext('2d');

  if (state.activeChartInstance) {
    state.activeChartInstance.destroy();
  }

  const labels = points.map(p => {
    const d = new Date(p.time * 1000);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  });

  const closes = points.map(p => p.close);

  // Gradient fill
  const gradient = ctx.createLinearGradient(0, 0, 0, 260);
  gradient.addColorStop(0, 'rgba(6, 182, 212, 0.4)');
  gradient.addColorStop(1, 'rgba(6, 182, 212, 0.0)');

  state.activeChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: `${symbol} Price`,
        data: closes,
        borderColor: '#06b6d4',
        borderWidth: 2.5,
        backgroundColor: gradient,
        fill: true,
        tension: 0.25,
        pointRadius: 2,
        pointHoverRadius: 6,
        pointBackgroundColor: '#06b6d4'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          mode: 'index',
          intersect: false,
          backgroundColor: '#0f172a',
          titleColor: '#94a3b8',
          bodyColor: '#38bdf8',
          borderColor: '#1e293b',
          borderWidth: 1,
          callbacks: {
            label: (ctx) => ` Price: $${Number(ctx.raw).toFixed(2)}`
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(30, 41, 59, 0.5)' },
          ticks: { color: '#64748b', font: { family: 'JetBrains Mono', size: 10 } }
        },
        y: {
          grid: { color: 'rgba(30, 41, 59, 0.5)' },
          ticks: {
            color: '#64748b',
            font: { family: 'JetBrains Mono', size: 10 },
            callback: (val) => `$${val}`
          }
        }
      }
    }
  });
}

function closeChartModal() {
  document.getElementById('chart-modal').classList.add('hidden');
  if (state.activeChartInstance) {
    state.activeChartInstance.destroy();
    state.activeChartInstance = null;
  }
}

// Guide Modal Controls
function openGuideModal() {
  document.getElementById('guide-modal').classList.remove('hidden');
  initLucide();
}

function closeGuideModal() {
  document.getElementById('guide-modal').classList.add('hidden');
}

// Universe Modal Controls
async function openUniverseModal() {
  document.getElementById('universe-modal').classList.remove('hidden');
  initLucide();
  searchUniverse('');
}

function closeUniverseModal() {
  document.getElementById('universe-modal').classList.add('hidden');
}

async function searchUniverse(query) {
  const container = document.getElementById('universe-list-container');
  container.innerHTML = '<div class="text-center p-4 text-muted">Searching symbol directory...</div>';
  try {
    const res = await fetch(`/api/universe?q=${encodeURIComponent(query)}&limit=80`);
    const data = await res.json();
    container.innerHTML = '';

    if (!data.results || data.results.length === 0) {
      container.innerHTML = '<div class="text-center p-4 text-muted">No symbols found matching query.</div>';
      return;
    }

    data.results.forEach(item => {
      const div = document.createElement('div');
      div.className = 'universe-item';
      div.innerHTML = `
        <span class="universe-item-sym">${item.symbol}</span>
        <span class="universe-item-name">${item.name}</span>
      `;
      div.addEventListener('click', () => {
        closeUniverseModal();
        openChartModal(item.symbol);
      });
      container.appendChild(div);
    });
  } catch (err) {
    container.innerHTML = `<div class="text-center p-4 text-muted">Error loading symbols: ${err.message}</div>`;
  }
}

async function rebuildUniverse() {
  if (!confirm('Re-downloading the entire US equity list from Nasdaq Trader will take ~10-15 seconds. Proceed?')) {
    return;
  }
  const btn = document.getElementById('btn-rebuild-universe');
  btn.disabled = true;
  btn.textContent = 'Downloading from Nasdaq...';

  try {
    const res = await fetch('/api/scan/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'universe' })
    });
    const data = await res.json();
    if (data.success) {
      startScanPolling();
      closeUniverseModal();
    } else {
      alert(`Error: ${data.error}`);
    }
  } catch (err) {
    alert(`Failed: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="refresh-cw"></i> Rebuild from Nasdaq';
    initLucide();
  }
}

// Export Results to CSV
function exportResultsToCSV() {
  if (!state.currentHits || state.currentHits.length === 0) {
    alert('No scan hits available to export.');
    return;
  }

  const rows = [
    ['Symbol', 'Price', 'Setups', 'RSI', 'Volume', 'ORB Time', 'ORB High', 'Pct Over']
  ];

  state.currentHits.forEach(h => {
    rows.push([
      h.symbol || '',
      h.price || '',
      (h.setups || []).join('; '),
      h.rsi !== undefined ? h.rsi : '',
      h.volume || '',
      h.at || '',
      h.or_high || '',
      h.pct_over || ''
    ]);
  });

  const csvContent = 'data:text/csv;charset=utf-8,' + rows.map(r => r.map(x => `"${x}"`).join(',')).join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `tradescanner_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Make global modal functions accessible to inline onclick
window.openChartModal = openChartModal;
