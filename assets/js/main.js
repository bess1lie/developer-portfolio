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
      doc.body.style.top = -savedScrollY + "px";
      doc.body.classList.add("menu-open");
      doc.documentElement.classList.add("menu-open");
      // overflow:hidden на body не блокирует touch-скролл в мобильных Chrome/Firefox/WebView.
      // preventDefault на touchmove/wheel с passive:false закрывает этот канал, не трогая layout.
      doc.addEventListener("touchmove", preventTouch, { passive: false });
      doc.addEventListener("wheel", preventWheel, { passive: false });
    }

    function unlockScroll(restore) {
      doc.body.classList.remove("menu-open");
      doc.documentElement.classList.remove("menu-open");
      doc.body.style.top = "";
      doc.removeEventListener("touchmove", preventTouch, { passive: false });
      doc.removeEventListener("wheel", preventWheel, { passive: false });
      // position:fixed на body сбрасывает позицию в 0 — возвращаем сохранённую.
      // restore=false для ссылок меню: якорь сам проскроллит к секции.
      if (restore) window.scrollTo({ top: savedScrollY, behavior: "auto" });
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
      link.addEventListener("click", function () {
        setMenu(false, { restoreScroll: false });
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
      ".timeline-item", ".faq-item"
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
        ".service-card", ".price-card", ".timeline-item", ".faq-item"
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
    gsap.set(".hero-trust", { opacity: 0 });
    gsap.set(".mini-card", { opacity: 0, y: 24, rotation: function (i) { return [-2, 2.5, -1.5, 2, -2.5][i] || 0; } });
    gsap.set(".hero-scroll", { opacity: 0 });

    heroTL
      .to(".hero-eyebrow", { opacity: 1, y: 0, duration: 0.4 }, 0)
      .to("#hero-title", { opacity: 1, y: 0, duration: 0.5 }, 0.08)
      .to(".hero-sub", { opacity: 1, y: 0, duration: 0.4 }, 0.22)
      .to(".hero-actions", { opacity: 1, y: 0, duration: 0.4 }, 0.32)
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

    // Процесс: timeline
    revealBatch(".timeline-item", 0.12, 0.7);

    // FAQ
    revealBatch(".faq-item", 0.08, 0.7);

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
    return new Promise(function (resolve, reject) {
      // Здесь будет реальная отправка: fetch('https://api.telegram.org/...', {method:'POST', body: JSON.stringify(data)})
      setTimeout(function () {
        resolve({ ok: true });
      }, 300);
      // reject(new Error('сеть недоступна')) — в случае ошибки
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

      if (!name || !contact) {
        if (hint) hint.textContent = "Укажите имя и контакт для связи.";
        return;
      }

      var data = { name: name, contact: contact, description: desc };

      sendLead(data)
        .then(function () {
          alert("Спасибо, " + name + "! Заявка принята. Я свяжусь с вами в ближайшее время.");
          if (hint) hint.textContent = "Спасибо, " + name + "! Заявка принята. Я свяжусь с вами в ближайшее время.";
          form.reset();
        })
        .catch(function () {
          if (hint) hint.textContent = "Не получилось отправить. Напишите мне напрямую в Telegram.";
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

  /* ---------- Инициализация ---------- */
  doc.addEventListener("DOMContentLoaded", function () {
    initLogo();
    initMenu();
    initGSAP();
    initFAQ();
    initYear();
    initForm();
  });
})();
