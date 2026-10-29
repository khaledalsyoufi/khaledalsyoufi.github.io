// Redundant manual check, inline script in index.html handles this sooner
if (history.scrollRestoration) {
    history.scrollRestoration = 'manual';
}

function renderServices() {
    const servicesList = document.getElementById('servicesList');
    const services = window.portfolioData?.services;

    if (!servicesList || !Array.isArray(services)) return;

    servicesList.innerHTML = '';

    // Poster frames are only fetched once a thumbnail is actually near the viewport,
    // so collapsed accordions cost nothing.
    const posterObserver = 'IntersectionObserver' in window
        ? new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                const video = entry.target;
                if (video.dataset.poster) video.poster = video.dataset.poster;
                posterObserver.unobserve(video);
            });
        }, { rootMargin: '200px' })
        : null;

    services.forEach((service) => {
        const serviceItem = document.createElement('div');
        serviceItem.className = 'service-item reveal';
        serviceItem.dataset.service = service.slug;

        const header = document.createElement('div');
        header.className = 'service-header';
        // Real button semantics: keyboard operable, state exposed to AT.
        header.setAttribute('role', 'button');
        header.setAttribute('tabindex', '0');
        header.setAttribute('aria-expanded', 'false');
        header.setAttribute('aria-controls', `service-panel-${service.slug}`);

        const title = document.createElement('h2');
        title.className = 'service-title';
        title.append(document.createTextNode(`${service.title} `));

        const accent = document.createElement('span');
        accent.className = 'mono accent';
        accent.textContent = service.accent;
        title.append(accent);

        const toggle = document.createElement('span');
        toggle.className = 'service-toggle mono';
        toggle.textContent = '[ + ]';

        header.append(title, toggle);

        const content = document.createElement('div');
        content.className = 'service-content';
        content.id = `service-panel-${service.slug}`;

        const details = document.createElement('div');
        details.className = 'service-details mono';
        const description = document.createElement('p');
        description.textContent = service.description;
        details.append(description);

        const visuals = document.createElement('div');
        visuals.className = 'service-visuals';
        const grid = document.createElement('div');
        grid.className = 'visual-grid';

        service.projects.forEach((project, index) => {
            const visualItem = document.createElement('div');
            visualItem.className = 'visual-item';
            
            // Hide items beyond the first 4
            if (index >= 4) {
                visualItem.classList.add('hidden-project');
                visualItem.style.display = 'none';
                visualItem.style.opacity = '0';
                visualItem.style.transition = 'opacity 0.4s ease';
            }

            const wrapper = document.createElement('div');
            wrapper.className = 'visual-img-wrapper';

            const isVideoCover = /\.(mp4|webm|ogg)$/i.test(project.cover);
            const media = document.createElement(isVideoCover ? 'video' : 'img');
            media.src = project.cover;
            if (!isVideoCover) {
                media.loading = 'lazy';
                media.decoding = 'async';
            }
            if (isVideoCover) {
                // Nothing is fetched until the card is hovered: preload="none" + poster.
                media.preload = 'none';
                media.loop = true;
                media.muted = true;
                media.playsInline = true;
                if (project.poster) {
                    media.dataset.poster = project.poster;
                    if (posterObserver) posterObserver.observe(media);
                    else media.poster = project.poster;
                }

                wrapper.classList.add('vertical-thumbnail');

                const startPreview = () => { media.play().catch(() => {}); };
                const stopPreview = () => media.pause();
                visualItem.addEventListener('mouseenter', startPreview);
                visualItem.addEventListener('mouseleave', stopPreview);
                visualItem.addEventListener('focusin', startPreview);
                visualItem.addEventListener('focusout', stopPreview);
            } else {
                media.alt = project.title ? `${project.title} — project cover` : 'Project cover';
            }
            media.dataset.title = project.title;
            media.dataset.year = project.year;
            media.dataset.role = project.role;
            media.dataset.gallery = project.gallery.join(',');
            media.dataset.desc = project.description;

            wrapper.append(media);
            
            if (isVideoCover) {
                const playBadge = document.createElement('div');
                playBadge.className = 'play-badge';
                playBadge.setAttribute('aria-hidden', 'true');
                playBadge.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"></path></svg>`;
                wrapper.append(playBadge);
            }
            
            visualItem.append(wrapper);
            if (project.title) {
                const caption = document.createElement('div');
                caption.className = 'visual-caption';
                caption.textContent = project.title;
                visualItem.append(caption);
            }

            // Signature detail: the piece's real pixel dimensions, revealed on hover.
            const spec = document.createElement('div');
            spec.className = 'visual-spec';
            spec.textContent = project.year || '';
            visualItem.append(spec);

            const setSpec = () => {
                const w = isVideoCover ? media.videoWidth : media.naturalWidth;
                const h = isVideoCover ? media.videoHeight : media.naturalHeight;
                if (!w || !h) return;
                spec.textContent = `${w} × ${h}${project.year ? ' · ' + project.year : ''}`;
            };
            if (isVideoCover) {
                media.addEventListener('loadedmetadata', setSpec, { once: true });
            } else {
                media.addEventListener('load', setSpec, { once: true });
                if (media.complete) setSpec();
            }

            // Keyboard access to the gallery, not just mouse.
            visualItem.tabIndex = 0;
            visualItem.setAttribute('role', 'button');
            visualItem.setAttribute('aria-label',
                `${project.title || (isVideoCover ? 'Motion reel' : 'Project')}: open gallery`);
            visualItem.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
                    event.preventDefault();
                    media.click();
                }
            });

            grid.append(visualItem);
        });

        visuals.append(grid);
        
        // Add View More / View Less button logic
        if (service.projects.length > 4) {
            const toggleBtn = document.createElement('button');
            toggleBtn.className = 'view-more-btn mono';
            toggleBtn.innerHTML = 'VIEW MORE';
            toggleBtn.dataset.state = 'collapsed';
            toggleBtn.type = 'button';
            toggleBtn.setAttribute('aria-expanded', 'false');
            toggleBtn.setAttribute('aria-controls', content.id);

            toggleBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                const isCollapsed = this.dataset.state === 'collapsed';
                const hiddenItems = grid.querySelectorAll('.hidden-project');
                const serviceItemEl = this.closest('.service-item');
                const contentEl = serviceItemEl.querySelector('.service-content');

                if (isCollapsed) {
                    // Expand
                    hiddenItems.forEach(item => {
                        item.style.display = 'flex';
                        setTimeout(() => item.style.opacity = '1', 10);
                    });
                    this.innerHTML = 'VIEW LESS';
                    this.dataset.state = 'expanded';
                } else {
                    // Collapse
                    hiddenItems.forEach(item => {
                        item.style.opacity = '0';
                        setTimeout(() => item.style.display = 'none', 400);
                    });
                    this.innerHTML = 'VIEW MORE';
                    this.dataset.state = 'collapsed';
                    
                    // Scroll back to button position if needed
                    setTimeout(() => {
                        serviceItemEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }, 450);
                }
                
                this.setAttribute('aria-expanded', String(isCollapsed));

                // Recalculate accordion height once the items are shown / hidden,
                // otherwise a collapsed grid keeps its expanded max-height and the
                // accordion's close animation stalls on the empty space.
                setTimeout(() => {
                    if (serviceItemEl.classList.contains('expanded')) {
                        contentEl.style.maxHeight = `${contentEl.scrollHeight}px`;
                    }
                }, isCollapsed ? 100 : 450);
            });
            visuals.append(toggleBtn);
        }

        content.append(details, visuals);
        serviceItem.append(header, content);
        servicesList.append(serviceItem);
    });
}

// Services Accordion Logic
function initServices() {
    const serviceItems = [...document.querySelectorAll('.service-item')];
    if (!serviceItems.length) return;

    const setExpanded = (item, expanded) => {
        const content = item.querySelector('.service-content');
        const toggle = item.querySelector('.service-toggle');
        const header = item.querySelector('.service-header');

        item.classList.toggle('expanded', expanded);
        if (toggle) toggle.innerText = expanded ? '[ - ]' : '[ + ]';
        if (header) header.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        content.style.maxHeight = expanded ? `${content.scrollHeight}px` : '0px';
    };

    const syncExpandedHeights = () => {
        serviceItems.forEach((item) => {
            if (item.classList.contains('expanded')) {
                item.querySelector('.service-content').style.maxHeight =
                    `${item.querySelector('.service-content').scrollHeight}px`;
            }
        });
    };

    const toggleItem = (item) => {
        const isExpanded = item.classList.contains('expanded');
        serviceItems.forEach((serviceItem) => setExpanded(serviceItem, false));
        if (!isExpanded) setExpanded(item, true);
    };

    serviceItems.forEach((item) => {
        const header = item.querySelector('.service-header');
        if (!header) return;

        header.addEventListener('click', () => toggleItem(item));
        header.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
                event.preventDefault();
                toggleItem(item);
            } else if (event.key === 'Escape' && item.classList.contains('expanded')) {
                setExpanded(item, false);
                header.focus();
            }
        });
    });

    window.addEventListener('resize', syncExpandedHeights);
}

