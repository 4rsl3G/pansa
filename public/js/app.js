/* ---------------- utils ---------------- */
const LS_KEY = "panstream_continue_v1";

function formatTime(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function throttle(fn, ms) {
  let t = 0;
  return (...args) => {
    const n = Date.now();
    if (n - t > ms) { t = n; fn(...args); }
  };
}

/* ---------------- overlay ---------------- */
function showOverlay() {
  const el = document.getElementById("pageOverlay");
  if (!el) return;
  el.style.display = "block";
  gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.15 });
}
function hideOverlay() {
  const el = document.getElementById("pageOverlay");
  if (!el) return;
  gsap.to(el, { opacity: 0, duration: 0.18, onComplete: () => (el.style.display = "none") });
}

/* ---------------- AOS ---------------- */
function initAOS() {
  AOS.init({ once: true, duration: 700, easing: "ease-out-cubic", offset: 40 });
}

/* ---------------- lazy images ---------------- */
function initLazyImages(scope = document) {
  const imgs = [...scope.querySelectorAll("img[data-lazy='true']")];
  if (!imgs.length) return;

  const loadImg = (img) => {
    const src = img.getAttribute("data-src");
    if (!src) return;
    img.src = src;
    img.onload = () => img.classList.add("is-loaded");
    img.onerror = () => img.classList.add("is-loaded");
  };

  if (!("IntersectionObserver" in window)) {
    imgs.forEach(loadImg);
    return;
  }

  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      loadImg(e.target);
      io.unobserve(e.target);
    });
  }, { rootMargin: "220px" });

  imgs.forEach((img) => io.observe(img));
}

/* ---------------- micro UI ---------------- */
function initGlobalUI() {
  // Navbar pulse
  $("#btnPulse").off("click").on("click", () => {
    const el = document.querySelector("header");
    if (!el) return;
    gsap.fromTo(el, { boxShadow: "0 0 0 rgba(255,255,255,0)" }, { boxShadow: "0 0 50px rgba(255,255,255,.10)", duration: 0.45, yoyo: true, repeat: 1 });
  });

  // Parallax cards
  $(".card").off("mousemove").on("mousemove", function (e) {
    const r = this.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    gsap.to(this, {
      rotationY: px * 6,
      rotationX: -py * 6,
      transformPerspective: 800,
      duration: 0.25,
      ease: "power2.out"
    });
  }).off("mouseleave").on("mouseleave", function () {
    gsap.to(this, { rotationY: 0, rotationX: 0, duration: 0.35, ease: "power2.out" });
  });
}

/* ---------------- Continue Watching ---------------- */
function loadContinue() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); }
  catch { return []; }
}
function saveContinue(list) {
  localStorage.setItem(LS_KEY, JSON.stringify(list.slice(0, 50)));
}
function upsertContinue(entry) {
  const list = loadContinue();
  const idx = list.findIndex(x => String(x.code) === String(entry.code));
  const next = { ...entry, updatedAt: Date.now() };

  if (idx >= 0) list[idx] = { ...list[idx], ...next };
  else list.unshift(next);

  list.sort((a,b) => (b.updatedAt||0) - (a.updatedAt||0));
  saveContinue(list);
}
function clearContinue() {
  localStorage.removeItem(LS_KEY);
}

