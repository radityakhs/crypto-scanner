// Small library for parsing compact numbers and computing IDX signals
// Designed to be used by the server and tests (pure functions)

function parseCompactNumber(str) {
    if (str == null) return 0;
    try {
        str = String(str).trim();
        str = str.replace(/Rp|\s|,/gi, '');
        const sign = str.startsWith('-') ? -1 : 1;
        str = str.replace(/^[+-]/, '');
        const last = str.slice(-1).toUpperCase();
        if (last === 'K' || last === 'M' || last === 'B') {
            const num = parseFloat(str.slice(0, -1)) || 0;
            if (last === 'K') return sign * num * 1e3;
            if (last === 'M') return sign * num * 1e6;
            if (last === 'B') return sign * num * 1e9;
        }
        const cleaned = str.replace(/[^0-9.\-]/g, '');
        return sign * (parseFloat(cleaned) || 0);
    } catch (e) { return 0; }
}

function computeIDXSignals(stock) {
    const vol = parseCompactNumber(stock.volume);
    const val = parseCompactNumber(stock.value);
    const foreign = parseCompactNumber(stock.foreign);

    let score = 0;
    if (vol >= 50e6) score += 2;
    else if (vol >= 10e6) score += 1;
    if ((Number(stock.change) || 0) >= 2) score += 1;
    if (foreign > 0) score += 1;
    if ((stock.technical || '').toLowerCase().includes('bull')) score += 1;

    const whale = score >= 3;
    const inflowText = foreign ? (foreign > 0 ? `+Rp ${Math.round(foreign).toLocaleString('id-ID')}` : `-Rp ${Math.abs(Math.round(foreign)).toLocaleString('id-ID')}`)
        : (val ? `Rp ${Math.round(val).toLocaleString('id-ID')}` : stock.value || '—');

    const trending = ((Number(stock.change) || 0) >= 1 && vol >= 5e6) || (vol >= 100e6 && Number(stock.change) !== 0);
    const trendLabel = trending ? (stock.change > 0 ? 'Uptrend' : 'Downtrend') : 'Flat/No Flow';

    return { whale, inflowText, trending, trendLabel, vol, val, foreign, score };
}

module.exports = { parseCompactNumber, computeIDXSignals };