// Trigger smooth staggered scroll-up entrance animation for Selected Works
function triggerServicesScrollUp() {
    const servicesSection = document.getElementById('services');
    if (!servicesSection) return;

    servicesSection.classList.remove('animate-in', 'animation-done');
    void servicesSection.offsetWidth; // Trigger reflow so animation re-runs cleanly
    servicesSection.classList.add('animate-in');

    setTimeout(() => {
        servicesSection.classList.add('animation-done');
    }, 1200);
}

// Trigger smooth slide-down entrance animation for the VHS Cassette Tape
function triggerTapeSlideDown() {
    const heroRight = document.querySelector('.hero-right');
    if (!heroRight) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        heroRight.classList.remove('tape-slide-down');
        return;
    }

    heroRight.classList.remove('tape-slide-down');
    void heroRight.offsetWidth; // Force reflow so animation re-triggers
    heroRight.classList.add('tape-slide-down');
}

// Glitch Text Effect
function initGlitch() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&*";
    const glitchElements = document.querySelectorAll('.glitch-text');

    glitchElements.forEach(el => {
        const originalText = el.dataset.text || el.innerText;
        let iteration = 0;
        let interval = null;

        const startGlitch = () => {
            clearInterval(interval);
            iteration = 0;
            interval = setInterval(() => {
                el.innerText = originalText.split("")
                    .map((char, index) => {
                        if (index < iteration) return originalText[index];
                        return chars[Math.floor(Math.random() * chars.length)];
                    })
                    .join("");

                if (iteration >= originalText.length) clearInterval(interval);
                iteration += 1 / 3;
            }, 30);
        };

        el.addEventListener('mouseenter', startGlitch);
        // Initial glitch
        setTimeout(startGlitch, 500);
    });
}

// Staggered Reveal on Scroll
function initReveal() {
    const revealElements = document.querySelectorAll('.reveal, .timeline-item, .section-label, .section');

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1 });

    revealElements.forEach(el => observer.observe(el));
}

// Hero Section Parallax Interaction (Retired in favor of 3D VHS cassette tape physics)
function initHeroParallax() {
    // Parallax retired: 3D cassette tape handles its own physics, tilt, and hover centering
}

// Image Lightbox Logic (Slider Mode)
function initLightbox() {
    const lightbox = document.getElementById('lightbox');
    const lightboxContainer = lightbox.querySelector('.lightbox-container');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');

    // Project Info Elements
    const projectTitle = lightbox.querySelector('.project-title');
    const projectDesc = lightbox.querySelector('.project-desc');
    const metaYear = lightbox.querySelector('.meta-year');
    const metaRole = lightbox.querySelector('.meta-role');
    const metaCount = lightbox.querySelector('.meta-count');
    const closeBtn = lightbox.querySelector('.lightbox-close');
    const metaOverlay = lightbox.querySelector('.lightbox-meta-overlay');

    let currentImages = [];
    let currentIndex = 0;
    let isAnimating = false;
    let lastFocused = null;
    let currentPoster = '';

    const updateCounter = (mode = 'desktop') => {
        if (!metaCount) return;

        if (mode === 'mobile') {
            metaCount.innerText = `${currentImages.length} IMAGES`;
            return;
        }

        const currentLabel = String(currentIndex + 1).padStart(2, '0');
        const totalLabel = String(currentImages.length).padStart(2, '0');
        metaCount.innerText = `${currentLabel} / ${totalLabel}`;
    };

    // Helper to create media element
    const createMedia = (src, poster = '') => {
        const isVideo = src.match(/\.(mp4|webm|ogg)$/i);
        const media = document.createElement(isVideo ? 'video' : 'img');
        media.src = src;
        media.className = 'lightbox-img';
        if (!isVideo) {
            media.loading = 'lazy';
            media.decoding = 'async';
            media.alt = projectTitle.innerText ? `${projectTitle.innerText} — project image` : 'Project image';
        }
        if (isVideo) {
            media.loop = true;
            media.controls = true;
            media.playsInline = true;
            media.preload = 'metadata';
            if (poster) media.poster = poster;
        }
        return media;
    };

    // Browsers block autoplay when the video has sound: try unmuted once,
    // then fall back to muted so the reel always starts on click.
    const startPlayback = (el) => {
        if (!el || el.tagName !== 'VIDEO') return;
        const attemptPlay = () => {
            const attempt = el.play();
            if (attempt && typeof attempt.catch === 'function') {
                attempt.catch(() => {
                    // Autoplay with sound was refused: start muted, sound stays one tap away.
                    el.muted = true;
                    el.play().catch(() => { });
                });
            }
        };
        attemptPlay();
        if (el.readyState < 3) {
            el.addEventListener('canplay', () => {
                if (el.paused) attemptPlay();
            }, { once: true });
        }
    };

    // Update View
    const updateView = (direction = 'next') => {
        if (isAnimating) return;
        isAnimating = true;

        const incomingSrc = currentImages[currentIndex];

        // Remove existing current if any (except the one we are transitioning out)
        // But simpler: Just append new, animate, then clean up.

        const newImg = createMedia(incomingSrc, currentPoster);
        // Start position depending on direction
        if (direction === 'next') {
            newImg.classList.add('slide-in-right');
        } else if (direction === 'prev') {
            newImg.classList.add('slide-in-left');
        } else {
            // Initial load
            newImg.classList.add('active'); // Just fade in/appear
        }

        lightboxContainer.appendChild(newImg);
        startPlayback(newImg);

        // Force reflow
        void newImg.offsetWidth;

        // Current active image to slide out
        const currentActive = lightboxContainer.querySelector('.lightbox-img.active');

        if (currentActive && direction) {
            currentActive.classList.remove('active');
            if (direction === 'next') {
                currentActive.classList.add('slide-out-left');
            } else {
                currentActive.classList.add('slide-out-right');
            }

            // Cleanup old image after transition
            setTimeout(() => {
                if (currentActive && currentActive.parentNode) {
                    currentActive.parentNode.removeChild(currentActive);
                }
            }, 500); // Match CSS transition time
        }

        // Animate new in
        if (direction) {
            newImg.classList.remove('slide-in-right', 'slide-in-left');
            newImg.classList.add('active');
        }

        updateCounter();

        setTimeout(() => {
            isAnimating = false;
        }, 500);
    };

    // Navigation Handlers
    const goNext = () => {
        if (isAnimating) return;
        currentIndex = (currentIndex + 1) % currentImages.length;
        updateView('next');
    };

    const goPrev = () => {
        if (isAnimating) return;
        currentIndex = (currentIndex - 1 + currentImages.length) % currentImages.length;
        updateView('prev');
    };

    // Open Lightbox
    document.querySelectorAll('.visual-item img, .visual-item video').forEach(img => {
        img.addEventListener('click', (e) => {
            e.stopPropagation();

            // The card may have been previewing on hover; stop it so audio doesn't overlap.
            if (img.tagName === 'VIDEO') img.pause();
            currentPoster = img.dataset.poster || img.getAttribute('poster') || '';

            const galleryData = img.dataset.gallery;
            if (galleryData) {
                // Use only specific gallery images (exclude the cover/trigger image)
                currentImages = galleryData.split(',').map(p => p.trim());
            } else {
                // Fallback: Just show the single image if no gallery defined
                currentImages = [img.src];
            }

            // Clean duplicates if any (cover might be repeated)
            currentImages = [...new Set(currentImages)];

            // Setup Metadata
            const metadata = img.dataset;
            projectTitle.innerText = metadata.title || 'UNTITLED PROJECT';
            projectTitle.style.display = metadata.title ? 'block' : 'none';
            projectDesc.innerText = metadata.desc || 'No description available.';
            projectDesc.style.display = metadata.desc && metadata.title ? 'block' : 'none';
            metaYear.innerText = metadata.year || '2025';
            metaRole.innerText = metadata.role || 'DESIGN';
            
            if (metaOverlay) {
                metaOverlay.style.display = metadata.title ? 'block' : 'none';
            }

            // Reset State
            lightboxContainer.innerHTML = '';
            currentIndex = 0;
            
            // Hide navigation if only 1 item (like Reels)
            if (currentImages.length <= 1) {
                prevBtn.style.display = 'none';
                nextBtn.style.display = 'none';
            } else {
                prevBtn.style.display = '';
                nextBtn.style.display = '';
            }

            // Reveal the dialog first: a video can't start inside a hidden subtree.
            lightbox.classList.add('active');
            document.body.classList.add('no-scroll');

            // Layout Decision: Mobile (Vertical Scroll) vs Desktop (Slider)
            if (window.innerWidth <= 900) {
                // Mobile: Render ALL images
                currentImages.forEach(src => {
                    const imgEl = createMedia(src, currentPoster);
                    imgEl.classList.add('active'); // active makes it visible
                    // No slide classes needed
                    lightboxContainer.appendChild(imgEl);
                    startPlayback(imgEl);
                });
                updateCounter('mobile');
            } else {
                // Desktop: Interactive Slider
                updateView(null);
            }

            lightbox.classList.add('active');
            document.body.classList.add('no-scroll');
            lastFocused = document.activeElement;
            // The dialog keeps visibility:hidden until its (transitioned) style lands,
            // so retry the focus hand-off for a few frames instead of guessing a delay.
            void lightbox.offsetWidth;
            const focusIntoDialog = (attempt = 0) => {
                if (!lightbox.classList.contains('active')) return;
                closeBtn.focus({ preventScroll: true });
                if (lightbox.contains(document.activeElement) || attempt > 40) return;
                requestAnimationFrame(() => focusIntoDialog(attempt + 1));
            };
            focusIntoDialog();
        });
    });

    // Event Listeners
    nextBtn.addEventListener('click', (e) => { e.stopPropagation(); goNext(); });
    prevBtn.addEventListener('click', (e) => { e.stopPropagation(); goPrev(); });

    // Keyboard Nav + focus trap
    document.addEventListener('keydown', (e) => {
        if (!lightbox.classList.contains('active')) return;
        if (e.key === 'ArrowRight') goNext();
        if (e.key === 'ArrowLeft') goPrev();
        if (e.key === 'Escape') closeLightbox();

        if (e.key === 'Tab') {
            const focusables = [...lightbox.querySelectorAll('button, [href], video[controls]')]
                .filter((el) => el.getClientRects().length > 0 && !el.disabled);
            if (!focusables.length) return;
            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        }
    });

    // Close logic
    const closeLightbox = () => {
        lightbox.querySelectorAll('video').forEach((v) => v.pause());
        lightbox.classList.remove('active');
        document.body.classList.remove('no-scroll');
        setTimeout(() => {
            lightboxContainer.innerHTML = '';
            if (metaCount) {
                metaCount.innerText = '';
            }
        }, 500);
        if (lastFocused && typeof lastFocused.focus === 'function') {
            lastFocused.focus({ preventScroll: true });
        }
    };

    closeBtn.addEventListener('click', closeLightbox);
    lightbox.addEventListener('click', (e) => {
        if (e.target === lightbox || e.target === lightboxContainer) {
            closeLightbox();
        }
    });
}


