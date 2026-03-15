// ═══════════════════════════════════════════════════════════════════════════
//  WALLET FLOW GRAPH  v1.0
//  Visualisasi transaksi wallet seperti Arkham Intelligence
//  Menggunakan D3.js v7 force-directed graph (dimuat via CDN di index.html)
//
//  Support chains:  Ethereum (Etherscan API)  ·  Solana (Helius API)
//  Render ke:       #walletGraphCanvas  (SVG di dalam #walletGraphPanel)
// ═══════════════════════════════════════════════════════════════════════════

const walletGraph = (() => {
    'use strict';

    // ── State ─────────────────────────────────────────────────────────────────
    let svgEl        = null;   // D3 SVG selection
    let simulation   = null;   // D3 force simulation
    let nodes        = [];     // { id, label, type, chain, address, value, x, y }
    let links        = [];     // { source, target, value, valueUsd, hash, direction, timestamp }
    let rootAddress  = '';     // wallet yang sedang dilihat
    let rootChain    = '';
    let isLoading    = false;
    let minUsd       = 0;      // filter: USD minimum
    let sortMode     = 'time'; // 'time' | 'value'
    let depth        = 1;      // hop depth (1 = langsung, 2 = counter-party's txs)

    // ── Known entity labels ───────────────────────────────────────────────────
    // Sumber: Etherscan labels + well-known contracts
    const KNOWN_LABELS = {
        // ETH
        '0xd8da6bf26964af9d7eed9e03e53415d37aa96045': 'Vitalik Buterin',
        '0x28c6c06298d514db089934071355e5743bf21d60': 'Binance Hot Wallet',
        '0x21a31ee1afc51d94c2efccaa2092ad1028285549': 'Binance Cold Wallet',
        '0x47ac0fb4f2d84898e4d9e7b4dab3c24507a6d503': 'Binance 8',
        '0xa9d1e08c7793af67e9d92fe308d5697fb81d3e43': 'Coinbase 10',
        '0x71660c4005ba85c37ccec55d0c4493e66fe775d3': 'Coinbase 1',
        '0x503828976d22510aad0201ac7ec88293211d23da': 'Coinbase 2',
        '0xddfabcdc4d8ffc6d5beaf154f18b778f892a0740': 'Coinbase 3',
        '0x3cd751e6b0078be393132286c442345e5dc49699': 'Coinbase 4',
        '0x77696bb39917c91a0c3908d577d5e322095425ca': 'Coinbase 9',
        '0x7c195d981abfdc3ddecd2ca0fed0958430488e34': 'Coinbase 11',
        '0xe982615d461dd5cd06575bbea87624fda4e3de17': 'Coinbase 12',
        '0xa090e606e30bd747d4e6245a1517ebe430f0057e': 'Coinbase 14',
        '0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640': 'Uniswap V3: USDC-ETH',
        '0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8': 'Uniswap V3: USDC-ETH 0.3%',
        '0x7a250d5630b4cf539739df2c5dacb4c659f2488d': 'Uniswap V2: Router',
        '0xe592427a0aece92de3edee1f18e0157c05861564': 'Uniswap V3: Router',
        '0x00000000219ab540356cbb839cbe05303d7705fa': 'ETH2 Deposit Contract',
        '0xae7ab96520de3a18e5e111b5eaab095312d7fe84': 'Lido: stETH',
        '0xba12222222228d8ba445958a75a0704d566bf2c8': 'Balancer Vault',
        '0xdef1c0ded9bec7f1a1670819833240f027b25eff': '0x: Exchange Proxy',
        '0x1111111254eeb25477b68fb85ed929f73a960582': '1inch V5 Router',
        '0xc36442b4a4522e871399cd717abdd847ab11fe88': 'Uniswap V3: Positions NFT',
        // SOL known addresses
        '11111111111111111111111111111111': 'SOL System Program',
        'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA': 'SOL Token Program',
        'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe1bJ8': 'SOL ATA Program',
        '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin': 'Serum DEX V3',
        'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4': 'Jupiter Aggregator V6',
        'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc': 'Orca Whirlpool',
        'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm': 'dydx',
        '9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP': 'Orca V2',
        'MarBmsSgKXdrN1egZf5sqe1TMai9K1rChYNDJgjq7aD': 'Marinade Finance',
    };

    // ── Utilities ─────────────────────────────────────────────────────────────
    const short    = a => a ? a.slice(0, 6) + '…' + a.slice(-4) : '—';
    const getLabel = addr => KNOWN_LABELS[addr?.toLowerCase()] || KNOWN_LABELS[addr] || short(addr);
    const fmtUsd   = v => v >= 1e6 ? `$${(v/1e6).toFixed(2)}M`
                        : v >= 1e3 ? `$${(v/1e3).toFixed(1)}K`
                        : `$${v.toFixed(2)}`;
    const chainColor = { ethereum: '#627eea', solana: '#9945ff', unknown: '#64748b' };

    // Node type → colour mapping
    const nodeColor = (type) => {
        switch(type) {
            case 'root':     return '#6366f1';   // indigo — wallet utama
            case 'exchange': return '#f59e0b';   // amber
            case 'contract': return '#10b981';   // emerald — smart contract
            case 'defi':     return '#06b6d4';   // cyan — DeFi protocol
            case 'wallet':   return '#94a3b8';   // slate — wallet biasa
            default:         return '#64748b';
        }
    };

    // Detect node type dari label
    const detectType = (label, addr) => {
        if (!label) return 'wallet';
        const l = label.toLowerCase();
        if (l.includes('binance') || l.includes('coinbase') || l.includes('kraken')
            || l.includes('okx') || l.includes('bybit') || l.includes('kucoin'))
            return 'exchange';
        if (l.includes('uniswap') || l.includes('sushi') || l.includes('curve')
            || l.includes('balancer') || l.includes('aave') || l.includes('compound')
            || l.includes('lido') || l.includes('orca') || l.includes('jupiter')
            || l.includes('marinade') || l.includes('serum'))
            return 'defi';
        if (l.includes('contract') || l.includes('program') || l.includes('proxy')
            || l.includes('router') || l.includes('vault') || l.includes('erc19')
            || l.includes('deposit'))
            return 'contract';
        return 'wallet';
    };

    // ── API Fetch: ETH (Etherscan) ────────────────────────────────────────────
    async function fetchEthFlows(address, hops) {
        const apiKey = localStorage.getItem('etherscanApiKey') || '';
        const kp     = apiKey ? `&apikey=${apiKey}` : '';
        // Normal ETH txs
        const url    = `https://api.etherscan.io/api?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&sort=desc&offset=25${kp}`;
        try {
            const res  = await fetch(url);
            const json = await res.json();
            if (json.status !== '1') return [];
            return (json.result || []).slice(0, 25).map(tx => {
                const val     = parseFloat(tx.value) / 1e18;
                const dir     = tx.to?.toLowerCase() === address.toLowerCase() ? 'in' : 'out';
                const counter = dir === 'in' ? tx.from : tx.to;
                return {
                    hash:      tx.hash,
                    from:      tx.from,
                    to:        tx.to,
                    counter,
                    direction: dir,
                    value:     val,
                    valueUsd:  val * 2600,   // rough ETH price
                    timestamp: parseInt(tx.timeStamp) * 1000,
                    isContract: tx.input !== '0x' && tx.input?.length > 10,
                };
            });
        } catch { return []; }
    }

    // ── API Fetch: Solana (public RPC + Helius if key exists) ─────────────────
    async function fetchSolFlows(address) {
        const heliusKey = localStorage.getItem('heliusApiKey') || '';
        let txs = [];

        if (heliusKey) {
            // Helius: enhanced transaction API dengan parsed data
            try {
                const url = `https://api.helius.xyz/v0/addresses/${address}/transactions?api-key=${heliusKey}&limit=25&type=TRANSFER`;
                const res  = await fetch(url);
                const json = await res.json();
                if (Array.isArray(json)) {
                    txs = json.map(tx => {
                        const transfer = tx.nativeTransfers?.[0] || {};
                        const val      = (transfer.amount || 0) / 1e9;
                        const dir      = transfer.toUserAccount === address ? 'in' : 'out';
                        const counter  = dir === 'in' ? transfer.fromUserAccount : transfer.toUserAccount;
                        return {
                            hash:      tx.signature,
                            from:      transfer.fromUserAccount || address,
                            to:        transfer.toUserAccount   || address,
                            counter:   counter || '—',
                            direction: dir,
                            value:     val,
                            valueUsd:  val * 140,   // rough SOL price
                            timestamp: (tx.timestamp || 0) * 1000,
                            isContract: (tx.instructions?.length || 0) > 1,
                        };
                    }).filter(t => t.counter && t.counter !== '—' && t.value > 0);
                }
            } catch {}
        }

        // Fallback: public RPC — dapat signature saja, tidak ada value detail
        if (!txs.length) {
            try {
                const rpc = await fetch('https://api.mainnet-beta.solana.com', {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body:    JSON.stringify({
                        jsonrpc: '2.0', id: 1,
                        method:  'getSignaturesForAddress',
                        params:  [address, { limit: 20 }]
                    })
                });
                const rpcJson = await rpc.json();
                const sigs = rpcJson.result || [];
                txs = sigs.map((s, i) => ({
                    hash:      s.signature,
                    from:      address,
                    to:        '—',
                    counter:   null,          // tidak bisa tahu tanpa parse tx
                    direction: 'out',
                    value:     0,
                    valueUsd:  0,
                    timestamp: (s.blockTime || 0) * 1000,
                    isContract: false,
                })).filter(t => t.hash);
            } catch {}
        }

        return txs;
    }

    // ── Build graph nodes & links ─────────────────────────────────────────────
    function buildGraph(rawTxs, centerAddress, chain) {
        const nodeMap = new Map();
        const linkArr = [];

        // Add root node
        const rootLabel = getLabel(centerAddress);
        nodeMap.set(centerAddress.toLowerCase(), {
            id:      centerAddress.toLowerCase(),
            address: centerAddress,
            label:   rootLabel,
            type:    'root',
            chain,
            txCount: rawTxs.length,
            value:   0,
        });

        // Filter by min USD
        const filtered = rawTxs.filter(tx => (tx.valueUsd || 0) >= minUsd);

        filtered.forEach(tx => {
            const counter = tx.counter;
            if (!counter || counter === '—') return;

            const cid    = counter.toLowerCase();
            const cLabel = getLabel(counter);
            const cType  = detectType(cLabel, counter);

            if (!nodeMap.has(cid)) {
                nodeMap.set(cid, {
                    id:      cid,
                    address: counter,
                    label:   cLabel,
                    type:    cType,
                    chain,
                    txCount: 1,
                    value:   tx.valueUsd || 0,
                });
            } else {
                const n = nodeMap.get(cid);
                n.txCount++;
                n.value += tx.valueUsd || 0;
            }

            linkArr.push({
                source:    tx.direction === 'in' ? cid : centerAddress.toLowerCase(),
                target:    tx.direction === 'in' ? centerAddress.toLowerCase() : cid,
                value:     tx.value    || 0,
                valueUsd:  tx.valueUsd || 0,
                hash:      tx.hash,
                direction: tx.direction,
                timestamp: tx.timestamp,
            });
        });

        return {
            nodes: [...nodeMap.values()],
            links: linkArr,
        };
    }

    // ── Render D3 graph ───────────────────────────────────────────────────────
    function renderGraph(graphData, chain) {
        const container = document.getElementById('walletGraphSvg');
        if (!container) return;

        // Clear previous
        container.innerHTML = '';
        const W = container.clientWidth  || 800;
        const H = container.clientHeight || 500;

        const d3 = window.d3;
        if (!d3) {
            container.innerHTML = '<div style="color:#f87171;padding:20px">D3.js belum dimuat. Refresh halaman.</div>';
            return;
        }

        // SVG + zoom
        svgEl = d3.select(container)
            .append('svg')
            .attr('width', '100%')
            .attr('height', '100%')
            .attr('viewBox', `0 0 ${W} ${H}`)
            .style('background', '#0a0f1e');

        // Defs: arrowhead markers
        const defs = svgEl.append('defs');
        ['in','out','both'].forEach(dir => {
            defs.append('marker')
                .attr('id',          `arrow-${dir}`)
                .attr('viewBox',     '0 -4 10 8')
                .attr('refX',        20)
                .attr('refY',        0)
                .attr('markerWidth', 6)
                .attr('markerHeight',6)
                .attr('orient',      'auto')
                .append('path')
                .attr('d',    'M0,-4L10,0L0,4')
                .attr('fill', dir === 'in' ? '#4ade80' : dir === 'out' ? '#f87171' : '#60a5fa');
        });

        const g = svgEl.append('g').attr('class', 'graph-root');

        // Zoom behaviour
        const zoom = d3.zoom()
            .scaleExtent([0.2, 4])
            .on('zoom', (event) => g.attr('transform', event.transform));
        svgEl.call(zoom);

        nodes = graphData.nodes.map(n => ({ ...n }));
        links = graphData.links.map(l => ({ ...l }));

        // Max USD for scaling
        const maxUsd = Math.max(...links.map(l => l.valueUsd || 0), 1);

        // Force simulation
        simulation = d3.forceSimulation(nodes)
            .force('link',    d3.forceLink(links).id(d => d.id).distance(d => {
                // Longer distance for large value txs
                const base = 100;
                const factor = 1 + (d.valueUsd / maxUsd) * 2;
                return base * factor;
            }))
            .force('charge',  d3.forceManyBody().strength(-350))
            .force('center',  d3.forceCenter(W / 2, H / 2))
            .force('collide', d3.forceCollide(40));

        // ── Edges ──────────────────────────────────────────────
        const link = g.append('g').attr('class', 'links')
            .selectAll('line')
            .data(links)
            .enter().append('line')
            .attr('stroke',       d => d.direction === 'in' ? '#4ade8066' : '#f8717166')
            .attr('stroke-width', d => Math.max(1, Math.sqrt((d.valueUsd || 0) / maxUsd) * 6))
            .attr('marker-end',   d => `url(#arrow-${d.direction})`)
            .attr('class',        'graph-link')
            .on('mouseenter', (event, d) => showEdgeTooltip(event, d))
            .on('mouseleave', hideTooltip);

        // ── Edge value labels ───────────────────────────────────
        const linkLabel = g.append('g').attr('class', 'link-labels')
            .selectAll('text')
            .data(links.filter(l => l.valueUsd >= 100))  // hanya tampilkan jika ≥ $100
            .enter().append('text')
            .attr('font-size', 9)
            .attr('fill',      '#64748b')
            .attr('text-anchor','middle')
            .text(d => fmtUsd(d.valueUsd));

        // ── Nodes ───────────────────────────────────────────────
        const nodeG = g.append('g').attr('class', 'nodes')
            .selectAll('g')
            .data(nodes)
            .enter().append('g')
            .attr('class', 'graph-node')
            .call(d3.drag()
                .on('start', (event, d) => {
                    if (!event.active) simulation.alphaTarget(0.3).restart();
                    d.fx = d.x; d.fy = d.y;
                })
                .on('drag',  (event, d) => { d.fx = event.x; d.fy = event.y; })
                .on('end',   (event, d) => {
                    if (!event.active) simulation.alphaTarget(0);
                    d.fx = null; d.fy = null;
                })
            )
            .on('mouseenter', (event, d) => showNodeTooltip(event, d))
            .on('mouseleave', hideTooltip)
            .on('click',      (event, d) => {
                event.stopPropagation();
                onNodeClick(d);
            });

        // Node circle
        nodeG.append('circle')
            .attr('r',           d => d.type === 'root' ? 24 : Math.max(12, Math.min(22, 10 + Math.sqrt(d.txCount || 1) * 2)))
            .attr('fill',        d => nodeColor(d.type) + '22')
            .attr('stroke',      d => nodeColor(d.type))
            .attr('stroke-width',d => d.type === 'root' ? 3 : 1.5);

        // Chain badge dot (small inner circle)
        nodeG.filter(d => d.chain)
            .append('circle')
            .attr('r',    4)
            .attr('cx',   d => d.type === 'root' ? 18 : 10)
            .attr('cy',   d => d.type === 'root' ? -18 : -10)
            .attr('fill', d => chainColor[d.chain] || '#64748b');

        // Node label
        nodeG.append('text')
            .attr('text-anchor', 'middle')
            .attr('dy',          d => d.type === 'root' ? 38 : 30)
            .attr('font-size',   d => d.type === 'root' ? 11 : 9)
            .attr('font-weight', d => d.type === 'root' ? '700' : '400')
            .attr('fill',        d => d.type === 'root' ? '#e2e8f0' : '#94a3b8')
            .text(d => d.label.length > 18 ? d.label.slice(0, 16) + '…' : d.label);

        // Root node icon text
        nodeG.filter(d => d.type === 'root')
            .append('text')
            .attr('text-anchor', 'middle')
            .attr('dy', '0.35em')
            .attr('font-size', 14)
            .attr('fill', '#e2e8f0')
            .text('⬡');

        // Simulation tick
        simulation.on('tick', () => {
            link
                .attr('x1', d => d.source.x)
                .attr('y1', d => d.source.y)
                .attr('x2', d => d.target.x)
                .attr('y2', d => d.target.y);

            linkLabel
                .attr('x', d => ((d.source.x || 0) + (d.target.x || 0)) / 2)
                .attr('y', d => ((d.source.y || 0) + (d.target.y || 0)) / 2);

            nodeG.attr('transform', d => `translate(${d.x},${d.y})`);
        });

        updateStats(graphData);
    }

    // ── Tooltip ────────────────────────────────────────────────────────────────
    function getOrCreateTooltip() {
        let t = document.getElementById('wgTooltip');
        if (!t) {
            t = document.createElement('div');
            t.id = 'wgTooltip';
            t.className = 'wg-tooltip';
            document.body.appendChild(t);
        }
        return t;
    }

    function showNodeTooltip(event, d) {
        const tip = getOrCreateTooltip();
        const chainBadge = d.chain === 'ethereum' ? '⟠ ETH' : d.chain === 'solana' ? '◎ SOL' : '';
        tip.innerHTML = `
            <div class="wg-tip-title">${d.label}</div>
            <div class="wg-tip-addr">${d.address}</div>
            <div class="wg-tip-row"><span>Chain</span><b>${chainBadge}</b></div>
            <div class="wg-tip-row"><span>Type</span><b>${d.type}</b></div>
            <div class="wg-tip-row"><span>Txs</span><b>${d.txCount || 0}</b></div>
            ${d.value > 0 ? `<div class="wg-tip-row"><span>Volume</span><b>${fmtUsd(d.value)}</b></div>` : ''}
            ${d.type !== 'root' ? `<div class="wg-tip-expand">🔍 Klik untuk expand</div>` : ''}
        `;
        positionTooltip(tip, event);
        tip.style.display = 'block';
    }

    function showEdgeTooltip(event, d) {
        const tip = getOrCreateTooltip();
        const dir  = d.direction === 'in' ? '⬇ MASUK' : '⬆ KELUAR';
        const time = d.timestamp ? new Date(d.timestamp).toLocaleString('id-ID') : '—';
        tip.innerHTML = `
            <div class="wg-tip-title">${dir} ${fmtUsd(d.valueUsd)}</div>
            <div class="wg-tip-row"><span>Value</span><b>${d.value?.toFixed(4) || '—'}</b></div>
            <div class="wg-tip-row"><span>USD</span><b>${fmtUsd(d.valueUsd)}</b></div>
            <div class="wg-tip-row"><span>Time</span><b>${time}</b></div>
            <div class="wg-tip-addr">${d.hash?.slice(0, 20)}…</div>
        `;
        positionTooltip(tip, event);
        tip.style.display = 'block';
    }

    function positionTooltip(tip, event) {
        const x = event.pageX + 12;
        const y = event.pageY + 12;
        tip.style.left = Math.min(x, window.innerWidth  - 220) + 'px';
        tip.style.top  = Math.min(y, window.innerHeight - 160) + 'px';
    }

    function hideTooltip() {
        const tip = document.getElementById('wgTooltip');
        if (tip) tip.style.display = 'none';
    }

    // ── Expand node on click ───────────────────────────────────────────────────
    async function onNodeClick(d) {
        if (d.type === 'root') return;
        if (!d.address || d.address === '—') return;

        // Re-center graph pada address ini
        const panel = document.getElementById('walletGraphPanel');
        if (panel) {
            const infoEl = document.getElementById('wgExpandInfo');
            if (infoEl) infoEl.textContent = `Loading transaksi ${d.label}…`;
        }

        showLoading(true);
        try {
            const txs = d.chain === 'solana'
                ? await fetchSolFlows(d.address)
                : await fetchEthFlows(d.address, 1);

            const gData = buildGraph(txs, d.address, d.chain);

            // Merge dengan graph yang ada
            const existingIds = new Set(nodes.map(n => n.id));
            gData.nodes.forEach(n => { if (!existingIds.has(n.id)) nodes.push(n); });
            gData.links.forEach(l => links.push(l));

            // Re-render
            renderGraph({ nodes, links }, d.chain);
        } catch (e) {
            console.error('Expand node error:', e);
        } finally {
            showLoading(false);
        }
    }

    // ── Stats bar ─────────────────────────────────────────────────────────────
    function updateStats(graphData) {
        const el = document.getElementById('wgStats');
        if (!el) return;
        const totalVol = graphData.links.reduce((s, l) => s + (l.valueUsd || 0), 0);
        const inVol    = graphData.links.filter(l => l.direction === 'in') .reduce((s, l) => s + (l.valueUsd || 0), 0);
        const outVol   = graphData.links.filter(l => l.direction === 'out').reduce((s, l) => s + (l.valueUsd || 0), 0);
        el.innerHTML = `
            <span class="wg-stat"><b>${graphData.nodes.length}</b> nodes</span>
            <span class="wg-stat"><b>${graphData.links.length}</b> txs</span>
            <span class="wg-stat" style="color:#4ade80">⬇ IN ${fmtUsd(inVol)}</span>
            <span class="wg-stat" style="color:#f87171">⬆ OUT ${fmtUsd(outVol)}</span>
            <span class="wg-stat">Total vol: <b>${fmtUsd(totalVol)}</b></span>
        `;
    }

    function showLoading(on) {
        const el = document.getElementById('wgLoadingOverlay');
        if (el) el.style.display = on ? 'flex' : 'none';
        isLoading = on;
    }

    // ── Public: load graph for a wallet ──────────────────────────────────────
    async function loadGraph(address, chain) {
        if (isLoading) return;
        if (!address) {
            alert('Pilih wallet yang sudah di-track, atau masukkan address di form di atas.');
            return;
        }
        if (chain !== 'ethereum' && chain !== 'solana') {
            alert('Flow Graph saat ini hanya mendukung Ethereum dan Solana.');
            return;
        }

        rootAddress = address;
        rootChain   = chain;

        // Show panel
        const panel = document.getElementById('walletGraphPanel');
        if (panel) panel.style.display = 'block';

        // Scroll to graph
        setTimeout(() => panel?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);

        showLoading(true);
        document.getElementById('wgAddressLabel').textContent =
            `${chain === 'ethereum' ? '⟠' : '◎'} ${short(address)}`;

        try {
            const txs = chain === 'solana'
                ? await fetchSolFlows(address)
                : await fetchEthFlows(address, 1);

            if (!txs.length) {
                document.getElementById('walletGraphSvg').innerHTML =
                    `<div style="color:#94a3b8;padding:40px;text-align:center">
                        <div style="font-size:2rem">📭</div>
                        <p>Tidak ada transaksi ditemukan.<br>
                        ${chain === 'solana' ? 'Tambahkan <b>Helius API Key</b> di bawah untuk data lebih detail.' : 'Pastikan address benar dan ada transaksi.'}
                        </p>
                    </div>`;
                updateStats({ nodes: [], links: [] });
                return;
            }

            const graphData = buildGraph(txs, address, chain);
            renderGraph(graphData, chain);
        } catch (e) {
            console.error('loadGraph error:', e);
            document.getElementById('walletGraphSvg').innerHTML =
                `<div style="color:#f87171;padding:40px;text-align:center">Error: ${e.message}</div>`;
        } finally {
            showLoading(false);
        }
    }

    // ── Filter controls ───────────────────────────────────────────────────────
    function applyFilter() {
        const minVal = parseFloat(document.getElementById('wgFilterUsd')?.value || '0') || 0;
        minUsd = minVal;
        if (rootAddress) loadGraph(rootAddress, rootChain);
    }

    function resetZoom() {
        if (!svgEl || !window.d3) return;
        svgEl.transition().duration(400)
            .call(window.d3.zoom().transform, window.d3.zoomIdentity);
    }

    function closeGraph() {
        const panel = document.getElementById('walletGraphPanel');
        if (panel) panel.style.display = 'none';
        if (simulation) simulation.stop();
    }

    // ── Init: bind wallet card "Flow Graph" buttons ────────────────────────────
    function init() {
        // nothing on init — buttons rendered dynamically in walletTracker
    }

    return { loadGraph, applyFilter, resetZoom, closeGraph, init };
})();
