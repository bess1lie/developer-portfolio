/* bess1lie — dependency-free interactions */
(function () {
  "use strict";
  var doc = document;
  doc.documentElement.classList.add("js");
  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Якоря — точный скролл ---------- */
  function initAnchors() {
    function update(){
      var headerH = document.querySelector('.nav') ? document.querySelector('.nav').offsetHeight : 64;
      document.querySelectorAll('section[id]').forEach(function(sec){
        var padTop = parseFloat(window.getComputedStyle(sec).paddingTop);
        var h2 = sec.querySelector('h2');
        var h2mt = h2 ? parseFloat(window.getComputedStyle(h2).marginTop) : 0;
        var m = 32 + headerH - padTop - h2mt;
        sec.style.scrollMarginTop = m + 'px';
        if (h2) h2.style.scrollMarginTop = (headerH + 32) + 'px';
      });
    }
    update();
    window.__syncAnchors = update;
    window.addEventListener('resize', update);
    if ('ResizeObserver' in window) {
      var ro = new ResizeObserver(update);
      document.querySelectorAll('section[id]').forEach(function(s){ ro.observe(s); });
    }
    // also handle direct hash on load
    if (location.hash) {
      var id = location.hash.slice(1);
      var el = document.getElementById(id);
      if (el) setTimeout(function(){
        var headerH = document.querySelector('.nav').offsetHeight;
        var top = el.getBoundingClientRect().top + window.scrollY - headerH - 32 + parseFloat(window.getComputedStyle(el).paddingTop);
        window.scrollTo({top: el.offsetTop - headerH - 32 + parseFloat(window.getComputedStyle(el).paddingTop), behavior:'instant'});
      }, 100);
    }
  }

  /* ---------- Навигация: всегда наверху + точное переключение темы ---------- */
  function initNav() {
    var nav = document.querySelector(".nav");
    var links = Array.prototype.slice.call(document.querySelectorAll(".nav-links a"));
    function updateNavTheme() {
      if (!nav) return;
      var h = nav.offsetHeight || 64;
      var y = h + 1;
      var x = Math.round(window.innerWidth / 2);
      var el = document.elementFromPoint(x, y);
      var isDark = !!(el && el.closest('[data-theme="dark"]'));
      if (!isDark) {
        // fallback: проверка через getBoundingClientRect секций ровно под кромкой шапки
        var darkSections = document.querySelectorAll('[data-theme="dark"]');
        for (var i = 0; i < darkSections.length; i++) {
          var r = darkSections[i].getBoundingClientRect();
          if (r.top <= h && r.bottom > h) { isDark = true; break; }
          if (r.top <= h+0.5 && r.bottom >= h+0.5) { isDark = true; break; }
        }
      }
      nav.classList.toggle("nav--dark", isDark);
    }
    if (nav) {
      window.addEventListener("resize", updateNavTheme, { passive: true });
      updateNavTheme();
    }
    var secs = ["work", "services", "ai-admin", "why", "pricing", "process", "faq", "contact"].map(function (id) {
      return document.getElementById(id);
    }).filter(Boolean);
    function mark() {
      var cur = null;
      for (var i = 0; i < secs.length; i++) {
        if (secs[i].getBoundingClientRect().top < window.innerHeight * 0.4) cur = secs[i].id;
      }
      links.forEach(function (a) {
        a.classList.toggle("is-active", a.getAttribute("href") === "#" + cur);
      });
      if (nav) {
        var sc = window.scrollY > 40;
        if (nav.classList.contains("is-scrolled") !== sc) {
          nav.classList.toggle("is-scrolled", sc);
          if (window.__syncAnchors) window.__syncAnchors();
        }
      }
    }
    window.addEventListener("scroll", function () { window.requestAnimationFrame(function () { updateNavTheme(); mark(); }); }, { passive: true });
    mark();
  }

  /* ---------- Мобильное меню ---------- */
  function initMenu() {
    var toggle = doc.querySelector(".nav-toggle");
    var menu = doc.getElementById("mmenu");
    if (!toggle || !menu) return;
    menu.hidden = false;
    var open = false;
    var savedY = 0;
    function setMenu(next) {
      if (open === next) return;
      open = next;
      toggle.setAttribute("aria-expanded", next ? "true" : "false");
      toggle.setAttribute("aria-label", next ? "Закрыть меню" : "Открыть меню");
      if (next) {
        savedY = window.scrollY;
        doc.body.style.top = -savedY + "px";
        doc.body.classList.add("menu-open");
        menu.classList.add("is-open");
        var first = menu.querySelector("a");
        if (first) first.focus({ preventScroll: true });
      } else {
        menu.classList.remove("is-open");
        doc.body.classList.remove("menu-open");
        doc.body.style.top = "";
        window.scrollTo({ top: savedY, behavior: "instant" });
        toggle.focus({ preventScroll: true });
      }
    }
    toggle.addEventListener("click", function () { setMenu(!open); });
    menu.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () { setMenu(false); });
    });
    doc.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && open) setMenu(false);
    });
  }

  /* ---------- Логотип наверх ---------- */
  function initLogo() {
    document.querySelectorAll("[data-scrolltop]").forEach(function (el) {
      el.addEventListener("click", function (e) {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
      });
    });
    // точный скролл для якорей — h2 на 32px ниже шапки
    // content-visibility placeholders выше цели могут сдвинуть layout уже
    // после остановки скролла, поэтому коррекция делается до 3 проходов.
    function snapTo(h2, onDone) {
      var hh = document.querySelector('.nav') ? document.querySelector('.nav').offsetHeight : 64;
      var d = h2.getBoundingClientRect().top - hh - 32;
      if (Math.abs(d) > 2) { window.scrollTo({ top: window.scrollY + d, behavior: 'instant' }); return true; }
      if (onDone) onDone();
      return false;
    }
    document.querySelectorAll('a[href^="#"]').forEach(function(a){
      var href=a.getAttribute('href');
      if(href==='#top') return;
      a.addEventListener('click', function(e){
        var id=href.slice(1);
        var sec=document.getElementById(id);
        if(!sec) return;
        var h2=sec.querySelector('h2') || sec;
        var headerH=document.querySelector('.nav') ? document.querySelector('.nav').offsetHeight : 64;
        var top = h2.getBoundingClientRect().top + window.scrollY - headerH - 32;
        // reserve height for images already done via width/height
        e.preventDefault();
        window.scrollTo({top: top, behavior: reducedMotion ? 'auto' : 'smooth'});
        history.pushState(null,'',href);
        // snap-correction: wait until smooth scroll settles, then fix residual drift
        var cancelled = false;
        var cancel = function(){ cancelled = true; };
        window.addEventListener('wheel', cancel, {once:true, passive:true});
        window.addEventListener('touchmove', cancel, {once:true, passive:true});
        var t0 = Date.now(), tStart = t0, lastY = window.scrollY, fixes = 0;
        (function settle(){
          if (cancelled || Date.now() - tStart > 8000) return;
          var now = Date.now(), y = window.scrollY;
          if (now - t0 > 3000 || (now - t0 > 500 && Math.abs(y - lastY) < 1)) {
            if (snapTo(h2) && fixes < 2) {
              fixes++;
              setTimeout(function(){ if (!cancelled) { t0 = Date.now(); lastY = window.scrollY; settle(); } }, 700);
            }
          } else { lastY = y; requestAnimationFrame(settle); }
        })();
        // close mobile menu if open
        var mmenu=document.getElementById('mmenu');
        if(mmenu && mmenu.classList.contains('is-open')){
          var toggle=document.querySelector('.nav-toggle');
          if(toggle) toggle.click();
        }
      });
    });
    // handle direct hash on load
    if(location.hash){
      var id=location.hash.slice(1);
      var sec=document.getElementById(id);
      if(sec){
        setTimeout(function(){
          var h2=sec.querySelector('h2') || sec;
          var headerH=document.querySelector('.nav').offsetHeight;
          var top = h2.getBoundingClientRect().top + window.scrollY - headerH - 32;
          window.scrollTo({top: top, behavior:'instant'});
        }, 200);
      }
    }
  }

  /* ---------- Hero stack + mask-reveal ---------- */
  function initHero() {
    var lines = doc.querySelectorAll("h1 .line > span");
    if (lines.length) {
      lines.forEach(function(s){ s.style.transform='none'; s.style.opacity='1'; });
    }
  }

  /* ---------- Reveal — single IO, variants + stagger ---------- */
  function initReveal() {
    var els = doc.querySelectorAll(".reveal, .reveal-scale, .reveal-blur");
    if (!els.length) return;
    if (reducedMotion || !("IntersectionObserver" in window)) {
      els.forEach(function (el) { el.classList.add("is-visible"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add("is-visible");
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.12 });
    els.forEach(function (el) { io.observe(el); });
  }

  /* ---------- Работы: табы + сцена + телефон ---------- */
  function initWork() {
    var tabs = doc.querySelectorAll(".work-tab");
    var panels = doc.querySelectorAll(".work-panel");
    // for old markup compat: if no work-tab, try work-item
    if (!tabs.length) tabs = doc.querySelectorAll(".work-item");
    var shotsBrowser = doc.querySelectorAll(".work-mock-inner img[data-shot]");
    var carousel = doc.querySelector(".work-carousel-track");
    var dots = doc.querySelectorAll(".work-dots span");
    if (!tabs.length) return;
    // ensure panels exist — if not, create from tabs data
    if (!panels.length) {
      // fallback: use work-item detail as panels
      panels = tabs;
    }
    var cur = 0;
    // make scene height stable: measure max panel height
    var scene = doc.querySelector(".work-scene");
    if (scene) {
      var maxH = 0;
      // temporarily show all to measure
      panels.forEach(function(p){
        p.hidden = false;
        var h = p.offsetHeight;
        if (h > maxH) maxH = h;
      });
      if (maxH) {
        scene.style.minHeight = maxH + 'px';
        // use grid-stack to keep height stable
        var panelContainer = doc.getElementById("work-panel");
        if (panelContainer && panels.length>1) {
          // set minHeight on panel container
          panelContainer.style.minHeight = maxH + 'px';
        }
      }
    }
    function activate(i) {
      cur = i;
      tabs.forEach(function(el,k){
        var on = k===i;
        el.classList.toggle("is-active", on);
        el.setAttribute("aria-selected", on ? "true" : "false");
        el.setAttribute("tabindex", on ? "0" : "-1");
      });
      // panels: show one, hide others via hidden + visibility
      var panelData = [
        {num:"01", type:"ЛЕНДИНГ", title:"Кофейня «Дәме»", desc:"Меню, отзывы и форма заявки в одном понятном сайте.", tags:["Меню в ₸","Адаптив","Форма заявки"], meta:["от 69 000 ₸","5–10 дней"], href:"https://bess1lie.github.io/cafe-demo/"},
        {num:"02", type:"КОРПОРАТИВНЫЙ САЙТ", title:"Барбершоп «Жігіт»", desc:"Услуги, мастера, прайс и онлайн-запись в одном месте.", tags:["Мастера","Онлайн-запись"], meta:["от 129 000 ₸","от 14 дней"], href:"https://bess1lie.github.io/barbershop-demo/"},
        {num:"03", type:"САЙТ С КАТАЛОГОМ", title:"Мастерская «Ағаш»", desc:"Каталог изделий, фильтры и калькулятор стоимости.", tags:["Каталог","Калькулятор"], meta:["от 189 000 ₸","от 20 дней"], href:"https://bess1lie.github.io/furniture-demo/"}
      ];
      var panelNum = document.getElementById("work-panel-num");
      var panelType = document.getElementById("work-panel-type");
      var panelTitle = document.getElementById("work-panel-title");
      var panelDesc = document.getElementById("work-panel-desc");
      var panelTags = document.getElementById("work-panel-tags");
      var panelMeta = document.getElementById("work-panel-meta");
      var panelLink = document.getElementById("work-panel-link");
      if (panelTitle && panelData[i]) {
        if (panelNum) panelNum.textContent = panelData[i].num;
        if (panelType) panelType.textContent = panelData[i].type;
        panelTitle.textContent = panelData[i].title;
        panelDesc.textContent = panelData[i].desc;
        panelTags.innerHTML = panelData[i].tags.map(function(t){return "<li>"+t+"</li>";}).join("");
        if (panelMeta) panelMeta.innerHTML = "<span>"+panelData[i].meta[0]+"</span><span>"+panelData[i].meta[1]+"</span>";
        panelLink.href = panelData[i].href;
        panelTitle.style.opacity = "0"; panelTitle.style.transform = "translateY(8px)";
        setTimeout(function(){ panelTitle.style.opacity="1"; panelTitle.style.transform="none"; }, 20);
      }
      shotsBrowser.forEach(function(s){
        var on = Number(s.getAttribute("data-shot"))===i;
        if (on) s.removeAttribute("hidden"); else s.setAttribute("hidden","");
        s.style.opacity = on ? "1" : "0";
        s.style.transform = on ? "none" : "translateY(10px) scale(.985)";
        s.style.filter = on ? "blur(0)" : "blur(3px)";
      });
      if (dots.length) {
        dots.forEach(function(d,k){ d.classList.toggle("is-active", k===i); });
      }
    }
    tabs.forEach(function(el, idx){
      el.addEventListener("click", function(){ activate(idx); });
      el.addEventListener("keydown", function(e){
        if(e.key==="ArrowLeft" || e.key==="ArrowRight"){
          e.preventDefault();
          var dir = e.key==="ArrowLeft" ? -1 : 1;
          var next = (idx + dir + tabs.length) % tabs.length;
          tabs[next].focus();
          activate(next);
        }
      });
    });
    activate(0);
    // mobile carousel: single source of truth for dots is real scroll pos
    var trackCards = carousel ? carousel.querySelectorAll('.work-carousel-card') : [];
    var scrollTicking = false;
    function setDots(i){
      cur = i;
      if (dots.length) dots.forEach(function(d,k){ d.classList.toggle('is-active', k===i); });
    }
    function syncDotsToScroll(){
      scrollTicking = false;
      if (!carousel || trackCards.length < 2 || !dots.length) return;
      var max = carousel.scrollWidth - carousel.clientWidth;
      var i = max > 0 ? Math.round(carousel.scrollLeft / (max / (trackCards.length - 1))) : 0;
      setDots(Math.max(0, Math.min(trackCards.length - 1, i)));
    }
    if (carousel) {
      carousel.addEventListener('scroll', function(){
        if (!scrollTicking) { scrollTicking = true; window.requestAnimationFrame(syncDotsToScroll); }
      }, { passive: true });
    }
    var carouselMq = window.matchMedia('(max-width: 900px)');
    function onCarouselMq(){
      if (carouselMq.matches) syncDotsToScroll();
    }
    if (carouselMq.addEventListener) carouselMq.addEventListener('change', onCarouselMq);
    else if (carouselMq.addListener) carouselMq.addListener(onCarouselMq);
  }

  /* ---------- Чат — один компонент, фиксированная высота, классы ---------- */
  function initChat() {
    function setupBox(box, steps){
      if (!box) return;
      var items = Array.prototype.slice.call(box.querySelectorAll("[data-chat]"));
      if (!items.length) {
        // hero compact: 3 msgs
        items = Array.prototype.slice.call(box.querySelectorAll(".msg"));
      }
      // static: full conversation visible at once, no autoplay sequencing
      items.forEach(function(el){
        if (el.classList.contains("typing")) return;
        el.classList.add("chat-item", "is-shown");
      });
      // without JS fallback handled via CSS (.js not present)
    }
    var aiBox = document.getElementById("chat-demo");
    if (aiBox) {
      var aiSteps = [
        {idx:0, delay:600}, // client
        {idx:1, delay:600}, // typing
        {idx:2, delay:750}, // bot
        {idx:3, delay:600}, // client
        {idx:4, delay:600}, // typing
        {idx:5, delay:750}, // bot
        {idx:6, delay:600}  // card
      ];
      setupBox(aiBox, aiSteps);
    }
    var heroBox = document.querySelector(".phone-mini .phone-screen");
    if (heroBox) {
      // hero is showcase — keep messages visible, no chat-item logic
      var heroMsgs = heroBox.querySelectorAll(".msg");
      heroMsgs.forEach(function(el){
        el.classList.remove("chat-item");
        el.classList.add("show");
        el.style.visibility = "visible";
        el.style.opacity = "1";
        el.style.transform = "none";
      });
      var heroCard = heroBox.querySelector(".booking-card");
      if (heroCard) {
        heroCard.classList.remove("chat-item");
        heroCard.classList.add("show");
        heroCard.style.visibility = "visible";
        heroCard.style.opacity = "1";
        heroCard.style.transform = "none";
      }
    }
  }

  /* ---------- Timeline — сегменты между кружками ---------- */
  function initTimeline() {
    var tl = document.getElementById("timeline");
    if (!tl) return;
    var items = tl.querySelectorAll("li");
    if (!items.length) return;
    // без JS и reduced-motion — всё заполнено
    if (!doc.documentElement.classList.contains('js') || reducedMotion) {
      items.forEach(function(li){ li.classList.add('is-done'); li.classList.add('is-active'); li.style.setProperty('--f','1'); });
      return;
    }
    var ticking = false;
    function update(){
      var vh = window.innerHeight;
      var refY = vh * 0.55;
      var centers = [];
      for (var i=0;i<items.length;i++){
        var circle = items[i].querySelector('.step-num');
        var r = circle ? circle.getBoundingClientRect() : items[i].getBoundingClientRect();
        centers.push(r.top + r.height/2);
      }
      // set is-done / is-active and --f per segment
      for (var k=0;k<items.length;k++){
        var cy = centers[k];
        var isReached = refY >= cy;
        var isActive = false;
        if (isReached) {
          // last reached
          var nextCy = centers[k+1];
          if (k === items.length-1 || refY < nextCy) isActive = true;
        }
        items[k].classList.toggle('is-done', isReached && !isActive);
        items[k].classList.toggle('is-active', isActive);
        // segment k -> k+1
        if (k < items.length-1) {
          var next = centers[k+1];
          var f = 0;
          if (refY <= cy) f = 0;
          else if (refY >= next) f = 1;
          else f = (refY - cy) / (next - cy);
          f = Math.max(0, Math.min(1, f));
          items[k].style.setProperty('--f', f.toFixed(3));
        }
      }
      ticking = false;
    }
    function onScroll(){ if(!ticking){ ticking=true; requestAnimationFrame(update); } }
    window.addEventListener('scroll', onScroll, {passive:true});
    window.addEventListener('resize', onScroll);
    if ('ResizeObserver' in window) new ResizeObserver(onScroll).observe(tl);
    // also observe font load
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(update);
    update();
  }

  /* ---------- FAQ ---------- */
  function initFaq() {
    document.querySelectorAll(".faq-item").forEach(function (item) {
      var btn = item.querySelector(".faq-question");
      var answer = item.querySelector(".faq-answer");
      if (!btn || !answer) return;
      btn.addEventListener("click", function () {
        var open = item.classList.contains("is-open");
        document.querySelectorAll(".faq-item.is-open").forEach(function (other) {
          other.classList.remove("is-open");
          other.querySelector(".faq-question").setAttribute("aria-expanded", "false");
          other.querySelector(".faq-answer").setAttribute("hidden", "");
        });
        if (!open) {
          item.classList.add("is-open");
          btn.setAttribute("aria-expanded", "true");
          answer.removeAttribute("hidden");
        }
      });
    });
  }

  /* ---------- Форма — фикс курсора и radio ---------- */
  function initFormCursorFix() {
    var form = doc.getElementById('lead-form');
    if (!form) return;
    form.addEventListener('mouseenter', function(){ doc.body.classList.add('form-hover'); });
    form.addEventListener('mouseleave', function(){ doc.body.classList.remove('form-hover'); });
    // also disable magnetic on ancestors
    var magnetics = form.querySelectorAll('.magnetic');
    magnetics.forEach(function(el){ el.classList.remove('magnetic'); });
  }

  /* ---------- Форма ---------- */
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
    var btn = form.querySelector("button[type='submit']");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var data = {
        name: form.name.value.trim(),
        contact: form.contact.value.trim(),
        interest: form.interest.value,
        description: form.description.value.trim(),
        website: form.website.value
      };
      if (!data.name || !data.contact) {
        if (hint) {
          hint.classList.remove("is-success");
          hint.classList.add("is-error");
          hint.textContent = "Заполните имя и контакт.";
        }
        return;
      }
      if (btn) { btn.disabled = true; btn.textContent = "Отправляем…"; }
      if (hint) {
        hint.classList.remove("is-success", "is-error");
        hint.textContent = "";
      }
      sendLead(data).then(function (res) {
        // check if res is json and ok
        if (hint) {
          hint.classList.remove("is-error");
          hint.classList.add("is-success");
          hint.textContent = "Заявка отправлена! Ответим в течение нескольких часов.";
        }
        form.reset();
        if (btn) { btn.disabled = false; btn.textContent = "Отправить заявку"; }
      }).catch(function () {
        // The website flow must stay on-site. Telegram is sent only server-side.
        if (hint) {
          hint.classList.remove("is-success");
          hint.classList.add("is-error");
          hint.textContent = "Не удалось отправить заявку. Попробуйте ещё раз.";
        }
        if (btn) { btn.disabled = false; btn.textContent = "Повторить"; }
      });
      // also handle non-ok res
      // if fetch returns 404, it will be caught as error above via res.ok check in sendLead
    });
  }

  /* ---------- Год ---------- */
  function initYear() {
    var el = doc.getElementById("year");
    if (el) el.textContent = String(new Date().getFullYear());
  }

  /* ---------- Intro ---------- */
  function initIntro() {
    var intro = doc.getElementById("intro");
    if (!intro) return;
    try {
      if (sessionStorage.getItem("bl-intro") || reducedMotion) {
        intro.remove();
        return;
      }
      sessionStorage.setItem("bl-intro", "1");
    } catch (err) {
      intro.remove();
      return;
    }
    setTimeout(function () { intro.remove(); }, 1400);
  }

  function initTextReveal(){
    if(reducedMotion) return;
    var h1Lines = doc.querySelectorAll("h1 .line");
    h1Lines.forEach(function(line,i){
      line.style.overflow="hidden";
      var inner=line.firstElementChild;
      if(inner){
        inner.style.display="block";
        inner.style.transform="translateY(110%)";
        inner.style.transition="transform .7s cubic-bezier(.16,1,.3,1) "+(i*70)+"ms, opacity .6s ease "+(i*70)+"ms";
        inner.style.opacity="0";
        requestAnimationFrame(function(){
          setTimeout(function(){ inner.style.transform="translateY(0)"; inner.style.opacity="1"; }, 80);
        });
      }
    });
  }

  /* ---------- Init ---------- */
  doc.addEventListener("DOMContentLoaded", function () {
    initAnchors();
    var intro = doc.getElementById("intro");
    if (intro) intro.remove();
    initNav();
    initMenu();
    initLogo();
    initTextReveal();
    initFormCursorFix();
    initHero();
    initReveal();
    initWork();
    initChat();
    initTimeline();
    initFaq();
    initForm();
    initYear();
  });
})();