// Custom Cursor
function initCustomCursor() {
    const cursor = document.querySelector('.custom-cursor');
    if (!cursor) return;

    // Only for mouse/trackpad users. Touch and headless keep the native pointer.
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    if (!finePointer.matches) {
        cursor.style.display = 'none';
        return;
    }

    document.body.classList.add('has-custom-cursor');

    const interactiveSelector = 'a, button, .service-header, .visual-item, .hero-card, .modal-btn, .modal-close-btn, .tv-dial-item, .tv-top-menu, .tv-ctrl-btn';

    // Track mouse movement
    document.addEventListener('mousemove', (e) => {
        cursor.style.left = e.clientX + 'px';
        cursor.style.top = e.clientY + 'px';
    });

    // Delegate hover state so dynamically rendered items are covered too.
    document.addEventListener('mouseleave', () => {
        cursor.style.opacity = '0';
    });

    document.addEventListener('mouseenter', () => {
        cursor.style.opacity = '';
    });

    // Delegate hover state so dynamically rendered items are covered too.
    document.addEventListener('mouseover', (e) => {
        if (e.target.closest(interactiveSelector)) {
            cursor.classList.add('hover');
        }
    });

    document.addEventListener('mouseout', (e) => {
        if (e.target.closest(interactiveSelector)) {
            cursor.classList.remove('hover');
        }
    });
}

// Loading Screen Animation & Page Transitions
function initLoader() {
    const loader = document.getElementById('loader');
    const percentElement = document.querySelector('.loader-percent');
    const progressFill = document.querySelector('.loader-ticks-fill');
    const labelElement = document.querySelector('.loader-label');

    if (!loader || !percentElement || !progressFill) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const setProgress = (percent) => {
        const safePercent = Math.max(0, Math.min(100, percent));
        percentElement.textContent = Math.floor(safePercent);
        progressFill.style.width = safePercent + '%';
    };

    const showLoader = () => {
        loader.classList.remove('hidden');
    };

    const hideLoader = () => {
        loader.classList.add('hidden');
        document.body.classList.add('page-loaded');

        const currentView = window.location.hash.replace('#', '') || 'home';
        if (currentView === 'services') {
            triggerServicesScrollUp();
        } else if (currentView === 'home') {
            triggerTapeSlideDown();
            if (window.typewriterController?.start) {
                window.typewriterController.start(320);
            }
        }
    };

    const viewLabels = {
        home: 'LOADING // HOME',
        services: 'LOADING // SELECTED WORKS',
        clients: 'LOADING // CLIENTS',
        about: 'LOADING // INFO'
    };

    const runLoaderTransition = (options = {}) => new Promise((resolve) => {
        const config = typeof options === 'number' ? { duration: options } : (options || {});
        const duration = config.duration || 420;
        const targetView = config.targetView || '';
        const onMidpoint = config.onMidpoint || null;

        if (prefersReducedMotion) {
            if (typeof onMidpoint === 'function') onMidpoint();
            resolve();
            return;
        }

        if (labelElement) {
            labelElement.textContent = viewLabels[targetView] || 'LOADING';
        }

        showLoader();
        setProgress(0);

        const startTime = performance.now();
        let midpointCalled = false;

        const animate = (timestamp) => {
            const elapsed = timestamp - startTime;
            const rawProgress = Math.min(elapsed / duration, 1);
            // Non-linear easing: fast start, soft finish
            const easedProgress = 1 - Math.pow(1 - rawProgress, 2.4);
            const percent = Math.min(easedProgress * 100, 100);

            setProgress(percent);

            if (percent >= 98 && !midpointCalled) {
                midpointCalled = true;
                if (typeof onMidpoint === 'function') {
                    onMidpoint();
                }
            }

            if (rawProgress < 1) {
                requestAnimationFrame(animate);
                return;
            }

            setProgress(100);
            if (!midpointCalled && typeof onMidpoint === 'function') {
                midpointCalled = true;
                onMidpoint();
            }

            setTimeout(() => {
                hideLoader();
                setTimeout(() => {
                    if (labelElement) labelElement.textContent = 'LOADING';
                }, 400);
                resolve();
            }, 90);
        };

        requestAnimationFrame(animate);
    });

    window.portfolioLoader = {
        hide: hideLoader,
        showTransition: runLoaderTransition
    };

    if (prefersReducedMotion) {
        hideLoader();
        document.documentElement.style.scrollBehavior = 'smooth';
        window.scrollTo(0, 0);
        return;
    }

    // Play on every page load/refresh
    let percent = 0;
    const duration = 1150; // smooth ~1.15s loading
    const increment = 100 / (duration / 16);

    const animateLoader = () => {
        percent += increment;

        if (percent > 100) percent = 100;

        setProgress(percent);

        if (percent < 100) {
            requestAnimationFrame(animateLoader);
        } else {
            window.scrollTo(0, 0);

            // Hold briefly at 100% so the user sees the filled segmented bar, then fade
            setTimeout(() => {
                hideLoader();
                document.documentElement.style.scrollBehavior = 'smooth';
                window.scrollTo(0, 0);
                triggerTapeSlideDown();
            }, 240);
        }
    };

    // Start animation
    requestAnimationFrame(animateLoader);
}