function initContinueHome() {
  const wrap = document.getElementById("continueRow");
  const grid = document.getElementById("continueCards");
  const skel = document.getElementById("continueSkeleton");
  const btnClear = document.getElementById("btnClearContinue");

  if (!wrap || !grid || !skel) return;

  // show skeleton first
  wrap.classList.add("hidden");
  skel.classList.remove("hidden");

  const list = loadContinue().filter(x => x && x.code);

  if (!list.length) {
    // hide skeleton, show nothing (or keep skeleton? we hide)
    skel.classList.add("hidden");
    return;
  }

  // build cards
  grid.innerHTML = list.slice(0, 8).map((x) => {
    const pct = x.duration ? Math.min(100, Math.round((x.time / x.duration) * 100)) : 0;
    const href = `/watch/${x.code}/${x.ep}?lang=${encodeURIComponent(x.lang || "en")}&cover=${encodeURIComponent(x.cover||"")}&name=${encodeURIComponent(x.title||"")}`;

    return `
      <a href="${href}" class="vCard card panel" style="box-shadow:var(--glow); border-radius:20px;">
        <div class="vPoster">
          <img data-src="${x.cover || ""}"
               src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="
               data-lazy="true" class="vPosterImg" alt="">
          <div class="vShade"></div>
          <div class="vMeta">
            <div class="vName line-clamp-2">${x.title || "Untitled"}</div>
            <div class="vMini"><span>EP ${x.ep}</span><span>${formatTime(x.time||0)}</span></div>
            <div style="margin-top:10px;height:6px;border-radius:999px;background:rgba(255,255,255,.18);overflow:hidden;">
              <div style="height:100%;width:${pct}%;background:rgba(255,255,255,.85)"></div>
            </div>
          </div>
        </div>
      </a>
    `;
  }).join("");

  // show list, hide skeleton
  skel.classList.add("hidden");
  wrap.classList.remove("hidden");
  initLazyImages(wrap);

  btnClear?.addEventListener("click", () => {
    clearContinue();
    wrap.classList.add("hidden");
    skel.classList.add("hidden");
  });
}

function initContinueTitle() {
  const box = document.getElementById("titleContinue");
  const meta = document.getElementById("titleContinueMeta");
  const btn = document.getElementById("titleContinueBtn");
  if (!box || !meta || !btn) return;

  const m = location.pathname.match(/\/t\/([^/]+)/);
  if (!m) return;
  const code = m[1];

  const list = loadContinue();
  const item = list.find(x => String(x.code) === String(code));
  if (!item) { box.classList.add("hidden"); return; }

  box.classList.remove("hidden");
  meta.textContent = `EP ${item.ep} • ${formatTime(item.time || 0)}`;
  btn.href = `/watch/${code}/${item.ep}?lang=${encodeURIComponent(item.lang||"en")}&cover=${encodeURIComponent(item.cover||"")}&name=${encodeURIComponent(item.title||"")}`;
}

/* ---------------- Vertical HLS Player ---------------- */
let hlsInstance = null;
let autoNext = true;

function destroyHls() {
  if (hlsInstance) {
    try { hlsInstance.destroy(); } catch {}
    hlsInstance = null;
  }
}

