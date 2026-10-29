'use strict';

/* =========================================================================
   История границ — интерактивная карта (1413–2025)
   Данные об эпохах лежат в js/eras-data.js
   Фото карт: assets/maps/<год>.jpg        — полная (2400 px)
              assets/maps/<год>-sm.jpg     — облегчённая для телефона (1280 px)
              assets/maps/thumbs/<год>.jpg — миниатюра 520 px
   ========================================================================= */

var MAPS_BASE = 'assets/maps/';
var MAPS_THUMBS = MAPS_BASE + 'thumbs/';
var MAP_EXTENSIONS = ['jpg', 'jpeg', 'webp', 'png', 'JPG', 'JPEG', 'WEBP', 'PNG'];

// Телефон/планшет: отдаём облегчённую карту (меньше трафика и памяти)
function isSmallScreen() {
  if (window.matchMedia && window.matchMedia('(max-width: 820px)').matches) return true;
  var c = navigator.connection;
  return !!(c && c.saveData);
}
var smallMode = isSmallScreen();

var eras = window.ERAS;
var startYear = eras[0].start;
var endYear = window.MAXYEAR;

// ===== Состояние =====
var currentYear = startYear;
var shownIndex = null;
var scale = 1, posX = 0, posY = 0;
var isDragging = false, lastX = 0, lastY = 0;
var playTimer = null;
var playSpeed = 2;      // множитель скорости: 1, 1.5, 2, 2.5, 3
var BASE_DELAY = 120;   // базовая задержка (мс) между годами при 1x
var hashTimer = null;

var viewport = document.getElementById('viewport');
var panZoom = document.getElementById('pan-zoom');
var mapImage = document.getElementById('map-image');
var mapPlaceholder = document.getElementById('map-placeholder');
var phYear = document.getElementById('ph-year');
var phHint = document.getElementById('ph-hint');
var yearDisplay = document.getElementById('year-display');
var yearRange = document.getElementById('year-range');
var yearCaption = document.getElementById('year-caption');
var epochRange = document.getElementById('epoch-range');
var slider = document.getElementById('year-slider');
var epochsMenu = document.getElementById('epochs-menu');
var epochsToggle = document.getElementById('epochs-toggle');
var marksBox = document.getElementById('timeline-marks');
var playBtn = document.getElementById('play-btn');
var prevBtn = document.getElementById('prev-btn');
var nextBtn = document.getElementById('next-btn');
var zoomInBtn = document.getElementById('zoom-in');
var zoomOutBtn = document.getElementById('zoom-out');
var zoomResetBtn = document.getElementById('zoom-reset');
var zoomFullBtn = document.getElementById('zoom-full');
var epochTitle = document.getElementById('epoch-title');
var epochDesc = document.getElementById('epoch-desc');
var epochMore = document.getElementById('epoch-more');
var chronicleLink = document.getElementById('chronicle-link');
var speedBar = document.getElementById('speed-bar');
var speedBtns = speedBar.querySelectorAll('.speed-btn');

// ===== Поиск фото карты (перебор расширений) =====
var imageCache = {};   // ключ (год + вариант) -> url | null

function probeAny(base, i, done) {
  if (i >= MAP_EXTENSIONS.length) { done(null); return; }
  var url = base + '.' + MAP_EXTENSIONS[i];
  var probe = new Image();
  probe.onload = function () { done(url); };
  probe.onerror = function () { probeAny(base, i + 1, done); };
  probe.src = url;
}

function probeImage(era, done) {
  var key = era.start + (smallMode ? '-sm' : '');
  if (Object.prototype.hasOwnProperty.call(imageCache, key)) { done(imageCache[key]); return; }

  var fullBase = MAPS_BASE + era.start;
  function tryFull() {
    probeAny(fullBase, 0, function (url) {
      imageCache[key] = url;
      done(url);
    });
  }

  if (smallMode) {
    // сначала облегчённая копия, если её нет — обычная
    probeAny(fullBase + '-sm', 0, function (url) {
      if (url) { imageCache[key] = url; done(url); return; }
      tryFull();
    });
  } else {
    tryFull();
  }
}

// Миниатюра для превью меток (лёгкая, ~22 КБ)
function probeThumb(era, done) {
  probeAny(MAPS_THUMBS + era.start, 0, function (url) {
    if (url) { done(url); return; }
    probeImage(era, done);
  });
}

