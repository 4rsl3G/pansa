const LS_KEY = "panstream_continue_v1";
const LS_AUTONEXT = "panstream_autonext_v1";

function formatTime(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function showOverlay() {
  const el = document.getElementById("pageOverlay");
  if (!el) return;
  el.style.display = "block";
  if (window.gsap) gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.15 });
}
function hideOverlay() {
  const el = document.getElementById("pageOverlay");
  if (!el) return;
  if (window.gsap) {
    gsap.to(el, { opacity: 0, duration: 0.18, onComplete: () => (el.style.display = "none") });
  } else el.style.display = "none";
}

function initAOS() {
  if (!window.AOS) return;
  AOS.init({ once: true, duration: 650, easing: "ease-out-cubic", offset: 36 });
}

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
  }, { rootMargin: "240px" });

  imgs.forEach((img) => io.observe(img));
}

function initGlobalUI() {
  $("#btnPulse").off("click").on("click", () => {
    const el = document.querySelector("header");
    if (!el || !window.gsap) return;
    gsap.fromTo(el, { boxShadow: "0 0 0 rgba(255,255,255,0)" }, { boxShadow: "0 0 50px rgba(255,255,255,.10)", duration: 0.45, yoyo: true, repeat: 1 });
  });
}

/* Continue Watching */
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
function clearContinue() { localStorage.removeItem(LS_KEY); }

