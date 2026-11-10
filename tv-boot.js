/*
  First-load intro: an old TV on a VHS deck in a dark room, lit by one lamp.

  The set is 3D (tv3d.js, three.js from the import map in index.html's head) wherever WebGL works; where it
  doesn't, or three.js doesn't arrive within LOAD_3D, the same story plays on a CSS-drawn TV (#loader .tvb,
  tv-boot.css).

  The set waits, dark, for the visitor to turn it on (a click or a key): browsers only let sound start from a
  gesture, and the intro has its own (sfx below, synthesised with Web Audio, nothing to download; it keeps
  quiet when the visitor has turned the site's sound off). The page loads meanwhile. Then a tape slides into
  the deck, the set comes on (a phosphor line opens into static, then the deck's blue screen) and the screen
  prints one line per part of the page as that part has really arrived, with a tracking bar weighted by each
  part's rough share of the wait (TEMPO between lines, so a cached load still reads as a tape starting).
  When everything is in, the camera flies into the glass, everything goes to black, hideLoader (main.js) wakes
  the page under the black, and the black lifts off it.

  Once on, a click or a key fast-forwards (FF). A return visit plays faster. A part that hasn't come within
  PART_TIMEOUT is printed SKIP and the tape plays on, and HARD_CAP (from the moment it's turned on) hands over
  whatever happens. While the intro runs, window.tvBoot.active holds the site's own sound (effects.js), and
  'tvboot:end' lets it back in. main.js skips the intro under prefers-reduced-motion (tvBoot.dispose), and
  #loader keeps its segmented bar for the page-to-page transitions once .is-boot is gone.
*/
(() => {
    'use strict';
    const loader = document.getElementById('loader');
    const root = loader && loader.querySelector('.tvb');
    if (!root) return;

    const $ = (s) => root.querySelector(s);
    const stage = $('.tvb-stage'), screen = $('.tvb-screen'), log = $('.tvb-log'), fill = $('.tvb-bar i'),
        pctEl = $('.tvb-pct'), counterEl = $('.tvb-counter'), dispEl = $('.tvb-disp-text'),
        line = $('.tvb-line'), noise = $('.tvb-static'), fade = $('.tvb-fade');

    const SEEN = 'ka-tv-boot-seen';
    const TEMPO = 170;           // ms: the least time between two printed lines
    const PART_TIMEOUT = 8000;   // ms a part may take before it's printed SKIP
    const LOAD_3D = 6000;        // ms three.js and the 3D set may take before the CSS TV plays instead
    const HARD_CAP = 24000;      // ms after turning on, past which the page is handed over whatever happens
    const FF_SPEED = 0.3;        // time scale while fast-forwarding

    let seen = false;
    try { seen = localStorage.getItem(SEEN) === '1'; } catch (e) { /* storage unavailable */ }
    const base = seen ? 0.6 : 1;
    const S = { ff: false, done: false, shown: 0, target: 0, counter: '0:00:00' };   // what both sets draw from
    const q = () => (S.ff ? Math.min(base, FF_SPEED) : base);
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const T = (ms) => wait(ms * q());

    // ---- the intro's sound: a deck, a CRT and a room, synthesised ----
    const sfx = (() => {
        let ctx = null, master = null, noiseBuf = null;
        const loops = [];
        const allowed = () => { try { return localStorage.getItem('vhs-sound') !== 'off'; } catch (e) { return true; } };

        // must run inside the visitor's gesture
        function unlock() {
            if (ctx || !allowed()) return;
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return;
            try { ctx = new AC(); } catch (e) { ctx = null; return; }
            if (ctx.resume) ctx.resume().catch(() => {});
            master = ctx.createGain();
            master.gain.value = 0.9;
            const limiter = ctx.createDynamicsCompressor();
            limiter.threshold.value = -12;
            limiter.ratio.value = 4;
            master.connect(limiter).connect(ctx.destination);
            noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
            const d = noiseBuf.getChannelData(0);
            for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        }

        const env = (g, at, peak, a, hold, r) => {
            g.gain.setValueAtTime(0.0001, at);
            g.gain.exponentialRampToValueAtTime(peak, at + a);
            if (hold) g.gain.setValueAtTime(peak, at + a + hold);
            g.gain.exponentialRampToValueAtTime(0.0001, at + a + hold + r);
            return at + a + hold + r + 0.05;
        };
        const hiss = ({ at, type = 'bandpass', freq, to, q: Q = 1, peak, a = 0.002, hold = 0, r }) => {
            const src = ctx.createBufferSource();
            src.buffer = noiseBuf;
            src.loop = true;
            const f = ctx.createBiquadFilter();
            f.type = type;
            f.frequency.setValueAtTime(freq, at);
            if (to) f.frequency.exponentialRampToValueAtTime(to, at + a + hold + r);
            f.Q.value = Q;
            const g = ctx.createGain();
            src.connect(f).connect(g).connect(master);
            const end = env(g, at, peak, a, hold, r);
            src.start(at, Math.random());
            src.stop(end);
        };
        const tone = ({ at, type = 'sine', freq, to, peak, a = 0.002, hold = 0, r }) => {
            const o = ctx.createOscillator();
            o.type = type;
            o.frequency.setValueAtTime(freq, at);
            if (to) o.frequency.exponentialRampToValueAtTime(to, at + a + hold + r);
            const g = ctx.createGain();
            o.connect(g).connect(master);
            const end = env(g, at, peak, a, hold, r);
            o.start(at);
            o.stop(end);
        };
        // a sound that runs until it's stopped
        const loop = (build, level, fadeIn = 0.4) => {
            const g = ctx.createGain();
            g.gain.value = 0.0001;
            g.connect(master);
            const nodes = build(g);
            g.gain.exponentialRampToValueAtTime(level, ctx.currentTime + fadeIn);
            const item = { g, nodes };
            loops.push(item);
            return item;
        };
        const stopAll = (fadeOut = 0.5) => {
            if (!ctx) return;
            const t = ctx.currentTime;
            loops.splice(0).forEach(({ g, nodes }) => {
                g.gain.cancelScheduledValues(t);
                g.gain.setValueAtTime(Math.max(g.gain.value, 0.0001), t);
                g.gain.exponentialRampToValueAtTime(0.0001, t + fadeOut);
                nodes.forEach((n) => { try { n.stop(t + fadeOut + 0.05); } catch (e) { /* already stopped */ } });
            });
        };
        const live = (fn) => (...args) => { if (ctx && ctx.state !== 'closed') fn(ctx.currentTime, ...args); };

        return {
            unlock,
            // the power switch on the set
            click: live((t) => {
                hiss({ at: t, freq: 3000, q: 2, peak: 0.22, r: 0.03 });
                tone({ at: t, freq: 130, to: 50, type: 'triangle', peak: 0.2, r: 0.09 });
                hiss({ at: t + 0.07, freq: 4200, q: 2, peak: 0.08, r: 0.02 });
            }),
            // the tape pushed into the slot, the mechanism taking it, the motor spinning up
            tape: live((t, ms) => {
                const s = ms / 1000;
                hiss({ at: t + s * 0.45, freq: 600, to: 1900, q: 0.8, peak: 0.1, a: 0.08, hold: s * 0.3, r: 0.12 });
                hiss({ at: t + s * 0.9, freq: 1500, q: 2.5, peak: 0.3, r: 0.05 });
                tone({ at: t + s * 0.9, freq: 95, to: 40, peak: 0.26, r: 0.14 });
                tone({ at: t + s * 0.98, freq: 60, to: 140, type: 'sawtooth', peak: 0.03, a: 0.05, hold: 0.25, r: 0.2 });
                setTimeout(() => {
                    if (!ctx) return;
                    // the deck's motor and the tape's hiss, under everything until the black
                    loop((g) => {
                        const o = ctx.createOscillator();
                        o.type = 'sawtooth';
                        o.frequency.value = 52;
                        const lp = ctx.createBiquadFilter();
                        lp.type = 'lowpass';
                        lp.frequency.value = 260;
                        o.connect(lp).connect(g);
                        const src = ctx.createBufferSource();
                        src.buffer = noiseBuf;
                        src.loop = true;
                        const hp = ctx.createBiquadFilter();
                        hp.type = 'highpass';
                        hp.frequency.value = 5200;
                        const hg = ctx.createGain();
                        hg.gain.value = 0.35;
                        src.connect(hp).connect(hg).connect(g);
                        o.start();
                        src.start();
                        return [o, src];
                    }, 0.035, 0.6);
                }, ms);
            }),
            // the CRT coming on: relay clunk, degauss thump, and its hum and faint whine from then on
            powerOn: live((t) => {
                hiss({ at: t, freq: 2600, q: 1.5, peak: 0.16, r: 0.03 });
                tone({ at: t + 0.02, freq: 40, to: 68, type: 'triangle', peak: 0.34, a: 0.03, r: 0.6 });
                hiss({ at: t + 0.02, freq: 180, type: 'lowpass', q: 0.7, peak: 0.2, a: 0.02, r: 0.45 });
                tone({ at: t + 0.05, freq: 58, type: 'sawtooth', peak: 0.05, a: 0.02, hold: 0.35, r: 0.3 });
                loop((g) => {
                    const hum = ctx.createOscillator();
                    hum.frequency.value = 60;
                    const hum2 = ctx.createOscillator();
                    hum2.frequency.value = 120;
                    const h2 = ctx.createGain();
                    h2.gain.value = 0.4;
                    const whine = ctx.createOscillator();
                    whine.frequency.value = 9800;
                    const wg = ctx.createGain();
                    wg.gain.value = 0.05;
                    hum.connect(g);
                    hum2.connect(h2).connect(g);
                    whine.connect(wg).connect(g);
                    [hum, hum2, whine].forEach((o) => o.start());
                    return [hum, hum2, whine];
                }, 0.05, 0.5);
            }),
            // the picture's static, before the tape's signal locks
            static: live((t, ms) => {
                hiss({ at: t, freq: 2400, q: 0.5, peak: 0.16, a: 0.01, hold: ms / 1000, r: 0.12 });
                hiss({ at: t, freq: 300, type: 'lowpass', q: 0.5, peak: 0.07, a: 0.01, hold: ms / 1000, r: 0.1 });
            }),
            // a line printed on the screen
            blip: live((t) => {
                tone({ at: t, freq: 1320, type: 'square', peak: 0.03, hold: 0.025, r: 0.02 });
            }),
            // the test is through: the OSD's double beep
            ready: live((t) => {
                tone({ at: t, freq: 1047, type: 'square', peak: 0.035, hold: 0.06, r: 0.03 });
                tone({ at: t + 0.1, freq: 1568, type: 'square', peak: 0.035, hold: 0.09, r: 0.04 });
            }),
            // fast-forward: the motor winds up
            ff: live((t) => {
                tone({ at: t, freq: 70, to: 260, type: 'sawtooth', peak: 0.04, a: 0.05, hold: 0.2, r: 0.2 });
                hiss({ at: t, freq: 900, to: 3800, q: 1, peak: 0.06, a: 0.1, hold: 0.1, r: 0.2 });
            }),
            // the flight into the glass: a rising rush and a swelling tone, cut by the black
            zoom: live((t, ms) => {
                const s = ms / 1000;
                hiss({ at: t, freq: 250, to: 5200, q: 0.9, peak: 0.3, a: s * 0.85, r: s * 0.2 });
                tone({ at: t, freq: 70, to: 300, type: 'sawtooth', peak: 0.05, a: s * 0.85, r: s * 0.2 });
                hiss({ at: t + s * 0.5, freq: 2400, q: 0.5, peak: 0.12, a: s * 0.4, r: s * 0.15 });
            }),
            // the black: a soft low thud as the room goes, and everything still running fades out
            black: live((t) => {
                tone({ at: t, freq: 70, to: 32, peak: 0.3, a: 0.005, r: 0.7 });
                hiss({ at: t, freq: 160, type: 'lowpass', q: 0.6, peak: 0.12, a: 0.005, r: 0.45 });
                stopAll(0.5);
            }),
            close() {
                stopAll(0.2);
                const c = ctx;
                ctx = null;
                if (c) setTimeout(() => c.close().catch(() => {}), 800);
            },
        };
    })();

    // ---- the parts the screen counts, in the order they can arrive ----
    const windowLoaded = () => (document.readyState === 'complete'
        ? Promise.resolve()
        : new Promise((r) => window.addEventListener('load', r, { once: true })));

    const imageReady = (selector) => {
        const img = document.querySelector(selector);
        if (!img) return Promise.resolve();
        if (img.complete) return img.naturalWidth ? Promise.resolve() : Promise.reject();
        return new Promise((res, rej) => {
            img.addEventListener('load', res, { once: true });
            img.addEventListener('error', rej, { once: true });
        });
    };

    const PARTS = [
        ['FONTS', 2, () => (document.fonts ? document.fonts.ready : Promise.resolve())],
        ['PORTFOLIO DATA', 1, () => (window.portfolioData ? Promise.resolve() : Promise.reject())],
        ['MOTION ENGINE', 1, () => (window.gsap ? Promise.resolve() : Promise.reject())],
        ['PORTRAIT', 3, () => imageReady('.hero img[src*="profile-khaled"]')],
        ['PAGE ASSETS', 3, windowLoaded],
    ];
    const TOTAL = PARTS.reduce((s, p) => s + p[1], 0);

    const track = () => PARTS.map(([label, weight, ready]) => {
        let p;
        try { p = Promise.resolve(ready()); } catch (e) { p = Promise.reject(e); }
        return Promise.race([
            p.then(() => 'OK', () => 'SKIP'),
            wait(PART_TIMEOUT).then(() => 'SKIP'),
        ]).then((status) => ({ label, weight, status }));
    });

    // ---- the tape counter and the tracking bar ----
    let tapeMs = 0, lastFrame = 0, running = false;
    const fmt = (ms) => {
        const s = Math.floor(ms / 1000);
        return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    };
    const frame = (now) => {
        if (!running) return;
        if (lastFrame) tapeMs += (now - lastFrame) * (S.ff ? 6 : 1) * 4;   // a tape's counter runs fast; ff faster
        lastFrame = now;
        S.counter = fmt(tapeMs);
        S.shown += (S.target - S.shown) * Math.min(1, 0.16 / Math.max(q(), 0.3));
        if (Math.abs(S.target - S.shown) < 0.002) S.shown = S.target;
        if (view === cssView) {
            counterEl.textContent = S.counter;
            dispEl.textContent = S.counter.slice(-5);
            fill.style.width = (S.shown * 100).toFixed(2) + '%';
            pctEl.textContent = String(Math.round(S.shown * 100)).padStart(3, '0') + '%';
        }
        requestAnimationFrame(frame);
    };

    // prints parts in the order they arrive, never faster than TEMPO
    const playLog = (results, addLine) => new Promise((resolve) => {
        const queue = [];
        let wake = null, printed = 0, done = 0, last = 0;
        results.forEach((p) => p.then((r) => {
            queue.push(r);
            if (wake) { const w = wake; wake = null; w(); }
        }));
        (async () => {
            while (printed < PARTS.length) {
                if (!queue.length) await new Promise((r) => { wake = r; });
                const gap = last + TEMPO * q() - performance.now();
                if (gap > 0) await wait(gap);
                const part = queue.shift();
                addLine(part);
                done += part.weight;
                S.target = done / TOTAL;
                last = performance.now();
                printed++;
            }
            resolve();
        })();
    });

    // ---- the CSS TV, for where the 3D set can't play ----
    const anim = (el, frames, ms, opts = {}) => el.animate(frames, {
        duration: ms * q(), fill: 'forwards', easing: 'cubic-bezier(.2,.8,.2,1)', ...opts,
    });

    const cssView = {
        gate() { root.classList.add('is-gate'); },
        started() { root.classList.remove('is-gate'); },
        async tapeIn() {
            root.classList.add('is-tape');
            dispEl.textContent = 'LOAD';
            await T(950);
        },
        async powerOn() {
            root.classList.add('is-on');
            anim(line, [{ transform: 'scaleX(0)', opacity: 0 }, { transform: 'scaleX(1)', opacity: 1 }], 220);
            await T(300);
            anim(line, [{ transform: 'scale(1, 1)', opacity: 1 }, { transform: 'scale(1, 130)', opacity: 0 }], 240, { easing: 'ease-in' });
            anim(noise, [{ opacity: 0 }, { opacity: 0.9 }], 160);
            await T(420);
            root.classList.add('is-play');
            anim(noise, [{ opacity: 0.9 }, { opacity: 0.1 }], 480, { easing: 'ease-out' });
        },
        addLine({ label, status }) {
            const li = document.createElement('li');
            if (status !== 'OK') li.className = 'is-skip';
            li.innerHTML = '<span></span><i></i><b></b>';
            li.firstChild.textContent = label;
            li.lastChild.textContent = status;
            log.appendChild(li);
        },
        fastForward() {
            root.classList.add('is-ff');
            root.style.setProperty('--tvb-q', q());
        },
        done() { root.classList.add('is-done'); },
        // the camera pushes in until the glass more than fills the viewport, and the picture goes to black
        async zoom() {
            root.classList.add('is-zoom');
            const sr = screen.getBoundingClientRect();
            const st = stage.getBoundingClientRect();
            const vw = document.documentElement.clientWidth, vh = window.innerHeight;
            const scale = Math.max(vw / sr.width, vh / sr.height) * 1.18;
            const cx = sr.left + sr.width / 2, cy = sr.top + sr.height / 2;
            stage.style.transformOrigin = `${cx - st.left}px ${cy - st.top}px`;
            const ms = 1300;
            fade.style.background = '#000';
            anim(noise, [{ opacity: 0.1 }, { opacity: 0.55, offset: 0.6 }, { opacity: 0 }], ms, { easing: 'linear' });
            anim(fade, [{ opacity: 0 }, { opacity: 0, offset: 0.5 }, { opacity: 1 }], ms, { easing: 'ease-in' });
            await anim(stage, [
                { transform: 'translate(0px, 0px) scale(1)' },
                { transform: `translate(${vw / 2 - cx}px, ${vh / 2 - cy}px) scale(${scale})` },
            ], ms, { easing: 'cubic-bezier(.7,0,.2,1)' }).finished.catch(() => {});
        },
        // #loader fades (0.45s) off the page once it's handed over
        unveil: () => wait(700),
        dispose() {},
    };

    // ---- the 3D set ----
    const webgl = () => {
        try {
            const c = document.createElement('canvas');
            return !!(window.WebGL2RenderingContext && c.getContext('webgl2'));
        } catch (e) { return false; }
    };
    async function make3D() {
        if (!webgl() || !HTMLScriptElement.supports || !HTMLScriptElement.supports('importmap')) return null;
        const mod = await Promise.race([import('./tv3d.js?v=3'), wait(LOAD_3D).then(() => null)]).catch(() => null);
        if (!mod) return null;
        try { return mod.createView(S, { q }); } catch (e) { return null; }
    }

    let view = null, on = false;
    const fastForward = () => {
        if (S.ff || !view || !on) return;
        S.ff = true;
        sfx.ff();
        if (view.fastForward) view.fastForward();
    };

    // waits for the visitor to turn the set on; the sound starts inside that gesture
    const turnOn = () => new Promise((resolve) => {
        loader.classList.add('is-gate');
        loader.setAttribute('aria-label', 'Click or press any key to turn on');
        view.gate();
        const go = (e) => {
            if (e.type === 'keydown' && (e.metaKey || e.ctrlKey || e.altKey || e.key === 'Tab')) return;
            document.removeEventListener('pointerdown', go, true);
            document.removeEventListener('keydown', go, true);
            sfx.unlock();
            sfx.click();
            loader.classList.remove('is-gate');
            loader.setAttribute('aria-label', 'Loading');
            view.started();
            on = true;
            // this gesture turned the set on; the next ones fast-forward
            setTimeout(() => {
                document.addEventListener('pointerdown', fastForward);
                document.addEventListener('keydown', fastForward);
            }, 0);
            resolve();
        };
        document.addEventListener('pointerdown', go, true);
        document.addEventListener('keydown', go, true);
    });

    function dispose() {
        running = false;
        tvBoot.active = false;
        loader.classList.remove('is-boot', 'is-gate');
        document.removeEventListener('pointerdown', fastForward);
        document.removeEventListener('keydown', fastForward);
        sfx.close();
        if (view && view.dispose) view.dispose();
        root.remove();
        window.dispatchEvent(new Event('tvboot:end'));
    }

    let started = false;
    function start(onDone) {
        if (started) return;
        started = true;
        tvBoot.active = true;
        root.style.setProperty('--tvb-q', base);

        const results = track();   // loading is measured from now, while the set waits to be turned on
        let handed = false, finished = false;
        const handOver = () => {
            if (handed) return;
            handed = true;
            try { localStorage.setItem(SEEN, '1'); } catch (e) { /* storage unavailable */ }
            onDone();
        };
        const finish = () => {
            if (finished) return;
            finished = true;
            handOver();
            dispose();
        };

        (async () => {
            view = await make3D();
            if (!view) {
                view = cssView;
                root.classList.add('is-css');
            }
            await turnOn();
            setTimeout(finish, HARD_CAP);
            await T(200);
            sfx.tape(1150 * q());
            await view.tapeIn();
            sfx.powerOn();
            const powered = view.powerOn();
            setTimeout(() => sfx.static(380 * q()), 400 * q());
            await powered;
            running = true;
            requestAnimationFrame(frame);
            await playLog(results, (part) => { sfx.blip(); view.addLine(part); });
            S.target = 1;
            await T(450);
            S.done = true;
            sfx.ready();
            view.done();
            await T(500);
            sfx.zoom(2100 * q());
            await view.zoom();
            sfx.black();
            handOver();          // the page wakes under the black
            await view.unveil();
        })().catch(() => {}).then(finish);
    }

    const tvBoot = (window.tvBoot = { start, dispose, active: false });
})();