function showPlaceholder(era) {
  phYear.textContent = era.start;
  phHint.textContent = MAPS_BASE + era.start + '.jpg';
  mapPlaceholder.classList.add('visible');
  mapImage.classList.add('is-empty');
}

function hidePlaceholder() {
  mapPlaceholder.classList.remove('visible');
  mapImage.classList.remove('is-empty');
}

// ===== Предзагрузка соседних карт (чтобы воспроизведение шло плавно) =====
function preloadNeighbour(idx) {
  [idx + 1, idx - 1].forEach(function (i) {
    var era = eras[i];
    if (!era || imageCache[era.start]) return;
    probeImage(era, function () {});
  });
}

// ===== Адрес страницы: #1923 =====
function yearFromHash() {
  var n = parseInt((location.hash || '').replace('#', ''), 10);
  return isNaN(n) ? null : n;
}
function syncHash() {
  if (hashTimer) return;
  hashTimer = setTimeout(function () {
    hashTimer = null;
    if (yearFromHash() === currentYear) return;
    history.replaceState(null, '', '#' + currentYear);
  }, 350);
}

// ===== Индекс эпохи по году =====
function eraIndexFor(year) {
  if (year <= startYear) return 0;
  if (year >= eras[eras.length - 1].start) return eras.length - 1;
  for (var i = eras.length - 1; i >= 0; i--) {
    if (year >= eras[i].start) return i;
  }
  return 0;
}

// ===== Трансформация карты =====
function applyTransform() {
  panZoom.style.transform = 'translate(' + posX + 'px, ' + posY + 'px) scale(' + scale + ')';
  zoomInBtn.disabled = scale >= 8;
  zoomOutBtn.disabled = scale <= 0.5;
}
function setScale(s) {
  scale = Math.max(0.5, Math.min(8, s));
  applyTransform();
}
function resetView() {
  scale = 1; posX = 0; posY = 0;
  applyTransform();
}

// ===== Обновление карты и интерфейса =====
function updateUI(year) {
  currentYear = Math.max(startYear, Math.min(endYear, year));
  slider.value = currentYear;
  yearDisplay.innerText = currentYear;

  var idx = eraIndexFor(currentYear);
  var era = eras[idx];

  if (idx !== shownIndex) {
    shownIndex = idx;

    var label = window.eraLabel(era);
    epochRange.textContent = label;
    yearRange.innerHTML = 'Карта: <b>' + label + '</b>';
    yearCaption.textContent = era.title;
    epochTitle.textContent = era.title;
    epochDesc.textContent = era.desc;

    if (epochMore) epochMore.setAttribute('href', 'gallery.html#' + era.start);

    var thisIdx = idx;
    mapImage.classList.add('loading');
    probeImage(era, function (url) {
      if (thisIdx !== shownIndex) return;      // пользователь уже ушёл на другую эпоху
      if (url) {
        if (mapImage.getAttribute('src') !== url) mapImage.src = url;
        hidePlaceholder();
      } else {
        mapImage.removeAttribute('src');
        showPlaceholder(era);
      }
      mapImage.classList.remove('loading');
    });
  }

  if (chronicleLink) chronicleLink.setAttribute('href', 'gallery.html#' + currentYear);

  prevBtn.disabled = idx <= 0;
  nextBtn.disabled = idx >= eras.length - 1;
  highlightMenu(idx);
  highlightMarks(idx);
  syncHash();
}

// ===== Панорама мышью =====
viewport.addEventListener('mousedown', function (e) {
  if (e.target.closest('.zoom-btn')) return;
  isDragging = true; lastX = e.clientX; lastY = e.clientY;
  mapImage.classList.add('dragging');
  e.preventDefault();
});
window.addEventListener('mousemove', function (e) {
  if (!isDragging) return;
  posX += e.clientX - lastX; posY += e.clientY - lastY;
  lastX = e.clientX; lastY = e.clientY;
  applyTransform();
});
window.addEventListener('mouseup', function () {
  isDragging = false; mapImage.classList.remove('dragging');
});

