// Analysis Utilities - Moon Phase + Technical Indicators
// Date: February 19, 2026

(function (global) {
    const TWO_PI = Math.PI * 2;

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function getMoonPhaseInfo(date = new Date()) {
        const knownNewMoon = new Date('2024-01-11T11:57:00Z');
        const synodicMonth = 29.530588853; // days
        const diffDays = (date.getTime() - knownNewMoon.getTime()) / (1000 * 60 * 60 * 24);
        const phase = ((diffDays % synodicMonth) + synodicMonth) % synodicMonth;
        const phaseIndex = Math.floor((phase / synodicMonth) * 8);

        const phases = [
            { name: 'New Moon', icon: '🌑', bias: 'Cautious', note: 'Bias sideways; wait for confirmation before entries.' },
            { name: 'Waxing Crescent', icon: '🌒', bias: 'Building', note: 'Momentum can build; scale in gradually.' },
            { name: 'First Quarter', icon: '🌓', bias: 'Trend Shift', note: 'Watch for breakout or reversal signals.' },
            { name: 'Waxing Gibbous', icon: '🌔', bias: 'Risk-On', note: 'Trend continuation often strengthens.' },
            { name: 'Full Moon', icon: '🌕', bias: 'Exhaustion', note: 'Potential volatility spike; tighten risk.' },
            { name: 'Waning Gibbous', icon: '🌖', bias: 'Cooling', note: 'Momentum cools; take partial profits.' },
            { name: 'Last Quarter', icon: '🌗', bias: 'Rebalance', note: 'Mean reversion likely; avoid chasing.' },
            { name: 'Waning Crescent', icon: '🌘', bias: 'Reset', note: 'Lower volume; focus on high-conviction setups.' }
        ];

        return {
            phaseIndex,
            phase,
            illumination: clamp((1 - Math.cos((TWO_PI * phase) / synodicMonth)) / 2, 0, 1),
            ...phases[phaseIndex]
        };
    }

    function calculateSMA(data, period) {
        if (!data || data.length === 0) return [];
        const sma = new Array(data.length).fill(null);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
            sum += data[i];
            if (i >= period) {
                sum -= data[i - period];
            }
            if (i >= period - 1) {
                sma[i] = sum / period;
            }
        }
        return sma;
    }

    function calculateEMA(data, period) {
        if (!data || data.length === 0) return [];
        const ema = new Array(data.length).fill(null);
        const multiplier = 2 / (period + 1);
        let prev = data[0];
        ema[0] = prev;
        for (let i = 1; i < data.length; i++) {
            prev = (data[i] - prev) * multiplier + prev;
            ema[i] = prev;
        }
        return ema;
    }

    function calculateMACD(data, shortPeriod = 12, longPeriod = 26, signalPeriod = 9) {
        if (!data || data.length === 0) return { macd: [], signal: [], histogram: [] };
        const emaShort = calculateEMA(data, shortPeriod);
        const emaLong = calculateEMA(data, longPeriod);
        const macd = data.map((_, i) => {
            if (emaShort[i] === null || emaLong[i] === null) return null;
            return emaShort[i] - emaLong[i];
        });
        const signal = calculateEMA(macd.map(v => v ?? 0), signalPeriod);
        const histogram = macd.map((value, i) => (value === null ? null : value - (signal[i] ?? 0)));
        return { macd, signal, histogram };
    }

    function calculateSupportResistance(data, lookback = 60) {
        if (!data || data.length === 0) {
            return { support: null, resistance: null };
        }
        const slice = data.slice(-lookback);
        const sorted = [...slice].sort((a, b) => a - b);
        const support = sorted[Math.floor(sorted.length * 0.1)];
        const resistance = sorted[Math.floor(sorted.length * 0.9)];
        return { support, resistance };
    }

    function calculateOBV(prices, volumes) {
        if (!prices || !volumes || prices.length === 0 || volumes.length === 0) {
            return [];
        }
        const length = Math.min(prices.length, volumes.length);
        const obv = new Array(length).fill(0);
        for (let i = 1; i < length; i++) {
            if (prices[i] > prices[i - 1]) {
                obv[i] = obv[i - 1] + volumes[i];
            } else if (prices[i] < prices[i - 1]) {
                obv[i] = obv[i - 1] - volumes[i];
            } else {
                obv[i] = obv[i - 1];
            }
        }
        return obv;
    }

    function detectVolumeSpike(volumes, lookback = 20, spikeMultiplier = 1.8) {
        if (!volumes || volumes.length < lookback + 1) {
            return { spike: false, ratio: 0 };
        }
        const recent = volumes.slice(-lookback);
        const avg = recent.reduce((sum, v) => sum + v, 0) / recent.length;
        const last = volumes[volumes.length - 1];
        const ratio = avg ? last / avg : 0;
        return { spike: ratio >= spikeMultiplier, ratio };
    }

    function calculateFibonacciLevels(prices, lookback = 120) {
        if (!prices || prices.length === 0) return null;
        const slice = prices.slice(-lookback);
        const high = Math.max(...slice);
        const low = Math.min(...slice);
        const last = slice[slice.length - 1];
        const trend = last >= slice[0] ? 'up' : 'down';
        const range = high - low;
        const retracementRatios = [0.236, 0.382, 0.5, 0.618, 0.786];
        const extensionRatios = [1.272, 1.618];

        const retracements = retracementRatios.map(ratio => {
            const level = trend === 'up'
                ? high - range * ratio
                : low + range * ratio;
            return { ratio, level };
        });

        const extensions = extensionRatios.map(ratio => {
            const level = trend === 'up'
                ? low + range * ratio
                : high - range * ratio;
            return { ratio, level };
        });

        return { high, low, trend, retracements, extensions };
    }

    function calculateAltseasonIndexProxy(coins, btcId = 'bitcoin') {
        if (!coins || coins.length === 0) {
            return { index: 0, label: 'N/A', note: 'Data tidak tersedia.' };
        }
        const btc = coins.find(coin => coin.id === btcId);
        if (!btc) {
            return { index: 0, label: 'N/A', note: 'BTC data tidak ditemukan.' };
        }
        const btcChange24h = btc.price_change_percentage_24h || 0;
        const btcChange7d = btc.price_change_percentage_7d_in_currency || 0;
        const alts = coins.filter(coin => coin.id !== btcId);
        const outperformers = alts.filter(coin =>
            (coin.price_change_percentage_24h || 0) > btcChange24h &&
            (coin.price_change_percentage_7d_in_currency || 0) > btcChange7d
        );
        const index = alts.length ? (outperformers.length / alts.length) * 100 : 0;

        let label = 'Neutral';
        let note = 'Pasar campuran, belum ada dominasi jelas.';
        if (index >= 75) {
            label = 'Altseason';
            note = 'Mayoritas altcoin mengungguli BTC.';
        } else if (index <= 25) {
            label = 'BTC Season';
            note = 'BTC lebih kuat dibanding altcoin.';
        }

        return { index, label, note };
    }

    function getNearestPrice(prices, targetMs) {
        if (!prices || prices.length === 0) return null;
        let nearest = prices[0];
        let smallestDiff = Math.abs(prices[0][0] - targetMs);
        for (const point of prices) {
            const diff = Math.abs(point[0] - targetMs);
            if (diff < smallestDiff) {
                smallestDiff = diff;
                nearest = point;
            }
        }
        return nearest[1];
    }

    function buildTimeframeSummary(prices) {
        if (!prices || prices.length === 0) return [];
        const latest = prices[prices.length - 1][1];
        const now = prices[prices.length - 1][0];
        const timeframes = [
            { label: '1D', ms: 24 * 60 * 60 * 1000, horizon: 'Intraday' },
            { label: '7D', ms: 7 * 24 * 60 * 60 * 1000, horizon: 'Swing' },
            { label: '30D', ms: 30 * 24 * 60 * 60 * 1000, horizon: 'Position' }
        ];

        return timeframes.map(tf => {
            const pastPrice = getNearestPrice(prices, now - tf.ms);
            const change = pastPrice ? ((latest - pastPrice) / pastPrice) * 100 : 0;
            let bias = 'Neutral';
            if (change > 5) bias = 'Bullish';
            else if (change < -5) bias = 'Bearish';
            return {
                ...tf,
                change,
                bias
            };
        });
    }

    const utils = {
        getMoonPhaseInfo,
        calculateSMA,
        calculateEMA,
        calculateMACD,
        calculateSupportResistance,
        calculateOBV,
        detectVolumeSpike,
        calculateFibonacciLevels,
        calculateAltseasonIndexProxy,
        buildTimeframeSummary,
        getNearestPrice
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = utils;
    } else {
        global.AnalysisUtils = utils;
    }
})(typeof window !== 'undefined' ? window : globalThis);
