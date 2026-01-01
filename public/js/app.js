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

/* overlay */
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

/* AOS */
function initAOS() {
  AOS.init({ once: true, duration: 650, easing: "ease-out-cubic", offset: 36 });
}

/* lazy images */
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

/* UI */
function initGlobalUI() {
  $("#btnPulse").off("click").on("click", () => {
    const el = document.querySelector("header");
    if (!el) return;
    gsap.fromTo(el, { boxShadow: "0 0 0 rgba(255,255,255,0)" }, { boxShadow: "0 0 50px rgba(255,255,255,.10)", duration: 0.45, yoyo: true, repeat: 1 });
  });

  // card tilt only on desktop (avoid jitter on mobile)
  const isCoarse = matchMedia("(pointer: coarse)").matches;
  if (isCoarse) return;

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

  skel.classList.add("hidden");
  wrap.classList.remove("hidden");
  initLazyImages(wrap);

  btnClear?.addEventListener("click", () => {
    clearContinue();
    wrap.classList.add("hidden");
    skel.classList.add("hidden");
  });
}

/* Barba PJAX + global loading */
function initBarba() {
  barba.init({
    transitions: [{
      async leave(data) {
        showOverlay();
        await gsap.to(data.current.container, { opacity: 0, y: -8, duration: 0.18, ease: "power2.in" });
      },
      enter(data) {
        gsap.fromTo(data.next.container, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.26, ease: "power2.out" });
      },
      afterEnter() {
        hideOverlay();
        initAOS();
        initGlobalUI();
        initLazyImages(document);
        initContinueHome();
        AOS.refreshHard();
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
  initBarba();
});