// Smart TV EPG Channel Guide Layout (Inspired by Digital Television Guide OSD)
function renderClients() {
    const dialTrack = document.getElementById('tvDialTrack');
    const tvFeaturedBrandLogo = document.getElementById('tvFeaturedBrandLogo');
    const tvMainTitle = document.getElementById('tvMainTitle');
    const tvTimelineFill = document.getElementById('tvTimelineFill');
    const tvTimelineEnd = document.getElementById('tvTimelineEnd');
    const tvNextName = document.getElementById('tvNextName');
    const tvDialUp = document.getElementById('tvDialUp');
    const tvDialDown = document.getElementById('tvDialDown');
    const slideA = document.getElementById('tvBackdropSlideA');
    const slideB = document.getElementById('tvBackdropSlideB');
    const clientsSection = document.getElementById('clients');

    const clients = window.portfolioData?.clients;
    if (!dialTrack || !Array.isArray(clients) || clients.length === 0) return;

    const totalChannels = clients.length;
    let currentIndex = 7; // Channel 8 initially selected (matching reference position)
    if (currentIndex >= totalChannels) currentIndex = 0;

    const ITEM_HEIGHT = 68;
    const VIEWPORT_HEIGHT = 480;
    const CENTER_OFFSET = (VIEWPORT_HEIGHT / 2) - (ITEM_HEIGHT / 2); // 206px

    dialTrack.innerHTML = '';
    const itemElements = [];

    // Render channel items in vertical dial
    clients.forEach((client, i) => {
        const item = document.createElement('div');
        item.className = 'tv-dial-item' + (i === currentIndex ? ' is-active' : '');
        item.dataset.index = String(i);

        const isP = Boolean(client.isPortrait);
        item.innerHTML = `
            <span class="tv-dial-num mono">${i + 1}</span>
            <div class="tv-dial-logo-wrap">
                <img src="${client.logo}" alt="${client.name}" class="tv-dial-logo${isP ? ' is-portrait' : ''}" loading="lazy" />
            </div>
            <div class="tv-dial-select-pill" title="View ${client.name}">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#000000" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
            </div>
        `;

        item.addEventListener('click', () => {
            selectChannel(i);
        });

        dialTrack.appendChild(item);
        itemElements.push(item);
    });

    // Dynamic Stock Backdrop Switcher with Slow-Mo Ken Burns Zoom In
    let activeSlideKey = 'A';
    function updateBackdropImage(imageUrl) {
        if (!imageUrl || !slideA || !slideB) return;
        const nextSlide = activeSlideKey === 'A' ? slideB : slideA;
        const currentSlide = activeSlideKey === 'A' ? slideA : slideB;

        nextSlide.style.backgroundImage = `url("${imageUrl}")`;
        // Restart the CSS Ken Burns slow zoom animation
        nextSlide.style.animation = 'none';
        void nextSlide.offsetWidth; // force reflow
        nextSlide.style.animation = '';

        nextSlide.classList.add('is-active');
        currentSlide.classList.remove('is-active');

        activeSlideKey = activeSlideKey === 'A' ? 'B' : 'A';
    }

    // Channel Selection & Wheel Translation
    function selectChannel(targetIndex) {
        const nextIndex = (targetIndex + totalChannels) % totalChannels;
        currentIndex = nextIndex;

        // 1. Smoothly translate track so active channel is centered
        const translateY = CENTER_OFFSET - (currentIndex * ITEM_HEIGHT);
        dialTrack.style.transform = `translateY(${translateY}px)`;

        // 2. Update active class on items
        itemElements.forEach((el, i) => {
            el.classList.toggle('is-active', i === currentIndex);
        });

        // 3. Update EPG Details with pure client names & categories
        const currentClient = clients[currentIndex];
        const nextClient = clients[(currentIndex + 1) % totalChannels];

        if (tvFeaturedBrandLogo) {
            tvFeaturedBrandLogo.src = currentClient.logo;
            tvFeaturedBrandLogo.alt = currentClient.name;
            const isP = Boolean(currentClient.isPortrait);
            tvFeaturedBrandLogo.classList.toggle('is-portrait', isP);
            const logoWrap = tvFeaturedBrandLogo.closest('.tv-brand-logo-wrap');
            if (logoWrap) logoWrap.classList.toggle('is-portrait', isP);
        }

        if (tvMainTitle) {
            tvMainTitle.textContent = currentClient.name;
        }

        if (tvTimelineFill) {
            const pct = Math.round(((currentIndex + 1) / totalChannels) * 100);
            tvTimelineFill.style.width = `${Math.max(18, Math.min(pct, 95))}%`;
        }

        if (tvTimelineEnd) {
            tvTimelineEnd.textContent = currentClient.category || 'BRAND ARCHIVE';
        }

        if (tvNextName) {
            tvNextName.textContent = nextClient.name + (nextClient.category ? ' · ' + nextClient.category : '');
        }

        // 4. Update dynamic stock background for brand field with Slow-Mo Zoom In
        if (currentClient.bg) {
            updateBackdropImage(currentClient.bg);
        }
    }

    // Initial setup with Channel 8 centered
    selectChannel(currentIndex);

    // Chevron Arrows
    if (tvDialUp) {
        tvDialUp.addEventListener('click', () => {
            selectChannel(currentIndex - 1);
        });
    }

    if (tvDialDown) {
        tvDialDown.addEventListener('click', () => {
            selectChannel(currentIndex + 1);
        });
    }

    // Mouse Wheel Scroll over the dial or stage
    let wheelThrottle = 0;
    const stageEl = document.querySelector('.tv-epg-stage');
    if (stageEl) {
        stageEl.addEventListener('wheel', (e) => {
            const now = Date.now();
            if (now - wheelThrottle < 140) return;
            wheelThrottle = now;

            if (e.deltaY > 10) {
                selectChannel(currentIndex + 1);
            } else if (e.deltaY < -10) {
                selectChannel(currentIndex - 1);
            }
        }, { passive: true });
    }

    // Keyboard Navigation
    document.addEventListener('keydown', (e) => {
        if (!clientsSection || !clientsSection.classList.contains('is-visible')) return;
        if (document.body.classList.contains('modal-open')) return;
        if (document.querySelector('.lightbox.is-open')) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectChannel(currentIndex + 1);
            return;
        }

        if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectChannel(currentIndex - 1);
            return;
        }

        if (e.key === 'PageDown') {
            e.preventDefault();
            selectChannel(currentIndex + 4);
            return;
        }

        if (e.key === 'PageUp') {
            e.preventDefault();
            selectChannel(currentIndex - 4);
            return;
        }

        if (e.key === 'Escape') {
            e.preventDefault();
            const homeLink = document.querySelector('[data-view-link="home"]');
            if (homeLink) homeLink.click();
            return;
        }

        if (e.key === 'Enter') {
            e.preventDefault();
            // Acknowledge selection
            const pill = itemElements[currentIndex]?.querySelector('.tv-dial-select-pill');
            if (pill) {
                pill.style.transform = 'scale(0.92)';
                setTimeout(() => { pill.style.transform = ''; }, 120);
            }
            return;
        }
    });

    // Reset center position when view becomes visible
    window.addEventListener('viewchange', (e) => {
        if (e.detail?.view === 'clients') {
            setTimeout(() => {
                selectChannel(currentIndex);
                if (tvEpgVideo) tvEpgVideo.play().catch(() => {});
            }, 50);
        }
    });
}

// Intro Title Animation
function initIntro() {
    const titleEl = document.querySelector('.display-title');
    if (!titleEl) return;

    const revealLines = () => {
        document.querySelectorAll('.blur-line').forEach(el => el.classList.add('visible'));
    };

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        titleEl.style.visibility = 'visible';
        revealLines();
        return;
    }

    const originalText = titleEl.innerText;
    titleEl.style.visibility = 'hidden';

    // Create black overlay + title
    const overlay = document.createElement('div');
    overlay.id = 'intro-overlay';

    const titleDiv = document.createElement('div');
    titleDiv.className = 'intro-title';
    titleDiv.innerHTML = originalText.replace(/\n/g, '<br>');
    overlay.appendChild(titleDiv);

    document.body.appendChild(overlay);

    // After a brief pause, shrink the title
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            overlay.querySelector('.intro-title').style.transform = 'translate(-50%, -50%) scale(1)';
            overlay.querySelector('.intro-title').style.opacity = '0';
        });
    });

    // Fade out overlay
    setTimeout(() => {
        overlay.style.opacity = '0';
        titleEl.style.visibility = 'visible';
        setTimeout(() => {
            overlay.remove();
            revealLines();
        }, 400);
    }, 450);
}

// Theme Toggler
// Theme Toggler
// Theme Toggler
function initTheme() {
    const toggleBtn = document.getElementById('theme-toggle');
    const root = document.documentElement;
    const logo = document.querySelector('.main-logo');

    const readSaved = () => {
        try { return localStorage.getItem('theme'); } catch (e) { return null; }
    };
    const save = (theme) => {
        try { localStorage.setItem('theme', theme); } catch (e) { }
    };

    const updateImages = (theme) => {
        if (logo) {
            logo.src = theme === 'light' ? 'public/images/logo_light.webp' : 'public/images/logo.webp';
        }
    };

    const applyTheme = (theme) => {
        // Theme lives on <html> so the page canvas, overscroll and UA chrome follow it.
        root.setAttribute('data-theme', theme);
        updateImages(theme);
        if (toggleBtn) {
            toggleBtn.setAttribute('aria-label',
                theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme');
        }
    };

    const systemPrefersLight = window.matchMedia('(prefers-color-scheme: light)');
    const savedTheme = readSaved();

    applyTheme(savedTheme || (systemPrefersLight.matches ? 'light' : 'dark'));

    systemPrefersLight.addEventListener('change', (e) => {
        if (!readSaved()) applyTheme(e.matches ? 'light' : 'dark');
    });

    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            const currentTheme = root.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
            const newTheme = currentTheme === 'light' ? 'dark' : 'light';
            applyTheme(newTheme);
            save(newTheme);
        });
    }
}
// Magnetic Hover Effect (Disabled per user request)
function initMagnetic() {
    // Disabled
}

// 3D Gyroscope Tilt Effect
function initTilt3D() {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    // The hero portrait is owned by the parallax handler, so it is excluded here.
    const targets = document.querySelectorAll('.visual-item, .timeline-item, .client-item');
    if (!targets.length) return;

    targets.forEach(el => {
        const isClient = el.classList.contains('client-item');
        const intensity = isClient ? 20 : 12;
        const scale = isClient ? 1.06 : 1.02;

        el.addEventListener('mousemove', (e) => {
            const rect = el.getBoundingClientRect();
            const x = (e.clientX - rect.left) / rect.width;
            const y = (e.clientY - rect.top) / rect.height;
            const tiltX = (y - 0.5) * -intensity;
            const tiltY = (x - 0.5) * intensity;
            el.style.transform = `perspective(800px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) scale3d(${scale},${scale},${scale})`;
            el.style.transition = 'transform 0.08s linear';
        });

        el.addEventListener('mouseleave', () => {
            el.style.transform = 'perspective(800px) rotateX(0deg) rotateY(0deg) scale3d(1,1,1)';
            el.style.transition = 'transform 0.5s cubic-bezier(0.19, 1, 0.22, 1)';
        });
    });
}

