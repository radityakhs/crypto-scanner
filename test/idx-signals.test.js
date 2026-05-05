const assert = require('assert');
const lib = require('../lib/idx-signals');

describe('idx-signals', () => {
    it('parseCompactNumber handles K/M/B and Rp prefixes', () => {
        assert.strictEqual(lib.parseCompactNumber('82.4M'), 82400000);
        assert.strictEqual(lib.parseCompactNumber('Rp 807B'), 807000000000);
        assert.strictEqual(lib.parseCompactNumber('+12B'), 12000000000);
        assert.strictEqual(lib.parseCompactNumber('-5M'), -5000000);
        assert.strictEqual(lib.parseCompactNumber('312M'), 312000000);
        assert.strictEqual(lib.parseCompactNumber(null), 0);
    });

    it('computeIDXSignals produces expected fields and basic heuristics', () => {
        const stock = { code: 'TEST', price: 1000, change: 3.5, volume: '60M', value: 'Rp 120B', foreign: '+10B', technical: '📈 Bullish' };
        const sig = lib.computeIDXSignals(stock);
        assert.ok(sig.whale === true, 'expected whale true for high volume + positive flow + move');
        assert.ok(sig.trending === true, 'expected trending true');
        assert.ok(typeof sig.inflowText === 'string' && sig.inflowText.startsWith('+Rp'));

        const small = { code: 'SMALL', price: 100, change: 0.2, volume: '1M', value: 'Rp 1B', foreign: '-0.1B', technical: 'neutral' };
        const s2 = lib.computeIDXSignals(small);
        assert.ok(s2.whale === false, 'small should not be whale');
    });
});
