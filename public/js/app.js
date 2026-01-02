const LS_KEY = "panstream_continue_v1";
const LS_AUTONEXT = "panstream_autonext_v1";

function formatTime(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
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

/* Watch Player (NO LOADING, AUTO PLAY) */
function initWatchPlayer() {
  const data = window.__PS__;
  if (!data) {
    console.error("[PS] window.__PS__ missing!");
    return;
  }

  const video = document.getElementById("psVideo");
  const btnPlay = document.getElementById("btnPlay");
  const btnMute = document.getElementById("btnMute");
  const vol = document.getElementById("vol");
  const quality = document.getElementById("quality");
  const btnFull = document.getElementById("btnFull");
  const btnNext = document.getElementById("btnNext");
  const toggleAutoNext = document.getElementById("toggleAutoNext");
  const autoState = document.getElementById("autoState");
  const tCur = document.getElementById("tCur");
  const tDur = document.getElementById("tDur");
  const seek = document.getElementById("seek");

  let duration = 0;
  let autoNext = true;
  localStorage.setItem(LS_AUTONEXT, "on");

  function setPlayIcon() {
    if (!btnPlay) return;
    btnPlay.innerHTML = video.paused ? '<i class="ri-play-fill"></i>' : '<i class="ri-pause-fill"></i>';
  }

  // Auto play: ambil URL dari API via jQuery, lalu set ke <video>
  $.ajax({
    url: data.apiPlayUrl,
    method: "GET",
    dataType: "json",
    cache: false,
    success: (j) => {
      if (!j.ok || !j.data?.video) {
        console.error("[PS] API response invalid", j);
        return;
      }

      const v = j.data.video;
      // simpan di memory
      data._src720  = v.video_720;
      data._src1080 = v.video_1080;
      data._src480  = v.video_480;

      const src = data._src720 || data._src480 || data._src1080;
      if (!src) {
        console.error("[PS] No playable URL from API!");
        return;
      }

      video.src = src;
      video.load();

      video.onloadedmetadata = () => {
        duration = video.duration || 0;
        if (tDur) tDur.textContent = formatTime(duration);
      };

      video.play().catch(() => console.warn("[PS] Autoplay blocked by browser"));
    },
    error: (xhr, status, err) => {
      console.error("[PS] jQuery AJAX error", xhr?.status, err);
    }
  });

  // Play / Pause
  btnPlay?.addEventListener("click", () => {
    if (video.paused) video.play().catch(()=>{});
    else video.pause();
    setPlayIcon();
  });

  // Mute / Unmute
  btnMute?.addEventListener("click", () => {
    video.muted = !video.muted;
    btnMute.innerHTML = video.muted ? '<i class="ri-volume-mute-line"></i>' : '<i class="ri-volume-up-line"></i>';
  });

  // Volume slider
  vol?.addEventListener("input", () => {
    video.volume = Number(vol.value || 1);
    video.muted = false;
    btnMute.innerHTML = '<i class="ri-volume-up-line"></i>';
  });

  // Quality change
  quality?.addEventListener("change", () => {
    const q = quality.value;
    const src = (q === "1080" ? data._src1080 : q === "480" ? data._src480 : data._src720) || "";
    if (!src) return console.error("[PS] No source for quality", q);
    video.src = src;
    video.load();
    video.play().catch(()=>{});
  });

  // Fullscreen
  btnFull?.addEventListener("click", () => {
    try {
      if (video.requestFullscreen) video.requestFullscreen();
      else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
    } catch {}
  });

  // Next episode
  btnNext?.addEventListener("click", () => {
    if (data.nextUrl) location.href = data.nextUrl;
  });

  // Auto next toggle
  toggleAutoNext?.addEventListener("click", () => {
    autoNext = !autoNext;
    if (autoState) autoState.textContent = autoNext ? "ON" : "OFF";
    localStorage.setItem(LS_AUTONEXT, autoNext ? "on" : "off");
  });

  // Save progress
  const saveProgress = () => {
    const t = video.currentTime || 0;
    const d = duration || video.duration || 0;
    upsertContinue({ lang: data.lang, code: data.code, ep: data.ep, title: data.title, cover: data.cover, time: t, duration: d });
  };

  video.addEventListener("timeupdate", () => {
    if (tCur) tCur.textContent = formatTime(video.currentTime);
    saveProgress();
  });

  video.addEventListener("pause", saveProgress);
  video.addEventListener("ended", () => {
    saveProgress();
    if (autoNext && data.nextUrl) location.href = data.nextUrl;
  });

  setPlayIcon();
}

function initGlobalUI() {
  $("#btnPulse").off("click").on("click", () => {
    const el = document.querySelector("header");
    if (!el || !window.gsap) return;
    gsap.fromTo(el, { boxShadow: "0 0 0 rgba(255,255,255,0)" }, { boxShadow: "0 0 50px rgba(255,255,255,.10)", duration: 0.45, yoyo: true, repeat: 1 });
  });
}

function initBarba() {
  if (!window.barba) return;
  barba.init({
    transitions: [{
      async leave(data) {
        const el = document.getElementById("pageOverlay");
        el && (el.style.display = "block");
        await gsap.to(data.current.container, { opacity: 0, y: -6, duration: 0.16 });
      },
      enter(data) {
        gsap.fromTo(data.next.container, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.22 });
      },
      afterEnter() {
        const el = document.getElementById("pageOverlay");
        el && (el.style.display = "none");
        window.scrollTo({ top: 0, behavior: "instant" });
      }
    }]
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initWatchPlayer();
  initGlobalUI();
  initBarba();
});