// ===== Тач-панорама и пинч-зум =====
var pinchDist = 0, pinchScale = 1;
viewport.addEventListener('touchstart', function (e) {
  if (e.touches.length === 1) {
    isDragging = true; lastX = e.touches[0].clientX; lastY = e.touches[0].clientY;
  } else if (e.touches.length === 2) {
    isDragging = false;
    var dx = e.touches[0].clientX - e.touches[1].clientX;
    var dy = e.touches[0].clientY - e.touches[1].clientY;
    pinchDist = Math.hypot(dx, dy);
    pinchScale = scale;
  }
}, { passive: true });
viewport.addEventListener('touchmove', function (e) {
  if (e.touches.length === 1 && isDragging) {
    e.preventDefault();
    posX += e.touches[0].clientX - lastX;
    posY += e.touches[0].clientY - lastY;
    lastX = e.touches[0].clientX; lastY = e.touches[0].clientY;
    applyTransform();
  } else if (e.touches.length === 2 && pinchDist > 0) {
    e.preventDefault();
    var dx = e.touches[0].clientX - e.touches[1].clientX;
    var dy = e.touches[0].clientY - e.touches[1].clientY;
    setScale(pinchScale * (Math.hypot(dx, dy) / pinchDist));
  }
}, { passive: false });
viewport.addEventListener('touchend', function () { isDragging = false; });

// ===== Колесо: смена года, Shift/Ctrl+колесо — зум =====
viewport.addEventListener('wheel', function (e) {
  e.preventDefault();
  if (e.shiftKey || e.ctrlKey) {
    setScale(scale + (e.deltaY > 0 ? -0.15 : 0.15));
  } else if (e.deltaY > 0) {
    updateUI(currentYear + 1);
  } else {
    updateUI(currentYear - 1);
  }
}, { passive: false });

// ===== Слайдер =====
slider.addEventListener('input', function (e) {
  stopPlay();
  updateUI(parseInt(e.target.value, 10));
});

// ===== Зум-кнопки =====
zoomInBtn.addEventListener('click', function () { setScale(scale + 0.5); });
zoomOutBtn.addEventListener('click', function () { setScale(scale - 0.5); });
zoomResetBtn.addEventListener('click', resetView);

// ===== Полный экран =====
function isFullscreen() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}
function toggleFullscreen() {
  var el = document.documentElement;
  if (!isFullscreen()) {
    (el.requestFullscreen || el.webkitRequestFullscreen || function () {}).call(el);
  } else {
    (document.exitFullscreen || document.webkitExitFullscreen || function () {}).call(document);
  }
}
zoomFullBtn.addEventListener('click', toggleFullscreen);
document.addEventListener('fullscreenchange', function () {
  zoomFullBtn.textContent = isFullscreen() ? '⤢' : '⛶';
  zoomFullBtn.title = isFullscreen() ? 'Выйти из полноэкранного режима' : 'На весь экран';
});

// ===== Шаг по эпохам =====
function stepEra(dir) {
  stopPlay();
  var idx = eraIndexFor(currentYear);
  var next = Math.max(0, Math.min(eras.length - 1, idx + dir));
  updateUI(eras[next].start);
}
prevBtn.addEventListener('click', function () { stepEra(-1); });
nextBtn.addEventListener('click', function () { stepEra(1); });

// ===== Автовоспроизведение со скоростью playSpeed =====
function playDelay() {
  return Math.round(BASE_DELAY / playSpeed);
}
function stopPlay() {
  if (playTimer) { clearInterval(playTimer); playTimer = null; }
  playBtn.classList.remove('active');
  playBtn.textContent = '\u25B6 ВОСПРОИЗВЕДЕНИЕ';
}
function startPlay() {
  playBtn.classList.add('active');
  playBtn.textContent = '\u23F8 ПАУЗА';
  if (currentYear >= endYear) updateUI(startYear);
  playTimer = setInterval(function () {
    if (currentYear >= endYear) { stopPlay(); return; }
    updateUI(currentYear + 1);
  }, playDelay());
}
playBtn.addEventListener('click', function () {
  if (playTimer) { stopPlay(); return; }
  startPlay();
});

// ===== Мини-бар скорости =====
function setSpeed(spd) {
  playSpeed = spd;
  Array.prototype.forEach.call(speedBtns, function (b) {
    b.classList.toggle('active', parseFloat(b.getAttribute('data-speed')) === spd);
  });
  // Если воспроизведение идёт — перезапускаем интервал с новой задержкой
  if (playTimer) { clearInterval(playTimer); playTimer = null; startPlay(); }
}
Array.prototype.forEach.call(speedBtns, function (b) {
  b.addEventListener('click', function () {
    setSpeed(parseFloat(b.getAttribute('data-speed')));
  });
});

