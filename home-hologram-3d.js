/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║     HOME 3D HOLOGRAM ANIMATIONS — Digimon Evolution & Coin Attraction   ║
 * ║                                                                          ║
 * ║  Features:                                                              ║
 * │  • 3D rotating hologram entity                                          │
 * │  • Evolution/transformation states                                      │
 * │  • Multi-angle perspective shifting                                     │
 * │  • Coin attraction system on signals                                    │
 * │  • Professional geometric design (no emoji)                             │
 * │  • Smooth 3D perspective transforms                                     │
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

(function() {
    'use strict';

    // ══════════════════════════════════════════════════════════════════════
    // CONFIGURATION
    // ══════════════════════════════════════════════════════════════════════
    const CONFIG = {
        fps: 60,
        rotationSpeed: 1.2,
        perspectiveDistance: 1200,
        coinSpeed: 2.5,
        coinCount: 8
    };

    // ══════════════════════════════════════════════════════════════════════
    // 3D HOLOGRAM ENTITY
    // ══════════════════════════════════════════════════════════════════════
    class HologramEntity {
        constructor(centerX, centerY) {
            this.centerX = centerX;
            this.centerY = centerY;
            this.rotationX = 0;
            this.rotationY = 0;
            this.rotationZ = 0;
            this.scale = 1;
            this.state = 'idle'; // idle, charging, evolving, active
            this.stateTime = 0;
            this.glow = 0;
            this.layers = this.buildLayers();
        }

        buildLayers() {
            // Create geometric 3D layers for hologram
            return [
                {
                    type: 'core',
                    radius: 12,
                    color: '#00d9ff',
                    z: 0,
                    intensity: 1
                },
                {
                    type: 'ring',
                    radius: 30,
                    color: '#00b8ff',
                    z: -10,
                    segments: 12,
                    intensity: 0.7
                },
                {
                    type: 'ring',
                    radius: 45,
                    color: '#0099ff',
                    z: 10,
                    segments: 16,
                    intensity: 0.5
                },
                {
                    type: 'sphere',
                    radius: 35,
                    color: '#0077cc',
                    z: 0,
                    intensity: 0.3
                }
            ];
        }

        setState(newState) {
            if (this.state !== newState) {
                this.state = newState;
                this.stateTime = 0;
                
                // Color change based on state
                switch(newState) {
                    case 'charging':
                        this.layers[0].color = '#ffaa00';
                        break;
                    case 'evolving':
                        this.layers[0].color = '#ff00ff';
                        break;
                    case 'active':
                        this.layers[0].color = '#00ff00';
                        break;
                    default:
                        this.layers[0].color = '#00d9ff';
                }
            }
        }

        update() {
            this.stateTime++;
            
            // Continuous rotation
            this.rotationY += CONFIG.rotationSpeed * 0.5;
            this.rotationX += Math.sin(this.stateTime * 0.01) * 0.3;
            this.rotationZ += Math.cos(this.stateTime * 0.012) * 0.2;

            // State-specific animations
            switch(this.state) {
                case 'charging':
                    this.scale = 1 + Math.sin(this.stateTime * 0.08) * 0.15;
                    this.glow = Math.sin(this.stateTime * 0.06) * 0.5 + 0.5;
                    break;
                case 'evolving':
                    this.scale = 1 + (Math.sin(this.stateTime * 0.12) * 0.25);
                    this.rotationZ += 4;
                    this.glow = Math.sin(this.stateTime * 0.1) * 0.8 + 0.8;
                    break;
                case 'active':
                    this.scale = 1 + Math.sin(this.stateTime * 0.05) * 0.08;
                    this.glow = 0.6;
                    break;
                default:
                    this.scale = 1 + Math.sin(this.stateTime * 0.03) * 0.05;
                    this.glow = 0.4;
            }

            // Keep angles in range
            this.rotationX %= 360;
            this.rotationY %= 360;
            this.rotationZ %= 360;
        }

        project3DTo2D(x, y, z) {
            // Apply rotations
            let rx = x;
            let ry = y * Math.cos(this.rotationX * Math.PI / 180) - z * Math.sin(this.rotationX * Math.PI / 180);
            let rz = y * Math.sin(this.rotationX * Math.PI / 180) + z * Math.cos(this.rotationX * Math.PI / 180);

            x = rx * Math.cos(this.rotationY * Math.PI / 180) + rz * Math.sin(this.rotationY * Math.PI / 180);
            z = -rx * Math.sin(this.rotationY * Math.PI / 180) + rz * Math.cos(this.rotationY * Math.PI / 180);
            y = ry;

            rx = x * Math.cos(this.rotationZ * Math.PI / 180) - y * Math.sin(this.rotationZ * Math.PI / 180);
            ry = x * Math.sin(this.rotationZ * Math.PI / 180) + y * Math.cos(this.rotationZ * Math.PI / 180);

            // Perspective projection
            const perspective = CONFIG.perspectiveDistance / (CONFIG.perspectiveDistance + z);
            const screenX = this.centerX + rx * perspective * this.scale;
            const screenY = this.centerY + ry * perspective * this.scale;
            const depth = perspective;

            return { x: screenX, y: screenY, depth, z };
        }

        draw(ctx, w, h) {
            ctx.save();

            // Draw layers
            this.layers.forEach((layer, idx) => {
                if (layer.type === 'core') {
                    this.drawCore(ctx, layer);
                } else if (layer.type === 'ring') {
                    this.drawRing(ctx, layer);
                } else if (layer.type === 'sphere') {
                    this.drawSphere(ctx, layer);
                }
            });

            ctx.restore();
        }

        drawCore(ctx, layer) {
            const proj = this.project3DTo2D(0, 0, layer.z);
            const alpha = layer.intensity * (0.5 + this.glow * 0.5);
            
            ctx.globalAlpha = alpha;
            ctx.fillStyle = layer.color;
            ctx.beginPath();
            ctx.arc(proj.x, proj.y, layer.radius * this.scale, 0, Math.PI * 2);
            ctx.fill();

            // Inner glow
            const glowGrad = ctx.createRadialGradient(proj.x, proj.y, 0, proj.x, proj.y, layer.radius * this.scale);
            glowGrad.addColorStop(0, layer.color + Math.round(255 * alpha * 0.8).toString(16).padStart(2, '0'));
            glowGrad.addColorStop(1, layer.color + Math.round(255 * alpha * 0.2).toString(16).padStart(2, '0'));
            ctx.fillStyle = glowGrad;
            ctx.beginPath();
            ctx.arc(proj.x, proj.y, layer.radius * this.scale * 1.5, 0, Math.PI * 2);
            ctx.fill();
        }

        drawRing(ctx, layer) {
            const segments = layer.segments;
            const alpha = layer.intensity * (0.4 + this.glow * 0.3);
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = layer.color;
            ctx.lineWidth = 2;

            for (let i = 0; i < segments; i++) {
                const angle = (i / segments) * Math.PI * 2;
                const x = Math.cos(angle) * layer.radius;
                const y = Math.sin(angle) * layer.radius;
                const proj = this.project3DTo2D(x, y, layer.z);

                if (i === 0) {
                    ctx.beginPath();
                    ctx.moveTo(proj.x, proj.y);
                } else {
                    ctx.lineTo(proj.x, proj.y);
                }
            }
            ctx.closePath();
            ctx.stroke();

            // Rotating segments
            ctx.strokeStyle = layer.color;
            ctx.globalAlpha = alpha * 0.6;
            for (let i = 0; i < 4; i++) {
                const angle = (i * 90 + this.stateTime * 1.5) * Math.PI / 180;
                const x1 = Math.cos(angle) * layer.radius;
                const y1 = Math.sin(angle) * layer.radius;
                const x2 = Math.cos(angle + Math.PI) * layer.radius;
                const y2 = Math.sin(angle + Math.PI) * layer.radius;

                const proj1 = this.project3DTo2D(x1, y1, layer.z);
                const proj2 = this.project3DTo2D(x2, y2, layer.z);

                ctx.beginPath();
                ctx.moveTo(proj1.x, proj1.y);
                ctx.lineTo(proj2.x, proj2.y);
                ctx.stroke();
            }
        }

        drawSphere(ctx, layer) {
            const segments = 8;
            const alpha = layer.intensity * (0.3 + this.glow * 0.2);
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = layer.color;
            ctx.lineWidth = 1;

            // Draw wireframe sphere
            for (let lat = 0; lat <= Math.PI; lat += Math.PI / segments) {
                for (let lon = 0; lon < Math.PI * 2; lon += Math.PI / (segments * 2)) {
                    const x = Math.sin(lat) * Math.cos(lon) * layer.radius;
                    const y = Math.cos(lat) * layer.radius;
                    const z = Math.sin(lat) * Math.sin(lon) * layer.radius;

                    const proj = this.project3DTo2D(x, y, z);

                    if (lon === 0) {
                        ctx.beginPath();
                        ctx.moveTo(proj.x, proj.y);
                    } else {
                        ctx.lineTo(proj.x, proj.y);
                    }
                }
                ctx.stroke();
            }
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // COIN PARTICLE
    // ══════════════════════════════════════════════════════════════════════
    class CoinParticle {
        constructor(startX, startY, targetX, targetY) {
            this.x = startX;
            this.y = startY;
            this.targetX = targetX;
            this.targetY = targetY;
            this.progress = 0;
            this.maxProgress = 100;
            this.size = 6;
            this.rotation = 0;
            this.trail = [];
            this.active = true;
        }

        update() {
            this.progress += CONFIG.coinSpeed;
            this.rotation += 8;

            if (this.progress >= this.maxProgress) {
                this.active = false;
                return;
            }

            const t = this.progress / this.maxProgress;
            const easeT = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; // easeInOutQuad

            this.x = this.targetX - (this.targetX - this.x) * (1 - easeT);
            this.y = this.targetY - (this.targetY - this.y) * (1 - easeT);

            this.trail.push({ x: this.x, y: this.y, life: 50 });
            if (this.trail.length > 10) this.trail.shift();

            this.trail.forEach(p => p.life--);
            this.trail = this.trail.filter(p => p.life > 0);
        }

        draw(ctx) {
            if (!this.active) return;

            const alpha = 1 - (this.progress / this.maxProgress);

            // Draw trail
            this.trail.forEach((p, i) => {
                ctx.globalAlpha = alpha * (p.life / 50) * 0.5;
                ctx.fillStyle = '#ffaa00';
                ctx.beginPath();
                ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
                ctx.fill();
            });

            // Draw coin (geometric design)
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate((this.rotation * Math.PI) / 180);
            ctx.globalAlpha = alpha;

            // Outer circle
            ctx.strokeStyle = '#ffaa00';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, this.size, 0, Math.PI * 2);
            ctx.stroke();

            // Inner segments
            ctx.strokeStyle = '#ffaa00';
            ctx.lineWidth = 1;
            for (let i = 0; i < 4; i++) {
                const angle = (i * 90 * Math.PI) / 180;
                ctx.beginPath();
                ctx.moveTo(Math.cos(angle) * this.size * 0.6, Math.sin(angle) * this.size * 0.6);
                ctx.lineTo(Math.cos(angle) * this.size, Math.sin(angle) * this.size);
                ctx.stroke();
            }

            ctx.restore();
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // MAIN ANIMATION MANAGER
    // ══════════════════════════════════════════════════════════════════════
    let _state = {
        hologram: null,
        coins: [],
        animationFrame: 0,
        canvas: null,
        mouseX: 0,
        mouseY: 0
    };

    function initHologramCanvas() {
        // ⚠️ DISABLED — canvas homeEpicCanvas sekarang dipakai oleh
        // home-epic-animations.js (Gundam Head). Hologram 3D dinonaktifkan
        // agar tidak overlap / menimpa animasi Gundam.
        return;
    }

    function updateHologramAnimation() {
        if (!_state.canvas || !_state.hologram) return;

        const ctx = _state.canvas.getContext('2d');
        const w = _state.canvas.width;
        const h = _state.canvas.height;

        // Clear canvas with matrix background effect
        // (matrix background renders its own animation if initialized)
        ctx.fillStyle = 'rgba(10, 25, 47, 0.08)';
        ctx.fillRect(0, 0, w, h);

        // Subtle additional grid overlay
        drawBackgroundGrid(ctx, w, h);

        // Update and draw hologram
        _state.hologram.update();
        _state.hologram.draw(ctx, w, h);

        // Update and draw coins
        _state.coins = _state.coins.filter(coin => coin.active);
        _state.coins.forEach(coin => {
            coin.update();
            coin.draw(ctx);
        });

        // Draw glow effect
        drawGlowEffect(ctx, _state.hologram);

        _state.animationFrame++;
        requestAnimationFrame(updateHologramAnimation);
    }

    function drawBackgroundGrid(ctx, w, h) {
        ctx.strokeStyle = 'rgba(0, 217, 255, 0.08)';
        ctx.lineWidth = 0.5;

        const gridSize = 50;
        for (let x = 0; x < w; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
            ctx.stroke();
        }
        for (let y = 0; y < h; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
        }
    }

    function drawGlowEffect(ctx, hologram) {
        if (!_state.canvas) return;

        const w = _state.canvas.width;
        const h = _state.canvas.height;
        const intensity = hologram.glow;

        ctx.globalAlpha = intensity * 0.2;
        const grad = ctx.createRadialGradient(hologram.centerX, hologram.centerY, 0, hologram.centerX, hologram.centerY, 150);
        grad.addColorStop(0, '#00d9ff');
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(hologram.centerX, hologram.centerY, 150, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = 1;
    }

    // ══════════════════════════════════════════════════════════════════════
    // TRIGGER FUNCTIONS
    // ══════════════════════════════════════════════════════════════════════
    function triggerCharging() {
        if (!_state.hologram) return;
        _state.hologram.setState('charging');
        setTimeout(() => _state.hologram.setState('idle'), 1500);
    }

    function triggerEvolving() {
        if (!_state.hologram) return;
        _state.hologram.setState('evolving');
        setTimeout(() => _state.hologram.setState('idle'), 2500);
    }

    function triggerActive() {
        if (!_state.hologram) return;
        _state.hologram.setState('active');
    }

    function triggerCoinAttraction() {
        if (!_state.canvas || !_state.hologram) return;

        // Generate coins from edges
        for (let i = 0; i < CONFIG.coinCount; i++) {
            const angle = (i / CONFIG.coinCount) * Math.PI * 2;
            const radius = Math.max(_state.canvas.width, _state.canvas.height) * 0.7;
            const startX = _state.hologram.centerX + Math.cos(angle) * radius;
            const startY = _state.hologram.centerY + Math.sin(angle) * radius;

            _state.coins.push(
                new CoinParticle(startX, startY, _state.hologram.centerX, _state.hologram.centerY)
            );
        }

        triggerCharging();
    }

    // ══════════════════════════════════════════════════════════════════════
    // EXTERNAL API
    // ══════════════════════════════════════════════════════════════════════
    window.HologramAnimations = {
        init: initHologramCanvas,
        triggerCharging,
        triggerEvolving,
        triggerActive,
        triggerCoinAttraction,
        setState: (state) => _state.hologram?.setState(state),
        getState: () => _state
    };

    // ══════════════════════════════════════════════════════════════════════
    // INTEGRATION WITH SIGNALS
    // ══════════════════════════════════════════════════════════════════════
    let _lastSignalId = localStorage.getItem('cs_last_hologram_signal') || '0';

    function monitorSignals() {
        setInterval(() => {
            fetch('./signals.json?_=' + Date.now(), { signal: AbortSignal.timeout(2000) })
                .then(r => r.json())
                .then(signals => {
                    if (Array.isArray(signals) && signals.length > 0) {
                        const latest = signals[0];
                        if (latest.id && latest.id > _lastSignalId) {
                            _lastSignalId = latest.id;
                            localStorage.setItem('cs_last_hologram_signal', _lastSignalId);
                            
                            triggerCoinAttraction();
                            
                            // Trigger evolution on strong signals
                            if ((latest.confidence || 0) > 85) {
                                setTimeout(triggerEvolving, 800);
                            }
                        }
                    }
                })
                .catch(() => {});
        }, 4000);
    }

    // ══════════════════════════════════════════════════════════════════════
    // AUTO-INIT — DISABLED (Gundam head animation aktif di canvas ini)
    // ══════════════════════════════════════════════════════════════════════
    // if (document.readyState === 'loading') {
    //     document.addEventListener('DOMContentLoaded', () => {
    //         setTimeout(initHologramCanvas, 100);
    //         setTimeout(monitorSignals, 500);
    //     });
    // } else {
    //     setTimeout(initHologramCanvas, 100);
    //     setTimeout(monitorSignals, 500);
    // }

})();
