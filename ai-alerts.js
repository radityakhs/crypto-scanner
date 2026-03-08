// ══════════════════════════════════════════════════════════════════════════════
//  AI Alert System v2 — Price & RSI Alerts with Browser Notifications
//  ✦ New: Repeat alert (re-arm after cooldown) + Test Alert button per row
//  Checks all active alerts every 60 seconds via setInterval
// ══════════════════════════════════════════════════════════════════════════════

const aiAlerts = (() => {
    'use strict';

    const LS_KEY      = 'ai_alerts_v1';
    const CHECK_MS    = 60 * 1000; // 1 minute

    // ── State ─────────────────────────────────────────────────────────────────
    // Schema v2: { id, type, symbol, condition, value, message,
    //              active, triggered, triggeredAt, triggeredVal,
    //              repeat, cooldownMin, lastTriggeredAt }
    let _alerts  = [];
    let _timer   = null;
    let _notifOk = false; // browser notification permission granted

    // ── Condition types ───────────────────────────────────────────────────────
    const CONDITIONS = {
        'price_below':  { label: 'Harga < ',    icon: '📉', fn: (cur, val) => cur <= val },
        'price_above':  { label: 'Harga > ',    icon: '📈', fn: (cur, val) => cur >= val },
        'change_below': { label: 'Change 24h < ',icon: '🔻', fn: (cur, val) => cur <= val },
        'change_above': { label: 'Change 24h > ',icon: '🔺', fn: (cur, val) => cur >= val },
        'rsi_below':    { label: 'RSI < ',       icon: '⚡', fn: (cur, val) => cur !== null && cur <= val },
        'rsi_above':    { label: 'RSI > ',       icon: '⚡', fn: (cur, val) => cur !== null && cur >= val },
    };

    const COOLDOWN_OPTIONS = [
        { value: 15,  label: '15 menit' },
        { value: 30,  label: '30 menit' },
        { value: 60,  label: '1 jam'    },
        { value: 120, label: '2 jam'    },
        { value: 240, label: '4 jam'    },
        { value: 480, label: '8 jam'    },
        { value: 1440,label: '24 jam'   },
    ];

    // ── Persistence ──────────────────────────────────────────────────────────
    function _save() { localStorage.setItem(LS_KEY, JSON.stringify(_alerts)); }
    function _load() {
        try {
            const raw = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
            // Migrate v1 → v2: add repeat fields if missing
            _alerts = raw.map(a => ({
                repeat:         false,
                cooldownMin:    60,
                lastTriggeredAt: null,
                ...a,
            }));
        } catch { _alerts = []; }
    }

    // ── Get current value for an alert ────────────────────────────────────────
    function _getCurrentValue(alert) {
        const sym = alert.symbol?.toUpperCase();

        if (window.cryptoData) {
            const coin = window.cryptoData.find(c =>
                c.symbol?.toUpperCase() === sym || c.id?.toUpperCase() === sym
            );
            if (coin) {
                if (alert.condition.startsWith('price'))   return coin.current_price;
                if (alert.condition.startsWith('change'))  return coin.price_change_percentage_24h;
                if (alert.condition.startsWith('rsi'))     return coin.rsi ?? null;
            }
        }

        if (window.IDX_STOCKS_DATA) {
            const stock = window.IDX_STOCKS_DATA.find(s => s.symbol?.toUpperCase() === sym);
            if (stock) {
                if (alert.condition.startsWith('price'))  return stock.price;
                if (alert.condition.startsWith('change')) return stock.change;
                if (alert.condition.startsWith('rsi'))    return stock.rsi ?? null;
            }
        }

        if (window.US_STOCKS_DATA) {
            const stock = window.US_STOCKS_DATA.find(s => s.symbol?.toUpperCase() === sym);
            if (stock) {
                if (alert.condition.startsWith('price'))  return stock.price;
                if (alert.condition.startsWith('change')) return stock.change;
                if (alert.condition.startsWith('rsi'))    return stock.rsi ?? null;
            }
        }

        return null;
    }

    // ── Trigger alert ─────────────────────────────────────────────────────────
    // @param {boolean} isSilent — if true, show toast but don't change alert state (used by testAlert)
    function _triggerAlert(alert, currentValue, isSilent = false) {
        if (!isSilent) {
            alert.triggeredAt  = new Date().toISOString();
            alert.triggeredVal = currentValue;
            alert.lastTriggeredAt = alert.triggeredAt;

            if (alert.repeat) {
                // Re-arm mode: keep active=true, just record lastTriggered
                // _checkAlerts will suppress during cooldown
            } else {
                // One-shot: deactivate after trigger
                alert.triggered = true;
                alert.active    = false;
            }
            _save();
        }

        const cond  = CONDITIONS[alert.condition];
        const title = `🔔 Alert: ${alert.symbol}`;
        const valFmt = currentValue?.toFixed ? Number(currentValue).toLocaleString('en-US', { maximumFractionDigits: 4 }) : String(currentValue);
        const body  = `${cond?.icon || ''} ${alert.symbol} — ${cond?.label || alert.condition}${alert.value}\nNilai sekarang: ${valFmt}${isSilent ? '\n[🧪 TEST MODE]' : ''}`;

        // Browser notification
        if (_notifOk && 'Notification' in window) {
            try {
                new Notification(title, { body, icon: '/images/ic_build.png', tag: `alert_${alert.id}` });
            } catch {}
        }

        _showToast(title, body, cond?.icon || '🔔', isSilent);
        _playBeep();

        if (!isSilent) _renderAlerts();
    }

    // ── Check all alerts ──────────────────────────────────────────────────────
    function _checkAlerts() {
        const now = Date.now();
        const active = _alerts.filter(a => a.active && !a.triggered);
        if (!active.length) return;

        for (const alert of active) {
            // For repeat alerts, suppress during cooldown period
            if (alert.repeat && alert.lastTriggeredAt) {
                const elapsedMin = (now - new Date(alert.lastTriggeredAt).getTime()) / 60000;
                if (elapsedMin < alert.cooldownMin) continue;
            }

            const current = _getCurrentValue(alert);
            if (current == null) continue;

            const cond = CONDITIONS[alert.condition];
            if (cond && cond.fn(current, alert.value)) {
                _triggerAlert(alert, current);
            }
        }
    }

    // ── Toast notification ────────────────────────────────────────────────────
    function _showToast(title, body, icon, isTest = false) {
        let container = document.getElementById('alertToastContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'alertToastContainer';
            container.className = 'alert-toast-container';
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.className = `alert-toast alert-toast--in${isTest ? ' alert-toast--test' : ''}`;
        toast.innerHTML = `
            <div class="alert-toast-icon">${icon}</div>
            <div class="alert-toast-body">
                <div class="alert-toast-title">${title}${isTest ? ' <span class="alert-test-tag">TEST</span>' : ''}</div>
                <div class="alert-toast-msg">${body.replace(/\n/g, '<br>')}</div>
            </div>
            <button class="alert-toast-close" onclick="this.parentElement.remove()">✕</button>`;

        container.appendChild(toast);
        setTimeout(() => toast.classList.remove('alert-toast--in'), 10);
        setTimeout(() => {
            toast.classList.add('alert-toast--out');
            setTimeout(() => toast.remove(), 400);
        }, 8000);
    }

    // ── Audio beep ────────────────────────────────────────────────────────────
    function _playBeep() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.setValueAtTime(880, ctx.currentTime);
            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.5);
        } catch {}
    }

    // ── Cooldown remaining helper ─────────────────────────────────────────────
    function _cooldownRemaining(alert) {
        if (!alert.repeat || !alert.lastTriggeredAt) return null;
        const elapsedMin = (Date.now() - new Date(alert.lastTriggeredAt).getTime()) / 60000;
        const rem = alert.cooldownMin - elapsedMin;
        if (rem <= 0) return null;
        if (rem < 60) return `${Math.ceil(rem)}m`;
        return `${Math.ceil(rem / 60)}j`;
    }

    // ── Render alerts panel ───────────────────────────────────────────────────
    function _renderAlerts() {
        const el = document.getElementById('alertsContainer');
        if (!el) return;

        const active    = _alerts.filter(a => a.active && !a.triggered);
        const triggered = _alerts.filter(a => a.triggered);
        const inactive  = _alerts.filter(a => !a.active && !a.triggered);

        const renderRow = (a) => {
            const cond    = CONDITIONS[a.condition] || {};
            const curVal  = _getCurrentValue(a);
            const curFmt  = curVal != null ? Number(curVal).toLocaleString('en-US', { maximumFractionDigits: 4 }) : '—';
            const cdRem   = _cooldownRemaining(a);

            const statusBadge = a.triggered
                ? `<span class="alert-badge alert-badge--triggered">✅ Terpicu ${a.triggeredAt ? new Date(a.triggeredAt).toLocaleString('id-ID') : ''}</span>`
                : a.active
                    ? `<span class="alert-badge alert-badge--active">🟢 Aktif</span>`
                    : `<span class="alert-badge alert-badge--inactive">⏸ Nonaktif</span>`;

            const repeatBadge = a.repeat
                ? cdRem
                    ? `<span class="alert-badge alert-badge--repeat">🔄 Cooldown ${cdRem}</span>`
                    : `<span class="alert-badge alert-badge--repeat">🔄 Ulangi /${a.cooldownMin >= 60 ? (a.cooldownMin/60)+'j' : a.cooldownMin+'m'}</span>`
                : '';

            return `
            <div class="alert-row ${a.triggered ? 'alert-row--triggered' : ''} ${!a.active && !a.triggered ? 'alert-row--inactive' : ''}">
                <div class="alert-row-main">
                    <span class="alert-row-icon">${cond.icon || '🔔'}</span>
                    <div class="alert-row-info">
                        <span class="alert-row-symbol">${a.symbol}</span>
                        <span class="alert-row-cond">${cond.label || a.condition}<strong>${Number(a.value).toLocaleString()}</strong></span>
                        ${a.message ? `<span class="alert-row-msg">${a.message}</span>` : ''}
                    </div>
                    <div class="alert-row-cur">Kini: <strong>${curFmt}</strong></div>
                    <div class="alert-row-badges">${statusBadge}${repeatBadge}</div>
                </div>
                <div class="alert-row-actions">
                    ${!a.triggered && a.active  ? `<button class="alert-act-btn" onclick="aiAlerts.pauseAlert(${a.id})">⏸ Pause</button>` : ''}
                    ${!a.triggered && !a.active ? `<button class="alert-act-btn" onclick="aiAlerts.resumeAlert(${a.id})">▶ Aktifkan</button>` : ''}
                    <button class="alert-act-btn alert-act-btn--test" onclick="aiAlerts.testAlert(${a.id})" title="Coba trigger alert ini tanpa mengubah status">🧪 Test</button>
                    <button class="alert-act-btn alert-act-btn--del" onclick="aiAlerts.deleteAlert(${a.id})">✕</button>
                </div>
            </div>`;
        };

        el.innerHTML = `
        <div class="alerts-sections">

          ${active.length ? `
          <div class="alerts-group">
            <div class="alerts-group-title">🟢 Alert Aktif (${active.length})</div>
            ${active.map(renderRow).join('')}
          </div>` : ''}

          ${triggered.length ? `
          <div class="alerts-group">
            <div class="alerts-group-title">✅ Sudah Terpicu (${triggered.length})</div>
            ${triggered.map(renderRow).join('')}
            <button class="pt-btn pt-btn--ghost" style="margin-top:8px" onclick="aiAlerts.clearTriggered()">🗑️ Hapus semua yang terpicu</button>
          </div>` : ''}

          ${inactive.length ? `
          <div class="alerts-group">
            <div class="alerts-group-title">⏸ Nonaktif (${inactive.length})</div>
            ${inactive.map(renderRow).join('')}
          </div>` : ''}

          ${!_alerts.length ? `
          <div class="pt-empty">
              <div class="pt-empty-icon">🔕</div>
              <div class="pt-empty-title">Belum ada alert</div>
              <div class="pt-empty-sub">Tambahkan alert di form di atas — sistem akan memantau kondisi dan memberitahu kamu.</div>
          </div>` : ''}

        </div>

        <div class="pt-footer">
            <span>⏱ Cek tiap 60 detik</span>
            <button class="pt-btn pt-btn--ghost" onclick="aiAlerts.checkNow()">↻ Cek Sekarang</button>
            ${_notifOk ? '<span style="color:#4ade80;font-size:0.75rem">🔔 Notifikasi aktif</span>'
                       : '<button class="pt-btn pt-btn--ghost" onclick="aiAlerts.requestNotifPermission()">🔔 Aktifkan Notifikasi</button>'}
        </div>`;
    }

    // ── Render add form ───────────────────────────────────────────────────────
    function _renderForm() {
        const el = document.getElementById('alertFormContainer');
        if (!el) return;
        el.innerHTML = `
        <div class="pt-form-card">
            <div class="pt-form-title">➕ Tambah Alert Baru</div>
            <div class="pt-form-grid">
                <div class="pt-form-group">
                    <label>Symbol Aset</label>
                    <input id="alSymbol" type="text" placeholder="BTC / BBCA / AAPL" autocomplete="off" list="alSymbolList">
                    <datalist id="alSymbolList">
                        ${['BTC','ETH','SOL','BNB','XRP','ADA','BBCA','BMRI','TLKM','ANTM','AAPL','NVDA','TSLA','MSFT','GOOGL']
                            .map(s => `<option value="${s}">`).join('')}
                    </datalist>
                </div>
                <div class="pt-form-group">
                    <label>Kondisi</label>
                    <select id="alCondition">
                        ${Object.entries(CONDITIONS).map(([k,v]) =>
                            `<option value="${k}">${v.icon} ${v.label}…</option>`
                        ).join('')}
                    </select>
                </div>
                <div class="pt-form-group">
                    <label>Nilai Target</label>
                    <input id="alValue" type="number" placeholder="85000" step="any">
                </div>
                <div class="pt-form-group">
                    <label>Catatan (opsional)</label>
                    <input id="alMessage" type="text" placeholder="Misal: beli kalau BTC sudah di sini">
                </div>
            </div>

            <!-- Repeat Alert Row -->
            <div class="alert-repeat-row">
                <label class="alert-repeat-toggle">
                    <input type="checkbox" id="alRepeat" onchange="document.getElementById('alCooldownWrap').style.display=this.checked?'flex':'none'">
                    <span class="alert-repeat-label">🔄 Ulangi alert (repeat)</span>
                    <span class="alert-repeat-hint">— alert akan aktif kembali setelah cooldown</span>
                </label>
                <div id="alCooldownWrap" class="alert-cooldown-wrap" style="display:none">
                    <label>Cooldown:</label>
                    <select id="alCooldown">
                        ${COOLDOWN_OPTIONS.map(o =>
                            `<option value="${o.value}" ${o.value === 60 ? 'selected' : ''}>${o.label}</option>`
                        ).join('')}
                    </select>
                </div>
            </div>

            <div class="pt-form-actions">
                <div id="alFormError" class="pt-form-error"></div>
                <button class="pt-btn pt-btn--primary" onclick="aiAlerts.addAlert()">🔔 Tambah Alert</button>
            </div>
        </div>`;
    }

    // ── Public CRUD ───────────────────────────────────────────────────────────
    function addAlert() {
        const symbol      = document.getElementById('alSymbol')?.value?.trim().toUpperCase();
        const condition   = document.getElementById('alCondition')?.value;
        const value       = parseFloat(document.getElementById('alValue')?.value);
        const message     = document.getElementById('alMessage')?.value?.trim();
        const repeat      = document.getElementById('alRepeat')?.checked ?? false;
        const cooldownMin = parseInt(document.getElementById('alCooldown')?.value ?? '60', 10);
        const errEl       = document.getElementById('alFormError');

        const setErr = (m) => { if (errEl) errEl.textContent = m; };
        if (!symbol)      return setErr('⚠️ Masukkan symbol aset.');
        if (!condition)   return setErr('⚠️ Pilih kondisi.');
        if (isNaN(value)) return setErr('⚠️ Masukkan nilai target yang valid.');

        setErr('');
        _alerts.push({
            id: Date.now(),
            symbol, condition, value,
            message: message || '',
            active: true,
            triggered: false,
            triggeredAt: null,
            triggeredVal: null,
            repeat,
            cooldownMin,
            lastTriggeredAt: null,
        });
        _save();

        ['alSymbol','alValue','alMessage'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        const repEl = document.getElementById('alRepeat');
        if (repEl) { repEl.checked = false; document.getElementById('alCooldownWrap').style.display = 'none'; }

        _renderAlerts();
    }

    function deleteAlert(id) {
        _alerts = _alerts.filter(a => a.id !== id);
        _save();
        _renderAlerts();
    }

    function pauseAlert(id) {
        const a = _alerts.find(a => a.id === id);
        if (a) { a.active = false; _save(); _renderAlerts(); }
    }

    function resumeAlert(id) {
        const a = _alerts.find(a => a.id === id);
        if (a) { a.active = true; a.triggered = false; _save(); _renderAlerts(); }
    }

    function clearTriggered() {
        _alerts = _alerts.filter(a => !a.triggered);
        _save();
        _renderAlerts();
    }

    // Test alert — fires toast + beep without changing alert state
    function testAlert(id) {
        const a = _alerts.find(a => a.id === id);
        if (!a) return;
        const curVal = _getCurrentValue(a) ?? a.value;
        _triggerAlert(a, curVal, /* isSilent= */ true);
    }

    function checkNow() { _checkAlerts(); _renderAlerts(); }

    async function requestNotifPermission() {
        if (!('Notification' in window)) return;
        const perm = await Notification.requestPermission();
        _notifOk = (perm === 'granted');
        _renderAlerts();
    }

    // ── Init ──────────────────────────────────────────────────────────────────
    function init() {
        _load();
        _notifOk = (Notification?.permission === 'granted');
        _renderForm();
        _renderAlerts();
        _timer = setInterval(_checkAlerts, CHECK_MS);
        console.log('✅ AI Alert System v2 initialized — repeat alert + test button enabled');
    }

    return {
        init,
        addAlert,
        deleteAlert,
        pauseAlert,
        resumeAlert,
        clearTriggered,
        checkNow,
        testAlert,
        requestNotifPermission,
    };
})();
