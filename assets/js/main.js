/* =========================================================================
   bess1lie — developer portfolio
   Vanilla JS · без зависимостей
   ========================================================================= */
(function () {
  "use strict";

  var doc = document;

  /* ---------- Мобильное меню ---------- */
  function initMenu() {
    var toggle = doc.querySelector(".nav-toggle");
    var menu = doc.getElementById("mobile-menu");
    if (!toggle || !menu) return;

    // Убираем атрибут hidden: дальше меню управляется классом .is-open,
    // чтобы работала CSS-анимация opacity/transform (hidden = display:none).
    menu.hidden = false;

    var open = false;
    var savedScrollY = 0;

    function preventTouch(event) {
      // Скроллить можно ТОЛЬКО список меню, всё остальное блокируем.
      var list = menu.querySelector("ul");
      if (list && list.contains(event.target)) return;
      event.preventDefault();
    }

    function preventWheel(event) {
      var list = menu.querySelector("ul");
      if (list && list.contains(event.target)) return;
      event.preventDefault();
    }

    function lockScroll() {
      savedScrollY = window.scrollY;
      var scrollbarWidth = window.innerWidth - doc.documentElement.clientWidth;
      doc.body.style.top = -savedScrollY + "px";
      doc.body.style.paddingRight = scrollbarWidth + "px";
      doc.body.classList.add("menu-open");
      doc.documentElement.classList.add("menu-open");
      if (typeof ScrollTrigger !== "undefined" && ScrollTrigger.getAll) {
        ScrollTrigger.getAll().forEach(function (t) { t.disable(); });
      }
      doc.addEventListener("touchmove", preventTouch, { passive: false });
      doc.addEventListener("wheel", preventWheel, { passive: false });
    }

    function unlockScroll(restore) {
      doc.body.classList.remove("menu-open");
      doc.documentElement.classList.remove("menu-open");
      doc.body.style.top = "";
      doc.body.style.paddingRight = "";
      doc.removeEventListener("touchmove", preventTouch, { passive: false });
      doc.removeEventListener("wheel", preventWheel, { passive: false });
      if (typeof ScrollTrigger !== "undefined" && ScrollTrigger.getAll) {
        ScrollTrigger.getAll().forEach(function (t) { t.enable(); });
        ScrollTrigger.refresh();
      }
      if (restore) window.scrollTo({ top: savedScrollY, behavior: "instant" });
    }

    function setMenu(next, opts) {
      opts = opts || {};
      if (open === next) return; // защита от race condition при быстрых кликах
      open = next;

      toggle.setAttribute("aria-expanded", next ? "true" : "false");
      toggle.setAttribute("aria-label", next ? "Закрыть меню" : "Открыть меню");

      if (next) {
        // lockScroll ДО добавления класса: Firefox сдвигает scrollY на доли px,
        // если overflow:hidden применяется во время старта анимации меню.
        lockScroll();
        menu.classList.add("is-open");
        var first = menu.querySelector("a");
        // preventScroll: не даём focus() скроллить страницу к меню
        if (first) first.focus({ preventScroll: true });
      } else {
        menu.classList.remove("is-open");
        unlockScroll(opts.restoreScroll !== false);
        // preventScroll: focus() на toggle не должен "отбрасывать" страницу вверх
        toggle.focus({ preventScroll: true });
      }
    }

    toggle.addEventListener("click", function () {
      setMenu(!open);
    });

    menu.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function (event) {
        var href = link.getAttribute("href") || "";
        if (href.charAt(0) === "#") {
          event.preventDefault();
          setMenu(false, { restoreScroll: true });
          var target = document.getElementById(href.slice(1));
          if (target) {
            requestAnimationFrame(function () {
              target.scrollIntoView({ behavior: "smooth", block: "start" });
            });
          }
        } else {
          setMenu(false, { restoreScroll: true });
        }
      });
    });

    doc.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && open) {
        setMenu(false);
      }
    });

    doc.addEventListener("pointerdown", function (event) {
      if (!open) return;
      if (menu.contains(event.target) || toggle.contains(event.target)) return;
      setMenu(false);
    });

    // При развороте/переходе на десктоп закрываем меню
    window.addEventListener("resize", function () {
      if (open && window.innerWidth > 768) setMenu(false);
    });
  }

  /* ---------- Логотип: плавный скролл в начало ---------- */
  function initLogo() {
    var logo = doc.querySelector(".logo");
    if (!logo) return;

    function goToTop() {
      if (window.scrollY <= 2) return; // уже наверху — не дёргаем страницу
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    logo.addEventListener("click", goToTop);
    // Доступность: логотип теперь role="button", поэтому Enter/Space тоже должны работать
    logo.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        goToTop();
      }
    });
  }

  /* ---------- Reveal-анимации при скролле (Резервный вариант) ---------- */
  function initReveal() {
    var groups = [
      ".project-row", ".why-card",
      ".service-card", ".price-card",
      ".process-card", ".faq-item",
      ".hero-choice-card", ".chat-demo-wrap", ".ai-admin-steps li", ".ai-admin-compare-item"
    ];
    var els = doc.querySelectorAll(groups.join(","));
    if (!els.length) return;
    els.forEach(function (el) { el.classList.add("reveal"); });

    if (!("IntersectionObserver" in window)) {
      els.forEach(function (el) { el.classList.add("is-visible"); });
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });

    els.forEach(function (el) { observer.observe(el); });
  }

  /* ---------- GSAP Анимации (Премиум) ---------- */
  function initGSAP() {
    if (typeof gsap === "undefined" || typeof ScrollTrigger === "undefined") {
      initReveal();
      return;
    }

    gsap.registerPlugin(ScrollTrigger);

    var prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      var revealGroups = [
        ".gs-reveal", ".mini-card", ".project-row", ".why-card",
        ".service-card", ".price-card", ".process-card", ".faq-item"
      ];
      doc.querySelectorAll(revealGroups.join(",")).forEach(function (el) {
        gsap.set(el, { opacity: 1, y: 0, scale: 1 });
      });
      return;
    }

    // --- 1. Анимация появления Hero блока (общий вход ≤ 0.9с) ---
    var heroTL = gsap.timeline({ defaults: { ease: "power3.out" } });

    gsap.set(".hero-eyebrow", { opacity: 0, y: 16 });
    gsap.set("#hero-title", { opacity: 0, y: 20 });
    gsap.set(".hero-sub", { opacity: 0, y: 16 });
    gsap.set(".hero-actions", { opacity: 0, y: 12 });
    gsap.set(".hero-choice-cards", { opacity: 0, y: 12 });
    gsap.set(".hero-trust", { opacity: 0 });
    gsap.set(".mini-card", { opacity: 0, y: 24, rotation: function (i) { return [-2, 2.5, -1.5, 2, -2.5][i] || 0; } });
    gsap.set(".hero-scroll", { opacity: 0 });

    heroTL
      .to(".hero-eyebrow", { opacity: 1, y: 0, duration: 0.4 }, 0)
      .to("#hero-title", { opacity: 1, y: 0, duration: 0.5 }, 0.08)
      .to(".hero-sub", { opacity: 1, y: 0, duration: 0.4 }, 0.22)
      .to(".hero-actions", { opacity: 1, y: 0, duration: 0.4 }, 0.32)
      .to(".hero-choice-cards", { opacity: 1, y: 0, duration: 0.4 }, 0.38)
      .to(".hero-trust", { opacity: 1, duration: 0.3 }, 0.42)
      .to(".mini-card", {
        opacity: 1,
        y: 0,
        rotation: function (i) { return [-2, 2.5, -1.5, 2, -2.5][i] || 0; },
        stagger: 0.06,
        duration: 0.5
      }, 0.35)
      .to(".hero-scroll", { opacity: 0.7, duration: 0.3 }, 0.55);

    // --- 2. Движение орбов: только CSS-drift (transform, без JS) ---

    // --- 3. Исчезновение индикатора скролла при прокрутке ---
    gsap.to(".hero-scroll", {
      scrollTrigger: {
        trigger: ".hero",
        start: "top top",
        end: "bottom 80%",
        scrub: true
      },
      opacity: 0,
      y: -20
    });

    // --- 4. Единый стиль scroll-reveals: простой fade-up для всех секций ---
    function revealBatch(selector, stagger, duration) {
      var els = doc.querySelectorAll(selector);
      if (!els.length) return;
      gsap.set(els, { opacity: 0, y: 24 });
      ScrollTrigger.batch(els, {
        onEnter: function (batch) {
          gsap.to(batch, {
            opacity: 1,
            y: 0,
            duration: duration || 0.7,
            stagger: stagger || 0.1,
            ease: "power2.out",
            overwrite: "auto"
          });
        },
        once: true,
        start: "top 90%"
      });
    }

    // Демо-проекты
    revealBatch(".project-row", 0.12, 0.8);

    // Услуги
    revealBatch(".service-card", 0.1, 0.6);

    // «Почему я»
    revealBatch(".why-card", 0.1, 0.7);

    // Цены
    revealBatch(".price-card", 0.1, 0.7);

    // Процесс: premium grid
    revealBatch(".process-card", 0.1, 0.6);

    // FAQ
    revealBatch(".faq-item", 0.08, 0.7);

    // AI-админ
    revealBatch(".chat-demo-wrap", 0, 0.7);
    revealBatch(".ai-admin-steps li", 0.1, 0.6);
    revealBatch(".ai-admin-compare-item", 0.1, 0.6);

    // Контакты: форма
    revealBatch(".lead-form", 0, 0.7);
  }

  /* ---------- Текущий год в футере ---------- */
  function initYear() {
    var el = doc.getElementById("year");
    if (el) el.textContent = String(new Date().getFullYear());
  }

  /* ---------- Форма заявки ----------
     Единственная точка интеграции: замените реализацию sendLead()
     (например, на fetch в Telegram Bot API) без изменения HTML. */
  function sendLead(data) {
    return fetch("/api/lead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    }).then(function (res) {
      if (!res.ok) throw new Error("send failed: " + res.status);
      return res.json();
    });
  }

  function initForm() {
    var form = doc.getElementById("lead-form");
    if (!form) return;

    var hint = form.querySelector(".form-hint");

    form.addEventListener("submit", function (event) {
      event.preventDefault();

      var name = form.elements["name"].value.trim();
      var contact = form.elements["contact"].value.trim();
      var desc = form.elements["description"].value.trim();
      var interest = form.elements["interest"] ? form.elements["interest"].value : "";
      var website = (form.elements["website"] ? form.elements["website"].value : "");

      if (!name || !contact) {
        if (hint) hint.textContent = "Укажите имя и контакт для связи.";
        return;
      }

      var data = { name: name, contact: contact, description: desc, interest: interest, website: website };

      sendLead(data)
        .then(function () {
          alert("Спасибо, " + name + "! Заявка принята. Мы свяжемся с вами в ближайшее время.");
          if (hint) hint.textContent = "Спасибо, " + name + "! Заявка принята. Мы свяжемся с вами в ближайшее время.";
          form.reset();
        })
        .catch(function () {
          if (hint) hint.textContent = "Не получилось отправить. Напишите нам напрямую в Telegram.";
        });
    });
  }

  /* ---------- Форма Security Watch ---------- */
  function initSecurityForm() {
    var form = doc.getElementById("security-form");
    if (!form) return;

    var hint = form.querySelector(".form-hint");
    var btn = form.querySelector("button[type='submit']");

    form.addEventListener("submit", function (event) {
      event.preventDefault();

      var domain = form.elements["domain"].value.trim();
      var name = form.elements["name"].value.trim();
      var contact = form.elements["contact"].value.trim();
      var website = (form.elements["website"] ? form.elements["website"].value : "");

      if (website) {
        if (hint) hint.textContent = "Спасибо! Проверка запущена.";
        return;
      }
      if (!domain || !name || !contact) {
        if (hint) hint.textContent = "Укажите домен, имя и контакт для связи.";
        return;
      }
      if (!/^[a-z0-9\u00a1-\uffff]([a-z0-9\u00a1-\uffff-]*[a-z0-9\u00a1-\uffff])?(\.[a-z0-9\u00a1-\uffff]([a-z0-9\u00a1-\uffff-]*[a-z0-9\u00a1-\uffff])?)+$/i.test(domain)) {
        if (hint) hint.textContent = "Похоже, это не домен. Пример: example.kz";
        return;
      }

      var originalText = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Проверяем…";
      var scanFailed = true;

      var done = function (message) {
        if (hint) hint.textContent = message;
        btn.disabled = false;
        btn.textContent = originalText;
        form.reset();
      };

      var sendLeadAndFinish = function () {
        return sendLead({ name: name, contact: contact, description: "Security Watch — домен: " + domain, website: "" })
          .catch(function () {
            if (!scanFailed) done("Результат выше, но заявку не удалось отправить — напишите в Telegram.");
          });
      };

      fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: domain })
      })
        .then(function (res) {
          return res.json().then(function (data) {
            if (!res.ok) throw new Error(data.error || "scan failed");
            return data;
          });
        })
        .then(function (data) {
          var message;
          if (!data.ok) {
            message = "Не получилось проверить домен. Попробуйте ещё раз.";
          } else if (data.issues === 0) {
            message = "Проблем не обнаружено. Полный отчёт — в боте @trustwatch_kz_bot";
          } else if (data.severity === "critical" || data.severity === "high") {
            message = "Нашли серьёзные проблемы (" + data.issues + "). Полный отчёт — в боте @trustwatch_kz_bot";
          } else if (data.severity === "medium") {
            message = "Нашли проблемы (" + data.issues + "). Полный отчёт — в боте @trustwatch_kz_bot";
          } else {
            message = "Нашли незначительные замечания (" + data.issues + "). Полный отчёт — в боте @trustwatch_kz_bot";
          }
          scanFailed = data.ok === false;
          done(message);
          return sendLeadAndFinish();
        })
        .catch(function () {
          done("Не получилось проверить. Напишите нам в Telegram.");
          return sendLeadAndFinish();
        });
    });
  }

  /* ---------- FAQ: плавное открытие ---------- */
  function initFAQ() {
    var items = doc.querySelectorAll(".faq-item");
    if (!items.length) return;

    items.forEach(function (item) {
      var btn = item.querySelector(".faq-question");
      var answer = item.querySelector(".faq-answer");
      if (!btn || !answer) return;

      btn.addEventListener("click", function () {
        var isOpen = item.classList.contains("is-open");

        items.forEach(function (other) {
          other.classList.remove("is-open");
          var a = other.querySelector(".faq-answer");
          var b = other.querySelector(".faq-question");
          if (a) a.hidden = true;
          if (b) b.setAttribute("aria-expanded", "false");
        });

        if (!isOpen) {
          item.classList.add("is-open");
          answer.hidden = false;
          btn.setAttribute("aria-expanded", "true");
        }
      });
    });
  }

  /* ---------- Scroll progress ----------
     Desktop Chromium: нативный animation-timeline.
     Desktop Firefox без поддержки / mobile (<=767px): JS rAF + --sp.
     Режимы не работают одновременно: на mobile CSS-анимация отключена
     через @media, JS включается по matchMedia. */
  function initScrollProgress() {
    var root = doc.documentElement;
    var mq = window.matchMedia("(max-width: 767px)");
    var nativeOK = window.CSS && CSS.supports && CSS.supports("animation-timeline: scroll(root block)");
    var mode = "native";
    var ticking = false;
    function useJS() { return !nativeOK || mq.matches; }
    function update() {
      ticking = false;
      if (mode !== "js") return;
      var max = root.scrollHeight - root.clientHeight;
      var p = max > 0 ? root.scrollTop / max : 0;
      if (!isFinite(p) || p < 0) p = 0;
      if (p > 1) p = 1;
      root.style.setProperty("--sp", p.toFixed(4));
    }
    function requestUpdate() {
      if (mode !== "js" || ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }
    function chooseMode() {
      mode = useJS() ? "js" : "native";
      if (mode === "js") update();
    }
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", function () { chooseMode(); requestUpdate(); });
    if (mq.addEventListener) mq.addEventListener("change", chooseMode);
    chooseMode();
  }

  /* ---------- Инициализация ---------- */
  doc.addEventListener("DOMContentLoaded", function () {
    initLogo();
    initMenu();
    initScrollProgress();
    initGSAP();
    initFAQ();
    initYear();
    initForm();
    initSecurityForm();
  });
})();