function initContinueHome() {
  const wrap = document.getElementById("continueRow");
  const grid = document.getElementById("continueCards");
  const skel = document.getElementById("continueSkeleton");
  const btnClear = document.getElementById("btnClearContinue");
  if (!wrap || !grid || !skel) return;

  wrap.classList.add("hidden");
  skel.classList.remove("hidden");

  const list = loadContinue().filter(x => x && x.code);
  if (!list.length) {
    skel.classList.add("hidden");
    return;
  }

  grid.innerHTML = list.slice(0, 8).map((x) => {
    const pct = x.duration ? Math.min(100, Math.round((x.time / x.duration) * 100)) : 0;
    const href = `/watch/${x.code}/${x.ep}?lang=${encodeURIComponent(x.lang || "en")}&cover=${encodeURIComponent(x.cover||"")}&name=${encodeURIComponent(x.title||"")}`;
    return `
      <a href="${href}" class="vCard card" style="box-shadow:var(--glow); border-radius:20px; overflow:hidden;">
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

  skel.classList.add("hidden");
  wrap.classList.remove("hidden");
  initLazyImages(wrap);

  btnClear?.addEventListener("click", () => {
    clearContinue();
    wrap.classList.add("hidden");
    skel.classList.add("hidden");
  });
}

/* PLAYER (watch page) */
function initWatchPlayer() {
  const data = window.__PS__;
  if (!data) return;

  const v = document.getElementById("psVideo");
  const loading = document.getElementById("playerLoading");
  const tapOverlay = document.getElementById("tapOverlay");
  const bigPlay = document.getElementById("bigPlay");

  const tCur = document.getElementById("tCur");
  const tDur = document.getElementById("tDur");
  const seek = document.getElementById("seek");
  const btnPlay = document.getElementById("btnPlay");
  const btnMute = document.getElementById("btnMute");
  const vol = document.getElementById("vol");
  const quality = document.getElementById("quality");
  const btnFull = document.getElementById("btnFull");
  const btnNext = document.getElementById("btnNext");
  const btnReattach = document.getElementById("btnReattach");
  const btnNextLink = document.getElementById("btnNextLink");
  const toggleAutoNext = document.getElementById("toggleAutoNext");
  const autoState = document.getElementById("autoState");

  let hls = null;
  let duration = 0;
  let isSeeking = false;

  const initialAuto = (localStorage.getItem(LS_AUTONEXT) ?? "on") === "on";
  let autoNext = initialAuto;
  autoState.textContent = autoNext ? "ON" : "OFF";

  function setLoading(on) {
    if (!loading) return;
    loading.style.display = on ? "grid" : "none";
  }

  function pickSrc(q) {
    if (q === "1080") return data.src1080 || data.src720 || data.src480;
    if (q === "480") return data.src480 || data.src720 || data.src1080;
    return data.src720 || data.src1080 || data.src480;
  }

  function destroyHls() {
    if (hls) {
      try { hls.destroy(); } catch {}
      hls = null;
    }
  }

  function attach(q = "720") {
    destroyHls();
    setLoading(true);

    const src = pickSrc(q);
    if (!src) {
      setLoading(false);
      return;
    }

    // Safari iOS can play native HLS
    if (v.canPlayType("application/vnd.apple.mpegurl")) {
      v.src = src;
      v.load();
      setTimeout(() => setLoading(false), 450);
      return;
    }

    if (window.Hls && Hls.isSupported()) {
      hls = new Hls({ enableWorker: true });
      hls.loadSource(src);
      hls.attachMedia(v);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setLoading(false);
      });
      hls.on(Hls.Events.ERROR, () => {
        setLoading(false);
      });
    } else {
      v.src = src;
      v.load();
      setTimeout(() => setLoading(false), 450);
    }
  }

  function setPlayIcon() {
    if (!btnPlay) return;
    btnPlay.innerHTML = v.paused ? '<i class="ri-play-fill"></i>' : '<i class="ri-pause-fill"></i>';
    if (tapOverlay) tapOverlay.style.display = v.paused ? "grid" : "none";
  }

  function saveProgress() {
    const t = v.currentTime || 0;
    const d = duration || v.duration || 0;

    upsertContinue({
      lang: data.lang,
      code: data.code,
      ep: data.ep,
      title: data.title,
      cover: data.cover,
      time: t,
      duration: d
    });
  }

  // controls
  btnPlay?.addEventListener("click", async () => {
    if (v.paused) { await v.play().catch(()=>{}); }
    else v.pause();
    setPlayIcon();
  });

  bigPlay?.addEventListener("click", async () => {
    setLoading(false);
    await v.play().catch(()=>{});
    setPlayIcon();
  });

  btnMute?.addEventListener("click", () => {
    v.muted = !v.muted;
    btnMute.innerHTML = v.muted ? '<i class="ri-volume-mute-line"></i>' : '<i class="ri-volume-up-line"></i>';
  });

  vol?.addEventListener("input", () => {
    v.volume = Number(vol.value || 1);
    v.muted = false;
    btnMute.innerHTML = '<i class="ri-volume-up-line"></i>';
  });

  quality?.addEventListener("change", () => {
    const q = quality.value;
    const keep = v.currentTime || 0;
    const wasPlaying = !v.paused;
    attach(q);
    v.currentTime = keep;
    if (wasPlaying) v.play().catch(()=>{});
  });

  btnFull?.addEventListener("click", async () => {
    try {
      if (v.requestFullscreen) await v.requestFullscreen();
      else if (v.webkitEnterFullscreen) v.webkitEnterFullscreen();
    } catch {}
  });

  btnNext?.addEventListener("click", () => {
    if (btnNextLink?.href) location.href = btnNextLink.href;
  });

  btnReattach?.addEventListener("click", () => {
    attach(quality?.value || "720");
  });

  toggleAutoNext?.addEventListener("click", () => {
    autoNext = !autoNext;
    autoState.textContent = autoNext ? "ON" : "OFF";
    localStorage.setItem(LS_AUTONEXT, autoNext ? "on" : "off");
  });

  // seek
  seek?.addEventListener("input", () => {
    isSeeking = true;
  });
  seek?.addEventListener("change", () => {
    const val = Number(seek.value || 0) / 1000;
    if (duration > 0) v.currentTime = val * duration;
    isSeeking = false;
  });

  // video events
  v.addEventListener("loadstart", () => setLoading(true));
  v.addEventListener("waiting", () => setLoading(true));
  v.addEventListener("playing", () => setLoading(false));
  v.addEventListener("canplay", () => setLoading(false));

  v.addEventListener("loadedmetadata", () => {
    duration = v.duration || 0;
    tDur.textContent = formatTime(duration);
  });

  v.addEventListener("timeupdate", () => {
    const cur = v.currentTime || 0;
    if (!isSeeking && duration > 0) seek.value = String(Math.floor((cur / duration) * 1000));
    tCur.textContent = formatTime(cur);

    // save progress throttled
    if ((Math.floor(cur) % 3) === 0) saveProgress();
  });

  v.addEventListener("pause", () => { setPlayIcon(); saveProgress(); });
  v.addEventListener("play", () => setPlayIcon());

  v.addEventListener("ended", () => {
    saveProgress();
    if (!autoNext) return;
    // auto next episode
    if (data.total && data.ep < data.total && btnNextLink?.href) {
      location.href = btnNextLink.href;
    }
  });

  // attach start
  attach("720");
  setPlayIcon();

  // restore progress if exists
  const list = loadContinue();
  const found = list.find(x => String(x.code) === String(data.code) && Number(x.ep) === Number(data.ep));
  if (found && found.time && found.time > 5) {
    // wait a bit
    setTimeout(() => { try { v.currentTime = Math.min(found.time, (found.duration||999999)-1); } catch {} }, 900);
  }
}

/* Barba transitions + overlay */
function initBarba() {
  if (!window.barba) return;
  barba.init({
    transitions: [{
      async leave(data) {
        showOverlay();
        if (window.gsap) await gsap.to(data.current.container, { opacity: 0, y: -8, duration: 0.18, ease: "power2.in" });
      },
      enter(data) {
        if (window.gsap) gsap.fromTo(data.next.container, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.26, ease: "power2.out" });
      },
      afterEnter() {
        hideOverlay();
        initAOS();
        initGlobalUI();
        initLazyImages(document);
        initContinueHome();
        initWatchPlayer();
        if (window.AOS) AOS.refreshHard();
        window.scrollTo({ top: 0, behavior: "instant" });
      }
    }]
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initAOS();
  initGlobalUI();
  initLazyImages(document);
  initContinueHome();
  initWatchPlayer();
  initBarba();
});