// ===== Меню «ЭПОХИ» =====
eras.forEach(function (era) {
  var b = document.createElement('button');
  b.className = 'epoch-item';
  b.innerHTML = '<span class="name">' + era.title + '</span><span class="yr">' + window.eraLabel(era) + '</span>';
  b.addEventListener('click', function () { updateUI(era.start); stopPlay(); closeMenu(); });
  epochsMenu.appendChild(b);
});
epochsToggle.addEventListener('click', function (e) {
  e.stopPropagation();
  epochsMenu.classList.toggle('open');
  epochsToggle.classList.toggle('open', epochsMenu.classList.contains('open'));
});
document.addEventListener('click', function (e) {
  if (!epochsMenu.contains(e.target) && e.target !== epochsToggle) closeMenu();
});
function closeMenu() {
  epochsMenu.classList.remove('open');
  epochsToggle.classList.remove('open');
}
function highlightMenu(idx) {
  Array.prototype.forEach.call(epochsMenu.children, function (c, i) {
    c.style.background = (i === idx) ? 'rgba(230,184,0,.18)' : '';
  });
}

// ===== Метки лет под слайдером =====
var markPreview = document.getElementById('mark-preview');
var markPreviewImg = document.getElementById('mark-preview-img');
var markPreviewLabel = document.getElementById('mark-preview-label');
var previewTimer = null;

function hidePreview() {
  if (previewTimer) { clearTimeout(previewTimer); previewTimer = null; }
  markPreview.classList.remove('visible');
}
function showPreview(btn, idx) {
  var era = eras[idx];
  previewTimer = setTimeout(function () {
    probeThumb(era, function (url) {
      if (!url) return;
      var r = btn.getBoundingClientRect();
      markPreviewImg.src = url;
      markPreviewLabel.textContent = era.start + ' · ' + era.title;
      markPreview.style.left = Math.max(110, Math.min(window.innerWidth - 110, r.left + r.width / 2)) + 'px';
      markPreview.style.bottom = (window.innerHeight - r.top + 10) + 'px';
      markPreview.classList.add('visible');
    });
  }, 140);
}

eras.forEach(function (era, idx) {
  var b = document.createElement('button');
  b.className = 'mark-btn';
  b.textContent = era.start;
  b.addEventListener('click', function () { updateUI(era.start); stopPlay(); hidePreview(); });
  b.addEventListener('mouseenter', function () { showPreview(b, idx); });
  b.addEventListener('mouseleave', hidePreview);
  marksBox.appendChild(b);
});
function highlightMarks(idx) {
  Array.prototype.forEach.call(marksBox.children, function (c, i) {
    c.classList.toggle('active', i === idx);
  });
}

// ===== Клавиатура =====
document.addEventListener('keydown', function (e) {
  if (e.key === 'ArrowRight') { updateUI(currentYear + 1); }
  else if (e.key === 'ArrowLeft') { updateUI(currentYear - 1); }
  else if (e.key === ' ') { e.preventDefault(); playBtn.click(); }
  else if (e.key === '+' || e.key === '=') { setScale(scale + 0.5); }
  else if (e.key === '-') { setScale(scale - 0.5); }
  else if (e.key === '0') { resetView(); }
});

// ===== Переход по ссылке с годом: index.html#1923 =====
window.addEventListener('hashchange', function () {
  var y = yearFromHash();
  if (y !== null && y !== currentYear) { stopPlay(); updateUI(y); }
});

// ===== Высота таймлайна: карта и карточка эпохи подстраиваются под него =====
var timeline = document.querySelector('.timeline-controls');
function measureTimeline() {
  if (!timeline) return;
  document.documentElement.style.setProperty('--timeline-h', timeline.offsetHeight + 'px');
}
measureTimeline();
window.addEventListener('resize', measureTimeline);
window.addEventListener('load', measureTimeline);
if (window.ResizeObserver) {
  new ResizeObserver(measureTimeline).observe(timeline);
}

// ===== Смена «телефон ↔ компьютер»: перечитываем карту нужного размера =====
var resizeTimer = null;
window.addEventListener('resize', function () {
  if (resizeTimer) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(function () {
    resizeTimer = null;
    var nowSmall = isSmallScreen();
    if (nowSmall === smallMode) return;
    smallMode = nowSmall;
    imageCache = {};
    shownIndex = -1;
    updateUI(currentYear);
  }, 300);
});

// ===== Инициализация =====
mapImage.addEventListener('dragstart', function (e) { e.preventDefault(); });
resetView();

var initialYear = yearFromHash();
updateUI(initialYear === null ? startYear : initialYear);
setTimeout(function () { preloadNeighbour(shownIndex); }, 700);