function initSectionViews() {
    const body = document.body;
    const pageViews = [...document.querySelectorAll('.page-view[data-view]')];
    const viewLinks = [...document.querySelectorAll('[data-view-link]')];
    if (!pageViews.length || !viewLinks.length) return;

    const viewTitles = {
        home: 'Khaled Alsyoufi | Graphic Designer',
        services: 'Selected Works | Khaled Alsyoufi',
        clients: 'Clients | Khaled Alsyoufi',
        about: 'Info | Khaled Alsyoufi'
    };

    const validViews = new Set(pageViews.map((view) => view.dataset.view));
    let activeView = null;
    let ignoreNextHashChange = false;

    const applyView = (viewName, options = {}) => {
        const { pushHistory = false } = options;
        const nextView = validViews.has(viewName) ? viewName : 'home';

        if (activeView === nextView) {
            if (pushHistory) {
                ignoreNextHashChange = true;
                window.location.hash = nextView;
            }
            return;
        }

        body.classList.add('view-mode');

        pageViews.forEach((view) => {
            const isVisible = view.dataset.view === nextView;
            view.classList.toggle('is-visible', isVisible);
        });

        viewLinks.forEach((link) => {
            const isCurrent = link.dataset.viewLink === nextView;
            link.classList.toggle('is-current', isCurrent);
            if (isCurrent) {
                link.setAttribute('aria-current', 'page');
            } else {
                link.removeAttribute('aria-current');
            }
        });

        if (pushHistory) {
            ignoreNextHashChange = true;
            window.location.hash = nextView;
        }

        document.title = viewTitles[nextView] || viewTitles.home;
        activeView = nextView;
        window.dispatchEvent(new CustomEvent('viewchange', { detail: { view: nextView } }));
        window.scrollTo({ top: 0, behavior: 'auto' });

        if (nextView === 'services') {
            if (window.typewriterController?.pause) window.typewriterController.pause();
            const loader = document.getElementById('loader');
            const isLoaderActive = loader && !loader.classList.contains('hidden');
            if (!isLoaderActive) {
                triggerServicesScrollUp();
            }
        } else if (nextView === 'clients' || nextView === 'about') {
            if (window.typewriterController?.pause) window.typewriterController.pause();
        } else if (nextView === 'home') {
            const loader = document.getElementById('loader');
            const isLoaderActive = loader && !loader.classList.contains('hidden');
            if (!isLoaderActive) {
                triggerTapeSlideDown();
                if (window.typewriterController?.start) {
                    window.typewriterController.start(320);
                }
            }
        }
    };

    let isTransitioning = false;

    // Loading Screen Page Transition:
    // When navigating between pages, the clean segmented loader smoothly fills and acts as the transition.
    const navigateWithLoader = async (viewName, options = {}) => {
        const nextView = validViews.has(viewName) ? viewName : 'home';
        if (nextView === activeView || isTransitioning) return;

        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduced) {
            applyView(nextView, options);
            return;
        }

        isTransitioning = true;
        try {
            if (window.portfolioLoader && typeof window.portfolioLoader.showTransition === 'function') {
                await window.portfolioLoader.showTransition({
                    duration: 420,
                    targetView: nextView,
                    onMidpoint: () => {
                        applyView(nextView, options);
                    }
                });
            } else {
                applyView(nextView, options);
            }
        } finally {
            isTransitioning = false;
        }
    };

    viewLinks.forEach((link) => {
        link.addEventListener('click', async (event) => {
            event.preventDefault();
            const targetView = link.dataset.viewLink;
            if (targetView === 'home' && activeView === 'home') {
                triggerTapeSlideDown();
                if (window.typewriterController) {
                    window.typewriterController.start(60);
                }
                return;
            }
            await navigateWithLoader(targetView, { pushHistory: true });
        });
    });

    window.addEventListener('hashchange', async () => {
        if (ignoreNextHashChange) {
            ignoreNextHashChange = false;
            return;
        }

        const hashView = window.location.hash.replace('#', '');
        await navigateWithLoader(hashView || 'home');
    });

    const initialView = window.location.hash.replace('#', '') || 'home';
    applyView(initialView);
}

// Mobile Menu
function initMobileMenu() {
    const toggle = document.getElementById('menu-toggle');
    const menu = document.getElementById('mobile-menu');
    if (!toggle || !menu) return;

    const openMenu = () => {
        menu.hidden = false;
        toggle.setAttribute('aria-expanded', 'true');
        toggle.setAttribute('aria-label', 'Close menu');
        document.body.classList.add('no-scroll');
        const first = menu.querySelector('a');
        if (first) first.focus({ preventScroll: true });
    };

    const closeMenu = () => {
        if (menu.hidden) return;
        menu.hidden = true;
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-label', 'Open menu');
        document.body.classList.remove('no-scroll');
    };

    toggle.addEventListener('click', () => {
        if (menu.hidden) openMenu();
        else closeMenu();
    });

    menu.addEventListener('click', (e) => {
        if (e.target.closest('a')) closeMenu();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !menu.hidden) {
            closeMenu();
            toggle.focus({ preventScroll: true });
        }
    });

    window.addEventListener('resize', () => {
        if (window.innerWidth > 1024) closeMenu();
    });

    window.addEventListener('viewchange', closeMenu);
}


// Lens magnifier — a glass loupe that follows the pointer
function initLens() {
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!finePointer || reduced) return;

    const SIZE = 220;
    const ZOOM = 1.85;

    const lens = document.createElement('div');
    lens.className = 'lens';
    lens.setAttribute('aria-hidden', 'true');
    const stage = document.createElement('div');
    stage.className = 'lens-stage';
    lens.appendChild(stage);
    document.body.appendChild(lens);

    let media = null;
    let frame = 0;
    let x = 0;
    let y = 0;

    const clear = () => {
        stage.replaceChildren();
        lens.classList.remove('has-media');
        media = null;
    };

    const fill = (el) => {
        const rect = el.getBoundingClientRect();
        stage.replaceChildren();
        const copy = document.createElement('img');
        copy.alt = '';
        copy.decoding = 'async';
        copy.src = el.tagName === 'VIDEO'
            ? (el.poster || el.currentSrc)
            : (el.currentSrc || el.src);
        copy.style.width = rect.width + 'px';
        copy.style.height = rect.height + 'px';
        stage.style.width = rect.width + 'px';
        stage.style.height = rect.height + 'px';
        stage.appendChild(copy);
        lens.classList.add('has-media');
        media = el;
        return rect;
    };

    const render = () => {
        frame = 0;
        lens.style.transform = `translate3d(${x - SIZE / 2}px, ${y - SIZE / 2}px, 0)`;

        if (!media || !media.isConnected) {
            if (media) clear();
            return;
        }

        const rect = media.getBoundingClientRect();
        const ox = x - rect.left;
        const oy = y - rect.top;
        stage.style.transform =
            `translate(${SIZE / 2 - ox * ZOOM}px, ${SIZE / 2 - oy * ZOOM}px) scale(${ZOOM})`;
    };

    document.addEventListener('pointermove', (event) => {
        x = event.clientX;
        y = event.clientY;

        const wrap = event.target.closest ? event.target.closest('.visual-img-wrapper') : null;
        const next = wrap ? wrap.querySelector('img, video') : null;

        if (next && next !== media) fill(next);
        else if (!next && media) clear();

        lens.classList.add('visible');
        if (!frame) frame = requestAnimationFrame(render);
    }, { passive: true });

    document.addEventListener('pointerleave', () => {
        lens.classList.remove('visible');
        clear();
    });

    window.addEventListener('scroll', () => {
        if (!frame) frame = requestAnimationFrame(render);
    }, { passive: true });
}


// Dynamic VHS Source Device Detector (SOURCE: PC / TABLET / MOBILE)
function initVhsSourceDetector() {
    const sourceEls = document.querySelectorAll('.vhs-source-text');
    if (!sourceEls.length) return;

    const detectDevice = () => {
        const w = window.innerWidth;
        const ua = navigator.userAgent || '';
        const isMobileUA = /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
        const isTabletUA = /iPad|Tablet|(Android(?!.*Mobile))/i.test(ua) ||
                           (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua));

        if (isMobileUA || w < 768) {
            return 'MOBILE';
        }
        if (isTabletUA || (w >= 768 && w <= 1024)) {
            return 'TABLET';
        }
        return 'PC';
    };

    const update = () => {
        const device = detectDevice();
        sourceEls.forEach(el => {
            el.textContent = `SOURCE: ${device}`;
        });
    };

    update();
    window.addEventListener('resize', update, { passive: true });
    window.addEventListener('orientationchange', update, { passive: true });
}

// HUD clock — the little timecode on the case
function initHudClock() {
    const el = document.getElementById('hud-clock');
    if (!el) return;
    const tick = () => {
        const d = new Date();
        const p = (n) => String(n).padStart(2, '0');
        el.textContent = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
    };
    tick();
    setInterval(tick, 1000);
}




