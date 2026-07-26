// ============================================
// app.js — orchestrates boot → 3D → hero reveal
// ============================================
import { Terminal } from './terminal.js';
import { Scene3D } from './scene.js';

(function () {
    const veil = document.getElementById('veil');
    const terminalEl = document.getElementById('terminal');
    const terminalInner = document.getElementById('terminal-inner');
    const cursor = document.getElementById('terminal-cursor');
    const canvas = document.getElementById('scene');
    const hero = document.getElementById('hero');

    const terminal = new Terminal(terminalEl);

    // Init 3D scene ASAP so it can warm up during boot logs
    let scene3d;
    try {
        scene3d = new Scene3D(canvas);
        window.scene3d = scene3d; // expose for debugging / extensions
    } catch (err) {
        console.warn('[xmzf] 3D init failed, skipping scene.', err);
    }

    // hide the veil once first paint of everything is ready
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            veil.classList.add('is-hidden');
            setTimeout(() => veil.remove(), 700);
        });
    });

    // Track real resource readiness: 3D scene warmed + artistic fonts loaded.
    // Boot logs scroll fast on their own; the final "Booting XMZF Studio..."
    // line holds until these are actually ready, so the perceived boot time
    // always matches real loading.
    const fontsReady = (document.fonts && document.fonts.load)
        ? Promise.all([
            document.fonts.load('900 230px "Playfair Display"'),
            document.fonts.load('italic 900 230px "Playfair Display"'),
            document.fonts.load('500 26px "JetBrains Mono"'),
        ]).catch(() => {})
        : Promise.resolve();

    const sceneReady = new Promise(resolve => {
        if (scene3d) {
            // wait for the scene's first real frame to be rendered
            const check = () => {
                if (scene3d.ready) resolve();
                else requestAnimationFrame(check);
            };
            check();
        } else {
            resolve();
        }
    });

    const resourcesReady = Promise.all([fontsReady, sceneReady]);

    async function start() {
        // boot logs scroll fast in parallel with real resource loading
        const bootDone = terminal.run();

        // when logs finish, we may still be waiting on resources —
        // the terminal will sit on its final "Booting XMZF Studio..." line
        await bootDone;
        await resourcesReady;

        // tiny pause before transition
        await sleep(120);

        // reveal 3D canvas behind terminal
        if (scene3d) {
            canvas.classList.add('is-visible');
            await sleep(60);
        }

        // perform morph transition
        await morphTerminalIntoScreen();

        // reveal hero text + nav
        hero.classList.add('is-visible');
        requestAnimationFrame(() => hero.classList.add('is-revealed'));

        // enable vAI tower interaction once hero has settled
        if (scene3d && typeof scene3d.enableInteraction === 'function') {
            setTimeout(() => scene3d.enableInteraction(), 800);
        }

        // free terminal DOM
        setTimeout(() => {
            terminalEl.style.display = 'none';
        }, 1200);
    }

    async function morphTerminalIntoScreen() {
        if (!scene3d) {
            // fallback: just fade terminal out
            terminalEl.classList.add('is-fading');
            await sleep(600);
            return;
        }

        // Step 1: morph terminal content to XMZF-ish before shrinking
        terminal.morphToScreenContent();
        await sleep(500);

        // Step 2: compute target rect (the 3D screen's projected rect in CSS px)
        const rect = scene3d.getScreenRect();

        // The terminal-inner currently fills the viewport.
        // We want it to scale to fit the screen rect.
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const scaleX = rect.width / vw;
        const scaleY = rect.height / vh;
        const scale = Math.min(scaleX, scaleY) * 1.0;

        // translate so that the viewport center maps to the screen rect center
        const tx = rect.cx - vw / 2;
        const ty = rect.cy - vh / 2;

        // Apply transform with transition
        terminalInner.style.transition =
            'transform 1.0s cubic-bezier(0.7, 0, 0.2, 1), opacity 0.6s cubic-bezier(0.7,0,0.2,1) 0.4s, filter 0.9s ease';
        terminalInner.style.transformOrigin = 'center center';
        terminalInner.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
        terminalInner.style.opacity = '0';
        terminalInner.style.filter = 'blur(2px) brightness(1.3)';

        // also fade the terminal section's scanlines/vignette
        terminalEl.style.transition = 'opacity 0.5s ease 0.6s';
        terminalEl.style.opacity = '0.55';

        // Step 3: while shrinking, switch the 3D screen to show XMZF
        // time it so the screen "lights up" exactly as the terminal lands
        setTimeout(() => {
            scene3d.setScreenState('xmzf');
        }, 620);

        await sleep(1100);
    }

    function sleep(ms) {
        return new Promise(r => setTimeout(r, ms));
    }

    // ---- Scroll behavior: reveal panels, fade hero when leaving top ----
    const panels = document.querySelectorAll('.panel');
    if ('IntersectionObserver' in window) {
        const io = new IntersectionObserver((entries) => {
            entries.forEach(e => {
                if (e.isIntersecting) e.target.classList.add('is-in');
            });
        }, { threshold: 0.18 });
        panels.forEach(p => io.observe(p));
    } else {
        panels.forEach(p => p.classList.add('is-in'));
    }

    // When user scrolls past the hero, fade the fixed 3D canvas
    // so panels take over the screen cleanly. The hero itself is now
    // a normal document-flow section, so only the canvas needs handling.
    let scrollHandled = false;
    function onScroll() {
        const y = window.scrollY || window.pageYOffset;
        const threshold = window.innerHeight * 0.85;
        if (y > threshold && !scrollHandled) {
            scrollHandled = true;
            canvas.classList.add('is-scrolling-away');
        } else if (y <= threshold && scrollHandled) {
            scrollHandled = false;
            canvas.classList.remove('is-scrolling-away');
        }
    }
    window.addEventListener('scroll', onScroll, { passive: true });

    // smooth-scroll for in-page nav links
    document.querySelectorAll('a[href^="#"]').forEach(a => {
        a.addEventListener('click', (e) => {
            const id = a.getAttribute('href');
            if (id.length > 1) {
                const target = document.querySelector(id);
                if (target) {
                    e.preventDefault();
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }
        });
    });

    // kick off once DOM is fully ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