function initPlayer() {
  const W = window.__WATCH__;
  if (!W) return;

  const video = document.getElementById("video");
  const btnPlay = document.getElementById("btnPlay");
  const btnMute = document.getElementById("btnMute");
  const btnFS = document.getElementById("btnFS");
  const btnNext = document.getElementById("btnNext");
  const btnReattach = document.getElementById("btnReattach");
  const btnRetry = document.getElementById("btnRetry");

  const quality = document.getElementById("quality");
  const speed = document.getElementById("speed");
  const vol = document.getElementById("vol");

  const seekBar = document.getElementById("seekBar");
  const seekFill = document.getElementById("seekFill");
  const seekKnob = document.getElementById("seekKnob");
  const curTime = document.getElementById("curTime");
  const durTime = document.getElementById("durTime");

  const toggleAutoNext = document.getElementById("toggleAutoNext");

  const bufferOverlay = document.getElementById("bufferOverlay");

  const nextOverlay = document.getElementById("nextOverlay");
  const nextEpNum = document.getElementById("nextEpNum");
  const nextCountdown = document.getElementById("nextCountdown");
  const btnPlayNext = document.getElementById("btnPlayNext");
  const btnCancelNext = document.getElementById("btnCancelNext");

  if (!video) return;

  // controls fade on inactivity
  const controls = document.getElementById("controls");
  let hideTimer = null;
  const poke = () => {
    if (!controls) return;
    controls.style.opacity = "1";
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { controls.style.opacity = "0"; }, 2100);
  };
  document.getElementById("player")?.addEventListener("mousemove", poke, { passive: true });
  document.getElementById("player")?.addEventListener("touchstart", poke, { passive: true });
  document.getElementById("player")?.addEventListener("click", poke, { passive: true });
  poke();

  // restore progress
  const list = loadContinue();
  const existing = list.find(x => String(x.code) === String(W.code) && x.ep === W.ep);
  const resumeTime = existing ? (existing.time || 0) : 0;

  const map = { "1080": W.urls.v1080, "720": W.urls.v720, "480": W.urls.v480 };

  function showBuffer(msg = "Loading stream…", showRetry = false) {
    if (!bufferOverlay) return;
    bufferOverlay.classList.remove("hidden");
    bufferOverlay.querySelector(".pBufferText").textContent = msg;
    if (btnRetry) btnRetry.classList.toggle("hidden", !showRetry);
  }

  function hideBuffer() {
    if (!bufferOverlay) return;
    bufferOverlay.classList.add("hidden");
    if (btnRetry) btnRetry.classList.add("hidden");
  }

  function attach(url, startAt = 0) {
    if (!url) {
      showBuffer("No stream URL.", true);
      return;
    }
    showBuffer("Loading stream…", false);

    destroyHls();
    video.pause();
    video.removeAttribute("src");
    video.load();

    const seekAfter = () => {
      if (startAt > 1 && isFinite(startAt)) {
        try { video.currentTime = startAt; } catch {}
      }
    };

    // iOS safari can play m3u8 directly
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      video.onloadedmetadata = () => {
        seekAfter();
        video.play().catch(() => {});
      };
      return;
    }

    if (window.Hls && Hls.isSupported()) {
      hlsInstance = new Hls({ enableWorker: true, lowLatencyMode: true });
      hlsInstance.loadSource(url);
      hlsInstance.attachMedia(video);

      hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
        seekAfter();
        video.play().catch(() => {});
      });

      hlsInstance.on(Hls.Events.ERROR, (_, data) => {
        // show retry on fatal
        if (data?.fatal) {
          showBuffer("Stream error. Tap retry.", true);
        }
      });
    } else {
      showBuffer("HLS not supported in this browser.", true);
    }
  }

  // initial attach
  attach(map[quality?.value || "720"], resumeTime);

  // buffering events
  video.addEventListener("waiting", () => showBuffer("Buffering…", false));
  video.addEventListener("stalled", () => showBuffer("Buffering…", false));
  video.addEventListener("playing", hideBuffer);
  video.addEventListener("canplay", hideBuffer);

  btnRetry?.addEventListener("click", () => {
    const t = video.currentTime || resumeTime || 0;
    attach(map[quality?.value || "720"], t);
  });

  // icons
  function setPlayIcon() {
    const ico = btnPlay?.querySelector("i");
    if (!ico) return;
    ico.className = video.paused ? "ri-play-fill" : "ri-pause-fill";
  }
  function setMuteIcon() {
    const ico = btnMute?.querySelector("i");
    if (!ico) return;
    ico.className = (video.muted || video.volume === 0) ? "ri-volume-mute-line" : "ri-volume-up-line";
  }

  btnPlay?.addEventListener("click", () => (video.paused ? video.play() : video.pause()));
  video.addEventListener("play", setPlayIcon);
  video.addEventListener("pause", setPlayIcon);

  btnMute?.addEventListener("click", () => { video.muted = !video.muted; setMuteIcon(); });
  vol?.addEventListener("input", () => { video.volume = Number(vol.value); video.muted = false; setMuteIcon(); });
  speed?.addEventListener("change", () => { video.playbackRate = Number(speed.value || 1); });

  // seek UI
  const updateUI = () => {
    const d = video.duration || 0;
    const c = video.currentTime || 0;
    if (curTime) curTime.textContent = formatTime(c);
    if (durTime) durTime.textContent = formatTime(d);

    const pct = d ? (c / d) : 0;
    const w = `${Math.round(pct * 100)}%`;
    if (seekFill) seekFill.style.width = w;
    if (seekKnob) seekKnob.style.left = w;
  };
  const raf = () => { updateUI(); requestAnimationFrame(raf); };
  requestAnimationFrame(raf);

  seekBar?.addEventListener("click", (e) => {
    const r = seekBar.getBoundingClientRect();
    const pct = (e.clientX - r.left) / r.width;
    video.currentTime = Math.max(0, (video.duration || 0) * pct);
  });

  // quality change keeps time
  quality?.addEventListener("change", () => {
    const t = video.currentTime || 0;
    attach(map[quality.value], t);
  });

  btnReattach?.addEventListener("click", () => {
    const t = video.currentTime || 0;
    attach(map[quality?.value || "720"], t);
  });

  // fullscreen
  btnFS?.addEventListener("click", () => {
    const el = document.getElementById("player");
    if (!document.fullscreenElement) el?.requestFullscreen?.();
    else document.exitFullscreen?.();
  });

  // auto next toggle
  toggleAutoNext?.addEventListener("click", () => {
    autoNext = !autoNext;
    toggleAutoNext.textContent = autoNext ? "ON" : "OFF";
  });

  function goNext() {
    const nextEp = Math.min(W.total || (W.ep + 1), W.ep + 1);
    if (nextEp === W.ep) return;
    const url = `/watch/${W.code}/${nextEp}?lang=${encodeURIComponent(W.lang||"en")}&cover=${encodeURIComponent(W.cover||"")}&name=${encodeURIComponent(W.title||"")}`;
    window.location.href = url; // Barba will animate
  }

  btnNext?.addEventListener("click", goNext);
  btnPlayNext?.addEventListener("click", goNext);
  btnCancelNext?.addEventListener("click", () => nextOverlay?.classList.add("hidden"));

  // ended -> next overlay
  video.addEventListener("ended", () => {
    if (!autoNext) return;
    if ((W.ep || 0) >= (W.total || 0)) return;

    nextEpNum.textContent = String(W.ep + 1);
    nextOverlay?.classList.remove("hidden");

    let s = 2;
    if (nextCountdown) nextCountdown.textContent = String(s);
    const timer = setInterval(() => {
      s -= 1;
      if (nextCountdown) nextCountdown.textContent = String(Math.max(0, s));
      if (s <= 0) {
        clearInterval(timer);
        if (!nextOverlay?.classList.contains("hidden")) goNext();
      }
    }, 1000);
  });

  // keyboard shortcuts
  window.onkeydown = (e) => {
    if (["INPUT","SELECT","TEXTAREA"].includes((e.target?.tagName || "").toUpperCase())) return;
    if (e.code === "Space") { e.preventDefault(); video.paused ? video.play() : video.pause(); }
    if (e.key === "m" || e.key === "M") { video.muted = !video.muted; setMuteIcon(); }
    if (e.key === "f" || e.key === "F") btnFS?.click();
    if (e.key === "ArrowRight") video.currentTime += 5;
    if (e.key === "ArrowLeft") video.currentTime -= 5;
  };

  // save progress
  const saveProgress = throttle(() => {
    const d = video.duration || 0;
    const t = video.currentTime || 0;
    upsertContinue({
      code: W.code,
      ep: W.ep,
      time: t,
      duration: d,
      title: W.title,
      cover: W.cover,
      lang: W.lang
    });
  }, 1200);

  video.addEventListener("timeupdate", saveProgress);
  video.addEventListener("pause", saveProgress);

  video.addEventListener("loadedmetadata", () => {
    setPlayIcon();
    setMuteIcon();
    if (vol) vol.value = String(video.volume || 1);
  });

  // cleanup on pjax leave (handled by barba hook below)
}

/* ---------------- Barba PJAX ---------------- */
function initBarba() {
  barba.init({
    transitions: [{
      async leave(data) {
        showOverlay();
        // destroy HLS when leaving watch page to prevent leaks
        if (window.__WATCH__) {
          destroyHls();
          window.__WATCH__ = null;
        }
        await gsap.to(data.current.container, { opacity: 0, y: -8, duration: 0.18, ease: "power2.in" });
      },
      enter(data) {
        gsap.fromTo(data.next.container, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.28, ease: "power2.out" });
      },
      afterEnter() {
        hideOverlay();
        initAOS();
        initGlobalUI();
        initLazyImages(document);
        initContinueHome();
        initContinueTitle();
        initPlayer();
        AOS.refreshHard();
        window.scrollTo({ top: 0, behavior: "instant" });
      }
    }]
  });
}

/* ---------------- boot ---------------- */
document.addEventListener("DOMContentLoaded", () => {
  initAOS();
  initGlobalUI();
  initLazyImages(document);
  initContinueHome();
  initContinueTitle();
  initPlayer();
  initBarba();
});