// Center Screen Accent Modal (3x Cassette Flip Easter Egg - VHS OSD Edition)
function initAccentModal() {
    const modal = document.getElementById('accentModal');
    if (!modal) return;

    const backdrop = document.getElementById('accentModalBackdrop');
    const btnYes = document.getElementById('modalBtnYes');
    const btnNo = document.getElementById('modalBtnNo');

    // Google Drive portfolio link (replaces heavy local PDF)
    const PORTFOLIO_DRIVE_URL = 'https://drive.google.com/';
    const PDF_URL = PORTFOLIO_DRIVE_URL;

    const buttons = [btnYes, btnNo].filter(Boolean);
    let focusedIndex = 0;

    const setSelectedButton = (index, shouldFocus = true) => {
        if (!buttons.length) return;
        focusedIndex = (index + buttons.length) % buttons.length;
        buttons.forEach((btn, i) => {
            const isSel = (i === focusedIndex);
            btn.classList.toggle('is-selected', isSel);
            btn.setAttribute('aria-selected', isSel ? 'true' : 'false');
        });
        if (shouldFocus && document.activeElement !== buttons[focusedIndex]) {
            buttons[focusedIndex].focus();
        }
    };

    const openModal = () => {
        modal.removeAttribute('hidden');
        void modal.offsetWidth; // Force layout reflow
        modal.classList.add('is-open');
        document.body.classList.add('modal-open');
        setSelectedButton(0, true);
    };

    const closeModal = () => {
        modal.classList.remove('is-open');
        document.body.classList.remove('modal-open');
        setTimeout(() => {
            if (!modal.classList.contains('is-open')) {
                modal.setAttribute('hidden', '');
                setSelectedButton(0, false);
            }
        }, 220);
    };

    if (btnYes) {
        btnYes.addEventListener('click', () => {
            closeModal();
            const win = window.open(PDF_URL, '_blank');
            if (!win || win.closed || typeof win.closed === 'undefined') {
                window.location.href = PDF_URL;
            }
        });
        btnYes.addEventListener('focus', () => setSelectedButton(0, false));
        btnYes.addEventListener('mouseenter', () => setSelectedButton(0, false));
    }

    if (btnNo) {
        btnNo.addEventListener('click', closeModal);
        btnNo.addEventListener('focus', () => setSelectedButton(1, false));
        btnNo.addEventListener('mouseenter', () => setSelectedButton(1, false));
    }

    if (backdrop) {
        backdrop.addEventListener('click', closeModal);
    }

    // Keyboard navigation (Arrow keys, Tab, Escape, Enter)
    document.addEventListener('keydown', (e) => {
        if (!modal.classList.contains('is-open')) return;

        if (e.key === 'Escape') {
            e.preventDefault();
            closeModal();
            return;
        }

        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedButton(focusedIndex + 1, true);
            return;
        }

        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedButton(focusedIndex - 1, true);
            return;
        }

        if (e.key === 'Tab') {
            e.preventDefault();
            if (e.shiftKey) {
                setSelectedButton(focusedIndex - 1, true);
            } else {
                setSelectedButton(focusedIndex + 1, true);
            }
            return;
        }

        if (e.key === 'Enter') {
            e.preventDefault();
            if (buttons[focusedIndex]) {
                buttons[focusedIndex].click();
            }
            return;
        }
    });

    window.openAccentPdfModal = openModal;
}

// Authentic 3D VHS Cassette Tape: Flip interaction, Pointer-tilt, and Click Centering Focus for Hero
function initTapeTilt() {
    const hero = document.querySelector('.hero');
    const heroRight = document.querySelector('.hero-right');
    const heroFloatingImg = document.querySelector('.hero-floating-img');
    const card = document.querySelector('.hero .hero-card');
    if (!card || !heroFloatingImg) return;

    let isFlipped = false;
    let isFlipping = false;
    let flipCount = 0;
    let isCentered = false;

    // 1. Create or bind the focus backdrop
    let backdrop = document.querySelector('.hero-tape-backdrop');
    if (!backdrop && hero) {
        backdrop = document.createElement('div');
        backdrop.className = 'hero-tape-backdrop';
        backdrop.setAttribute('aria-hidden', 'true');
        hero.appendChild(backdrop);
    }

    const computeAndApplyCenter = () => {
        if (!heroRight) return;

        if (window.innerWidth <= 900) {
            heroFloatingImg.style.transform = 'scale(1.12)';
            heroFloatingImg.style.zIndex = '999';
            heroFloatingImg.classList.add('is-centered');
            if (hero) hero.classList.add('tape-focused');
            return;
        }

        const rightRect = heroRight.getBoundingClientRect();
        const restingCenterX = rightRect.left + rightRect.width / 2;
        const restingCenterY = rightRect.top + rightRect.height / 2;

        const screenCenterX = window.innerWidth / 2;
        const screenCenterY = window.innerHeight / 2;

        const deltaX = Math.round(screenCenterX - restingCenterX);
        const deltaY = Math.round(screenCenterY - restingCenterY);

        heroFloatingImg.style.transform = `translate3d(${deltaX}px, ${deltaY}px, 0) scale(1.3)`;
        heroFloatingImg.style.zIndex = '999';
        heroFloatingImg.classList.add('is-centered');
        if (hero) hero.classList.add('tape-focused');
        heroRight.style.zIndex = '999';
    };

    const enterFocus = () => {
        if (isCentered) return;
        isCentered = true;
        computeAndApplyCenter();
    };

    const exitFocus = () => {
        if (!isCentered) return;
        isCentered = false;

        heroFloatingImg.style.transform = '';
        heroFloatingImg.style.zIndex = '';
        heroFloatingImg.classList.remove('is-centered');
        if (hero) hero.classList.remove('tape-focused');
        if (heroRight) heroRight.style.zIndex = '';
    };

    const doFlip = () => {
        flipCount++;
        isFlipped = !isFlipped;
        isFlipping = true;
        card.classList.toggle('is-flipped', isFlipped);
        card.setAttribute('aria-pressed', isFlipped ? 'true' : 'false');

        // Temporarily pause tilt transform during 3D flip for maximum cinematic smoothness
        card.classList.remove('tilting');

        // On 3rd flip: trigger the Center Screen Accent Modal (no glow per user request)
        if (flipCount >= 3) {
            if (typeof window.openAccentPdfModal === 'function') {
                window.openAccentPdfModal();
            }
        }

        setTimeout(() => {
            isFlipping = false;
        }, 850);
    };

    // Click trigger: Enlarge immediately on first click + flip 180deg
    // "خلاص خليها اول ما اضغط على الشريط يكبر، دا غير عدد مرات اللف"
    card.addEventListener('click', (e) => {
        e.stopPropagation();

        // 1. Immediately center and enlarge if not already centered
        if (!isCentered) {
            enterFocus();
        }

        // 2. Flip the cassette tape in 3D (flip count tracked separately for 3x modal)
        doFlip();
    });

    card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (!isCentered) {
                enterFocus();
            }
            doFlip();
        }
    });

    // Close / return to resting place when clicking backdrop or outside
    if (backdrop) {
        backdrop.addEventListener('click', (e) => {
            e.stopPropagation();
            exitFocus();
        });
    }

    document.addEventListener('click', (e) => {
        if (isCentered && !heroFloatingImg.contains(e.target)) {
            exitFocus();
        }
    });

    // Close on Escape key
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isCentered) {
            exitFocus();
        }
    });

    // Close on page scroll
    window.addEventListener('scroll', () => {
        if (isCentered) {
            exitFocus();
        }
    }, { passive: true });

    // Recompute on window resize while centered
    window.addEventListener('resize', () => {
        if (isCentered) {
            computeAndApplyCenter();
        }
    }, { passive: true });

    // 3D Pointer-tilt physics on the tape face
    const BASE_Y = -17;
    const BASE_X = 5;
    const BASE_Z = -2;

    card.addEventListener('mouseenter', () => {
        if (!isFlipping) card.classList.add('tilting');
    });

    card.addEventListener('mousemove', (event) => {
        if (isFlipping) return;
        const rect = card.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width - 0.5;
        const y = (event.clientY - rect.top) / rect.height - 0.5;

        card.style.transform =
            `rotateY(${BASE_Y + x * 26}deg) rotateX(${BASE_X - y * 18}deg) rotateZ(${BASE_Z}deg)`;
    });

    card.addEventListener('mouseleave', () => {
        card.classList.remove('tilting');
        if (!isFlipping) {
            card.style.transform = '';
        }
    });
}


