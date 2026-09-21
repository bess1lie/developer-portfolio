/* bess1lie — dependency-free interactions */
(function () {
  "use strict";
  var doc = document;
  doc.documentElement.classList.add("js");
  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var motionOff = reducedMotion || !!(navigator.connection && navigator.connection.saveData) || !!(navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);

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
        var t0 = Date.now(), lastY = window.scrollY;
        (function settle(){
          if (cancelled) return;
          var now = Date.now(), y = window.scrollY;
          if (now - t0 > 3000 || (now - t0 > 500 && Math.abs(y - lastY) < 1)) {
            var hh = document.querySelector('.nav') ? document.querySelector('.nav').offsetHeight : 64;
            var d = h2.getBoundingClientRect().top - hh - 32;
            if (Math.abs(d) > 2) window.scrollTo({top: y + d, behavior: 'instant'});
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
    var stack = document.querySelector('.hero-stack');
    if (!stack) return;
    var chips = Array.prototype.slice.call(stack.querySelectorAll('.hero-chip'));
    var statusEl = document.getElementById('hero-stack-status-text') || document.getElementById('hero-marquee-status');
    var connectors = stack.querySelectorAll('.hero-connector');
    if (!chips.length) return;
    var cur = 0;
    var timer = null;
    var pausedUntil = 0;
    var results = ["заявка в пару кликов","заказы без звонков и ожиданий","услуги, цены и запись","ответы за 5 секунд, 24/7","код полностью ваш"];
    function activate(i){
      cur = i;
      chips.forEach(function(c,k){
        var on = k===i;
        c.classList.toggle('is-active', on);
        c.setAttribute('aria-pressed', on?'true':'false');
        if (connectors[k]) connectors[k].classList.toggle('is-active', on);
      });
      if (statusEl) statusEl.textContent = results[i] || results[0];
      var marqueeStatus = document.getElementById('hero-marquee-status');
      if (marqueeStatus) marqueeStatus.textContent = chips[i].querySelector('.hero-chip-title').textContent + ' — ' + results[i];
    }
    function next(){ activate((cur+1)%chips.length); }
    function schedule(){
      if (timer) clearInterval(timer);
      if (motionOff) return;
      timer = setInterval(function(){
        if (Date.now() < pausedUntil) return;
        next();
      }, 2800);
    }
    chips.forEach(function(chip, idx){
      chip.addEventListener('click', function(){ activate(idx); pausedUntil = Date.now()+6000; });
      chip.addEventListener('mouseenter', function(){ activate(idx); pausedUntil = Date.now()+6000; });
      chip.addEventListener('focus', function(){ activate(idx); pausedUntil = Date.now()+6000; });
    });
    // keyboard
    stack.addEventListener('keydown', function(e){
      if(e.key==='ArrowRight' || e.key==='ArrowLeft'){
        e.preventDefault();
        var dir = e.key==='ArrowRight'?1:-1;
        var nxt = (cur+dir+chips.length)%chips.length;
        chips[nxt].focus();
        activate(nxt); pausedUntil=Date.now()+6000;
      }
    });
    // parallax
    if (stack.getAttribute('data-layout') !== 'index' && window.matchMedia('(hover:hover) and (pointer:fine)').matches) {
      var raf=null, mx=0, my=0, tx=0, ty=0;
      stack.addEventListener('mousemove', function(e){
        var r=stack.getBoundingClientRect();
        mx=(e.clientX - r.left)/r.width -0.5;
        my=(e.clientY - r.top)/r.height -0.5;
        if(!raf) raf=requestAnimationFrame(function(){
          raf=null;
          tx += (mx - tx)*0.08;
          ty += (my - ty)*0.08;
          var core=stack.querySelector('.hero-stack-core');
          if(core) core.style.transform='translate(-50%,-50%) translate('+(tx*6)+'px,'+(ty*6)+'px)';
          chips.forEach(function(c,i){
            var f=(i%2?1:-1)*0.5;
            c.style.transform='translate('+(tx*12*f)+'px,'+(ty*12*f)+'px)';
          });
          var rings=stack.querySelectorAll('.hero-ring');
          rings.forEach(function(r,i){ r.style.transform='translate('+(tx*4*f)+'px,'+(ty*4*f)+'px) rotate('+(i? -5:5)+'deg)'; });
        });
      });
      stack.addEventListener('mouseleave', function(){
        if(raf) cancelAnimationFrame(raf);
        raf=null;
        var core=stack.querySelector('.hero-stack-core');
        if(core) core.style.transform='translate(-50%,-50%)';
        chips.forEach(function(c){ c.style.transform=''; });
      });
      document.addEventListener('visibilitychange', function(){
        if(document.hidden && raf) cancelAnimationFrame(raf);
      });
    }
    // pause when not in viewport
    if ('IntersectionObserver' in window){
      var io=new IntersectionObserver(function(entries){
        entries.forEach(function(en){
          stack.classList.toggle('is-paused', !en.isIntersecting);
          var shouldPause = !en.isIntersecting || document.hidden;
          stack.querySelectorAll('.hero-chip, .hero-connector, .hero-ring').forEach(function(el){
            el.style.animationPlayState = shouldPause ? 'paused' : '';
          });
        });
      }, {threshold:0.2});
      io.observe(stack);
    }
    // initial
    activate(0);
    schedule();
    // The desktop service index is intentionally static and fully readable.
    chips.forEach(function(c){ c.style.opacity='1'; c.style.transform='none'; });
    var conns=stack.querySelectorAll('.hero-connector');
    // B2 fix: only animate rendered connectors, guard getTotalLength, ResizeObserver
    function animateConnectors(){
      conns.forEach(function(l,i){
        try{
          var cs=getComputedStyle(l);
          var stackCs=getComputedStyle(stack);
          if(cs.display==='none' || cs.visibility==='hidden' || stackCs.display==='none') return;
          var rect=l.getBoundingClientRect();
          // layout not yet done -> skip
          if(!l.isConnected) return;
          var len=200;
          try{ if(l.getTotalLength) len=l.getTotalLength(); }catch(e){ len=200; }
          l.style.strokeDasharray=len; l.style.strokeDashoffset=len;
          setTimeout(function(){ l.style.transition='stroke-dashoffset 0.9s ease'; l.style.strokeDashoffset='0'; }, 300+i*80);
        }catch(e){}
      });
    }
    if('ResizeObserver' in window){
      try{ var ro=new ResizeObserver(function(){ animateConnectors(); }); ro.observe(stack); }catch(e){}
    }
    animateConnectors();
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
    var progress = doc.querySelector(".work-progress i");
    var carousel = doc.querySelector(".work-carousel-track");
    var dots = doc.querySelectorAll(".work-dots span");
    if (!tabs.length) return;
    // ensure panels exist — if not, create from tabs data
    if (!panels.length) {
      // fallback: use work-item detail as panels
      panels = tabs;
    }
    var cur = 0;
    var timer = null;
    var hovering = false;
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
        {num:"01", type:"ЛЕНДИНГ", title:"Кофейня «Дәме»", desc:"Меню, отзывы и форма заявки в одном понятном сайте.", tags:["Меню в ₸","Адаптив","Форма заявки"], meta:["от 45 000 ₸","5–10 дней"], href:"https://bess1lie.github.io/cafe-demo/"},
        {num:"02", type:"КОРПОРАТИВНЫЙ САЙТ", title:"Барбершоп «Жігіт»", desc:"Услуги, мастера, прайс и онлайн-запись в одном месте.", tags:["Мастера","Онлайн-запись"], meta:["от 75 000 ₸","от 14 дней"], href:"https://bess1lie.github.io/barbershop-demo/"},
        {num:"03", type:"САЙТ С КАТАЛОГОМ", title:"Мастерская «Ағаш»", desc:"Каталог изделий, фильтры и калькулятор стоимости.", tags:["Каталог","Калькулятор"], meta:["от 100 000 ₸","от 20 дней"], href:"https://bess1lie.github.io/furniture-demo/"}
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
      if (progress) {
        progress.classList.remove("is-animating");
        void progress.offsetWidth;
        if (!reducedMotion && !hovering) progress.classList.add("is-animating");
      }
      if (dots.length) {
        dots.forEach(function(d,k){ d.classList.toggle("is-active", k===i); });
      }
    }
    tabs.forEach(function(el, idx){
      el.addEventListener("click", function(){ activate(idx); restart(); });
      el.addEventListener("keydown", function(e){
        if(e.key==="ArrowLeft" || e.key==="ArrowRight"){
          e.preventDefault();
          var dir = e.key==="ArrowLeft" ? -1 : 1;
          var next = (idx + dir + tabs.length) % tabs.length;
          tabs[next].focus();
          activate(next); restart();
        }
      });
      el.addEventListener("mouseenter", function(){ hovering=true; if(progress) progress.classList.remove("is-animating"); });
      el.addEventListener("mouseleave", function(){ hovering=false; if(!reducedMotion) { if(progress){ progress.classList.remove("is-animating"); void progress.offsetWidth; progress.classList.add("is-animating"); } restart(); }});
      el.addEventListener("focus", function(){ hovering=true; if(progress) progress.classList.remove("is-animating"); });
      el.addEventListener("blur", function(){ hovering=false; if(!reducedMotion) restart(); });
    });
    function next(){ activate((cur+1)%tabs.length); }
    function restart(){
      if (timer) clearInterval(timer);
      if (reducedMotion) return;
      timer = setInterval(function(){ if(!hovering) next(); }, 6000);
      if (progress && !hovering) {
        progress.classList.remove("is-animating");
        void progress.offsetWidth;
        progress.classList.add("is-animating");
      }
    }
    var visual = doc.querySelector(".work-mock");
    if (visual) {
      visual.addEventListener("mouseenter", function(){ hovering=true; if(progress) progress.classList.remove("is-animating"); });
      visual.addEventListener("mouseleave", function(){ hovering=false; if(!reducedMotion) restart(); });
      // tilt
      if (window.matchMedia("(hover:hover) and (pointer:fine)").matches) {
        visual.addEventListener("mousemove", function(e){
          var r=visual.getBoundingClientRect();
          var x=(e.clientX - r.left)/r.width -0.5;
          var y=(e.clientY - r.top)/r.height -0.5;
          visual.style.transform = "perspective(800px) rotateX(" + (-y*3) + "deg) rotateY(" + (x*3) + "deg)";
        });
        visual.addEventListener("mouseleave", function(){ visual.style.transform=""; });
      }
    }
    activate(0);
    if (!reducedMotion) restart();
  }

  /* ---------- Чат — один компонент, фиксированная высота, классы ---------- */
  function initChat() {
    var isTouch = window.matchMedia("(pointer: coarse)").matches;
    var saveData = navigator.connection && navigator.connection.saveData;
    var shouldReduce = reducedMotion || saveData;
    function setupBox(box, steps){
      if (!box) return;
      var items = Array.prototype.slice.call(box.querySelectorAll("[data-chat]"));
      if (!items.length) {
        // hero compact: 3 msgs
        items = Array.prototype.slice.call(box.querySelectorAll(".msg"));
        items.forEach(function(el){ el.classList.add("chat-item"); });
        items = Array.prototype.slice.call(box.querySelectorAll(".chat-item"));
      } else {
        items.forEach(function(el){ el.classList.add("chat-item"); });
      }
      // ensure all in flow, hidden via class
      items.forEach(function(el){
        el.classList.remove("is-shown");
        if (el.classList.contains("typing")) el.classList.add("typing-item");
      });
      var played = false;
      var timers = [];
      function clearTimers(){ timers.forEach(function(t){ clearTimeout(t); }); timers=[]; }
      function play(){
        if (played) return;
        played = true;
        if (shouldReduce) {
          items.forEach(function(el){ el.classList.add("is-shown"); });
          return;
        }
        var t = 250;
        steps.forEach(function(step){
          var el = items[step.idx];
          if (!el) return;
          var isTyping = el.classList.contains("typing");
          var timer = setTimeout(function(){
            if (isTyping) {
              el.classList.add("is-shown");
              var off = setTimeout(function(){ el.classList.remove("is-shown"); }, 600);
              timers.push(off);
            } else {
              el.classList.add("is-shown");
            }
          }, t);
          timers.push(timer);
          t += step.delay;
        });
      }
      if (!("IntersectionObserver" in window)) { play(); return; }
      var io = new IntersectionObserver(function(entries){
        if (entries[0].isIntersecting) { play(); io.disconnect(); }
      }, {threshold: 0.25});
      io.observe(box);
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

  /* ---------- Магнитные кнопки — premium 6-10px, scale, shadow ---------- */
  function initMagnetic() {
    if (motionOff || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    document.querySelectorAll(".magnetic").forEach(function (el) {
      var raf=null, tx=0, ty=0;
      el.addEventListener("mousemove", function (e) {
        var r = el.getBoundingClientRect();
        var x = (e.clientX - r.left - r.width / 2) * 0.14;
        var y = (e.clientY - r.top - r.height / 2) * 0.22;
        x=Math.max(-10,Math.min(10,x)); y=Math.max(-10,Math.min(10,y));
        if(raf) cancelAnimationFrame(raf);
        raf=requestAnimationFrame(function(){
          el.style.transform = "translate(" + x.toFixed(1) + "px," + y.toFixed(1) + "px) scale(1.02)";
          el.style.boxShadow="0 8px 24px rgba(214,58,12,.18)";
        });
      });
      el.addEventListener("mouseleave", function () {
        if(raf) cancelAnimationFrame(raf);
        el.style.transform = ""; el.style.boxShadow="";
      });
    });
  }

  /* ---------- Кастомный курсор — point + ring, hover scale ---------- */
  function initCursor() {
    if (reducedMotion || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    var dot = document.createElement("div"); dot.className="cursor"; dot.setAttribute("aria-hidden","true"); document.body.appendChild(dot);
    var ring = document.createElement("div"); ring.className="cursor-ring"; ring.setAttribute("aria-hidden","true"); document.body.appendChild(ring);
    var mx=-100,my=-100,rx=-100,ry=-100,raf=null;
    function loop(){
      rx+=(mx-rx)*.16; ry+=(my-ry)*.16;
      dot.style.transform="translate("+mx+"px,"+my+"px)"; ring.style.transform="translate("+rx+"px,"+ry+"px)";
      // idle-settle: stop the loop when the ring has caught up (saves CPU)
      if (Math.abs(mx-rx)>0.1 || Math.abs(my-ry)>0.1) { raf=requestAnimationFrame(loop); }
      else { raf=null; }
    }
    document.addEventListener("mousemove", function(e){ mx=e.clientX; my=e.clientY; if(!raf && !document.hidden) raf=requestAnimationFrame(loop); });
    document.addEventListener("visibilitychange", function(){ if(document.hidden && raf){ cancelAnimationFrame(raf); raf=null; } });
    raf=requestAnimationFrame(loop);
    document.querySelectorAll("a, button, .bento-tile, .work-mock, .price-row").forEach(function(el){
      el.addEventListener("mouseenter", function(){ document.body.classList.add("cursor-hot"); });
      el.addEventListener("mouseleave", function(){ document.body.classList.remove("cursor-hot"); });
    });
  }

  /* ---------- Sticky mobile CTA ---------- */
  function initStickyCta() {
    var bar = doc.getElementById("sticky-cta");
    if (!bar) return;
    var pastHero = false;
    var atContact = false;
    function render() {
      bar.classList.toggle("is-visible", pastHero && !atContact && window.innerWidth <= 768);
    }
    if (!("IntersectionObserver" in window)) return;
    var hero = doc.querySelector(".hero");
    var contact = doc.getElementById("contact");
    if (hero) {
      new IntersectionObserver(function (entries) {
        pastHero = !entries[0].isIntersecting && entries[0].boundingClientRect.top < 0;
        render();
      }, { threshold: 0 }).observe(hero);
    }
    if (contact) {
      new IntersectionObserver(function (entries) {
        atContact = entries[0].isIntersecting;
        render();
      }, { threshold: 0.05 }).observe(contact);
    }
    window.addEventListener("resize", render);
    render();
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
        if (hint) hint.textContent = "Заполните имя и контакт.";
        return;
      }
      if (btn) { btn.disabled = true; btn.textContent = "Отправляем…"; }
      if (hint) hint.textContent = "";
      sendLead(data).then(function (res) {
        // check if res is json and ok
        if (hint) hint.textContent = "Заявка отправлена! Ответим в течение нескольких часов.";
        form.reset();
        if (btn) { btn.disabled = false; btn.textContent = "Отправить заявку"; }
      }).catch(function (err) {
        // fallback for static hosting 404/405
        var text = "Имя: " + data.name + "\nКонтакт: " + data.contact + "\nИнтерес: " + data.interest + "\nОписание: " + data.description;
        var url = "https://t.me/bess1liebot?text=" + encodeURIComponent(text);
        window.open(url, "_blank");
        if (hint) hint.textContent = "Открыли Telegram с готовым сообщением — нажмите Send";
        if (btn) { btn.disabled = false; btn.textContent = "Отправить заявку"; }
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

  /* ---------- Premium: hero mouse depth + card spotlight + scroll parallax ---------- */
  function initPointerFx() {
    if (reducedMotion || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    var hero = doc.querySelector(".hero");
    var stack = doc.querySelector(".hero-stack");
    if (hero && stack) {
      var raf=null, tx=0, ty=0, cx=0, cy=0;
      hero.addEventListener("mousemove", function(e){
        var r=hero.getBoundingClientRect();
        cx=(e.clientX - r.left)/r.width - .5;
        cy=(e.clientY - r.top)/r.height - .5;
        if(!raf) raf=requestAnimationFrame(function(){
          raf=null; tx += (cx - tx)*.08; ty += (cy - ty)*.08;
          var px=(tx*10).toFixed(2)+"px", py=(ty*10).toFixed(2)+"px";
          stack.style.setProperty("--px", px);
          stack.style.setProperty("--py", py);
          stack.style.transform="translate3d("+px+", "+py+", 0)";
        });
      });
      hero.addEventListener("mouseleave", function(){
        stack.style.setProperty("--px","0px"); stack.style.setProperty("--py","0px");
        stack.style.transform="translate3d(0,0,0)";
      });
    }
    // spotlight for bento / pricing
    document.querySelectorAll(".bento-tile, .price-row, .work-tab").forEach(function(card){
      card.addEventListener("mousemove", function(e){
        var r=card.getBoundingClientRect();
        card.style.setProperty("--mx", ((e.clientX - r.left))+"px");
        card.style.setProperty("--my", ((e.clientY - r.top))+"px");
      });
    });
    // subtle scroll parallax for hero grid (capped)
    var ticking=false;
    window.addEventListener("scroll", function(){
      if(ticking) return; ticking=true;
      requestAnimationFrame(function(){
        var y=Math.min(window.scrollY * 0.06, 40);
        if(hero) hero.style.setProperty("--scroll-y", y.toFixed(1)+"px");
        ticking=false;
      });
    }, {passive:true});
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
    initPointerFx();
    initTextReveal();
    initMagnetic();
    initFormCursorFix();
    initStickyCta();
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
