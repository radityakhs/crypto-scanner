/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║            MATRIX BACKGROUND ANIMATION — For Home Hologram             ║
 * ║                                                                          ║
 * ║  Renders animated matrix-style background similar to Signal Bot        ║
 * ║  with scrolling code/characters and glowing effects                    ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

(function() {
    'use strict';

    window.MatrixBackground = (function() {
        let _canvas = null;
        let _ctx = null;
        let _animRAF = null;
        let _chars = '01アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン';
        let _columns = [];
        let _frame = 0;

        /**
         * Initialize matrix background on given canvas
         */
        function init(canvas) {
            if (!canvas) return false;
            _canvas = canvas;
            _ctx = canvas.getContext('2d');
            if (!_ctx) return false;

            // Get canvas dimensions
            const w = canvas.offsetWidth || 800;
            const h = canvas.offsetHeight || 400;
            canvas.width = w;
            canvas.height = h;

            // Initialize columns
            const fontSize = 12;
            const cols = Math.ceil(w / fontSize);
            _columns = [];
            for (let i = 0; i < cols; i++) {
                _columns.push({
                    x: i * fontSize,
                    y: Math.random() * h,
                    speed: Math.random() * 1 + 0.5,
                    brightness: Math.random() * 0.5 + 0.5
                });
            }

            start();
            return true;
        }

        /**
         * Start animation loop
         */
        function start() {
            if (_animRAF) cancelAnimationFrame(_animRAF);
            
            function draw() {
                if (!_ctx || !_canvas) return;
                
                const w = _canvas.width;
                const h = _canvas.height;
                const fontSize = 12;

                // Semi-transparent background (fade trail effect)
                _ctx.fillStyle = 'rgba(10, 25, 47, 0.05)';
                _ctx.fillRect(0, 0, w, h);

                // Grid pattern overlay (subtle)
                _ctx.strokeStyle = 'rgba(0, 217, 255, 0.03)';
                _ctx.lineWidth = 0.5;
                const gridSize = 50;
                for (let x = 0; x < w; x += gridSize) {
                    _ctx.beginPath();
                    _ctx.moveTo(x, 0);
                    _ctx.lineTo(x, h);
                    _ctx.stroke();
                }
                for (let y = 0; y < h; y += gridSize) {
                    _ctx.beginPath();
                    _ctx.moveTo(0, y);
                    _ctx.lineTo(w, y);
                    _ctx.stroke();
                }

                // Draw matrix characters
                _ctx.font = fontSize + 'px monospace';
                _ctx.textBaseline = 'top';

                _columns.forEach((col, idx) => {
                    // Get random character
                    const char = _chars[Math.floor(Math.random() * _chars.length)];
                    
                    // Calculate brightness with fade
                    const fadeFactor = Math.min(col.y / h, 1);
                    const brightness = col.brightness * (1 - fadeFactor * 0.5);
                    
                    // Glow color with dynamic intensity
                    const glowAlpha = Math.max(0, Math.sin(_frame * 0.05 + idx * 0.1) * 0.3 + 0.4);
                    _ctx.fillStyle = `rgba(0, 217, 255, ${brightness * glowAlpha})`;
                    
                    // Draw character
                    _ctx.fillText(char, col.x, col.y);
                    
                    // Add occasional bright pulse
                    if (Math.random() > 0.95) {
                        _ctx.fillStyle = `rgba(255, 170, 0, ${glowAlpha * 0.5})`;
                        _ctx.fillText(char, col.x, col.y);
                    }
                    
                    // Move column down
                    col.y += col.speed;
                    
                    // Reset when off-screen
                    if (col.y > h) {
                        col.y = -fontSize;
                        col.brightness = Math.random() * 0.5 + 0.5;
                        col.speed = Math.random() * 1 + 0.5;
                    }
                });

                // Add subtle scanlines effect
                for (let y = 0; y < h; y += 4) {
                    _ctx.fillStyle = 'rgba(0, 0, 0, 0.03)';
                    _ctx.fillRect(0, y, w, 2);
                }

                _frame++;
                _animRAF = requestAnimationFrame(draw);
            }
            
            draw();
        }

        /**
         * Stop animation
         */
        function stop() {
            if (_animRAF) {
                cancelAnimationFrame(_animRAF);
                _animRAF = null;
            }
        }

        /**
         * Destroy and cleanup
         */
        function destroy() {
            stop();
            _canvas = null;
            _ctx = null;
            _columns = [];
        }

        return {
            init: init,
            start: start,
            stop: stop,
            destroy: destroy
        };
    })();
})();