// Arc-Style Infinite Vertical Reel & Collision Avoidance / Repulsion Scroll for INFO
function initInfoReelScroll() {
    const container = document.querySelector('.vhs-about');
    const reel = document.getElementById('vhsAboutReel');
    if (!container || !reel) return;

    const sleeve = container.querySelector('.vhs-sleeve');
    const tapeCard = container.querySelector('.vhs-about-tape');
    const inner3d = tapeCard ? tapeCard.querySelector('.cassette-3d') : null;
    const firstLoop = reel.querySelector('.vhs-about-loop');
    if (!firstLoop) return;

    // Clone the primary loop twice to create 3 seamless infinite loops
    // (Loops 2 & 3 marked as copies with aria-hidden="true" and inert for accessibility)
    const existingCopies = reel.querySelectorAll('.vhs-about-loop.is-copy');
    if (!existingCopies.length) {
        for (let i = 0; i < 2; i++) {
            const clone = firstLoop.cloneNode(true);
            clone.classList.add('is-copy');
            clone.setAttribute('aria-hidden', 'true');
            clone.setAttribute('inert', '');
            reel.appendChild(clone);
        }
    }

    let currentScroll = 0;
    let targetScroll = 0;
    let velocity = 0;

    // Continuous 3D Tape Rotation & Flip-on-scroll physics
    let currentTapeAngle = 0;
    let targetTapeAngle = 0;
    let tapeVelocity = 0;
    let settleTimer = null;

    let animFrame = null;
    let lastTime = performance.now();
    let loopHeight = 1;
    let lineItems = [];
    let tapeBox = { left: 0, right: 0, top: 0, width: 0, height: 0 };

    // Tape click / keyboard flip
    let infoFlipCount = 0;
    const doInfoFlip = () => {
        infoFlipCount++;
        window.clearTimeout(settleTimer);
        targetTapeAngle = 180 * Math.round((targetTapeAngle + 180) / 180);
        startAnimation();

        // On 3rd flip: trigger the Center Screen Accent Modal (matches Hero cassette)
        if (infoFlipCount >= 3) {
            if (typeof window.openAccentPdfModal === 'function') {
                window.openAccentPdfModal();
            }
        }
    };

    if (tapeCard) {
        tapeCard.addEventListener('click', () => {
            doInfoFlip();
        });

        tapeCard.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                doInfoFlip();
            }
        });

        // Fine pointer tilt on mousemove
        const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (finePointer && !reduced) {
            const BASE_Y = -17;
            const BASE_X = 5;
            const BASE_Z = -2;

            tapeCard.addEventListener('mousemove', (event) => {
                const rect = tapeCard.getBoundingClientRect();
                const x = (event.clientX - rect.left) / rect.width - 0.5;
                const y = (event.clientY - rect.top) / rect.height - 0.5;
                tapeCard.style.transform = `rotateY(${BASE_Y + x * 22}deg) rotateX(${BASE_X - y * 16}deg) rotateZ(${BASE_Z}deg)`;
            });

            tapeCard.addEventListener('mouseleave', () => {
                tapeCard.style.transform = `rotateY(${BASE_Y}deg) rotateX(${BASE_X}deg) rotateZ(${BASE_Z}deg)`;
            });
        }
    }

    // Critically-damped spring integration (exact formula from decompiled Arc engine)
    const springTo = (current, vel, target, dt, damping = 8.5) => {
        const offset = current - target;
        const decay = Math.exp(-damping * dt);
        const temp = vel + damping * offset;
        return {
            x: target + (offset + temp * dt) * decay,
            v: (vel - temp * damping * dt) * decay
        };
    };

    const smooth = (x) => x * x * (3 - 2 * x);

    const recalculate = () => {
        reel.style.transform = '';
        const lines = [...reel.querySelectorAll('.vhs-about-line')];
        lines.forEach((el) => {
            el.style.transform = '';
        });

        const containerRect = container.getBoundingClientRect();
        if (!containerRect.height) return;

        const tapeRect = tapeCard ? tapeCard.getBoundingClientRect() : (sleeve ? sleeve.getBoundingClientRect() : null);
        if (tapeRect && tapeRect.width > 0) {
            tapeBox = {
                left: tapeRect.left - containerRect.left,
                right: tapeRect.right - containerRect.left,
                top: tapeRect.top - containerRect.top,
                width: tapeRect.width,
                height: tapeRect.height
            };
        } else {
            const cx = containerRect.width / 2;
            const cy = containerRect.height / 2;
            const tw = Math.min(360, containerRect.width * 0.26);
            const th = tw * 1.38;
            tapeBox = {
                left: cx - tw / 2,
                right: cx + tw / 2,
                top: cy - th / 2,
                width: tw,
                height: th
            };
        }

        const loopEl = reel.querySelector('.vhs-about-loop');
        loopHeight = loopEl ? loopEl.offsetHeight : 1;

        lineItems = lines.map((el) => {
            const r = el.getBoundingClientRect();
            const sideEl = el.closest('[data-side]');
            return {
                el,
                initialX: r.left - containerRect.left,
                initialY: r.top - containerRect.top,
                w: r.width,
                h: r.height,
                isLeft: sideEl ? sideEl.getAttribute('data-side') === 'left' : false
            };
        });

        renderFrame();
    };

    const renderFrame = () => {
        if (!loopHeight) return;

        // Modulo arithmetic for infinite vertical looping
        const t = (currentScroll % loopHeight + loopHeight) % loopHeight;
        reel.style.transform = `translate3d(-50%, ${-t}px, 0)`;

        // Apply 3D spinning rotation to the cassette
        if (inner3d) {
            inner3d.style.transform = `rotateY(${currentTapeAngle.toFixed(2)}deg)`;
            inner3d.style.transition = 'none';
        }

        if (!lineItems.length) return;

        const tapeCenterY = tapeBox.top + tapeBox.height / 2;
        const halfH = tapeBox.height / 2;
        const feather = tapeBox.height * 0.26;
        const gap = Math.max(22, tapeBox.width * 0.08);

        // Repulsion physics: dynamic parting of text lines around the VHS tape
        for (let i = 0; i < lineItems.length; i++) {
            const item = lineItems[i];
            const lineCenterY = item.initialY - t + item.h / 2;
            const distY = Math.abs(lineCenterY - tapeCenterY);

            const s = smooth(Math.min(1, Math.max(0, (halfH + feather - distY) / feather)));

            if (s > 0.001) {
                const targetX = item.isLeft ? (tapeBox.left - gap - item.w) : (tapeBox.right + gap);
                const shiftX = (targetX - item.initialX) * s;
                item.el.style.transform = `translate3d(${shiftX.toFixed(1)}px, 0, 0)`;
            } else if (item.el.style.transform) {
                item.el.style.transform = '';
            }
        }
    };

    const updatePhysics = (now) => {
        const dt = Math.min(0.08, (now - lastTime) / 1000);
        lastTime = now;

        const res = springTo(currentScroll, velocity, targetScroll, dt, 8.5);
        currentScroll = res.x;
        velocity = res.v;

        const resTape = springTo(currentTapeAngle, tapeVelocity, targetTapeAngle, dt, 7.5);
        currentTapeAngle = resTape.x;
        tapeVelocity = resTape.v;

        if (Math.abs(targetScroll - currentScroll) < 0.1 && Math.abs(velocity) < 0.8) {
            currentScroll = targetScroll;
            velocity = 0;
        }

        if (Math.abs(targetTapeAngle - currentTapeAngle) < 0.1 && Math.abs(tapeVelocity) < 0.5) {
            currentTapeAngle = targetTapeAngle;
            tapeVelocity = 0;
        }

        renderFrame();

        const isStillScrolling = currentScroll !== targetScroll || Math.abs(velocity) > 0.02;
        const isStillSpinning = currentTapeAngle !== targetTapeAngle || Math.abs(tapeVelocity) > 0.02;

        if (isStillScrolling || isStillSpinning) {
            animFrame = requestAnimationFrame(updatePhysics);
        } else {
            animFrame = null;
        }
    };

    const startAnimation = () => {
        if (!animFrame) {
            lastTime = performance.now();
            animFrame = requestAnimationFrame(updatePhysics);
        }
    };

    const addScrollDelta = (delta) => {
        targetScroll += delta;

        // Flip/spin the tape in 3D with the scroll
        targetTapeAngle += delta * 0.45;
        window.clearTimeout(settleTimer);
        settleTimer = window.setTimeout(() => {
            // Once scrolling stops, settle cleanly to the nearest 180deg face
            targetTapeAngle = 180 * Math.round(targetTapeAngle / 180);
            startAnimation();
        }, 180);

        startAnimation();
    };

    const isAboutActive = () => container.classList.contains('is-visible');

    // Wheel input
    window.addEventListener('wheel', (e) => {
        if (!isAboutActive()) return;
        const delta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
        const amount = e.deltaMode === 1 ? delta * 16 : delta;
        addScrollDelta(amount * 0.9);
    }, { passive: true });

    // Touch input with momentum
    let touchStartY = null;
    let touchVel = 0;
    let touchLastT = 0;

    window.addEventListener('touchstart', (e) => {
        if (!isAboutActive() || !e.touches[0]) return;
        touchStartY = e.touches[0].clientY;
        touchVel = 0;
        touchLastT = performance.now();
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
        if (!isAboutActive() || touchStartY === null || !e.touches[0]) return;
        const y = e.touches[0].clientY;
        const dy = touchStartY - y;
        const now = performance.now();
        const dt = Math.max(8, now - touchLastT);
        touchVel = 0.6 * touchVel + (dy / dt) * 380;
        touchLastT = now;
        touchStartY = y;
        addScrollDelta(dy * 1.15);
    }, { passive: true });

    window.addEventListener('touchend', () => {
        if (!isAboutActive() || touchStartY === null) return;
        if (performance.now() - touchLastT < 90) {
            addScrollDelta(touchVel * 0.32);
        }
        touchStartY = null;
    }, { passive: true });

    // Pointer drag input on background
    let isDragging = false;
    let dragLastY = 0;
    let dragVel = 0;
    let dragLastT = 0;

    container.addEventListener('pointerdown', (e) => {
        if (!isAboutActive() || e.button > 0) return;
        if (e.target.closest('a, button, .hero-card')) return;
        isDragging = true;
        dragLastY = e.clientY;
        dragVel = 0;
        dragLastT = performance.now();
        if (container.setPointerCapture) {
            try { container.setPointerCapture(e.pointerId); } catch (_) {}
        }
    });

    window.addEventListener('pointermove', (e) => {
        if (!isDragging) return;
        const y = e.clientY;
        const dy = dragLastY - y;
        const now = performance.now();
        const dt = Math.max(8, now - dragLastT);
        dragVel = 0.6 * dragVel + (dy / dt) * 380;
        dragLastT = now;
        dragLastY = y;
        addScrollDelta(dy * 1.25);
    });

    const stopDrag = () => {
        if (!isDragging) return;
        isDragging = false;
        if (performance.now() - dragLastT < 90) {
            addScrollDelta(dragVel * 0.32);
        }
    };

    window.addEventListener('pointerup', stopDrag);
    window.addEventListener('pointercancel', stopDrag);

    // Recompute metrics when view changes or resizes
    window.addEventListener('viewchange', (e) => {
        if (e.detail?.view === 'about') {
            setTimeout(recalculate, 30);
            setTimeout(recalculate, 200);
            setTimeout(recalculate, 500);
        } else if (animFrame) {
            cancelAnimationFrame(animFrame);
            animFrame = null;
        }
    });

    let resizeTimer = null;
    window.addEventListener('resize', () => {
        if (!isAboutActive()) return;
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(recalculate, 60);
    });

    if ('ResizeObserver' in window) {
        new ResizeObserver(() => {
            if (isAboutActive()) recalculate();
        }).observe(container);
    }

    if (document.fonts?.ready) {
        document.fonts.ready.then(() => {
            if (isAboutActive()) recalculate();
        }).catch(() => {});
    }

    // Initial measurement
    setTimeout(recalculate, 100);
}


