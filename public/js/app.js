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
    gsap.fromTo(
      el,
      { boxShadow: "0 0 0 rgba(255,255,255,0)" },
      { boxShadow: "0 0 50px rgba(255,255,255,.10)", duration: 0.45, yoyo: true, repeat: 1 }
    );
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
  const idx = list.findIndex(x => String(x.code) === String(entry.code) && Number(x.ep) === Number(entry.ep));
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

/* WATCH PLAYER - jQuery load play URL (NO Hls.js) + DEBUG */
function initWatchPlayer() {
  const data = window.__PS__;
  if (!data) return;

  const v = document.getElementById("psVideo");
  const loading = document.getElementById("playerLoading");
  const loadingTxt = document.getElementById("loadingTxt");
  const tapOverlay = document.getElementById("tapOverlay");
  const bigPlay = document.getElementById("bigPlay");

  const toast = document.getElementById("playerToast");
  const toastTitle = document.getElementById("toastTitle");
  const toastDesc = document.getElementById("toastDesc");
  const toastBtn = document.getElementById("toastBtn");

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
  const toggleAutoNext = document.getElementById("toggleAutoNext");
  const autoState = document.getElementById("autoState");

  let duration = 0;
  let isSeeking = false;

  let retryCount = 0;
  let lastAttachAt = 0;

  // watchdog
  let waitingSince = 0;
  let lastProgressAt = Date.now();
  let lastTimeSeen = 0;
  let watchdogTimer = null;

  const initialAuto = (localStorage.getItem(LS_AUTONEXT) ?? "on") === "on";
  let autoNext = initialAuto;
  if (autoState) autoState.textContent = autoNext ? "ON" : "OFF";

  const DEBUG = (new URLSearchParams(location.search).get("debug") || "") === "1";
  const dlog = (...a) => DEBUG && console.log("[PS]", ...a);
  const derror = (...a) => DEBUG && console.error("[PS]", ...a);

  const saveProgressThrottled = (() => {
    let last = 0;
    return () => {
      const now = Date.now();
      if (now - last < 1800) return;
      last = now;
      saveProgress();
    };
  })();

  function showToast(title, desc, showBtn = true) {
    if (!toast) return;
    toast.style.display = "block";
    toastTitle.textContent = title || "Stream issue";
    toastDesc.textContent = desc || "";
    toastBtn.style.display = showBtn ? "block" : "none";
  }
  function hideToast() {
    if (!toast) return;
    toast.style.display = "none";
  }

  function setLoading(on, text = "Loading video…") {
    if (!loading) return;
    loading.style.pointerEvents = "none";
    loading.style.display = on ? "grid" : "none";
    if (loadingTxt) loadingTxt.textContent = text;
  }

  function setPlayIcon() {
    if (!btnPlay) return;
    btnPlay.innerHTML = v.paused ? '<i class="ri-play-fill"></i>' : '<i class="ri-pause-fill"></i>';
    if (tapOverlay) {
      tapOverlay.style.display = v.paused ? "grid" : "none";
      tapOverlay.style.pointerEvents = v.paused ? "auto" : "none";
    }
  }

  function cleanup() {
    if (watchdogTimer) { clearInterval(watchdogTimer); watchdogTimer = null; }
    try {
      v.pause();
      v.removeAttribute("src");
      v.load();
    } catch {}
  }

  function startWatchdog() {
    if (watchdogTimer) clearInterval(watchdogTimer);
    watchdogTimer = setInterval(() => {
      if (v.paused) return;

      const ct = Number(v.currentTime || 0);
      const now = Date.now();

      if (ct > lastTimeSeen + 0.05) {
        lastTimeSeen = ct;
        lastProgressAt = now;
        waitingSince = 0;
        return;
      }

      if (waitingSince && now - waitingSince > 8000) {
        waitingSince = 0;
        smartRetry("stuck_waiting");
      }

      if (now - lastProgressAt > 12000) {
        lastProgressAt = now;
        smartRetry("no_progress");
      }
    }, 1000);
  }

  // ======= jQuery load play url (biar tidak ada di HTML) =======
  function ajaxGetPlay() {
    return new Promise((resolve, reject) => {
      if (!window.$ || !$.getJSON) return reject(new Error("jquery_missing"));
      if (!data.apiPlayUrl) return reject(new Error("apiPlayUrl_missing"));

      dlog("GET", data.apiPlayUrl);
      $.ajax({
        url: data.apiPlayUrl,
        method: "GET",
        dataType: "json",
        cache: false,
        success: (j) => resolve(j),
        error: (xhr) => reject(new Error(`ajax_failed_${xhr?.status || 0}`))
      });
    });
  }

  async function loadSourcesViaAjax() {
    const j = await ajaxGetPlay();
    if (!j?.ok) throw new Error("api_not_ok");

    const vv = j.data?.video || {};
    // simpan di memory (tidak ada di HTML)
    data._src720 = vv.video_720 || "";
    data._src1080 = vv.video_1080 || "";
    data._src480 = vv.video_480 || "";

    dlog("sources loaded", {
      has720: !!data._src720,
      has1080: !!data._src1080,
      has480: !!data._src480,
      ttl: j.ttl
    });
  }

  function pickSrc(q) {
    const s720 = data._src720 || "";
    const s1080 = data._src1080 || "";
    const s480 = data._src480 || "";

    if (q === "1080") return s1080 || s720 || s480;
    if (q === "480") return s480 || s720 || s1080;
    return s720 || s1080 || s480;
  }

  async function smartRetry(reason) {
    const now = Date.now();
    if (now - lastAttachAt < 1200) return;

    if (retryCount >= 3) {
      showToast("Can’t load stream", "Try Re-attach or change quality.", true);
      setLoading(false);
      return;
    }

    retryCount += 1;
    showToast("Stream issue", `Refreshing… (${retryCount}/3)`, false);
    setLoading(true, "Refreshing stream…");

    try {
      await loadSourcesViaAjax();
      const q = quality?.value || "720";
      await attach(q, true);
      hideToast();
    } catch (e) {
      derror("retry failed", e);
      showToast("Stream issue", `Refresh failed (${reason || "retry"}). Tap Retry.`, true);
      setLoading(false);
    }
  }

  async function attach(q = "720", keepTime = false) {
    cleanup();
    setLoading(true, "Attaching stream…");
    lastAttachAt = Date.now();

    const src = pickSrc(q);
    dlog("attach", { q, src: src ? "(present)" : "(missing)" });

    if (!src) {
      setLoading(false);
      showToast("No source", "Video source not available.", true);
      return;
    }

    const keep = keepTime ? (v.currentTime || 0) : 0;
    const wasPlaying = keepTime ? !v.paused : false;

    waitingSince = 0;
    lastProgressAt = Date.now();
    lastTimeSeen = keep || 0;

    v.src = src;
    v.load();

    v.onloadedmetadata = () => {
      duration = v.duration || 0;
      if (tDur) tDur.textContent = formatTime(duration);
      if (keepTime && keep > 0 && duration > 0) {
        try { v.currentTime = Math.min(keep, duration - 0.7); } catch {}
      }
      setLoading(false);
      startWatchdog();
      if (wasPlaying) v.play().catch(() => {});
    };

    // failsafe: 4 detik tidak bisa load metadata → kemungkinan browser tidak support m3u8 tanpa Hls.js
    setTimeout(() => {
      const rs = v.readyState || 0;
      const err = v.error?.code || 0;
      if (!duration && rs < 2 && err === 4) {
        showToast("Source not supported", "Browser ini tidak bisa memutar .m3u8 tanpa Hls.js.", true);
        setLoading(false);
      }
    }, 4000);
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
    if (v.paused) await v.play().catch(() => {});
    else v.pause();
    setPlayIcon();
  });

  bigPlay?.addEventListener("click", async () => {
    hideToast();
    setLoading(false);
    await v.play().catch(() => {});
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

  quality?.addEventListener("change", async () => {
    const q = quality.value;
    const keep = v.currentTime || 0;
    const wasPlaying = !v.paused;
    await attach(q, true);
    try { v.currentTime = keep; } catch {}
    if (wasPlaying) v.play().catch(() => {});
  });

  btnFull?.addEventListener("click", async () => {
    try {
      if (v.requestFullscreen) await v.requestFullscreen();
      else if (v.webkitEnterFullscreen) v.webkitEnterFullscreen();
    } catch {}
  });

  btnNext?.addEventListener("click", () => {
    if (data.nextUrl) location.href = data.nextUrl;
  });

  btnReattach?.addEventListener("click", async () => {
    retryCount = 0;
    hideToast();
    await smartRetry("manual");
  });

  toggleAutoNext?.addEventListener("click", () => {
    autoNext = !autoNext;
    if (autoState) autoState.textContent = autoNext ? "ON" : "OFF";
    localStorage.setItem(LS_AUTONEXT, autoNext ? "on" : "off");
  });

  toastBtn?.addEventListener("click", async () => {
    retryCount = 0;
    hideToast();
    await smartRetry("toast_retry");
  });

  // seek
  seek?.addEventListener("input", () => { isSeeking = true; });
  seek?.addEventListener("change", () => {
    const val = Number(seek.value || 0) / 1000;
    const d = duration || v.duration || 0;
    if (d > 0) v.currentTime = val * d;
    isSeeking = false;
  });

  // buffering events
  v.addEventListener("loadstart", () => setLoading(true, "Loading…"));
  v.addEventListener("waiting", () => {
    setLoading(true, "Buffering…");
    if (!waitingSince) waitingSince = Date.now();
  });
  v.addEventListener("stalled", () => { if (!waitingSince) waitingSince = Date.now(); });
  v.addEventListener("playing", () => {
    setLoading(false);
    waitingSince = 0;
    lastProgressAt = Date.now();
  });
  v.addEventListener("canplay", () => setLoading(false));
  v.addEventListener("loadeddata", () => setLoading(false));
  v.addEventListener("canplaythrough", () => setLoading(false));

  v.addEventListener("loadedmetadata", () => {
    duration = v.duration || 0;
    if (tDur) tDur.textContent = formatTime(duration);
  });

  v.addEventListener("timeupdate", () => {
    const cur = v.currentTime || 0;
    const d = duration || v.duration || 0;
    if (!isSeeking && d > 0 && seek) seek.value = String(Math.floor((cur / d) * 1000));
    if (tCur) tCur.textContent = formatTime(cur);
    saveProgressThrottled();
  });

  v.addEventListener("pause", () => { setPlayIcon(); saveProgress(); });
  v.addEventListener("play", () => setPlayIcon());

  v.addEventListener("error", () => {
    const code = v.error?.code || 0;
    const map = {
      1: "Aborted",
      2: "Network error",
      3: "Decode error",
      4: "Source not supported (m3u8 tanpa Hls.js di Chrome/Android biasanya gagal)"
    };
    showToast("Video error", map[code] || `Error code ${code}`, true);
    setLoading(false);
    smartRetry("video_error");
  });

  v.addEventListener("ended", () => {
    saveProgress();
    if (!autoNext) return;
    if (data.total && data.ep < data.total && data.nextUrl) location.href = data.nextUrl;
  });

  // restore progress
  const list = loadContinue();
  const found = list.find(x => String(x.code) === String(data.code) && Number(x.ep) === Number(data.ep));
  const restoreTime = found?.time || 0;

  // START: load sources via AJAX first, then attach
  (async () => {
    try {
      setLoading(true, "Preparing stream…");
      await loadSourcesViaAjax();
      await attach("720", false);

      setPlayIcon();
      if (restoreTime > 5) {
        setTimeout(() => {
          try {
            const d = duration || v.duration || 0;
            if (d > 0) v.currentTime = Math.min(restoreTime, d - 0.7);
          } catch {}
        }, 900);
      }
    } catch (e) {
      derror("init failed", e);
      showToast("Stream issue", "Failed to load play data. Tap Retry.", true);
      setLoading(false);
    }
  })();
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
