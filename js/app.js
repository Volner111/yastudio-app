/* =========================================================================
   YaStudio Mini App — логика
   Маршруты:  #            главная
              #bot         страница услуги
              #bot/quiz    страница продукта
   ========================================================================= */
(function () {
  'use strict';

  const CFG = window.APP_CONFIG;
  const SERVICES = window.SERVICES;
  const app = document.getElementById('app');

  /* ---------- Telegram ---------- */
  const tg = window.Telegram && window.Telegram.WebApp;
  const inTelegram = !!(tg && tg.platform && tg.platform !== 'unknown');

  if (inTelegram) {
    document.documentElement.classList.add('in-tg');
    tg.ready();
    tg.expand();
    try { tg.setHeaderColor('#F5F5F7'); tg.setBackgroundColor('#F5F5F7'); } catch (e) {}
    // Не даём свайпу вниз сворачивать приложение во время прокрутки
    try { if (tg.isVersionAtLeast('7.7')) tg.disableVerticalSwipes(); } catch (e) {}
    tg.BackButton.onClick(goBack);
    tg.MainButton.onClick(openContact);
  }

  const haptic = (type) => {
    if (!inTelegram) return;
    try {
      type === 'select' ? tg.HapticFeedback.selectionChanged() : tg.HapticFeedback.impactOccurred('light');
    } catch (e) {}
  };

  function openContact() {
    haptic();
    if (inTelegram && CFG.contactUrl.startsWith('https://t.me/')) tg.openTelegramLink(CFG.contactUrl);
    else window.open(CFG.contactUrl, '_blank', 'noopener');
  }

  function setMainButton(visible) {
    if (!inTelegram) return;
    if (visible) {
      tg.MainButton.setParams({ text: CFG.ctaText, color: '#0B0B0C', text_color: '#FFFFFF', is_visible: true });
    } else {
      tg.MainButton.hide();
    }
  }

  /* ---------- Предзагрузка картинок, чтобы переходы были мгновенными ---------- */
  Object.values(SERVICES).forEach((s) => { const i = new Image(); i.decoding = 'async'; i.src = s.img; });

  // Картинки схем «Как это работает» подгружаем в фоне, когда главная уже показана,
  // чтобы при открытии продукта они были в кэше и появлялись мгновенно.
  const preloadSteps = () => {
    const urls = [];
    Object.values(SERVICES).forEach((s) => s.products.forEach((p) => (p.steps || []).forEach((st) => urls.push(st.img))));
    urls.forEach((u, i) => setTimeout(() => { const im = new Image(); im.decoding = 'async'; im.src = u; }, i * 40));
  };
  if ('requestIdleCallback' in window) requestIdleCallback(preloadSteps, { timeout: 1500 });
  else setTimeout(preloadSteps, 800);

  /* ---------- Маршрутизация ---------- */
  function parse(hash) {
    const [sKey, pId] = hash.replace(/^#/, '').split('/');
    const service = SERVICES[sKey];
    if (!service) return { type: 'home', depth: 0, hash: '' };
    const product = pId && service.clickable !== false && service.products.find((p) => p.id === pId);
    if (product) return { type: 'product', depth: 2, hash: `${sKey}/${pId}`, sKey, service, product };
    return { type: 'service', depth: 1, hash: sKey, sKey, service };
  }

  const scrollMemo = {};
  let current = parse(location.hash);

  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  history.replaceState({ root: true }, '', location.hash ? location.hash : location.pathname + location.search);

  function navigate(hash) {
    if (hash === current.hash) return;
    scrollMemo[current.hash] = window.scrollY;
    history.pushState({ root: false }, '', '#' + hash);
    show(parse('#' + hash), 'fwd');
  }

  function goBack() {
    haptic();
    if (history.state && history.state.root === false) {
      history.back();             // вернёт нас через popstate
    } else {
      // Открыли сразу глубокую ссылку — идём на уровень выше
      const parent = current.type === 'product' ? current.sKey : '';
      scrollMemo[current.hash] = window.scrollY;
      history.replaceState({ root: true }, '', parent ? '#' + parent : location.pathname + location.search);
      show(parse('#' + parent), 'back');
    }
  }

  window.addEventListener('popstate', () => {
    scrollMemo[current.hash] = window.scrollY;
    const next = parse(location.hash);
    show(next, next.depth < current.depth ? 'back' : 'fwd');
  });

  /* ---------- Отрисовка ---------- */
  function show(route, dir) {
    current = route;
    const view = document.createElement('main');
    view.className = 'view ' + (dir === 'back' ? 'in-back' : dir === 'fwd' ? 'in-fwd' : 'in-fade');
    view.innerHTML =
      route.type === 'home' ? homeView() :
      route.type === 'service' ? serviceView(route) :
      productView(route);
    app.replaceChildren(view);
    setupReveal(view);

    // Возврат на прежнее место прокрутки при движении назад
    window.scrollTo(0, dir === 'back' ? (scrollMemo[route.hash] || 0) : 0);

    if (inTelegram) route.depth > 0 ? tg.BackButton.show() : tg.BackButton.hide();
    setMainButton(route.depth > 0);
  }

  /* ---------- Появление карточек при прокрутке ----------
     Карточка с классом .reveal скрыта, пока не доедет до экрана.
     Те, что появились одновременно, выезжают по очереди (лесенкой). */
  let revealObserver = null;
  const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function setupReveal(root) {
    if (revealObserver) revealObserver.disconnect();
    const els = root.querySelectorAll('.reveal');
    if (reduceMotion || !('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add('in'));
      return;
    }
    revealObserver = new IntersectionObserver((entries, obs) => {
      let order = 0;
      entries
        .filter((e) => e.isIntersecting || e.boundingClientRect.bottom < 0)  // видимые + уже пролистанные
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        .forEach((e) => {
          const above = e.boundingClientRect.bottom < 0;
          e.target.style.transitionDelay = above ? '0ms' : `${Math.min(order++, 5) * 90}ms`;
          e.target.classList.add('in');
          obs.unobserve(e.target);
        });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    els.forEach((el) => revealObserver.observe(el));
  }

  // Один обработчик на всё приложение (дешевле, чем на каждую кнопку)
  app.addEventListener('click', (e) => {
    const go = e.target.closest('[data-go]');
    if (go) { haptic('select'); navigate(go.dataset.go); return; }
    if (e.target.closest('[data-back]')) { goBack(); return; }
    if (e.target.closest('[data-contact]')) { e.preventDefault(); openContact(); }
  });

  /* ---------- Шаблоны ---------- */
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const delay = (i, base = 60, step = 45) => `style="animation-delay:${base + Math.min(i, 8) * step}ms"`;

  const chevron = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';
  const check = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  const backBtn = '<button class="back" data-back>← Назад</button>';
  const cta = `<a class="cta reveal" href="${esc(CFG.contactUrl)}" data-contact>${esc(CFG.ctaText)}</a>`;

  function homeView() {
    const cards = Object.entries(SERVICES).map(([key, s], i) => `
      <button class="card card-${key} rise" data-go="${key}" ${delay(i, 80, 60)}>
        <img src="${s.img}" alt="" width="900" height="900" decoding="async" fetchpriority="high">
        <span>${esc(s.title)}</span>
      </button>`).join('');
    return `
      <h1 class="title">${esc(CFG.homeTitle)}</h1>
      <p class="subtitle">${esc(CFG.homeSubtitle)}</p>
      <div class="grid">${cards}</div>`;
  }

  function serviceView({ sKey, service }) {
    const open = service.clickable !== false;
    const items = service.products.map((p) => open ? `
      <button class="item reveal" data-go="${sKey}/${p.id}">
        <div class="item-text">
          <h3>${esc(p.title)}</h3>
          <p>${esc(p.short)}</p>
        </div>
        <span class="chev">${chevron}</span>
      </button>` : `
      <div class="item item-static reveal">
        <div class="item-text">
          <h3>${esc(p.title)}</h3>
          <p>${esc(p.short)}</p>
        </div>
      </div>`).join('');
    return `
      ${backBtn}
      <div class="hero ${sKey}"><img src="${service.img}" alt="" width="900" height="900" decoding="async"></div>
      <h1 class="h1">${esc(service.title)}</h1>
      <p class="lead">${esc(service.lead)}</p>
      <div class="items">${items}</div>
      ${cta}`;
  }

  // Схема «Как это работает»: шаги появляются по очереди
  function stepsView(steps) {
    const rows = steps.map((st, i) => `
      <li class="step rise" ${delay(i, 150, 110)}>
        <img src="${st.img}" alt="" width="240" height="240" decoding="async">
        <div class="step-text">
          <h3><span class="num">${i + 1}</span>${esc(st.title)}</h3>
          <p>${esc(st.text)}</p>
        </div>
      </li>`).join('');
    return `<div class="how reveal"><h2>Как это работает</h2><ol class="steps">${rows}</ol></div>`;
  }

  // Плашка «Вы сейчас внутри такого приложения»
  function noteView(text) {
    const up = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5.5 11.5L12 5l6.5 6.5"/></svg>';
    return `<div class="note reveal"><span class="note-ic">${up}</span>${esc(text)}</div>`;
  }

  function productView({ sKey, service, product: p }) {
    const li = (arr) => arr.map((t, i) => `<li class="rise" ${delay(i, 160, 40)}><span class="ic">${check}</span><span>${esc(t)}</span></li>`).join('');
    const dots = (arr) => arr.map((t, i) => `<li class="rise" ${delay(i, 120, 40)}><span class="ic"></span><span>${esc(t)}</span></li>`).join('');
    const others = service.products.filter((x) => x.id !== p.id)
      .map((x) => `<button class="pill" data-go="${sKey}/${x.id}">${esc(x.title)}</button>`).join('');
    const img = p.img || service.img;

    return `
      ${backBtn}
      <p class="eyebrow">${esc(service.title)}</p>
      <h1 class="p-title">${esc(p.title)}</h1>
      <p class="p-tagline">${esc(p.short)}</p>

      ${p.steps && p.steps.length ? stepsView(p.steps) + (p.note ? noteView(p.note) : '') :
        `<div class="hero mini-hero ${p.img ? '' : sKey}"><img src="${img}" alt="" width="900" height="900" decoding="async"></div>`}

      <section class="section reveal"><h2>Что это</h2><p>${esc(p.about)}</p></section>
      ${p.audience && p.audience.length ? `<section class="section reveal"><h2>Кому подойдёт</h2><ul class="list dots">${dots(p.audience)}</ul></section>` : ''}
      ${p.features && p.features.length ? `<section class="section reveal"><h2>Что входит</h2><ul class="list">${li(p.features)}</ul></section>` : ''}
      ${p.result ? `<div class="result reveal"><h2>Результат</h2><p>${esc(p.result)}</p></div>` : ''}

      ${cta}
      ${others ? `<div class="more reveal"><h2>Ещё в разделе «${esc(service.title)}»</h2><div class="pills">${others}</div></div>` : ''}`;
  }

  show(current, 'init');
})();