// The headline types itself out with an authentic typewriter blinking dash cursor (_)
// and automatically rotates through 6 punchy editorial statements every 5 seconds.
function initTypewriter() {
    const lines = [...document.querySelectorAll('.display-title .blur-line')];
    const titleEl = document.querySelector('.display-title');
    if (!lines.length) return;

    const PHRASES = [
        ["DESIGN", "THAT FEELS", "ALIVE."],
        ["VISUALS", "THAT COMMAND", "ATTENTION."],
        ["CRAFTED", "WITH PURE", "PRECISION."],
        ["SHAPING", "BRANDS THAT", "STAND OUT."],
        ["IDEAS", "BROUGHT INTO", "FOCUS."],
        ["STORIES", "TOLD THROUGH", "MOTION."]
    ];

    const HOLD_DELAY = 5000; // 5 seconds per phrase
    const TYPE_SPEED = 45;   // typing cadence
    const DELETE_SPEED = 22; // backspacing cadence
    const LINE_PAUSE = 120;  // pause when switching lines

    let currentPhraseIndex = 0;
    let typeTimeout = null;
    let isPaused = false;
    let lineIndex = 0;
    let charIndex = 0;

    // Create the authentic typewriter blinking dash cursor element (_)
    const cursor = document.createElement('span');
    cursor.className = 'type-cursor';
    cursor.setAttribute('aria-hidden', 'true');
    cursor.textContent = '_';

    // Lock exact dimensions with visible and ghost spans
    const lineElements = lines.map((line) => {
        line.classList.add('visible');
        line.textContent = '';
        const visibleSpan = document.createElement('span');
        visibleSpan.className = 'type-visible';
        const ghostSpan = document.createElement('span');
        ghostSpan.className = 'type-ghost';
        ghostSpan.setAttribute('aria-hidden', 'true');
        line.appendChild(visibleSpan);
        line.appendChild(ghostSpan);
        return {
            line,
            visible: visibleSpan,
            ghost: ghostSpan,
            targetText: ''
        };
    });

    const setPhrase = (index) => {
        currentPhraseIndex = index % PHRASES.length;
        const phrase = PHRASES[currentPhraseIndex];
        if (titleEl) {
            titleEl.setAttribute('aria-label', phrase.join(' '));
        }
        lineElements.forEach((item, i) => {
            item.targetText = phrase[i] || '';
            item.visible.textContent = '';
            item.ghost.textContent = item.targetText;
        });
    };

    const clearActiveTimeout = () => {
        if (typeTimeout) {
            clearTimeout(typeTimeout);
            typeTimeout = null;
        }
    };

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const cycleInstantly = () => {
            if (isPaused) return;
            setPhrase(currentPhraseIndex);
            lineElements.forEach((item) => {
                item.visible.textContent = item.targetText;
                item.ghost.textContent = '';
            });
            typeTimeout = setTimeout(() => {
                currentPhraseIndex = (currentPhraseIndex + 1) % PHRASES.length;
                cycleInstantly();
            }, HOLD_DELAY);
        };
        cycleInstantly();
        window.typewriterController = {
            start: () => {
                clearActiveTimeout();
                isPaused = false;
                cycleInstantly();
            },
            pause: () => {
                clearActiveTimeout();
                isPaused = true;
            },
            resume: () => {
                if (isPaused) {
                    isPaused = false;
                    cycleInstantly();
                }
            }
        };
        return;
    }

    setPhrase(0);

    const typeForward = () => {
        if (isPaused) return;

        if (lineIndex >= lineElements.length) {
            // Typing complete: hold for 5 seconds before deleting
            const last = lineElements[lineElements.length - 1];
            if (last) {
                last.ghost.textContent = '';
                if (cursor.parentElement !== last.line) {
                    last.line.appendChild(cursor);
                }
            }
            typeTimeout = setTimeout(startDelete, HOLD_DELAY);
            return;
        }

        const current = lineElements[lineIndex];

        if (cursor.parentElement !== current.line) {
            current.line.insertBefore(cursor, current.ghost);
        }

        charIndex += 1;
        current.visible.textContent = current.targetText.slice(0, charIndex);
        current.ghost.textContent = current.targetText.slice(charIndex);

        if (charIndex < current.targetText.length) {
            typeTimeout = setTimeout(typeForward, TYPE_SPEED);
        } else {
            lineIndex += 1;
            charIndex = 0;
            typeTimeout = setTimeout(() => {
                if (lineIndex < lineElements.length) {
                    const next = lineElements[lineIndex];
                    next.line.insertBefore(cursor, next.ghost);
                }
                typeTimeout = setTimeout(typeForward, LINE_PAUSE);
            }, LINE_PAUSE);
        }
    };

    const typeBackward = () => {
        if (isPaused) return;

        if (lineIndex < 0) {
            // Erase complete: pause slightly, advance phrase, then type
            typeTimeout = setTimeout(() => {
                setPhrase(currentPhraseIndex + 1);
                startType(0, false);
            }, 260);
            return;
        }

        const current = lineElements[lineIndex];

        if (cursor.parentElement !== current.line) {
            current.line.insertBefore(cursor, current.ghost);
        }

        charIndex -= 1;
        current.visible.textContent = current.targetText.slice(0, Math.max(0, charIndex));
        current.ghost.textContent = current.targetText.slice(Math.max(0, charIndex));

        if (charIndex > 0) {
            typeTimeout = setTimeout(typeBackward, DELETE_SPEED);
        } else {
            lineIndex -= 1;
            if (lineIndex >= 0) {
                charIndex = lineElements[lineIndex].targetText.length;
                typeTimeout = setTimeout(typeBackward, 40);
            } else {
                typeTimeout = setTimeout(typeBackward, 40);
            }
        }
    };

    const startDelete = () => {
        clearActiveTimeout();
        lineIndex = lineElements.length - 1;
        charIndex = lineElements[lineIndex] ? lineElements[lineIndex].targetText.length : 0;
        typeBackward();
    };

    const startType = (delay = 0, resetCurrent = true) => {
        clearActiveTimeout();
        isPaused = false;

        if (resetCurrent) {
            setPhrase(currentPhraseIndex);
        } else {
            lineElements.forEach((item) => {
                item.visible.textContent = '';
                item.ghost.textContent = item.targetText;
            });
        }

        if (lineElements[0]) {
            lineElements[0].line.insertBefore(cursor, lineElements[0].ghost);
        }

        lineIndex = 0;
        charIndex = 0;

        if (delay > 0) {
            typeTimeout = setTimeout(typeForward, delay);
        } else {
            typeForward();
        }
    };

    window.typewriterController = {
        start: (delay = 0) => startType(delay, true),
        pause: () => {
            clearActiveTimeout();
            isPaused = true;
        },
        resume: () => {
            if (isPaused) {
                isPaused = false;
                startType(100, true);
            }
        }
    };

    // Initial page load typing (after loader animation)
    startType(1450, false);
}

// Initialize loader immediately
initLoader();
initCustomCursor();

// DOM Content Loaded
document.addEventListener('DOMContentLoaded', () => {
    renderServices();
    renderClients();
    initGlitch();
    initServices();
    initReveal();
    initTypewriter();
    initHeroParallax();
    initLightbox();
    initTilt3D();
    initMobileMenu();
    initTapeTilt();
    initAccentModal();
    initInfoReelScroll();
    initHudClock();
    initVhsSourceDetector();
    initSectionViews();
});
