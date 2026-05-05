// ═══════════════════════════════════════════════════════════════════════════
//  WALLET FLOW GRAPH  v2.0  —  Arkham Intelligence-style UI
//  ─────────────────────────────────────────────────────────────────────────
//  Layout (inside #walletGraphPanel):
//    ┌──────────────┬──────────────────────────┐
//    │  EXPLORER    │   D3 Force-Directed Graph │
//    │  (left 260px)│   (center fill)           │
//    ├──────┬───────┴──────────────────────────┤
//    │ FILT │   TRANSFERS table (bottom)        │
//    └──────┴────────────────────────────────── ┘
// ═══════════════════════════════════════════════════════════════════════════

const walletGraph = (() => {
    'use strict';

    // ── State ──────────────────────────────────────────────────────────────────
    let svgEl        = null;
    let simulation   = null;
    let nodes        = [];
    let links        = [];
    let allRawTxs    = [];
    let rootAddress  = '';
    let rootChain    = '';
    let isLoading    = false;
    let minUsd       = 0;
    let _filterCat   = 'all';
    let _txPage      = 1;
    const PER_PAGE   = 10;

    // ── Category definitions (Arkham-style) ────────────────────────────────────
    const CATS = {
        cex:     { label: 'Centralized exchanges',  color: '#ef4444' },
        deposit: { label: 'Deposit addresses',       color: '#eab308' },
        fund:    { label: 'Individuals and funds',   color: '#8b5cf6' },
        dex:     { label: 'Decentralized exchanges', color: '#22c55e' },
        lending: { label: 'Lending',                 color: '#06b6d4' },
        misc:    { label: 'Misc',                    color: '#6b7280' },
        unknown: { label: 'Uncategorized',           color: '#374151' },
    };

    // ── Known entities ─────────────────────────────────────────────────────────
    const KE = {
        '0xd8da6bf26964af9d7eed9e03e53415d37aa96045': { label:'Vitalik Buterin',       cat:'fund',    icon:'👤' },
        '0x28c6c06298d514db089934071355e5743bf21d60': { label:'Binance: Hot Wallet',   cat:'deposit', icon:'🟡' },
        '0x21a31ee1afc51d94c2efccaa2092ad1028285549': { label:'Binance: Cold Wallet',  cat:'cex',     icon:'🔴' },
        '0x47ac0fb4f2d84898e4d9e7b4dab3c24507a6d503': { label:'Binance 8',             cat:'cex',     icon:'🔴' },
        '0xf977814e90da44bfa03b6295a0616a897441acec': { label:'Binance 8 Cold',        cat:'cex',     icon:'🔴' },
        '0x8894e0a0c962cb723c1976a4421c95949be2d4e3': { label:'Binance: Hot 6',        cat:'deposit', icon:'🟡' },
        '0xa9d1e08c7793af67e9d92fe308d5697fb81d3e43': { label:'Coinbase: Hot Wallet',  cat:'deposit', icon:'🟡' },
        '0x71660c4005ba85c37ccec55d0c4493e66fe775d3': { label:'Coinbase 1',            cat:'cex',     icon:'🔴' },
        '0x503828976d22510aad0201ac7ec88293211d23da': { label:'Coinbase 2',            cat:'cex',     icon:'🔴' },
        '0xddfabcdc4d8ffc6d5beaf154f18b778f892a0740': { label:'Coinbase 3',            cat:'cex',     icon:'🔴' },
        '0x3cd751e6b0078be393132286c442345e5dc49699': { label:'Coinbase 4',            cat:'cex',     icon:'🔴' },
        '0x77696bb39917c91a0c3908d577d5e322095425ca': { label:'Coinbase 9',            cat:'cex',     icon:'🔴' },
        '0xa090e606e30bd747d4e6245a1517ebe430f0057e': { label:'Coinbase 14',           cat:'cex',     icon:'🔴' },
        '0x0681d8db095565fe8a346fa0277bffde9c0edbbf': { label:'OKX: Hot Wallet',       cat:'cex',     icon:'🔴' },
        '0x6cc5f688a315f3dc28a7781717a9a798a59fda7b': { label:'OKX 1',                 cat:'cex',     icon:'🔴' },
        '0x236f9f97e0e62388479bf9e5ba4889e46b0273c3': { label:'Bybit: Hot Wallet',     cat:'cex',     icon:'🔴' },
        '0x1db92e2eebc8e0c075a02bea49a2935bcd2dfcf4': { label:'Bybit 1',               cat:'cex',     icon:'🔴' },
        '0x2b5634c42055806a59e9107ed44d43c426e99f00': { label:'KuCoin: Hot Wallet',    cat:'cex',     icon:'🔴' },
        '0xcad621da75a66c7a8f4ff86d30a2bf981bfc8fdd': { label:'KuCoin Deposit',        cat:'deposit', icon:'🟡' },
        '0xd3273eba07248020bf98a8b560ec1576a612102f': { label:'KuCoin 2',              cat:'cex',     icon:'🔴' },
        '0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640': { label:'Uniswap V3: USDC-ETH', cat:'dex',     icon:'🟢' },
        '0x7a250d5630b4cf539739df2c5dacb4c659f2488d': { label:'Uniswap V2: Router',   cat:'dex',     icon:'🟢' },
        '0xe592427a0aece92de3edee1f18e0157c05861564': { label:'Uniswap V3: Router',   cat:'dex',     icon:'🟢' },
        '0x1f98431c8ad98523631ae4a59f267346ea31f984': { label:'Uniswap V3: Factory',  cat:'dex',     icon:'🟢' },
        '0xdef1c0ded9bec7f1a1670819833240f027b25eff': { label:'0x: Exchange Proxy',   cat:'dex',     icon:'🟢' },
        '0x1111111254eeb25477b68fb85ed929f73a960582': { label:'1inch V5 Router',      cat:'dex',     icon:'🟢' },
        '0xae7ab96520de3a18e5e111b5eaab095312d7fe84': { label:'Lido: stETH',          cat:'lending', icon:'🩵' },
        '0xba12222222228d8ba445958a75a0704d566bf2c8': { label:'Balancer Vault',        cat:'dex',     icon:'🟢' },
        '0x00000000219ab540356cbb839cbe05303d7705fa': { label:'ETH2 Deposit Contract', cat:'misc',    icon:'⚫' },
        '0xc36442b4a4522e871399cd717abdd847ab11fe88': { label:'Uniswap V3: LP NFT',   cat:'dex',     icon:'🟢' },
        '11111111111111111111111111111111':             { label:'SOL System Program',   cat:'misc',    icon:'⚫' },
        'jup6lkbzbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4': { label:'Jupiter V6',         cat:'dex',     icon:'🟢' },
        'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc': { label:'Orca Whirlpool',     cat:'dex',     icon:'🟢' },
        'MarBmsSgKXdrN1egZf5sqe1TMai9K1rChYNDJgjq7aD': { label:'Marinade Finance',   cat:'lending', icon:'🩵' },
    };

    // ── Helpers ────────────────────────────────────────────────────────────────
    const short    = a => a ? a.slice(0,6)+'…'+a.slice(-4) : '—';
    const getEnt   = addr => KE[addr ? addr.toLowerCase() : ''] || KE[addr] || null;
    const getLabel = addr => getEnt(addr) ? getEnt(addr).label : short(addr);
    const getCat   = addr => getEnt(addr) ? getEnt(addr).cat   : 'unknown';
    const getIcon  = addr => getEnt(addr) ? getEnt(addr).icon  : null;

    function fmtUsd(v) {
        if (!v) return '$0';
        if (v >= 1e6) return '$' + (v/1e6).toFixed(2) + 'M';
        if (v >= 1e3) return '$' + (v/1e3).toFixed(1) + 'K';
        return '$' + v.toFixed(2);
    }

    function fmtTime(ts) {
        if (!ts) return '—';
        const diff = Math.floor((Date.now() - ts) / 1000);
        if (diff < 60)    return diff + ' seconds ago';
        if (diff < 3600)  return Math.floor(diff/60) + ' minutes ago';
        if (diff < 86400) return Math.floor(diff/3600) + ' hours ago';
        return new Date(ts).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
    }

    function fmtTimeFull(ts) {
        if (!ts) return '—';
        return new Date(ts).toLocaleString('en-US', {
            month:'long', day:'numeric', year:'numeric',
            hour:'2-digit', minute:'2-digit', timeZoneName:'short'
        });
    }

    function nodeColor(cat) {
        const MAP = { root:'#6366f1', cex:'#ef4444', deposit:'#eab308', fund:'#8b5cf6', dex:'#22c55e', lending:'#06b6d4', misc:'#6b7280', unknown:'#94a3b8' };
        return MAP[cat] || '#94a3b8';
    }

    function nodeR(d) {
        return d.cat === 'root' ? 26 : Math.max(14, Math.min(24, 11 + Math.sqrt(d.txCount || 1) * 2.5));
    }

    // ── Fetch ETH (Etherscan) ──────────────────────────────────────────────────
    async function fetchEthFlows(address) {
        const apiKey = localStorage.getItem('etherscanApiKey') || '';
        const kp     = apiKey ? '&apikey=' + apiKey : '';
        const url    = 'https://api.etherscan.io/api?module=account&action=txlist&address=' + address + '&startblock=0&endblock=99999999&sort=desc&offset=30' + kp;
        try {
            const json = await (await fetch(url)).json();
            if (json.status !== '1') return [];
            return (json.result || []).slice(0, 30).map(tx => {
                const val     = parseFloat(tx.value) / 1e18;
                const dir     = tx.to && tx.to.toLowerCase() === address.toLowerCase() ? 'in' : 'out';
                const counter = dir === 'in' ? tx.from : tx.to;
                const e       = getEnt(counter);
                return {
                    hash: tx.hash, from: tx.from, to: tx.to, counter: counter,
                    fromLabel: dir === 'in' ? (getEnt(tx.from) ? getEnt(tx.from).label : short(tx.from)) : 'Your Wallet',
                    toLabel:   dir === 'out'? (getEnt(tx.to  ) ? getEnt(tx.to).label   : short(tx.to  )) : 'Your Wallet',
                    direction: dir, value: val, valueUsd: val * 2600, token: 'ETH',
                    timestamp: parseInt(tx.timeStamp) * 1000,
                    cat: e ? e.cat : 'unknown',
                    isContract: tx.input !== '0x' && tx.input && tx.input.length > 10,
                };
            });
        } catch(e) { console.warn('ETH fetch:', e); return []; }
    }

    // ── Fetch SOL (Helius / public RPC) ───────────────────────────────────────
    async function fetchSolFlows(address) {
        const heliusKey = localStorage.getItem('heliusApiKey') || '';
        let txs = [];
        if (heliusKey) {
            try {
                const url  = 'https://api.helius.xyz/v0/addresses/' + address + '/transactions?api-key=' + heliusKey + '&limit=25&type=TRANSFER';
                const json = await (await fetch(url)).json();
                if (Array.isArray(json)) {
                    txs = json.map(tx => {
                        const t   = tx.nativeTransfers && tx.nativeTransfers[0] ? tx.nativeTransfers[0] : {};
                        const val = (t.amount || 0) / 1e9;
                        const dir = t.toUserAccount === address ? 'in' : 'out';
                        const ctr = dir === 'in' ? t.fromUserAccount : t.toUserAccount;
                        const e   = getEnt(ctr);
                        return {
                            hash: tx.signature, from: t.fromUserAccount || address, to: t.toUserAccount || address,
                            counter: ctr || '—',
                            fromLabel: dir === 'in' ? (e ? e.label : short(ctr)) : 'Your Wallet',
                            toLabel:   dir === 'out'? (e ? e.label : short(ctr)) : 'Your Wallet',
                            direction: dir, value: val, valueUsd: val * 140, token: 'SOL',
                            timestamp: (tx.timestamp || 0) * 1000, cat: e ? e.cat : 'unknown', isContract: false,
                        };
                    }).filter(t => t.counter && t.counter !== '—' && t.value > 0);
                }
            } catch(err) { console.warn('Helius fetch:', err); }
        }
        if (!txs.length) {
            try {
                const rpcJson = await (await fetch('https://api.mainnet-beta.solana.com', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ jsonrpc:'2.0', id:1, method:'getSignaturesForAddress', params:[address, {limit:20}] })
                })).json();
                txs = (rpcJson.result || []).map(s => ({
                    hash: s.signature, from: address, to: '—', counter: null,
                    fromLabel: 'Your Wallet', toLabel: '—',
                    direction: 'out', value: 0, valueUsd: 0, token: 'SOL',
                    timestamp: (s.blockTime || 0) * 1000, cat: 'unknown', isContract: false,
                })).filter(t => t.hash);
            } catch(err) { console.warn('RPC fetch:', err); }
        }
        return txs;
    }

    // ── Build graph data ───────────────────────────────────────────────────────
    function buildGraph(rawTxs, centerAddress, chain) {
        const nodeMap = new Map();
        const linkArr = [];
        const rootEnt = getEnt(centerAddress);
        nodeMap.set(centerAddress.toLowerCase(), {
            id: centerAddress.toLowerCase(), address: centerAddress,
            label: rootEnt ? rootEnt.label : short(centerAddress),
            cat: 'root', chain: chain, txCount: rawTxs.length, totalUsd: 0,
        });

        const filtered = rawTxs.filter(tx =>
            (tx.valueUsd || 0) >= minUsd &&
            (_filterCat === 'all' || tx.cat === _filterCat)
        );

        filtered.forEach(tx => {
            const ctr = tx.counter;
            if (!ctr || ctr === '—') return;
            const cid = ctr.toLowerCase();
            const ce  = getEnt(ctr);
            if (!nodeMap.has(cid)) {
                nodeMap.set(cid, {
                    id: cid, address: ctr, label: ce ? ce.label : short(ctr),
                    cat: ce ? ce.cat : 'unknown', chain: chain, txCount: 1, totalUsd: tx.valueUsd || 0,
                });
            } else {
                const n = nodeMap.get(cid);
                n.txCount++;
                n.totalUsd += (tx.valueUsd || 0);
            }
            linkArr.push({
                source: tx.direction === 'in' ? cid : centerAddress.toLowerCase(),
                target: tx.direction === 'in' ? centerAddress.toLowerCase() : cid,
                value: tx.value || 0, valueUsd: tx.valueUsd || 0,
                hash: tx.hash, direction: tx.direction,
                timestamp: tx.timestamp, fromLabel: tx.fromLabel, toLabel: tx.toLabel, token: tx.token || '',
            });
        });

        return { nodes: [...nodeMap.values()], links: linkArr };
    }

    // ── Render D3 force graph ─────────────────────────────────────────────────
    function renderGraph(graphData, chain) {
        const container = document.getElementById('walletGraphSvg');
        if (!container) return;
        container.innerHTML = '';

        const W = container.clientWidth  || 800;
        const H = container.clientHeight || 460;
        const d3 = window.d3;
        if (!d3) {
            container.innerHTML = '<div style="color:#f87171;padding:20px">D3.js tidak tersedia. Refresh halaman.</div>';
            return;
        }

        svgEl = d3.select(container).append('svg')
            .attr('width', '100%').attr('height', '100%')
            .attr('viewBox', '0 0 ' + W + ' ' + H)
            .style('background', '#070c1b');

        const defs = svgEl.append('defs');
        [['arrow-in','#4ade80'], ['arrow-out','#f87171']].forEach(function(pair) {
            defs.append('marker').attr('id', pair[0]).attr('viewBox', '0 -4 10 8')
                .attr('refX', 18).attr('refY', 0).attr('markerWidth', 5).attr('markerHeight', 5).attr('orient', 'auto')
                .append('path').attr('d', 'M0,-4L10,0L0,4').attr('fill', pair[1]);
        });
        var flt = defs.append('filter').attr('id', 'root-glow');
        flt.append('feGaussianBlur').attr('stdDeviation', 4).attr('result', 'blur');
        var fm = flt.append('feMerge');
        fm.append('feMergeNode').attr('in', 'blur');
        fm.append('feMergeNode').attr('in', 'SourceGraphic');

        const g = svgEl.append('g').attr('class', 'graph-root');

        const zoom = d3.zoom().scaleExtent([0.12, 5])
            .on('zoom', function(ev) { g.attr('transform', ev.transform); });
        svgEl.call(zoom);

        nodes = graphData.nodes.map(n => Object.assign({}, n));
        links = graphData.links.map(l => Object.assign({}, l));

        const maxUsd = Math.max.apply(null, links.map(l => l.valueUsd || 0).concat([1]));

        simulation = d3.forceSimulation(nodes)
            .force('link', d3.forceLink(links).id(function(d) { return d.id; }).distance(function(d) {
                return 85 + (d.valueUsd / maxUsd) * 130;
            }))
            .force('charge', d3.forceManyBody().strength(-480))
            .force('center', d3.forceCenter(W / 2, H / 2))
            .force('collide', d3.forceCollide(function(d) { return nodeR(d) + 8; }));

        // Edges
        const linkSel = g.append('g').selectAll('line').data(links).enter().append('line')
            .attr('stroke', function(d) { return d.direction === 'in' ? '#4ade8055' : '#f8717155'; })
            .attr('stroke-width', function(d) { return Math.max(1.5, Math.sqrt((d.valueUsd || 0) / maxUsd) * 7); })
            .attr('marker-end', function(d) { return 'url(#arrow-' + d.direction + ')'; })
            .style('cursor', 'pointer')
            .on('mouseenter', function(ev, d) { showEdgeTip(ev, d); })
            .on('mouseleave', hideTip)
            .on('click', function(ev, d) { ev.stopPropagation(); onEdgeClick(d); });

        const edgeLbl = g.append('g').selectAll('text').data(links.filter(function(l) { return l.valueUsd >= 200; }))
            .enter().append('text')
            .attr('font-size', 7.5).attr('fill', '#374151').attr('text-anchor', 'middle').attr('pointer-events', 'none')
            .text(function(d) { return fmtUsd(d.valueUsd); });

        // Nodes
        const nodeG = g.append('g').selectAll('g').data(nodes).enter().append('g')
            .attr('class', 'graph-node').style('cursor', 'pointer')
            .call(d3.drag()
                .on('start', function(ev, d) { if (!ev.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
                .on('drag',  function(ev, d) { d.fx = ev.x; d.fy = ev.y; })
                .on('end',   function(ev, d) { if (!ev.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; }))
            .on('mouseenter', function(ev, d) { showNodeTip(ev, d); })
            .on('mouseleave', hideTip)
            .on('click', function(ev, d) { ev.stopPropagation(); onNodeClick(d); });

        // Outer glow ring
        nodeG.filter(function(d) { return d.cat !== 'root' && d.cat !== 'unknown'; })
            .append('circle')
            .attr('r', function(d) { return nodeR(d) + 6; }).attr('fill', 'none')
            .attr('stroke', function(d) { return nodeColor(d.cat) + '28'; }).attr('stroke-width', 4);

        // Main circle
        nodeG.append('circle')
            .attr('r', function(d) { return nodeR(d); })
            .attr('fill', function(d) { return nodeColor(d.cat) + (d.cat === 'root' ? '30' : '18'); })
            .attr('stroke', function(d) { return nodeColor(d.cat); })
            .attr('stroke-width', function(d) { return d.cat === 'root' ? 2.5 : 1.5; })
            .attr('filter', function(d) { return d.cat === 'root' ? 'url(#root-glow)' : null; });

        // Icon inside node
        nodeG.append('text')
            .attr('text-anchor', 'middle').attr('dy', '0.35em')
            .attr('font-size', function(d) { return d.cat === 'root' ? 15 : 10; })
            .attr('fill', function(d) { return nodeColor(d.cat); })
            .attr('pointer-events', 'none')
            .text(function(d) {
                if (d.cat === 'root') return '⬡';
                const ic = getIcon(d.address);
                if (ic) return ic;
                if (d.cat === 'cex')     return '🔴';
                if (d.cat === 'dex')     return '🟢';
                if (d.cat === 'deposit') return '🟡';
                if (d.cat === 'lending') return '🩵';
                if (d.cat === 'fund')    return '🟣';
                return '●';
            });

        // Chain badge dot
        nodeG.append('circle')
            .attr('r', 4).attr('cx', function(d) { return nodeR(d) - 1; }).attr('cy', function(d) { return -(nodeR(d) - 1); })
            .attr('fill', function(d) { return d.chain === 'ethereum' ? '#627eea' : d.chain === 'solana' ? '#9945ff' : '#475569'; })
            .attr('stroke', '#070c1b').attr('stroke-width', 1.5);

        // Label
        nodeG.append('text')
            .attr('text-anchor', 'middle').attr('dy', function(d) { return nodeR(d) + 13; })
            .attr('font-size', function(d) { return d.cat === 'root' ? 10 : 8; })
            .attr('font-weight', function(d) { return d.cat === 'root' ? '700' : '400'; })
            .attr('fill', function(d) { return d.cat === 'root' ? '#e2e8f0' : '#64748b'; })
            .attr('pointer-events', 'none')
            .text(function(d) { return d.label.length > 18 ? d.label.slice(0, 16) + '…' : d.label; });

        simulation.on('tick', function() {
            linkSel
                .attr('x1', function(d) { return d.source.x; }).attr('y1', function(d) { return d.source.y; })
                .attr('x2', function(d) { return d.target.x; }).attr('y2', function(d) { return d.target.y; });
            edgeLbl
                .attr('x', function(d) { return ((d.source.x || 0) + (d.target.x || 0)) / 2; })
                .attr('y', function(d) { return ((d.source.y || 0) + (d.target.y || 0)) / 2 - 4; });
            nodeG.attr('transform', function(d) { return 'translate(' + d.x + ',' + d.y + ')'; });
        });

        updateStats(graphData);
    }

    // ── Explorer panel ─────────────────────────────────────────────────────────
    function onNodeClick(d) {
        const panel = document.getElementById('wgExplorer');
        if (!panel) return;
        const cat = CATS[d.cat] || CATS.unknown;

        panel.innerHTML = [
            '<div class="wge-header">',
            '  <span class="wge-title">EXPLORER</span>',
            '  <button class="wge-close" onclick="wgClearExplorer()">&times;</button>',
            '</div>',
            '<div class="wge-section">',
            '  <div class="wge-row"><span class="wge-key">SEE ADDRESS:</span>',
            '    <span class="wge-val wge-mono" title="' + d.address + '">' + (d.address ? d.address.slice(0,20) + '…' : '—') + '</span></div>',
            '  <div class="wge-row"><span class="wge-key">LABEL:</span>',
            '    <span class="wge-val">' + d.label + '</span></div>',
            '  <div class="wge-row"><span class="wge-key">CATEGORY:</span>',
            '    <span class="wge-val" style="color:' + cat.color + '">● ' + cat.label + '</span></div>',
            '  <div class="wge-row"><span class="wge-key">CHAIN:</span>',
            '    <span class="wge-val">' + (d.chain === 'ethereum' ? '⟠ Ethereum' : d.chain === 'solana' ? '◎ Solana' : d.chain) + '</span></div>',
            '</div>',
            '<div class="wge-divider"></div>',
            '<div class="wge-section">',
            '  <div class="wge-row"><span class="wge-key">CURRENT BALANCE:</span><span class="wge-val">0</span></div>',
            '  <div class="wge-row"><span class="wge-key">PCT OF SUPPLY:</span><span class="wge-val">0%</span></div>',
            '  <div class="wge-row"><span class="wge-key">CURRENT USD:</span><span class="wge-val">$0</span></div>',
            '  <div class="wge-row"><span class="wge-key">TX COUNT:</span><span class="wge-val">' + (d.txCount || 0) + '</span></div>',
            '  <div class="wge-row"><span class="wge-key">VOLUME:</span><span class="wge-val">' + fmtUsd(d.totalUsd || 0) + '</span></div>',
            '</div>',
            d.cat !== 'root' ? '<div class="wge-divider"></div><div class="wge-section"><button class="wge-expand-btn" onclick="walletGraph.loadGraph(\'' + d.address + '\',\'' + d.chain + '\')">🔍 Expand node ini</button></div>' : '',
        ].join('');
    }

    function onEdgeClick(d) {
        const panel = document.getElementById('wgExplorer');
        if (!panel) return;
        const dir      = d.direction === 'in';
        const dirLabel = dir ? '⬇ IN' : '⬆ OUT';
        const dirColor = dir ? '#4ade80' : '#f87171';
        const fromAddr = d.source && d.source.address ? d.source.address : '';
        const toAddr   = d.target && d.target.address ? d.target.address : '';
        const explorerBase = d.token === 'SOL' ? 'https://solscan.io/tx/' : 'https://etherscan.io/tx/';

        panel.innerHTML = [
            '<div class="wge-header">',
            '  <span class="wge-title">EXPLORER</span>',
            '  <button class="wge-close" onclick="wgClearExplorer()">&times;</button>',
            '</div>',
            '<div class="wge-section">',
            '  <div class="wge-row"><span class="wge-key">NETWORK:</span><span class="wge-val">' + (d.token === 'SOL' ? '◎ SOLANA' : '⟠ ETHEREUM') + '</span></div>',
            '  <div class="wge-row"><span class="wge-key">TIME:</span><span class="wge-val" style="color:#818cf8">' + fmtTimeFull(d.timestamp) + '</span></div>',
            '</div>',
            '<div class="wge-divider"></div>',
            '<div class="wge-section">',
            '  <div class="wge-row"><span class="wge-key">FROM:</span><span class="wge-val">' + (d.fromLabel || short(fromAddr)) + '</span></div>',
            '  <div class="wge-row"><span class="wge-key">TO:</span><span class="wge-val">' + (d.toLabel || short(toAddr)) + '</span></div>',
            '</div>',
            '<div class="wge-divider"></div>',
            '<div class="wge-section">',
            '  <div class="wge-row"><span class="wge-key">VALUE:</span><span class="wge-val">' + ((d.value || 0).toFixed(4)) + ' ' + (d.token || '') + '</span></div>',
            '  <div class="wge-row"><span class="wge-key">USD:</span><span class="wge-val" style="color:' + dirColor + '">' + dirLabel + ' ' + fmtUsd(d.valueUsd) + '</span></div>',
            d.hash && d.hash !== '—' ? '  <div class="wge-row"><span class="wge-key">TX HASH:</span><span class="wge-val wge-mono">' + d.hash.slice(0,14) + '…</span></div>' : '',
            '</div>',
            d.hash && d.hash !== '—' ? '<div class="wge-divider"></div><div class="wge-section"><a class="wge-tx-link" href="' + explorerBase + d.hash + '" target="_blank">🔗 View on Explorer ↗</a></div>' : '',
        ].join('');
    }

    // ── Filter panel ───────────────────────────────────────────────────────────
    function renderFilterPanel() {
        const el = document.getElementById('wgFilterPanel');
        if (!el) return;
        var items = Object.entries(CATS).concat([['all', { label:'All', color:'#e2e8f0' }]]);
        el.innerHTML = '<div class="wgf-title">FILTER TRANSFERS</div><div class="wgf-list">' +
            items.map(function(pair) {
                var key = pair[0], cat = pair[1];
                var active = _filterCat === key ? ' active' : '';
                return '<label class="wgf-item' + active + '" onclick="wgApplyFilter(\'' + key + '\')">' +
                    '<span class="wgf-dot" style="background:' + cat.color + '"></span>' +
                    '<span class="wgf-label">' + cat.label + '</span>' +
                    '</label>';
            }).join('') + '</div>';
    }

    // ── Transfers table ────────────────────────────────────────────────────────
    function renderTransferTable() {
        const el = document.getElementById('wgTransfersTable');
        if (!el) return;

        var filtered = _filterCat === 'all' ? allRawTxs : allRawTxs.filter(function(t) { return t.cat === _filterCat; });
        var totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
        if (_txPage > totalPages) _txPage = totalPages;
        var paged = filtered.slice((_txPage - 1) * PER_PAGE, _txPage * PER_PAGE);

        var countEl = document.getElementById('wgTxCount');
        if (countEl) countEl.textContent = _txPage + ' / ' + totalPages;
        var totalEl = document.getElementById('wgTxTotal');
        if (totalEl) totalEl.textContent = filtered.length;

        el.innerHTML = paged.length ? paged.map(function(tx, i) {
            var dir      = tx.direction === 'in';
            var dirColor = dir ? '#4ade80' : '#f87171';
            var dirIcon  = dir ? '⬇' : '⬆';
            var idx      = i + (_txPage - 1) * PER_PAGE;
            return '<tr class="wgt-row" onclick="wgRowClick(this,' + idx + ')">' +
                '<td class="wgt-time">'  + fmtTime(tx.timestamp) + '</td>' +
                '<td class="wgt-from">'  + (tx.fromLabel || short(tx.from)) + '</td>' +
                '<td class="wgt-to">'    + (tx.toLabel   || short(tx.to)) + '</td>' +
                '<td class="wgt-val">'   + ((tx.value || 0).toFixed(4)) + '</td>' +
                '<td class="wgt-tok">'   + (tx.token || '') + '</td>' +
                '<td class="wgt-usd" style="color:' + dirColor + '">' + dirIcon + ' ' + fmtUsd(tx.valueUsd) + '</td>' +
                '</tr>';
        }).join('') : '<tr><td colspan="6" class="wgt-empty">Tidak ada data</td></tr>';
    }

    // ── Tooltip ────────────────────────────────────────────────────────────────
    function getTip() {
        var t = document.getElementById('wgTooltip');
        if (!t) { t = document.createElement('div'); t.id = 'wgTooltip'; t.className = 'wg-tooltip'; document.body.appendChild(t); }
        return t;
    }
    function showNodeTip(ev, d) {
        var cat = CATS[d.cat] || CATS.unknown;
        var t   = getTip();
        t.innerHTML = '<div class="wg-tip-title">' + d.label + '</div>' +
            '<div class="wg-tip-cat" style="color:' + cat.color + '">● ' + cat.label + '</div>' +
            '<div class="wg-tip-row"><span>Txs</span><b>' + (d.txCount || 0) + '</b></div>' +
            '<div class="wg-tip-row"><span>Volume</span><b>' + fmtUsd(d.totalUsd || 0) + '</b></div>' +
            (d.cat !== 'root' ? '<div class="wg-tip-hint">Click to inspect</div>' : '');
        posTip(t, ev); t.style.display = 'block';
    }
    function showEdgeTip(ev, d) {
        var dir = d.direction === 'in' ? '<span style="color:#4ade80">⬇ IN</span>' : '<span style="color:#f87171">⬆ OUT</span>';
        var t   = getTip();
        t.innerHTML = '<div class="wg-tip-title">' + dir + ' ' + fmtUsd(d.valueUsd) + '</div>' +
            '<div class="wg-tip-row"><span>From</span><b>' + (d.fromLabel || '—') + '</b></div>' +
            '<div class="wg-tip-row"><span>To</span><b>'   + (d.toLabel   || '—') + '</b></div>' +
            '<div class="wg-tip-row"><span>Value</span><b>' + ((d.value || 0).toFixed(4)) + ' ' + (d.token || '') + '</b></div>' +
            '<div class="wg-tip-hint">' + fmtTime(d.timestamp) + '</div>';
        posTip(t, ev); t.style.display = 'block';
    }
    function posTip(t, ev) {
        t.style.left = Math.min(ev.pageX + 14, window.innerWidth  - 250) + 'px';
        t.style.top  = Math.min(ev.pageY + 14, window.innerHeight - 190) + 'px';
    }
    function hideTip() {
        var t = document.getElementById('wgTooltip');
        if (t) t.style.display = 'none';
    }

    // ── Stats ──────────────────────────────────────────────────────────────────
    function updateStats(gd) {
        const el = document.getElementById('wgStats');
        if (!el) return;
        var tot = gd.links.reduce(function(s,l) { return s + (l.valueUsd || 0); }, 0);
        var inv = gd.links.filter(function(l) { return l.direction === 'in';  }).reduce(function(s,l) { return s + (l.valueUsd || 0); }, 0);
        var out = gd.links.filter(function(l) { return l.direction === 'out'; }).reduce(function(s,l) { return s + (l.valueUsd || 0); }, 0);
        el.innerHTML = '<span class="wg-stat"><b>' + gd.nodes.length + '</b> nodes</span>' +
            '<span class="wg-stat"><b>' + gd.links.length + '</b> transfers</span>' +
            '<span class="wg-stat" style="color:#4ade80">⬇ IN ' + fmtUsd(inv) + '</span>' +
            '<span class="wg-stat" style="color:#f87171">⬆ OUT ' + fmtUsd(out) + '</span>' +
            '<span class="wg-stat">Vol ' + fmtUsd(tot) + '</span>';
    }

    function showLoading(on) {
        var el = document.getElementById('wgLoadingOverlay');
        if (el) el.style.display = on ? 'flex' : 'none';
        isLoading = on;
    }

    // ── Public: loadGraph ──────────────────────────────────────────────────────
    async function loadGraph(address, chain) {
        if (isLoading) return;
        if (!address) { alert('Masukkan wallet address.'); return; }
        if (chain === 'sol') chain = 'solana';
        if (chain === 'eth') chain = 'ethereum';
        if (chain !== 'ethereum' && chain !== 'solana') {
            alert('Flow Graph hanya support Ethereum & Solana.'); return;
        }

        rootAddress = address; rootChain = chain; _txPage = 1; _filterCat = 'all';

        var panel      = document.getElementById('walletGraphPanel');
        var emptyState = document.getElementById('wfEmptyState');
        if (emptyState) emptyState.style.display = 'none';
        if (panel)      panel.style.display       = 'flex';
        setTimeout(function() { if (panel) panel.scrollIntoView({ behavior:'smooth', block:'start' }); }, 100);

        showLoading(true);
        var addrLbl = document.getElementById('wgAddressLabel');
        if (addrLbl) addrLbl.textContent = (chain === 'ethereum' ? '⟠' : '◎') + ' ' + short(address);

        wgClearExplorer();

        try {
            allRawTxs = chain === 'solana' ? await fetchSolFlows(address) : await fetchEthFlows(address);

            if (!allRawTxs.length) {
                var svgCont = document.getElementById('walletGraphSvg');
                if (svgCont) svgCont.innerHTML = '<div style="color:#94a3b8;padding:60px;text-align:center;font-size:.9rem"><div style="font-size:2.5rem;margin-bottom:12px">📭</div><p>Tidak ada transaksi ditemukan.</p></div>';
                updateStats({ nodes:[], links:[] });
                return;
            }

            var gd = buildGraph(allRawTxs, address, chain);
            renderGraph(gd, chain);
            renderFilterPanel();
            renderTransferTable();
        } catch(e) {
            console.error('loadGraph error:', e);
            var svgCont2 = document.getElementById('walletGraphSvg');
            if (svgCont2) svgCont2.innerHTML = '<div style="color:#f87171;padding:40px;text-align:center">Error: ' + e.message + '</div>';
        } finally {
            showLoading(false);
        }
    }

    function applyFilter() {
        var input = document.getElementById('wgFilterUsd');
        minUsd = parseFloat((input && input.value) || 0) || 0;
        if (!allRawTxs.length) return;
        var gd = buildGraph(allRawTxs, rootAddress, rootChain);
        renderGraph(gd, rootChain);
        renderTransferTable();
    }

    function resetZoom() {
        if (!svgEl || !window.d3) return;
        svgEl.transition().duration(400).call(window.d3.zoom().transform, window.d3.zoomIdentity);
    }

    function closeGraph() {
        var panel = document.getElementById('walletGraphPanel');
        var es    = document.getElementById('wfEmptyState');
        if (panel) panel.style.display = 'none';
        if (es)    es.style.display    = 'flex';
        if (simulation) simulation.stop();
        allRawTxs = [];
    }

    function init() {}

    return {
        loadGraph:  loadGraph,
        applyFilter: applyFilter,
        resetZoom:  resetZoom,
        closeGraph: closeGraph,
        init:       init,
        _reloadFilter: function(cat) {
            _filterCat = cat;
            if (!allRawTxs.length) return;
            var gd = buildGraph(allRawTxs, rootAddress, rootChain);
            renderGraph(gd, rootChain);
            renderTransferTable();
            renderFilterPanel();
        },
        _txPageGo: function(p) {
            _txPage = p;
            renderTransferTable();
        },
    };
})();

// ── Global helpers (called from HTML onclick) ─────────────────────────────────
function wgClearExplorer() {
    var el = document.getElementById('wgExplorer');
    if (el) el.innerHTML = '<div class="wge-empty">Click a node or transfer to inspect</div>';
}

function wgApplyFilter(cat) {
    if (typeof walletGraph !== 'undefined') walletGraph._reloadFilter(cat);
}

function wgTxPagePrev() {
    var el = document.getElementById('wgTxCount');
    if (!el) return;
    var cur = parseInt(el.textContent.split('/')[0]) || 1;
    if (cur > 1) walletGraph._txPageGo(cur - 1);
}

function wgTxPageNext() {
    var el = document.getElementById('wgTxCount');
    if (!el) return;
    var parts = el.textContent.split('/');
    var cur = parseInt(parts[0]) || 1;
    var tot = parseInt(parts[1]) || 1;
    if (cur < tot) walletGraph._txPageGo(cur + 1);
}

function wgRowClick(rowEl, idx) {
    document.querySelectorAll('.wgt-row').forEach(function(r) { r.classList.remove('selected'); });
    rowEl.classList.add('selected');
}
