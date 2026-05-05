/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║   HOME EPIC ANIMATIONS — Gundam Head (filled, shaded, detailed)         ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

(function () {
    'use strict';

    // ═══════════════════════════════════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════════════════════════════════
    function lerp(a, b, t) { return a + (b - a) * t; }

    function poly(ctx, pts, fill, stroke, lw) {
        if (!pts.length) return;
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.closePath();
        if (fill)   { ctx.fillStyle   = fill;               ctx.fill(); }
        if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); }
    }

    function drawPanel(ctx, pts, baseColor, edgeColor, bevel) {
        bevel = bevel || 0.18;
        poly(ctx, pts, baseColor, edgeColor, 1.2);
        const cx = pts.reduce(function(s,p){return s+p[0];}, 0) / pts.length;
        const cy = pts.reduce(function(s,p){return s+p[1];}, 0) / pts.length;
        const inner = pts.map(function(p){return [lerp(p[0],cx,bevel), lerp(p[1],cy,bevel)];});
        ctx.save(); ctx.globalAlpha = 0.18;
        poly(ctx, inner, '#ffffff', null);
        ctx.restore();
    }

    // ═══════════════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════════════
    const _s = {
        phase: 0,
        eyeGlow: 0,
        scanBeam: 0, scanBeamDir: 1,
        ventGlow: 0,
        state: 'idle', stateTimer: 0,
        shake: 0,
        particles: [], floatingTexts: [],
        raf: null,
    };

    const TINTS = {
        idle:      null,
        scanning:  'rgba(56,189,248,0.14)',
        bullish:   'rgba(74,222,128,0.17)',
        bearish:   'rgba(248,113,113,0.17)',
        executing: 'rgba(251,191,36,0.17)',
        roar:      'rgba(232,121,249,0.17)',
        error:     'rgba(239,68,68,0.22)',
    };

    // ═══════════════════════════════════════════════════════════════════
    // PARTICLES + FLOATING TEXT
    // ═══════════════════════════════════════════════════════════════════
    class Particle {
        constructor(x, y, opts) {
            opts = opts || {};
            this.x = x; this.y = y;
            this.vx = (Math.random()-0.5)*(opts.speed||4);
            this.vy = (Math.random()-0.5)*(opts.speed||4)-(opts.up||1);
            this.life = 100; this.size = opts.size||3;
            this.color = opts.color||'#4ade80';
            this.rot = Math.random()*Math.PI*2;
            this.av = (Math.random()-0.5)*0.15;
        }
        update(){ this.x+=this.vx; this.y+=this.vy; this.vy+=0.1; this.rot+=this.av; this.life-=2.5; }
        isAlive(){ return this.life>0; }
        draw(ctx){
            ctx.save(); ctx.globalAlpha=Math.max(0,this.life/100);
            ctx.translate(this.x,this.y); ctx.rotate(this.rot);
            ctx.fillStyle=this.color;
            const s=this.size; ctx.fillRect(-s/2,-s/2,s,s);
            ctx.restore();
        }
    }

    class FloatingText {
        constructor(x, y, text, opts) {
            opts = opts || {};
            this.x=x; this.y=y; this.text=text;
            this.life=opts.duration||140; this.maxLife=this.life;
            this.color=opts.color||'#4ade80'; this.size=opts.size||16; this.vy=-1.2;
        }
        update(){ this.y+=this.vy; this.life--; }
        isAlive(){ return this.life>0; }
        draw(ctx){
            ctx.save(); ctx.globalAlpha=Math.max(0,this.life/this.maxLife);
            ctx.font=`bold ${this.size}px 'Courier New',monospace`;
            ctx.fillStyle=this.color; ctx.textAlign='center';
            ctx.shadowColor=this.color; ctx.shadowBlur=10;
            ctx.fillText(this.text,this.x,this.y); ctx.restore();
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // BACKGROUND
    // ═══════════════════════════════════════════════════════════════════
    let _matrixCols = [];
    const _KANA = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン01234567890';

    function drawBg(ctx, W, H) {
        // Semi-transparent fill for trail effect (katakana fade)
        ctx.fillStyle='rgba(5,13,26,0.08)'; ctx.fillRect(0,0,W,H);

        // Full dark base every ~120 frames to prevent ghosting
        if(Math.floor(_s.phase*40)%120===0){
            ctx.fillStyle='#050d1a'; ctx.fillRect(0,0,W,H);
        }

        // Grid
        ctx.save(); ctx.strokeStyle='rgba(0,200,255,0.04)'; ctx.lineWidth=0.5;
        for(let x=0;x<W;x+=50){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
        for(let y=0;y<H;y+=50){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
        ctx.restore();

        // Top teal glow
        const gTop=ctx.createRadialGradient(W/2,0,0,W/2,0,H*0.7);
        gTop.addColorStop(0,'rgba(0,180,220,0.10)'); gTop.addColorStop(1,'transparent');
        ctx.fillStyle=gTop; ctx.fillRect(0,0,W,H);

        // Bottom blue glow
        const gBot=ctx.createRadialGradient(W/2,H,0,W/2,H,H*0.5);
        gBot.addColorStop(0,'rgba(30,80,200,0.18)'); gBot.addColorStop(1,'transparent');
        ctx.fillStyle=gBot; ctx.fillRect(0,0,W,H);

        // Matrix rain — katakana + numbers
        if(_matrixCols.length===0){
            const cols=Math.floor(W/16);
            for(let i=0;i<cols;i++) _matrixCols.push({
                x: i*16+8,
                y: Math.random()*H,
                speed: 0.5+Math.random()*0.8,
                char: _KANA[Math.floor(Math.random()*_KANA.length)],
                timer: Math.floor(Math.random()*6),
                bright: Math.random()
            });
        }
        ctx.save(); ctx.font='11px monospace';
        for(const col of _matrixCols){
            col.timer++;
            if(col.timer%5===0){
                col.char=_KANA[Math.floor(Math.random()*_KANA.length)];
                col.y+=col.speed*5;
                col.bright=Math.random();
            }
            if(col.y>H+20) col.y=-16;
            const alpha=0.08+col.bright*0.18;
            ctx.globalAlpha=alpha;
            ctx.fillStyle=col.bright>0.85?'#ffaa00':'#00d9ff';
            ctx.fillText(col.char,col.x,col.y);
        }
        ctx.restore();
    }

    // ═══════════════════════════════════════════════════════════════════
    // GUNDAM HEAD DRAW
    // ═══════════════════════════════════════════════════════════════════
    function drawGundamHead(ctx, cx, cy, s, eyeGlow, scanBeam, ventGlow, tint) {

        const W  = '#dce8f0';  // white armor
        const LG = '#b8c8d4';  // light gray
        const MG = '#8ca0b0';  // mid gray
        const DG = '#3a4a58';  // dark recess
        const BL = '#1a3a8a';  // blue base
        const LB = '#2a5acc';  // light blue
        const BK = '#080c12';  // black trim
        const GR = '#00ff88';  // green eye
        const CY = '#00e5ff';  // cyan glow
        const RD = '#ff2828';  // red vent

        // ── Ground glow ─────────────────────────────────────────────
        ctx.save(); ctx.globalAlpha=0.28;
        const sg=ctx.createRadialGradient(cx,cy+67*s,0,cx,cy+67*s,62*s);
        sg.addColorStop(0,'#1a3aaa'); sg.addColorStop(1,'transparent');
        ctx.fillStyle=sg; ctx.fillRect(cx-75*s,cy+42*s,150*s,32*s);
        ctx.restore();

        // ── Blue base / collar ───────────────────────────────────────
        drawPanel(ctx,[
            [cx-52*s,cy+63*s],[cx+52*s,cy+63*s],
            [cx+44*s,cy+38*s],[cx-44*s,cy+38*s],
        ],BL,BK,0.15);
        // left extension
        poly(ctx,[
            [cx-52*s,cy+63*s],[cx-44*s,cy+38*s],
            [cx-62*s,cy+42*s],[cx-70*s,cy+58*s],
        ],LB,BK,1);
        // right extension
        poly(ctx,[
            [cx+52*s,cy+63*s],[cx+44*s,cy+38*s],
            [cx+62*s,cy+42*s],[cx+70*s,cy+58*s],
        ],LB,BK,1);
        // front stripe
        poly(ctx,[
            [cx-26*s,cy+63*s],[cx+26*s,cy+63*s],
            [cx+20*s,cy+48*s],[cx-20*s,cy+48*s],
        ],LB,CY,1);
        // base circle emblem
        ctx.save(); ctx.globalAlpha=0.7;
        ctx.beginPath(); ctx.arc(cx,cy+56*s,7*s,0,Math.PI*2);
        ctx.strokeStyle=CY; ctx.lineWidth=1.2; ctx.stroke();
        ctx.beginPath(); ctx.arc(cx,cy+56*s,3*s,0,Math.PI*2);
        ctx.fillStyle=CY; ctx.fill();
        ctx.restore();

        // ── Neck ─────────────────────────────────────────────────────
        poly(ctx,[
            [cx-16*s,cy+38*s],[cx+16*s,cy+38*s],
            [cx+13*s,cy+21*s],[cx-13*s,cy+21*s],
        ],DG,BK,1);
        // neck grilles
        for(let i=-2;i<=2;i++){
            const gx=cx+i*5.5*s;
            poly(ctx,[[gx-2*s,cy+23*s],[gx+2*s,cy+23*s],[gx+2*s,cy+36*s],[gx-2*s,cy+36*s]],RD,null);
            ctx.save(); ctx.globalAlpha=ventGlow*0.8;
            poly(ctx,[[gx-2*s,cy+23*s],[gx+2*s,cy+23*s],[gx+2*s,cy+36*s],[gx-2*s,cy+36*s]],GR,null);
            ctx.restore();
        }

        // ── Jaw / lower face ─────────────────────────────────────────
        drawPanel(ctx,[
            [cx-43*s,cy+21*s],[cx+43*s,cy+21*s],
            [cx+39*s,cy-2*s], [cx-39*s,cy-2*s],
        ],W,BK,0.12);
        // jaw sides
        poly(ctx,[
            [cx-43*s,cy+21*s],[cx-39*s,cy-2*s],
            [cx-50*s,cy+3*s],[cx-54*s,cy+19*s],
        ],LG,BK,1);
        poly(ctx,[
            [cx+43*s,cy+21*s],[cx+39*s,cy-2*s],
            [cx+50*s,cy+3*s],[cx+54*s,cy+19*s],
        ],LG,BK,1);
        // chin grille
        poly(ctx,[
            [cx-26*s,cy+9*s],[cx+26*s,cy+9*s],
            [cx+22*s,cy+19*s],[cx-22*s,cy+19*s],
        ],DG,BK,1);
        for(let i=-3;i<=3;i++){
            const gx=cx+i*7*s;
            poly(ctx,[[gx-2.2*s,cy+10.5*s],[gx+2.2*s,cy+10.5*s],[gx+2.2*s,cy+17.5*s],[gx-2.2*s,cy+17.5*s]],BK,null);
        }

        // ── Main face block ──────────────────────────────────────────
        drawPanel(ctx,[
            [cx-39*s,cy-2*s], [cx+39*s,cy-2*s],
            [cx+35*s,cy-34*s],[cx-35*s,cy-34*s],
        ],W,BK,0.1);
        // cheek panels
        poly(ctx,[
            [cx-39*s,cy-2*s],[cx-35*s,cy-34*s],
            [cx-44*s,cy-30*s],[cx-52*s,cy-9*s],
        ],LG,BK,1.2);
        poly(ctx,[
            [cx+39*s,cy-2*s],[cx+35*s,cy-34*s],
            [cx+44*s,cy-30*s],[cx+52*s,cy-9*s],
        ],LG,BK,1.2);

        // ── Forehead ────────────────────────────────────────────────
        drawPanel(ctx,[
            [cx-35*s,cy-34*s],[cx+35*s,cy-34*s],
            [cx+29*s,cy-58*s],[cx-29*s,cy-58*s],
        ],W,BK,0.1);
        poly(ctx,[
            [cx-35*s,cy-34*s],[cx-29*s,cy-58*s],
            [cx-37*s,cy-54*s],[cx-45*s,cy-36*s],
        ],LG,BK,1);
        poly(ctx,[
            [cx+35*s,cy-34*s],[cx+29*s,cy-58*s],
            [cx+37*s,cy-54*s],[cx+45*s,cy-36*s],
        ],LG,BK,1);

        // ── Crown ────────────────────────────────────────────────────
        drawPanel(ctx,[
            [cx-29*s,cy-58*s],[cx+29*s,cy-58*s],
            [cx+21*s,cy-74*s],[cx-21*s,cy-74*s],
        ],W,BK,0.1);
        poly(ctx,[
            [cx-29*s,cy-58*s],[cx-21*s,cy-74*s],
            [cx-29*s,cy-72*s],[cx-37*s,cy-60*s],
        ],MG,BK,1);
        poly(ctx,[
            [cx+29*s,cy-58*s],[cx+21*s,cy-74*s],
            [cx+29*s,cy-72*s],[cx+37*s,cy-60*s],
        ],MG,BK,1);

        // ── Panel lines (engraved detail) ────────────────────────────
        ctx.save(); ctx.strokeStyle=DG; ctx.lineWidth=0.7; ctx.globalAlpha=0.65;
        const hlines=[
            [cx-39*s,cy+7*s, cx+39*s,cy+7*s],
            [cx-38*s,cy+15*s,cx+38*s,cy+15*s],
            [cx-37*s,cy-15*s,cx+37*s,cy-15*s],
            [cx-36*s,cy-25*s,cx+36*s,cy-25*s],
            [cx-31*s,cy-45*s,cx+31*s,cy-45*s],
        ];
        for(const [x1,y1,x2,y2] of hlines){ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();}
        const vlines=[
            [cx-14*s,cy-2*s,cx-13*s,cy-34*s],
            [cx+14*s,cy-2*s,cx+13*s,cy-34*s],
            [cx-7*s,cy-34*s,cx-6*s,cy-58*s],
            [cx+7*s,cy-34*s,cx+6*s,cy-58*s],
        ];
        for(const [x1,y1,x2,y2] of vlines){ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();}
        ctx.restore();

        // ── V-Fin (main center horn) ─────────────────────────────────
        // left blade
        poly(ctx,[
            [cx-3*s, cy-74*s],
            [cx-20*s,cy-134*s],
            [cx-12*s,cy-132*s],
            [cx+1*s, cy-77*s],
        ],W,BK,1.5);
        poly(ctx,[
            [cx-2*s, cy-76*s],
            [cx-14*s,cy-130*s],
            [cx-12*s,cy-132*s],
            [cx-1*s, cy-77*s],
        ],MG,null);
        // right blade
        poly(ctx,[
            [cx+3*s, cy-74*s],
            [cx+20*s,cy-134*s],
            [cx+12*s,cy-132*s],
            [cx-1*s, cy-77*s],
        ],W,BK,1.5);
        poly(ctx,[
            [cx+2*s, cy-76*s],
            [cx+14*s,cy-130*s],
            [cx+12*s,cy-132*s],
            [cx+1*s, cy-77*s],
        ],MG,null);
        // V-fin root plate
        poly(ctx,[
            [cx-7*s,cy-70*s],[cx+7*s,cy-70*s],
            [cx+5*s,cy-84*s],[cx-5*s,cy-84*s],
        ],LB,CY,1);

        // ── Side wing fins ───────────────────────────────────────────
        // left fin
        poly(ctx,[
            [cx-45*s,cy-36*s],
            [cx-76*s,cy-76*s],
            [cx-65*s,cy-73*s],
            [cx-39*s,cy-38*s],
        ],LG,BK,1.2);
        poly(ctx,[
            [cx-45*s,cy-36*s],
            [cx-65*s,cy-73*s],
            [cx-58*s,cy-71*s],
            [cx-43*s,cy-38*s],
        ],MG,null);
        // right fin
        poly(ctx,[
            [cx+45*s,cy-36*s],
            [cx+76*s,cy-76*s],
            [cx+65*s,cy-73*s],
            [cx+39*s,cy-38*s],
        ],LG,BK,1.2);
        poly(ctx,[
            [cx+45*s,cy-36*s],
            [cx+65*s,cy-73*s],
            [cx+58*s,cy-71*s],
            [cx+43*s,cy-38*s],
        ],MG,null);

        // ── Eye visor housing ────────────────────────────────────────
        poly(ctx,[
            [cx-31*s,cy-8*s],[cx+31*s,cy-8*s],
            [cx+27*s,cy-24*s],[cx-27*s,cy-24*s],
        ],DG,BK,1.8);

        // eye glow amount
        const eg = 0.7 + Math.sin(eyeGlow)*0.3;
        ctx.save();
        ctx.shadowColor = GR; ctx.shadowBlur = 20+Math.sin(eyeGlow)*10;

        // left eye
        poly(ctx,[
            [cx-27*s,cy-10*s],[cx-7*s, cy-10*s],
            [cx-9*s, cy-22*s],[cx-25*s,cy-22*s],
        ],GR,null);
        // right eye
        poly(ctx,[
            [cx+7*s, cy-10*s],[cx+27*s,cy-10*s],
            [cx+25*s,cy-22*s],[cx+9*s, cy-22*s],
        ],GR,null);
        ctx.restore();

        // Eye radial glow
        ctx.save(); ctx.globalAlpha=eg*0.45;
        const egl=ctx.createRadialGradient(cx-17*s,cy-16*s,0,cx-17*s,cy-16*s,13*s);
        egl.addColorStop(0,GR); egl.addColorStop(1,'transparent');
        ctx.fillStyle=egl; ctx.fillRect(cx-32*s,cy-26*s,28*s,20*s);
        const egr=ctx.createRadialGradient(cx+17*s,cy-16*s,0,cx+17*s,cy-16*s,13*s);
        egr.addColorStop(0,GR); egr.addColorStop(1,'transparent');
        ctx.fillStyle=egr; ctx.fillRect(cx+4*s,cy-26*s,28*s,20*s);
        ctx.restore();

        // Scan line across visor
        const slY=lerp(cy-23*s,cy-9*s,(Math.sin(scanBeam*0.055)+1)/2);
        ctx.save();
        ctx.globalAlpha=0.55+Math.sin(scanBeam*0.1)*0.2;
        ctx.fillStyle=CY; ctx.shadowColor=CY; ctx.shadowBlur=6;
        ctx.fillRect(cx-29*s,slY,58*s,1.4*s);
        ctx.restore();

        // ── Forehead sensor ──────────────────────────────────────────
        ctx.save();
        ctx.shadowColor=CY; ctx.shadowBlur=12+Math.sin(eyeGlow*1.3)*6;
        ctx.beginPath(); ctx.arc(cx,cy-48*s,4.5*s,0,Math.PI*2);
        ctx.fillStyle=CY; ctx.globalAlpha=0.9; ctx.fill();
        ctx.restore();

        // ── Crown top stripe (blue) ──────────────────────────────────
        poly(ctx,[
            [cx-19*s,cy-58*s],[cx+19*s,cy-58*s],
            [cx+14*s,cy-70*s],[cx-14*s,cy-70*s],
        ],LB,CY,1);

        // ── Cheek vent panels ────────────────────────────────────────
        // left
        poly(ctx,[
            [cx-52*s,cy-9*s],[cx-43*s,cy-9*s],
            [cx-41*s,cy+1*s],[cx-50*s,cy+1*s],
        ],DG,BK,1);
        for(let i=0;i<3;i++){
            const vy=cy-7.5*s+i*3.5*s;
            poly(ctx,[[cx-51*s,vy],[cx-44*s,vy],[cx-44*s,vy+2.2*s],[cx-51*s,vy+2.2*s]],RD,null);
            ctx.save(); ctx.globalAlpha=ventGlow*0.9;
            poly(ctx,[[cx-51*s,vy],[cx-44*s,vy],[cx-44*s,vy+2.2*s],[cx-51*s,vy+2.2*s]],GR,null);
            ctx.restore();
        }
        // right
        poly(ctx,[
            [cx+43*s,cy-9*s],[cx+52*s,cy-9*s],
            [cx+50*s,cy+1*s],[cx+41*s,cy+1*s],
        ],DG,BK,1);
        for(let i=0;i<3;i++){
            const vy=cy-7.5*s+i*3.5*s;
            poly(ctx,[[cx+44*s,vy],[cx+51*s,vy],[cx+51*s,vy+2.2*s],[cx+44*s,vy+2.2*s]],RD,null);
            ctx.save(); ctx.globalAlpha=ventGlow*0.9;
            poly(ctx,[[cx+44*s,vy],[cx+51*s,vy],[cx+51*s,vy+2.2*s],[cx+44*s,vy+2.2*s]],GR,null);
            ctx.restore();
        }

        // ── Text / serial number markings ────────────────────────────
        ctx.save();
        ctx.font=`${4.5*s}px 'Courier New',monospace`;
        ctx.fillStyle='rgba(0,229,255,0.4)'; ctx.globalAlpha=0.6;
        ctx.fillText('RX-78',cx-38*s,cy+5*s);
        ctx.fillText('CS-BOT',cx+22*s,cy+5*s);
        ctx.restore();

        // ── State tint ───────────────────────────────────────────────
        if(tint){
            ctx.save(); ctx.fillStyle=tint;
            ctx.beginPath(); ctx.rect(cx-82*s,cy-145*s,164*s,215*s); ctx.fill();
            ctx.restore();
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // TICK LOOP
    // ═══════════════════════════════════════════════════════════════════
    function tick() {
        const canvas = document.getElementById('homeEpicCanvas');
        if (!canvas) { _s.raf = requestAnimationFrame(tick); return; }

        const wrap = canvas.parentElement;
        if (wrap) {
            const W2 = wrap.clientWidth||900, H2 = wrap.clientHeight||280;
            if (canvas.width!==W2||canvas.height!==H2) {
                canvas.width=W2; canvas.height=H2; _matrixCols=[];
            }
        }

        const ctx = canvas.getContext('2d');
        const W = canvas.width, H = canvas.height;

        _s.phase      += 0.025;
        _s.eyeGlow    += 0.07;
        _s.scanBeam   += _s.scanBeamDir * 1.4;
        if (_s.scanBeam>90||_s.scanBeam<0) _s.scanBeamDir*=-1;
        _s.ventGlow    = (Math.sin(_s.phase*1.9)+1)/2;
        _s.shake      *= 0.84;

        if (_s.stateTimer>0){ _s.stateTimer--; if(_s.stateTimer===0) setState('idle'); }
        if (_s.state==='idle'&&Math.random()<0.003) setState('scanning',100);

        drawBg(ctx, W, H);

        const bobY = Math.sin(_s.phase*0.7)*4;
        const sx = _s.shake>0?(Math.random()-0.5)*_s.shake:0;
        const sy = _s.shake>0?(Math.random()-0.5)*_s.shake:0;

        // Scale so head (±80px wide, ±150px tall) fits canvas nicely
        const sc = Math.min(W/190, H/330) * 0.80;
        const cx = W/2+sx, cy = H*0.53+bobY+sy;

        ctx.save();
        drawGundamHead(ctx, cx, cy, sc, _s.eyeGlow, _s.scanBeam, _s.ventGlow, TINTS[_s.state]||null);
        ctx.restore();

        _s.particles = _s.particles.filter(p=>p.isAlive());
        _s.particles.forEach(p=>{ p.update(); p.draw(ctx); });
        _s.floatingTexts = _s.floatingTexts.filter(t=>t.isAlive());
        _s.floatingTexts.forEach(t=>{ t.update(); t.draw(ctx); });

        _s.raf = requestAnimationFrame(tick);
    }

    // ═══════════════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════════════
    function setState(newState, duration) {
        _s.state = newState;
        _s.stateTimer = duration !== undefined ? duration : 140;
    }

    // ═══════════════════════════════════════════════════════════════════
    // TRIGGERS
    // ═══════════════════════════════════════════════════════════════════
    function triggerSignalAnimation(signal) {
        const canvas = document.getElementById('homeEpicCanvas');
        if (!canvas) return;
        const W=canvas.width, H=canvas.height;
        const type=(signal.type||signal.signal||'LONG').toUpperCase();
        const isLong=type.includes('LONG')||type.includes('BUY');
        setState(isLong?'bullish':'bearish',160);
        const col=isLong?'#4ade80':'#f87171';
        for(let i=0;i<16;i++)
            _s.particles.push(new Particle(W/2,H*0.44,{color:col,speed:3+Math.random()*3,size:2+Math.random()*3,up:2}));
        const sym=signal._sym||signal.coinSymbol||signal.symbol||signal.coin||'SIGNAL';
        _s.floatingTexts.push(new FloatingText(W/2,H*0.28,(isLong?'🚀 ':'⬇ ')+sym,{color:col,size:20,duration:120}));
        _s.shake=5;
    }

    function triggerTradeAnimation(trade) {
        const canvas = document.getElementById('homeEpicCanvas');
        if (!canvas) return;
        const W=canvas.width, H=canvas.height;
        setState('executing',180);
        for(let i=0;i<24;i++){
            const a=(i/24)*Math.PI*2, r=40+Math.random()*30;
            _s.particles.push(new Particle(W/2+Math.cos(a)*r,H*0.44+Math.sin(a)*r*0.5,{color:'#fbbf24',speed:4,size:2}));
        }
        const sym=trade._sym||trade.coinSymbol||trade.symbol||trade.coin||'TRADE';
        _s.floatingTexts.push(new FloatingText(W/2,H*0.26,`⚡ ${sym}`,{color:'#fbbf24',size:22,duration:150}));
        _s.shake=12;
    }

    function triggerErrorAnimation() {
        setState('error',130);
        const canvas=document.getElementById('homeEpicCanvas');
        if(!canvas) return;
        _s.shake=16;
        _s.floatingTexts.push(new FloatingText(canvas.width/2,canvas.height*0.28,'❌ ERROR',{color:'#f87171',size:20,duration:120}));
    }

    function triggerScanAnimation() { setState('scanning',150); }

    // ═══════════════════════════════════════════════════════════════════
    // INIT
    // ═══════════════════════════════════════════════════════════════════
    function initEpicAnimations() {
        const canvas=document.getElementById('homeEpicCanvas');
        if(!canvas){ console.warn('homeEpicCanvas not found'); return; }
        const wrap=canvas.parentElement;
        if(wrap){ canvas.width=wrap.clientWidth||900; canvas.height=wrap.clientHeight||280; }
        if(_s.raf) cancelAnimationFrame(_s.raf);
        _matrixCols=[];

        // ── Block ALL selection / drag events on canvas & wrapper ──
        const _blockEv = e => { e.preventDefault(); e.stopPropagation(); return false; };
        ['dragstart','drag','dragend','selectstart','contextmenu','mousedown'].forEach(ev => {
            canvas.addEventListener(ev, _blockEv, { passive: false, capture: true });
            if(wrap) wrap.addEventListener(ev, _blockEv, { passive: false, capture: true });
        });
        canvas.setAttribute('draggable', 'false');
        canvas.style.cssText += ';-webkit-user-drag:none;user-select:none;-webkit-user-select:none;';
        if(wrap){
            wrap.setAttribute('draggable','false');
            wrap.style.cssText += ';user-select:none;-webkit-user-select:none;';
        }

        // Init MatrixBackground (Japanese katakana rain) jika tersedia,
        // tapi jangan biarkan dia ambil alih canvas — Gundam tetap prioritas.
        if(typeof window.MatrixBackground !== 'undefined') {
            window.MatrixBackground.stop?.();
        }
        tick();
        window.triggerSignalAnimation=triggerSignalAnimation;
        window.triggerTradeAnimation =triggerTradeAnimation;
        window.triggerErrorAnimation =triggerErrorAnimation;
        window.triggerScanAnimation  =triggerScanAnimation;
        console.log('🤖 Gundam Head animation initialized!');
    }

    window.addEventListener('epicsignal', e=>triggerSignalAnimation(e.detail));
    window.addEventListener('epictrade',  e=>triggerTradeAnimation(e.detail));

    function monitorForEvents() {
        const proxyBase='http://127.0.0.1:3001';
        let lastTradeId=localStorage.getItem('cs_last_trade_id')||'0';
        let lastSignalId=localStorage.getItem('cs_last_signal_id')||'0';
        setInterval(()=>{
            fetch(proxyBase+'/api/auto-trader/state',{signal:AbortSignal.timeout(2000)})
                .then(r=>r.json()).then(data=>{
                    if(data?.lastTrade&&data.lastTrade.id>lastTradeId){
                        lastTradeId=data.lastTrade.id;
                        localStorage.setItem('cs_last_trade_id',lastTradeId);
                        triggerTradeAnimation(data.lastTrade);
                    }
                }).catch(()=>{});
            fetch('./signals.json?_='+Date.now(),{signal:AbortSignal.timeout(2000)})
                .then(r=>r.json()).then(signals=>{
                    if(Array.isArray(signals)&&signals.length){
                        const latest=signals[0];
                        const id=(latest.coinSymbol||latest.symbol||'')+'_'+(latest.timestamp||'');
                        if(id>lastSignalId){
                            lastSignalId=id;
                            localStorage.setItem('cs_last_signal_id',lastSignalId);
                            triggerSignalAnimation(latest);
                        }
                    }
                }).catch(()=>{});
        },5000);
    }

    if(document.readyState==='loading'){
        document.addEventListener('DOMContentLoaded',()=>{
            setTimeout(initEpicAnimations,100);
            setTimeout(monitorForEvents,600);
        });
    } else {
        setTimeout(initEpicAnimations,100);
        setTimeout(monitorForEvents,600);
    }

    window.EpicAnimations = {
        init: initEpicAnimations,
        triggerSignal: triggerSignalAnimation,
        triggerTrade:  triggerTradeAnimation,
        triggerError:  triggerErrorAnimation,
        triggerScan:   triggerScanAnimation,
        setState,
        getState: () => _s.state,
    };

})();