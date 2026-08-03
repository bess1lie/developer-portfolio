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
      event.preventDefault();
    }

    function lockScroll() {
      savedScrollY = window.scrollY;
      doc.body.style.overflow = "hidden";
      // Firefox сдвигает scrollY на доли px при смене overflow:hidden —
      // принудительно возвращаем позицию напрямую через scrollTop.
      doc.documentElement.scrollTop = savedScrollY;
      // overflow:hidden на body не блокирует touch-скролл в мобильных Chrome/Safari.
      // preventDefault на touchmove с passive:false закрывает этот канал, не трогая layout.
      doc.addEventListener("touchmove", preventTouch, { passive: false });
    }

    function unlockScroll() {
      doc.body.style.overflow = "";
      doc.removeEventListener("touchmove", preventTouch, { passive: false });
      // Firefox при снятии overflow:hidden сдвигает scrollY на доли px —
      // принудительно возвращаем сохранённую позицию напрямую через scrollTop.
      if (window.scrollY !== savedScrollY) {
        doc.documentElement.scrollTop = savedScrollY;
      }
    }

    function setMenu(next) {
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
        unlockScroll();
        // preventScroll: focus() на toggle не должен "отбрасывать" страницу вверх
        toggle.focus({ preventScroll: true });
      }
    }

    toggle.addEventListener("click", function () {
      setMenu(!open);
    });

    menu.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        setMenu(false);
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
      ".recent-card", ".why-card",
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
        ".gs-reveal", ".mini-card", ".recent-card", ".why-card",
        ".service-card", ".price-card", ".timeline-item", ".faq-item"
      ];
      doc.querySelectorAll(revealGroups.join(",")).forEach(function (el) {
        gsap.set(el, { opacity: 1, y: 0, scale: 1 });
      });
      return;
    }

    // --- 1. Анимация появления Hero блока (общий вход ≤ 1.2с) ---
    var heroTL = gsap.timeline({ defaults: { ease: "power4.out" } });

    gsap.set(".hero-eyebrow", { opacity: 0, y: 20 });
    gsap.set("#hero-title", { opacity: 0, y: 25 });
    gsap.set(".hero-sub", { opacity: 0, y: 20 });
    gsap.set(".hero-actions", { opacity: 0, y: 15 });
    gsap.set(".hero-trust", { opacity: 0 });
    gsap.set(".mini-card", { opacity: 0, scale: 0.8, y: 30 });
    gsap.set(".hero-scroll", { opacity: 0 });

    heroTL
      .to(".hero-eyebrow", { opacity: 1, y: 0, duration: 0.5 }, 0)
      .to("#hero-title", { opacity: 1, y: 0, duration: 0.7 }, 0.1)
      .to(".hero-sub", { opacity: 1, y: 0, duration: 0.5 }, 0.3)
      .to(".hero-actions", { opacity: 1, y: 0, duration: 0.5 }, 0.45)
      .to(".hero-trust", { opacity: 1, duration: 0.4 }, 0.55)
      .to(".mini-card", {
        opacity: 1,
        scale: 1,
        y: 0,
        stagger: 0.08,
        ease: "back.out(1.7)",
        duration: 0.6
      }, 0.5)
      .to(".hero-scroll", { opacity: 0.7, duration: 0.4 }, 0.8);

    // --- 2. Движение светящихся орбов (живое, с параллаксом) ---
    if (doc.querySelector(".orb-1")) {
      gsap.to(".orb-1", {
        x: "+=30",
        y: "-=20",
        rotation: 5,
        duration: 8,
        yoyo: true,
        repeat: -1,
        ease: "sine.inOut"
      });
    }
    if (doc.querySelector(".orb-2")) {
      gsap.to(".orb-2", {
        x: "-=25",
        y: "+=18",
        rotation: -4,
        duration: 9,
        yoyo: true,
        repeat: -1,
        ease: "sine.inOut"
      });
    }
    if (doc.querySelector(".orb-3")) {
      gsap.to(".orb-3", {
        x: "+=18",
        y: "+=14",
        rotation: 6,
        duration: 7,
        yoyo: true,
        repeat: -1,
        ease: "sine.inOut"
      });
    }

    // Параллакс орбов при скролле
    gsap.to([".orb-1", ".orb-2", ".orb-3"], {
      y: -50,
      scrollTrigger: {
        trigger: ".hero",
        start: "top top",
        end: "bottom top",
        scrub: 1
      }
    });

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

    // --- 4. Интерактивные микроанимации карточек на скролле (ScrollTrigger.batch) ---
    var revealTargets = [
      { selector: ".recent-card", stagger: 0.15 },
      { selector: ".why-card", stagger: 0.1 },
      { selector: ".service-card", stagger: 0.1 },
      { selector: ".price-card", stagger: 0.1 },
      { selector: ".timeline-item", stagger: 0.12 },
      { selector: ".faq-item", stagger: 0.08 }
    ];

    revealTargets.forEach(function (group) {
      var els = doc.querySelectorAll(group.selector);
      if (!els.length) return;

      gsap.set(els, { opacity: 0, y: 35 });

      ScrollTrigger.batch(els, {
        onEnter: function (batch) {
          gsap.to(batch, {
            opacity: 1,
            y: 0,
            duration: 0.8,
            stagger: group.stagger,
            ease: "power2.out",
            overwrite: "auto"
          });
        },
        once: true,
        start: "top 90%"
      });
    });
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
          if (hint) hint.textContent = "Спасибо, " + name + "! Заявка принята. Я свяжусь с вами в ближайшее время.";
          form.reset();
        })
        .catch(function () {
          if (hint) hint.textContent = "Не получилось отправить. Напишите мне напрямую в Telegram.";
        });
    });
  }

  /* ---------- Инициализация ---------- */
  doc.addEventListener("DOMContentLoaded", function () {
    initLogo();
    initMenu();
    initGSAP();
    initYear();
    initForm();
  });
})();
