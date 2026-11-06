/* ==========================================================================
   Motion layer
   - Lenis smooth scroll
   - SplitText / ScrambleText heading reveals
   - VHS "channel change" page transition
   - WebGL VHS shader on project thumbnails (hover + scroll velocity)
   - Synthesised sound (on by default, starts with the visitor's first tap/click/key)

   Everything here is optional: if a CDN library fails to load, or the visitor
   prefers reduced motion, the site keeps working exactly as before.
   ========================================================================== */
(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const hasGsap = typeof window.gsap !== 'undefined';

    if (hasGsap) {
        const plugins = [window.SplitText, window.ScrambleTextPlugin].filter(Boolean);
        if (plugins.length) gsap.registerPlugin(...plugins);
    }

    const state = {
        transitioning: false,
        loaderDone: false
    };

    /* ----------------------------------------------------------------------
       Sound (Web Audio, synthesised: nothing to download)

       Everything runs through a "tape" bus (soft saturation, wow & flutter,
       a little room) so the interface sounds like it is coming off a VHS deck.
       Sounds respond to the visitor: hover scrubs shift with position and are
       panned left/right with the pointer, scrolling spins the tape like
       fast-forward, and each interaction has its own mechanical sound.
       ---------------------------------------------------------------------- */
    const sound = (() => {
        // A minor pentatonic across two octaves: any order of hovers sounds musical.
        const HOVER_STEPS = 10;
        const CHANNEL_TONES = { home: 880, services: 988, clients: 1047, about: 1175 };

        let ctx = null;
        let out = null;      // master gain (on/off fades)
        let tape = null;     // input of the tape bus
        let room = null;     // reverb send
        let noise = null;
        let scrollVoice = null;
        let ambient = null;
        let enabled = false;
        let lastHover = 0;
        let lastKey = 0;
        // Phones and tablets get a lighter engine: the full room reverb and
        // oversampled saturation overrun the audio thread on mobile and stutter.
        const lite = !finePointer;

        /* ---------- engine ---------- */

        const makeNoise = (seconds) => {
            const length = Math.floor(ctx.sampleRate * seconds);
            const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
            return buffer;
        };

        // Short, dark room: decaying stereo noise as an impulse response.
        const makeImpulse = (seconds, decay) => {
            const length = Math.floor(ctx.sampleRate * seconds);
            const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
            for (let ch = 0; ch < 2; ch++) {
                const data = buffer.getChannelData(ch);
                for (let i = 0; i < length; i++) {
                    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
                }
            }
            return buffer;
        };

        // Gentle tape saturation curve.
        const makeCurve = (amount) => {
            const n = 1024;
            const curve = new Float32Array(n);
            for (let i = 0; i < n; i++) {
                const x = (i / (n - 1)) * 2 - 1;
                curve[i] = Math.tanh(x * amount) / Math.tanh(amount);
            }
            return curve;
        };

        // One tape-counter tick rendered ahead of time: on phones each tick is then a
        // single buffer playback instead of a noise source, filter, panner and envelope.
        let tickBuffer = null;
        const makeTick = () => {
            const length = Math.floor(ctx.sampleRate * 0.03);
            const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
            const data = buffer.getChannelData(0);
            let lp = 0;
            for (let i = 0; i < length; i++) {
                const e = Math.exp(-i / (ctx.sampleRate * 0.004));
                const n = Math.random() * 2 - 1;
                lp += (n - lp) * 0.45;          // take the fizz off the top
                data[i] = (n - lp) * e * 0.9;   // keep the click's bright body
            }
            return buffer;
        };

        const ensureContext = () => {
            if (ctx) return true;
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return false;
            try {
                ctx = new AudioCtx({ latencyHint: lite ? 'balanced' : 'interactive' });
            } catch (_) {
                ctx = new AudioCtx();
            }
            noise = makeNoise(3);

            out = ctx.createGain();
            out.gain.value = 0;
            const limiter = ctx.createDynamicsCompressor();
            limiter.threshold.value = -14;
            limiter.knee.value = 12;
            limiter.ratio.value = 4;
            limiter.attack.value = 0.003;
            limiter.release.value = 0.2;
            out.connect(limiter).connect(ctx.destination);

            // Tape bus: saturation -> wow/flutter (modulated delay) -> treble roll-off.
            tape = ctx.createGain();
            if (lite) {
                // Phones: just the treble roll-off. The saturation, modulated delay and
                // convolution reverb run on every sample and starve the mobile audio thread.
                const liteTone = ctx.createBiquadFilter();
                liteTone.type = 'lowpass';
                liteTone.frequency.value = 7500;
                liteTone.Q.value = 0.5;
                tape.connect(liteTone).connect(out);
                room = null;
                tickBuffer = makeTick();
                return true;
            }
            const shaper = ctx.createWaveShaper();
            shaper.curve = makeCurve(1.6);
            shaper.oversample = '2x';
            const wobble = ctx.createDelay(0.05);
            wobble.delayTime.value = 0.012;
            const wow = ctx.createOscillator();
            wow.frequency.value = 0.55;
            const wowDepth = ctx.createGain();
            wowDepth.gain.value = 0.0009;
            const flutter = ctx.createOscillator();
            flutter.frequency.value = 7.5;
            const flutterDepth = ctx.createGain();
            flutterDepth.gain.value = 0.00012;
            wow.connect(wowDepth).connect(wobble.delayTime);
            flutter.connect(flutterDepth).connect(wobble.delayTime);
            wow.start();
            flutter.start();
            const tone = ctx.createBiquadFilter();
            tone.type = 'lowpass';
            tone.frequency.value = 8500;
            tone.Q.value = 0.5;
            tape.connect(shaper).connect(wobble).connect(tone).connect(out);

            // Room send.
            room = ctx.createGain();
            room.gain.value = 0.22;
            const verb = ctx.createConvolver();
            verb.buffer = makeImpulse(1.1, 3.2);
            const verbTone = ctx.createBiquadFilter();
            verbTone.type = 'lowpass';
            verbTone.frequency.value = 3200;
            room.connect(verb).connect(verbTone).connect(out);
            tone.connect(room);

            return true;
        };

        const now = () => ctx.currentTime;
        const panFromX = (x) => (typeof x === 'number' ? Math.max(-0.8, Math.min(0.8, (x / window.innerWidth) * 2 - 1)) * 0.7 : 0);

        // A voice output: gain -> panner -> tape bus.
        const voice = (pan = 0, dest = tape) => {
            const gain = ctx.createGain();
            gain.gain.value = 0;
            if (!lite && ctx.createStereoPanner) {
                const panner = ctx.createStereoPanner();
                panner.pan.value = pan;
                gain.connect(panner).connect(dest);
            } else {
                gain.connect(dest);
            }
            return gain;
        };

        const env = (param, { at = now(), peak, attack, release, hold = 0 }) => {
            param.cancelScheduledValues(at);
            param.setValueAtTime(0.0001, at);
            param.exponentialRampToValueAtTime(peak, at + attack);
            if (hold) param.setValueAtTime(peak, at + attack + hold);
            param.exponentialRampToValueAtTime(0.0001, at + attack + hold + release);
            return at + attack + hold + release + 0.05;
        };

        // Filtered noise burst. Optional sweep of the filter frequency.
        const burst = ({ at = now(), freq, to, q = 1, type = 'bandpass', peak, attack, release, hold = 0, pan = 0 }) => {
            const src = ctx.createBufferSource();
            src.buffer = noise;
            const filter = ctx.createBiquadFilter();
            filter.type = type;
            filter.frequency.setValueAtTime(freq, at);
            if (to) filter.frequency.exponentialRampToValueAtTime(to, at + attack + hold + release);
            filter.Q.value = q;
            const g = voice(pan);
            src.connect(filter).connect(g);
            const end = env(g.gain, { at, peak, attack, release, hold });
            src.start(at, Math.random() * 2);
            src.stop(end);
        };

        // Oscillator with optional pitch glide.
        const osc = ({ at = now(), freq, to, type = 'sine', peak, attack, release, hold = 0, pan = 0, detune = 0 }) => {
            const o = ctx.createOscillator();
            o.type = type;
            o.frequency.setValueAtTime(freq, at);
            if (to) o.frequency.exponentialRampToValueAtTime(to, at + attack + hold + release);
            o.detune.value = detune;
            const g = voice(pan);
            o.connect(g);
            const end = env(g.gain, { at, peak, attack, release, hold });
            o.start(at);
            o.stop(end);
        };

        /* ---------- sound library ---------- */

        const sounds = {
            // Deck button: press click, a little body, and a softer release click.
            press: ({ pan = 0 } = {}) => {
                const t = now();
                burst({ at: t, freq: 3200, q: 1.5, peak: 0.16, attack: 0.001, release: 0.025, pan });
                osc({ at: t, freq: 140, to: 60, peak: 0.12, attack: 0.002, release: 0.06, pan });
                osc({ at: t, freq: 2100, peak: 0.012, attack: 0.001, release: 0.04, pan, type: 'triangle' });
                burst({ at: t + 0.075, freq: 4200, q: 2, peak: 0.06, attack: 0.001, release: 0.02, pan });
            },

            // Hover: the tape head brushing the tape. No musical pitch, just a short
            // filtered scrub whose brightness shifts a little with `step`.
            hover: ({ step = 0, pan = 0, peak = 0.06 } = {}) => {
                const t = now();
                const i = Math.max(0, Math.min(HOVER_STEPS - 1, step));
                const freq = 1400 * Math.pow(2, i / HOVER_STEPS);
                burst({ at: t, freq, to: freq * 1.5, q: 5, peak, attack: 0.003, release: 0.05, pan });
                burst({ at: t, freq: 5200, q: 1, type: 'highpass', peak: peak * 0.25, attack: 0.001, release: 0.015, pan });
            },

            // Sound on: the CRT powering up (degauss thump + a swell of hum).
            powerOn: ({ pan = 0 } = {}) => {
                const t = now();
                burst({ at: t, freq: 2800, q: 1.5, peak: 0.12, attack: 0.001, release: 0.025, pan });
                osc({ at: t + 0.02, freq: 38, to: 62, type: 'triangle', peak: 0.16, attack: 0.03, release: 0.45 });
                burst({ at: t + 0.02, freq: 180, q: 0.7, type: 'lowpass', peak: 0.12, attack: 0.02, release: 0.35 });
                burst({ at: t + 0.08, freq: 6000, to: 9000, q: 0.5, type: 'highpass', peak: 0.02, attack: 0.15, release: 0.3 });
            },

            // Accordion open: tape slides in, motor spins up, mechanism locks.
            insert: ({ pan = 0 } = {}) => {
                const t = now();
                burst({ at: t, freq: 900, to: 2400, q: 0.8, peak: 0.08, attack: 0.04, release: 0.2, pan });
                osc({ at: t + 0.05, freq: 55, to: 130, type: 'sawtooth', peak: 0.035, attack: 0.05, hold: 0.12, release: 0.15, pan });
                burst({ at: t + 0.26, freq: 1800, q: 2.5, peak: 0.18, attack: 0.001, release: 0.04, pan });
                osc({ at: t + 0.26, freq: 110, to: 45, peak: 0.16, attack: 0.002, release: 0.12, pan });
            },

            // Accordion close: motor winds down, softer clunk.
            remove: ({ pan = 0 } = {}) => {
                const t = now();
                osc({ at: t, freq: 130, to: 45, type: 'sawtooth', peak: 0.03, attack: 0.02, release: 0.22, pan });
                burst({ at: t + 0.12, freq: 1500, q: 2, peak: 0.1, attack: 0.001, release: 0.04, pan });
                osc({ at: t + 0.12, freq: 90, to: 40, peak: 0.1, attack: 0.002, release: 0.1, pan });
            },

            // Gallery open: eject spring and a little rising whirr.
            eject: () => {
                const t = now();
                burst({ at: t, freq: 2600, q: 3, peak: 0.16, attack: 0.001, release: 0.03 });
                osc({ at: t, freq: 420, to: 180, peak: 0.05, attack: 0.002, release: 0.22, type: 'triangle' });
                osc({ at: t + 0.01, freq: 900, to: 600, peak: 0.015, attack: 0.002, release: 0.15 });
                burst({ at: t + 0.05, freq: 600, to: 3000, q: 0.7, peak: 0.05, attack: 0.08, release: 0.2 });
            },

            // Gallery close: the tape drops back into the deck.
            close: () => {
                const t = now();
                burst({ at: t, freq: 3000, to: 700, q: 0.7, peak: 0.05, attack: 0.03, release: 0.12 });
                burst({ at: t + 0.12, freq: 1400, q: 2, peak: 0.16, attack: 0.001, release: 0.05 });
                osc({ at: t + 0.12, freq: 100, to: 42, peak: 0.14, attack: 0.002, release: 0.12 });
            },

            // Cassette flip: whoosh plus two plastic clacks.
            flip: ({ pan = 0 } = {}) => {
                const t = now();
                burst({ at: t, freq: 400, to: 2200, q: 0.9, peak: 0.07, attack: 0.08, release: 0.18, pan });
                burst({ at: t + 0.16, freq: 1300, q: 4, peak: 0.12, attack: 0.001, release: 0.03, pan });
                burst({ at: t + 0.22, freq: 2400, q: 4, peak: 0.09, attack: 0.001, release: 0.03, pan });
                osc({ at: t + 0.16, freq: 300, to: 150, peak: 0.03, attack: 0.002, release: 0.06, pan, type: 'triangle' });
            },

            // Typewriter keystroke on the hero headline.
            key: ({ back = false } = {}) => {
                const t = now();
                const pitch = back ? 2200 : 3400 + Math.random() * 1600;
                burst({ at: t, freq: pitch, q: 3, peak: back ? 0.03 : 0.05, attack: 0.001, release: 0.018, pan: (Math.random() - 0.5) * 0.3 });
                if (!back) osc({ at: t, freq: 180 + Math.random() * 40, peak: 0.018, attack: 0.001, release: 0.03 });
            },

            // Channel change: static burst, then the OSD double beep for that channel.
            static: ({ view } = {}) => {
                const t = now();
                // Kept low and short on purpose: a hint of static, not a wall of it.
                burst({ at: t, freq: 1800, q: 0.6, peak: 0.035, attack: 0.02, hold: 0.06, release: 0.18 });
                burst({ at: t, freq: 300, q: 0.5, peak: 0.015, attack: 0.01, hold: 0.05, release: 0.15, type: 'lowpass' });
                osc({ at: t, freq: 150, to: 40, type: 'triangle', peak: 0.12, attack: 0.004, release: 0.2 });
                const beep = CHANNEL_TONES[view] || 880;
                osc({ at: t + 0.42, freq: beep, type: 'square', peak: 0.025, attack: 0.002, hold: 0.05, release: 0.02 });
                osc({ at: t + 0.52, freq: beep * 1.5, type: 'square', peak: 0.025, attack: 0.002, hold: 0.07, release: 0.03 });
            },

            // OSD confirm beep (modal).
            beep: ({ up = true } = {}) => {
                const t = now();
                osc({ at: t, freq: up ? 1047 : 784, type: 'square', peak: 0.025, attack: 0.002, hold: 0.05, release: 0.02 });
                osc({ at: t + 0.08, freq: up ? 1568 : 523, type: 'square', peak: 0.025, attack: 0.002, hold: 0.06, release: 0.03 });
            },

            // Expand project grid (View More): rising mechanical clack & latch.
            viewMore: ({ pan = 0 } = {}) => {
                const t = now();
                burst({ at: t, freq: 2400, q: 2, peak: 0.12, attack: 0.001, release: 0.025, pan });
                burst({ at: t + 0.035, freq: 3600, q: 2.5, peak: 0.14, attack: 0.001, release: 0.03, pan });
                osc({ at: t, freq: 220, to: 440, type: 'triangle', peak: 0.04, attack: 0.002, release: 0.08, pan });
            },

            // Collapse project grid (View Less): descending mechanical latch.
            viewLess: ({ pan = 0 } = {}) => {
                const t = now();
                burst({ at: t, freq: 3200, q: 2.5, peak: 0.12, attack: 0.001, release: 0.025, pan });
                burst({ at: t + 0.035, freq: 1800, q: 2, peak: 0.10, attack: 0.001, release: 0.03, pan });
                osc({ at: t, freq: 380, to: 160, type: 'triangle', peak: 0.035, attack: 0.002, release: 0.08, pan });
            },

            // Switch client channel: crisp retro rotary dial detent & relay clunk.
            channelSwitch: ({ pan = 0, dir = 1 } = {}) => {
                const t = now();
                burst({ at: t, freq: dir >= 0 ? 2800 : 2200, q: 3, peak: 0.13, attack: 0.001, release: 0.02, pan });
                burst({ at: t + 0.025, freq: dir >= 0 ? 1600 : 1200, q: 2, peak: 0.09, attack: 0.001, release: 0.035, pan });
                osc({ at: t, freq: dir >= 0 ? 180 : 140, to: 65, type: 'triangle', peak: 0.08, attack: 0.002, release: 0.05, pan });
                burst({ at: t + 0.01, freq: 4500, q: 1, type: 'highpass', peak: 0.025, attack: 0.001, release: 0.015, pan });
            }
        };

        // A video with its own audio is playing: the deck steps aside until it stops.
        let videoHold = false;
        const audible = () => enabled && !videoHold;

        const play = (name, opts) => {
            if (!audible() || !ctx || !sounds[name]) return;
            sounds[name](opts);
        };

        const typeKey = (back = false, interval = back ? 30 : 18) => {
            if (!audible() || !ctx || document.hidden) return;
            const t = performance.now();
            if (t - lastKey < interval) return;
            lastKey = t;
            play('key', { back });
        };

        // Fade the whole deck (ambient, scroll whirr, everything) in or out.
        const applyLevel = (fade = 0.4) => {
            if (!ctx) return;
            const on = audible();
            if (on) ctx.resume();
            const t = now();
            out.gain.cancelScheduledValues(t);
            out.gain.setValueAtTime(out.gain.value, t);
            out.gain.linearRampToValueAtTime(on ? 1 : 0, t + fade);
            if (!on) setTimeout(() => { if (!audible()) ctx.suspend(); }, fade * 1000 + 100);
        };

        /* ---------- continuous voices ---------- */

        // Tape hiss + mains hum: the deck idling (disabled to eliminate background static/hiss).
        const startAmbient = () => {
            ambient = true;
        };

        // Scrolling sound disabled across the site.
        const startScrollVoice = () => {};
        const counterTick = () => {};
        let reelY = 0;
        let lastTickY = 0;
        let lastY = 0;

        /* ---------- toggle ---------- */

        const toggles = [...document.querySelectorAll('.sound-toggle')];
        const syncToggles = () => {
            toggles.forEach((btn) => {
                btn.setAttribute('aria-pressed', String(enabled));
                btn.classList.toggle('is-on', enabled);
                const label = btn.querySelector('.sound-label');
                if (label) label.textContent = enabled ? 'SOUND: ON' : 'SOUND: OFF';
            });
        };

        // Remember an explicit "off"; everyone else starts with sound on.
        const PREF_KEY = 'vhs-sound';
        try { enabled = localStorage.getItem(PREF_KEY) !== 'off'; } catch (_) { enabled = true; }
        const savePref = () => {
            try { localStorage.setItem(PREF_KEY, enabled ? 'on' : 'off'); } catch (_) {}
        };

        const setEnabled = (on, event, { quiet = false } = {}) => {
            if (on && !ensureContext()) return;
            enabled = on;
            if (ctx) {
                if (on) {
                    startAmbient();
                    startScrollVoice();
                    // Start from where things are now, so turning sound on isn't a jump.
                    lastY = window.scrollY;
                    lastTickY = reelY;
                }
                applyLevel(0.4);
            }
            syncToggles();
            if (audible() && !quiet) {
                sounds.powerOn({ pan: panFromX(event?.clientX) });
            }
        };

        // Track every <video>/<audio> that is actually making sound. Muted hover
        // previews don't count; the gallery reel with its audio does.
        const playingMedia = new Set();
        const isAudible = (el) => el.isConnected && !el.paused && !el.ended && !el.muted && el.volume > 0;
        const onMediaEvent = (event) => {
            const el = event.target;
            if (!(el instanceof HTMLMediaElement)) return;
            if (isAudible(el)) playingMedia.add(el);
            else playingMedia.delete(el);
            playingMedia.forEach((m) => { if (!isAudible(m)) playingMedia.delete(m); });

            const hold = playingMedia.size > 0;
            if (hold === videoHold) return;
            videoHold = hold;
            // Duck out quickly when the video starts, come back gently after it stops.
            applyLevel(hold ? 0.25 : 0.9);
        };
        ['play', 'playing', 'pause', 'ended', 'volumechange', 'emptied'].forEach((type) => {
            document.addEventListener(type, onMediaEvent, true); // media events don't bubble
        });

        toggles.forEach((btn) => {
            btn.addEventListener('click', (event) => {
                event.stopPropagation();
                setEnabled(!enabled, event);
                savePref();
            });
        });

        // Browsers only let audio start from a gesture, so the deck switches on with the
        // visitor's first tap, click or key anywhere on the site. touchend/pointerup are
        // the events iOS and Android accept; pointerdown covers mouse and keyboard users.
        const unlockEvents = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'];
        const unlock = () => {
            if (ctx && ctx.state === 'running') {
                unlockEvents.forEach((type) => document.removeEventListener(type, unlock, true));
                return;
            }
            if (!enabled) return;
            setEnabled(true, null, { quiet: true });
            if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {});
        };
        unlockEvents.forEach((type) => document.addEventListener(type, unlock, { capture: true, passive: true }));

        /* ---------- interface hooks ---------- */

        // Clicks: elements with their own sound are left to the observers below.
        const pressSelector = 'a, button, .tv-ctrl-btn, .tv-top-menu';
        const ownSound = '.sound-toggle, .service-header, .hero-card, .visual-item, .modal-btn, #lightbox, .view-more-btn, .tv-dial-item, .tv-dial-chevron';
        document.addEventListener('click', (event) => {
            if (!enabled) return;
            if (event.target.closest(ownSound)) return;
            if (event.target.closest(pressSelector)) play('press', { pan: panFromX(event.clientX) });
        });

        // Hover scrub: brightness shifts across the page; pan follows the pointer.
        const stepFor = (el, x) => {
            if (el.matches('.nav-links a')) {
                return 5 + [...el.closest('.nav-links').querySelectorAll('a')].indexOf(el);
            }
            if (el.matches('.service-header')) {
                const items = [...document.querySelectorAll('.service-header')];
                return items.indexOf(el);
            }
            if (el.matches('.visual-item')) {
                const grid = el.parentElement;
                const index = [...grid.children].indexOf(el);
                return 3 + (index % 8);
            }
            return Math.round((x / window.innerWidth) * (HOVER_STEPS - 1));
        };

        if (finePointer) {
            const hoverSelector = '.visual-item, .nav-links a, .service-header, .btn-view-projects, .tv-dial-item, .sound-toggle';
            document.addEventListener('mouseover', (event) => {
                if (!enabled) return;
                const el = event.target.closest(hoverSelector);
                if (!el) return;
                const from = event.relatedTarget;
                if (from && el.contains(from)) return;
                const t = performance.now();
                if (t - lastHover < 55) return;
                lastHover = t;
                play('hover', { step: stepFor(el, event.clientX), pan: panFromX(event.clientX) });
            });
        }

        // State changes the rest of the site already makes; listen instead of patching main.js.
        const watchClass = (el, className, onChange) => {
            if (!el) return;
            let was = el.classList.contains(className);
            new MutationObserver(() => {
                const is = el.classList.contains(className);
                if (is !== was) {
                    was = is;
                    onChange(is);
                }
            }).observe(el, { attributes: true, attributeFilter: ['class'] });
        };

        const centreOf = (el) => {
            const r = el.getBoundingClientRect();
            return panFromX(r.left + r.width / 2);
        };

        const hookInterface = () => {
            document.querySelectorAll('.service-item').forEach((item) => {
                watchClass(item, 'expanded', (open) => play(open ? 'insert' : 'remove', { pan: centreOf(item) * 0.5 }));
            });
            watchClass(document.getElementById('lightbox'), 'active', (open) => play(open ? 'eject' : 'close'));
            document.querySelectorAll('.hero-card').forEach((card) => {
                watchClass(card, 'is-flipped', () => play('flip', { pan: centreOf(card) }));
            });

            const modal = document.getElementById('accentModal');
            if (modal) {
                let wasHidden = modal.hidden;
                new MutationObserver(() => {
                    if (modal.hidden !== wasHidden) {
                        wasHidden = modal.hidden;
                        play('beep', { up: !modal.hidden });
                    }
                }).observe(modal, { attributes: true, attributeFilter: ['hidden'] });
                modal.querySelectorAll('.modal-btn').forEach((btn) => {
                    btn.addEventListener('mouseenter', () => play('hover', { step: 7 }));
                });
            }

            // Typewriter headline: one keystroke per character typed or deleted.
            const title = document.querySelector('.display-title');
            if (title) {
                const textLength = () => [...title.querySelectorAll('.type-visible')]
                    .reduce((sum, span) => sum + span.textContent.length, 0);
                let length = textLength();
                new MutationObserver(() => {
                    const next = textLength();
                    if (next === length) return;
                    const back = next < length;
                    length = next;
                    if (!title.closest('.page-view')?.classList.contains('is-visible')) return;
                    typeKey(back);
                }).observe(title, { childList: true, characterData: true, subtree: true });
            }
        };

        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hookInterface);
        else hookInterface();

        // Silence the deck while the tab is hidden.
        document.addEventListener('visibilitychange', () => {
            if (!ctx || !audible()) return;
            if (document.hidden) ctx.suspend();
            else ctx.resume();
        });

        syncToggles();
        return { play, typeKey, isOn: () => enabled, isHeld: () => videoHold };
    })();
    window.vhsSound = sound;

    /* ----------------------------------------------------------------------
       Lenis smooth scroll
       ---------------------------------------------------------------------- */
    let lenis = null;
    if (!reducedMotion && typeof window.Lenis === 'function') {
        lenis = new Lenis({
            lerp: 0.1,
            wheelMultiplier: 1,
            allowNestedScroll: true,
            autoRaf: !hasGsap,
            // Dialogs and full-screen stages keep their own native scrolling.
            prevent: (node) => !!node.closest?.('#lightbox, #mobile-menu, #accentModal, #clients, #about, [data-lenis-prevent]')
        });

        if (hasGsap) {
            gsap.ticker.add((time) => lenis.raf(time * 1000));
            gsap.ticker.lagSmoothing(0);
        }

        // Anything that locks the page (lightbox, menu, modal, fixed views) stops Lenis.
        const syncLock = () => {
            const cls = document.body.classList;
            const locked = cls.contains('no-scroll') || cls.contains('modal-open') || cls.contains('view-fixed');
            if (locked && !lenis.isStopped) lenis.stop();
            else if (!locked && lenis.isStopped) lenis.start();
        };
        new MutationObserver(syncLock).observe(document.body, { attributes: true, attributeFilter: ['class'] });
        syncLock();

        window.addEventListener('viewchange', () => {
            lenis.scrollTo(0, { immediate: true, force: true });
        });

        window.lenis = lenis;
    }

    /* ----------------------------------------------------------------------
       Heading reveals
       ---------------------------------------------------------------------- */
    const SCRAMBLE_CHARS = '01#%&*+/<>=_[]';
    const splits = new WeakMap();

    const getSplit = (el) => {
        if (splits.has(el)) return splits.get(el);
        const split = SplitText.create(el, {
            type: 'words,chars',
            mask: 'words',
            wordsClass: 'split-word',
            charsClass: 'split-char'
        });
        splits.set(el, split);
        return split;
    };

    // Big titles: characters rise out of a mask, one after another.
    const riseIn = (elements, baseDelay = 0) => {
        if (!window.SplitText) return;
        elements.forEach((el, index) => {
            const split = getSplit(el);
            gsap.killTweensOf(split.chars);
            gsap.fromTo(split.chars,
                { yPercent: 115, opacity: 0 },
                {
                    yPercent: 0,
                    opacity: 1,
                    duration: 0.9,
                    ease: 'expo.out',
                    stagger: 0.014,
                    delay: baseDelay + index * 0.07,
                    clearProps: 'transform,opacity'
                });
        });
    };

    // Mono labels: decode like an on-screen display tuning in.
    const scrambleIn = (elements, baseDelay = 0, withSound = false) => {
        if (!window.ScrambleTextPlugin) return;
        elements.forEach((el, index) => {
            if (!el.dataset.originalText) {
                el.dataset.originalText = el.textContent.trim();
                if (!el.hasAttribute('aria-label')) el.setAttribute('aria-label', el.dataset.originalText);
            }
            gsap.killTweensOf(el);
            let previousText = el.textContent;
            gsap.to(el, {
                duration: 0.9,
                delay: baseDelay + index * 0.08,
                scrambleText: {
                    text: el.dataset.originalText,
                    chars: SCRAMBLE_CHARS,
                    revealDelay: 0.2,
                    speed: 0.6
                },
                onUpdate: () => {
                    if (!withSound || previousText === el.textContent) return;
                    previousText = el.textContent;
                    if (!el.closest('.page-view')?.classList.contains('is-visible')) return;
                    const rect = el.getBoundingClientRect();
                    if (rect.bottom > 0 && rect.top < window.innerHeight) sound.typeKey(false, 100);
                }
            });
        });
    };

    const revealView = (view) => {
        if (reducedMotion || !hasGsap) return;
        const delay = state.transitioning ? 0.25 : 0.05;
        if (view === 'services') {
            const section = document.getElementById('services');
            if (!section) return;
            scrambleIn([...section.querySelectorAll('.section-label')], delay);
            riseIn([...section.querySelectorAll('.service-title')], delay + 0.1);
        } else if (view === 'about') {
            const section = document.getElementById('about');
            if (!section) return;
            scrambleIn([...section.querySelectorAll('.bio-kicker, .vhs-about-line')], delay, true);
        }
    };

    /* ----------------------------------------------------------------------
       VHS channel-change transition
       ---------------------------------------------------------------------- */
    const CHANNELS = {
        home: ['01', 'HOME'],
        services: ['02', 'SELECTED WORKS'],
        clients: ['03', 'CLIENTS'],
        about: ['04', 'INFO']
    };

    const switcher = (() => {
        const root = document.createElement('div');
        root.className = 'vhs-switch';
        root.setAttribute('aria-hidden', 'true');
        root.innerHTML = `
            <canvas class="vhs-switch-noise"></canvas>
            <div class="vhs-switch-bar"></div>
            <div class="vhs-switch-osd mono"><span class="vhs-switch-ch"></span><span class="vhs-switch-name"></span></div>`;
        document.body.append(root);

        const canvas = root.querySelector('canvas');
        const ctx = canvas.getContext('2d');
        const osd = root.querySelector('.vhs-switch-osd');
        const chEl = root.querySelector('.vhs-switch-ch');
        const nameEl = root.querySelector('.vhs-switch-name');
        let image = null;
        let osdTimer = null;

        // Low-resolution noise, scaled up with pixelated rendering: cheap and authentic.
        const resize = () => {
            const w = Math.max(120, Math.round(window.innerWidth / 4));
            const h = Math.max(80, Math.round(window.innerHeight / 4));
            if (canvas.width === w && canvas.height === h) return;
            canvas.width = w;
            canvas.height = h;
            image = ctx.createImageData(w, h);
        };

        const drawNoise = (roll) => {
            const { width: w, height: h } = canvas;
            const data = image.data;
            const bandStart = Math.floor(((roll % 1) + 1) % 1 * h);
            const bandHeight = Math.floor(h * 0.18);
            for (let y = 0; y < h; y++) {
                // A darker rolling band and slightly brighter rows, like a detuned set.
                const inBand = ((y - bandStart + h) % h) < bandHeight;
                const rowGain = inBand ? 0.35 : (0.75 + Math.random() * 0.25);
                for (let x = 0; x < w; x++) {
                    const v = Math.random() * 255 * rowGain;
                    const i = (y * w + x) * 4;
                    data[i] = v;
                    data[i + 1] = v;
                    data[i + 2] = v;
                    data[i + 3] = 255;
                }
            }
            ctx.putImageData(image, 0, 0);
        };

        const showOsd = (view) => {
            const [ch, name] = CHANNELS[view] || CHANNELS.home;
            chEl.textContent = `CH ${ch}`;
            nameEl.textContent = name;
            clearTimeout(osdTimer);
            osd.classList.add('is-visible');
            osdTimer = setTimeout(() => osd.classList.remove('is-visible'), 1500);
        };

        const run = ({ targetView, onMidpoint }) => new Promise((resolve) => {
            resize();
            sound.play('static', { view: targetView });
            state.transitioning = true;
            root.classList.add('is-active');
            document.body.classList.add('vhs-switching');

            const IN = 170;      // static ramps up over the old page
            const HOLD = 230;    // full static, page swaps underneath
            const OUT = 260;     // static rolls away off the new page
            const total = IN + HOLD + OUT;
            const start = performance.now();
            let swapped = false;

            const frame = (now) => {
                const t = now - start;
                let opacity;
                if (t < IN) opacity = t / IN;
                else if (t < IN + HOLD) opacity = 1;
                else opacity = Math.max(0, 1 - (t - IN - HOLD) / OUT);

                if (!swapped && t >= IN) {
                    swapped = true;
                    if (typeof onMidpoint === 'function') onMidpoint();
                    showOsd(targetView);
                    document.body.classList.remove('vhs-switching');
                }

                canvas.style.opacity = String(opacity);
                // Vertical hold slips as the picture locks back in.
                const slip = t > IN + HOLD ? (t - IN - HOLD) / OUT : 0;
                canvas.style.transform = `translateY(${(slip * slip * 35).toFixed(2)}%)`;
                drawNoise(t / 380);

                if (t < total) {
                    requestAnimationFrame(frame);
                    return;
                }

                root.classList.remove('is-active');
                canvas.style.opacity = '0';
                canvas.style.transform = '';
                setTimeout(() => { state.transitioning = false; }, 400);
                resolve();
            };

            requestAnimationFrame(frame);
        });

        window.addEventListener('resize', () => { if (root.classList.contains('is-active')) resize(); });
        return { run };
    })();

    if (!reducedMotion) {
        window.vhsTransition = (options) => switcher.run(options);
    }

    /* ----------------------------------------------------------------------
       WebGL VHS shader on project thumbnails
       One WebGL context renders every tile and copies the result into a small
       2D canvas inside each thumbnail, so layout, borders, clipping and
       accordions keep working as plain DOM.
       ---------------------------------------------------------------------- */
    const tiles = (() => {
        if (reducedMotion || !finePointer) return null;

        const glCanvas = document.createElement('canvas');
        const gl = glCanvas.getContext('webgl', { alpha: false, antialias: false, premultipliedAlpha: false });
        if (!gl) return null;

        const VERT = `
            attribute vec2 aPos;
            varying vec2 vUv;
            void main() {
                vUv = aPos * 0.5 + 0.5;
                gl_Position = vec4(aPos, 0.0, 1.0);
            }`;

        const FRAG = `
            precision mediump float;
            varying vec2 vUv;
            uniform sampler2D uTex;
            uniform vec2 uSize;
            uniform vec2 uImg;
            uniform vec2 uMouse;
            uniform float uHover;
            uniform float uVel;
            uniform float uTime;

            float rand(vec2 co) {
                return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
            }

            // object-fit: cover
            vec2 cover(vec2 uv) {
                float rs = uSize.x / uSize.y;
                float ri = uImg.x / uImg.y;
                vec2 s = rs > ri ? vec2(1.0, ri / rs) : vec2(rs / ri, 1.0);
                return (uv - 0.5) * s + 0.5;
            }

            void main() {
                float h = uHover;
                float v = uVel;
                vec2 uv = vUv;

                // Gentle zoom on hover (replaces the old CSS scale).
                uv = (uv - 0.5) / (1.0 + 0.05 * h) + 0.5;

                // Lens bulge that follows the pointer.
                vec2 d = uv - uMouse;
                float fall = smoothstep(0.5, 0.0, length(d));
                uv -= d * fall * 0.14 * h;

                // Scroll velocity bends the picture like a stretched tape.
                uv.y += v * 0.05 * sin(vUv.x * 3.14159);

                // Tracking: per-line jitter and a rolling tear band.
                float line = floor(vUv.y * uSize.y / 3.0);
                float jitter = rand(vec2(line, floor(uTime * 24.0))) - 0.5;
                float bandY = fract(-uTime * 0.22);
                float band = smoothstep(0.045, 0.0, abs(vUv.y - bandY));
                uv.x += jitter * 0.005 * h + band * 0.025 * h + jitter * abs(v) * 0.02;

                // Chromatic split, stronger while scrolling fast.
                float shift = 0.005 * h + abs(v) * 0.025;
                float r = texture2D(uTex, cover(uv + vec2(shift, 0.0))).r;
                float g = texture2D(uTex, cover(uv)).g;
                float b = texture2D(uTex, cover(uv - vec2(shift, 0.0))).b;
                vec3 col = vec3(r, g, b);

                // Scanlines and grain fade in with the hover.
                float scan = 0.5 + 0.5 * sin(vUv.y * uSize.y * 1.6);
                col *= 1.0 - 0.16 * h * scan;
                col += band * 0.08 * h;
                col += (rand(vUv * uSize + uTime) - 0.5) * 0.07 * (h + abs(v));

                gl_FragColor = vec4(col, 1.0);
            }`;

        const compile = (type, source) => {
            const shader = gl.createShader(type);
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                console.warn('[effects] shader:', gl.getShaderInfoLog(shader));
                return null;
            }
            return shader;
        };

        const vs = compile(gl.VERTEX_SHADER, VERT);
        const fs = compile(gl.FRAGMENT_SHADER, FRAG);
        if (!vs || !fs) return null;
        const program = gl.createProgram();
        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
        gl.useProgram(program);

        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        const aPos = gl.getAttribLocation(program, 'aPos');
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

        const u = {};
        ['uTex', 'uSize', 'uImg', 'uMouse', 'uHover', 'uVel', 'uTime'].forEach((name) => {
            u[name] = gl.getUniformLocation(program, name);
        });
        gl.uniform1i(u.uTex, 0);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

        const DPR = Math.min(window.devicePixelRatio || 1, 1.5);
        const registry = new Map();
        let velocity = 0;
        let lastScroll = window.scrollY;
        let lastTime = performance.now();
        let rafId = null;

        const ensureGlSize = (w, h) => {
            if (glCanvas.width < w || glCanvas.height < h) {
                glCanvas.width = Math.max(glCanvas.width, w);
                glCanvas.height = Math.max(glCanvas.height, h);
            }
        };

        const createTexture = (img) => {
            const tex = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            try {
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
            } catch (err) {
                gl.deleteTexture(tex);
                return null;
            }
            return tex;
        };

        const draw = (tile, time) => {
            const { w, h } = tile;
            if (!w || !h || !tile.tex) return;
            ensureGlSize(w, h);
            gl.viewport(0, 0, w, h);
            gl.bindTexture(gl.TEXTURE_2D, tile.tex);
            gl.uniform2f(u.uSize, w, h);
            gl.uniform2f(u.uImg, tile.img.naturalWidth, tile.img.naturalHeight);
            gl.uniform2f(u.uMouse, tile.mx, tile.my);
            gl.uniform1f(u.uHover, tile.hover);
            gl.uniform1f(u.uVel, velocity);
            gl.uniform1f(u.uTime, time);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            // WebGL draws bottom-up; the region we used sits at the bottom of the canvas.
            tile.ctx.drawImage(glCanvas, 0, glCanvas.height - h, w, h, 0, 0, w, h);
            // Only hide the real <img> once its WebGL copy is actually on screen.
            if (!tile.drawn) {
                tile.drawn = true;
                tile.wrapper.classList.add('gl-on');
            }
        };

        const loop = (now) => {
            rafId = null;
            const dt = Math.max(1, now - lastTime);
            lastTime = now;
            const scrollY = window.scrollY;
            const rawVel = ((scrollY - lastScroll) / dt) * 16.7 / 90; // ~1 at a fast flick
            lastScroll = scrollY;
            velocity += (Math.max(-1, Math.min(1, rawVel)) - velocity) * 0.12;
            if (Math.abs(velocity) < 0.001) velocity = 0;

            let keepGoing = velocity !== 0;
            const time = now / 1000;

            registry.forEach((tile) => {
                if (!tile.ready || !tile.visible) return;
                tile.hover += (tile.hoverTarget - tile.hover) * 0.09;
                if (Math.abs(tile.hoverTarget - tile.hover) < 0.002) tile.hover = tile.hoverTarget;
                const animating = tile.hover > 0 || velocity !== 0;
                if (animating || tile.dirty) {
                    draw(tile, time);
                    tile.dirty = animating; // one clean frame after settling
                }
                if (animating || tile.dirty) keepGoing = true;
            });

            if (keepGoing) rafId = requestAnimationFrame(loop);
        };

        const kick = () => {
            if (rafId === null) {
                lastTime = performance.now();
                lastScroll = window.scrollY;
                rafId = requestAnimationFrame(loop);
            }
        };

        const io = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                const tile = registry.get(entry.target);
                if (!tile) return;
                tile.visible = entry.isIntersecting;
                if (tile.visible) {
                    tile.dirty = true;
                    kick();
                }
            });
        }, { rootMargin: '100px' });

        const ro = new ResizeObserver((entries) => {
            entries.forEach((entry) => {
                const tile = registry.get(entry.target);
                if (!tile) return;
                const w = Math.round(entry.contentRect.width * DPR);
                const h = Math.round(entry.contentRect.height * DPR);
                if (!w || !h || (w === tile.w && h === tile.h)) return;
                tile.w = w;
                tile.h = h;
                tile.canvas.width = w; // clears the canvas
                tile.canvas.height = h;
                tile.drawn = false;
                tile.wrapper.classList.remove('gl-on');
                tile.dirty = true;
                kick();
            });
        });

        const register = (wrapper) => {
            if (registry.has(wrapper)) return;
            const img = wrapper.querySelector('img');
            if (!img) return; // video reels keep their native preview

            const canvas = document.createElement('canvas');
            canvas.className = 'vhs-tile';
            canvas.setAttribute('aria-hidden', 'true');
            img.after(canvas);

            const tile = {
                wrapper,
                img,
                canvas,
                ctx: canvas.getContext('2d'),
                tex: null,
                ready: false,
                visible: false,
                dirty: true,
                drawn: false,
                hover: 0,
                hoverTarget: 0,
                mx: 0.5,
                my: 0.5,
                w: 0,
                h: 0
            };
            registry.set(wrapper, tile);

            const onLoad = () => {
                if (tile.ready) return;
                tile.tex = createTexture(img);
                if (!tile.tex) return;
                tile.ready = true;
                tile.dirty = true;
                kick();
            };
            if (img.complete && img.naturalWidth) onLoad();
            else img.addEventListener('load', onLoad, { once: true });

            const item = wrapper.closest('.visual-item') || wrapper;
            const setHover = (on) => {
                tile.hoverTarget = on ? 1 : 0;
                kick();
            };
            item.addEventListener('mouseenter', () => setHover(true));
            item.addEventListener('mouseleave', () => setHover(false));
            item.addEventListener('focusin', () => setHover(true));
            item.addEventListener('focusout', () => setHover(false));
            wrapper.addEventListener('mousemove', (event) => {
                const rect = wrapper.getBoundingClientRect();
                tile.mx = (event.clientX - rect.left) / rect.width;
                tile.my = 1 - (event.clientY - rect.top) / rect.height;
            });

            io.observe(wrapper);
            ro.observe(wrapper);
        };

        const scan = () => {
            document.querySelectorAll('.visual-img-wrapper').forEach(register);
        };

        window.addEventListener('scroll', kick, { passive: true });

        // WebGL can lose its context (GPU reset, tab in background for long).
        glCanvas.addEventListener('webglcontextlost', (event) => {
            event.preventDefault();
            registry.forEach((tile) => {
                tile.ready = false;
                tile.drawn = false;
                tile.wrapper.classList.remove('gl-on');
            });
        });

        return { scan };
    })();

    /* ----------------------------------------------------------------------
       Wiring
       ---------------------------------------------------------------------- */
    const currentView = () => document.querySelector('.page-view.is-visible')?.dataset.view || 'home';

    window.addEventListener('viewchange', (event) => {
        if (!state.loaderDone) return;
        revealView(event.detail?.view);
    });

    const onReady = () => {
        if (tiles) tiles.scan();

        // First reveal waits for the loading screen to clear.
        const loader = document.getElementById('loader');
        const finish = () => {
            if (state.loaderDone) return;
            state.loaderDone = true;
            revealView(currentView());
        };
        if (!loader || loader.classList.contains('hidden')) {
            finish();
        } else {
            const mo = new MutationObserver(() => {
                if (loader.classList.contains('hidden')) {
                    mo.disconnect();
                    setTimeout(finish, 120);
                }
            });
            mo.observe(loader, { attributes: true, attributeFilter: ['class'] });
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', onReady);
    } else {
        onReady();
    }
})();
