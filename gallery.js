'use strict';

/* =========================================================================
   «ХРОНИКА» — страница эпох.
   Данные: js/eras-data.js
   Фото правителей: assets/rulers/<год>.*
   Фото эпохи:      assets/gallery/<год>/1.*, 2.*, 3.* ...
   ========================================================================= */

var RULERS_BASE = 'assets/rulers/';
var GALLERY_BASE = 'assets/gallery/';
var MAPS_BASE = 'assets/maps/';
var MAPS_THUMBS = MAPS_BASE + 'thumbs/';
var EXT = ['jpg', 'jpeg', 'webp', 'png', 'JPG', 'JPEG', 'WEBP', 'PNG'];

// Телефон/планшет: карта в лайтбоксе тоже облегчённая
function isSmallScreen() {
  if (window.matchMedia && window.matchMedia('(max-width: 820px)').matches) return true;
  var c = navigator.connection;
  return !!(c && c.saveData);
}

var eras = window.ERAS;
var currentIdx = 0;

var railList = document.getElementById('rail-list');
var detail = document.getElementById('era-detail');
var rulerImg = document.getElementById('ruler-img');
var rulerPh = document.getElementById('ruler-ph');
var rulerName = document.getElementById('ruler-name');
var rulerYears = document.getElementById('ruler-years');
var eraRange = document.getElementById('era-range');
var eraTitle = document.getElementById('era-title');
var eraLead = document.getElementById('era-lead');
var eraStory = document.getElementById('era-story');
var eraFacts = document.getElementById('era-facts');
var galleryBox = document.getElementById('era-gallery');
var galleryCount = document.getElementById('gallery-count');
var prevEraBtn = document.getElementById('prev-era');
var nextEraBtn = document.getElementById('next-era');
var slider = document.getElementById('year-slider');
var barYear = document.getElementById('bar-year');
var barMarks = document.getElementById('bar-marks');
var epochsMenu = document.getElementById('epochs-menu');
var epochsToggle = document.getElementById('epochs-toggle');
var mapLink = document.getElementById('map-link');
var lightbox = document.getElementById('lightbox');
var lbImg = document.getElementById('lb-img');
var lbCap = document.getElementById('lb-cap');
var lbClose = document.getElementById('lb-close');

// ===== Перебор расширений =====
function probe(base, exts, done) {
  var i = 0;
  (function next() {
    if (i >= exts.length) { done(null); return; }
    var url = base + '.' + exts[i++];
    var im = new Image();
    im.onload = function () { done(url); };
    im.onerror = next;
    im.src = url;
  })();
}

// ===== Индекс эпохи по году =====
function eraIndexFor(year) {
  var last = eras.length - 1;
  if (year <= eras[0].start) return 0;
  if (year >= eras[last].start) return last;
  for (var i = last; i >= 0; i--) {
    if (year >= eras[i].start) return i;
  }
  return 0;
}

function yearFromHash() {
  var n = parseInt((location.hash || '').replace('#', ''), 10);
  return isNaN(n) ? null : n;
}

// ===== Левая колонка =====
eras.forEach(function (era, i) {
  var b = document.createElement('button');
  b.className = 'rail-item';
  b.innerHTML = '<span class="r-yr">' + era.start + '</span>' +
                '<span class="r-name">' + era.title + '</span>';
  b.addEventListener('click', function () { selectEra(i); });
  railList.appendChild(b);
});

// ===== Метки лет внизу =====
eras.forEach(function (era, i) {
  var b = document.createElement('button');
  b.className = 'mark-btn';
  b.textContent = era.start;
  b.addEventListener('click', function () { selectEra(i); });
  barMarks.appendChild(b);
});

// ===== Меню «ЭПОХИ» =====
eras.forEach(function (era, i) {
  var b = document.createElement('button');
  b.className = 'epoch-item';
  b.innerHTML = '<span class="name">' + era.title + '</span><span class="yr">' + window.eraLabel(era) + '</span>';
  b.addEventListener('click', function () {
    selectEra(i);
    epochsMenu.classList.remove('open');
    epochsToggle.classList.remove('open');
  });
  epochsMenu.appendChild(b);
});
epochsToggle.addEventListener('click', function (e) {
  e.stopPropagation();
  epochsMenu.classList.toggle('open');
  epochsToggle.classList.toggle('open', epochsMenu.classList.contains('open'));
});
document.addEventListener('click', function (e) {
  if (!epochsMenu.contains(e.target) && e.target !== epochsToggle) {
    epochsMenu.classList.remove('open');
    epochsToggle.classList.remove('open');
  }
});

// ===== Портрет правителя =====
function renderRuler(era) {
  rulerImg.classList.remove('loaded');
  rulerImg.removeAttribute('src');
  rulerPh.classList.remove('hidden');
  rulerImg.alt = 'Портрет: ' + era.ruler;
  rulerName.textContent = era.ruler;
  rulerYears.textContent = era.rulerYears ? ('Годы: ' + era.rulerYears) : '';

  var token = era.start;
  probe(RULERS_BASE + token, EXT, function (url) {
    if (token !== eras[currentIdx].start) return;
    if (!url) return;
    rulerImg.onload = function () {
      rulerImg.classList.add('loaded');
      rulerPh.classList.add('hidden');
    };
    rulerImg.src = url;
  });
}

// ===== Галерея эпохи =====
function addTile(src, tag, caption, isMap, fullSrc) {
  var fig = document.createElement('figure');
  fig.className = 'tile' + (isMap ? ' is-map' : '');
  var im = document.createElement('img');
  im.src = src;
  im.alt = caption;
  im.loading = 'lazy';
  im.decoding = 'async';
  var cap = document.createElement('figcaption');
  cap.innerHTML = '<span class="t-tag">' + tag + '</span><span class="t-name">' + caption + '</span>';
  fig.appendChild(im);
  fig.appendChild(cap);
  fig.addEventListener('click', function () {
    lbImg.onerror = function () {
      lbImg.onerror = null;
      lbImg.src = src;
    };
    lbImg.src = fullSrc || src;
    lbCap.textContent = tag + ' · ' + caption;
    lightbox.classList.add('open');
  });
  // карта всегда первой в галерее, даже если миниатюра загрузилась позже фото
  if (isMap) galleryBox.insertBefore(fig, galleryBox.firstChild);
  else galleryBox.appendChild(fig);
  return fig;
}

var photoCache = {};   // год -> [url, ...]
var PHOTO_EXT = ['jpg', 'jpeg', 'png', 'webp'];

function renderPhotos(era) {
  var cached = photoCache[era.start];
  if (cached) {
    cached.forEach(function (url, i) {
      addTile(url, 'Фото ' + (i + 1), era.title, false);
    });
    updateCount();
    return;
  }

  var acc = [];
  (function next(num) {
    if (num > 6) { photoCache[era.start] = acc; return; }
    probe(GALLERY_BASE + era.start + '/' + num, PHOTO_EXT, function (url) {
      if (!url) { photoCache[era.start] = acc; return; }
      acc.push(url);
      if (era.start === eras[currentIdx].start) {
        addTile(url, 'Фото ' + num, era.title, false);
        updateCount();
      }
      next(num + 1);
    });
  })(1);
}

function renderGallery(era) {
  galleryBox.innerHTML = '';

  // 1) карта эпохи — миниатюра в плитке, полная версия в лайтбоксе
  probe(MAPS_THUMBS + era.start, EXT, function (thumb) {
    var full = MAPS_BASE + era.start + (isSmallScreen() ? '-sm' : '') + '.jpg';
    if (thumb) {
      if (era.start !== eras[currentIdx].start) return;
      addTile(thumb, 'Карта', window.eraLabel(era), true, full);
      updateCount();
      return;
    }
    probe(MAPS_BASE + era.start, EXT, function (url) {
      if (!url || era.start !== eras[currentIdx].start) return;
      addTile(url, 'Карта', window.eraLabel(era), true, url);
      updateCount();
    });
  });

  // 2) фотографии эпохи: assets/gallery/<год>/1..6
  //    Ищем подряд и останавливаемся на первом пропуске — без лишних запросов.
  //    Найденное запоминаем, чтобы при возврате к эпохе ничего не перепроверять.
  renderPhotos(era);

  // 3) заглушка-подсказка
  var empty = document.createElement('div');
  empty.className = 'tile-empty';
  empty.innerHTML = 'Фото эпохи';
  galleryBox.appendChild(empty);

  updateCount();
}

function plural(n) {
  var d10 = n % 10, d100 = n % 100;
  if (d10 === 1 && d100 !== 11) return 'изображение';
  if (d10 >= 2 && d10 <= 4 && (d100 < 12 || d100 > 14)) return 'изображения';
  return 'изображений';
}

function updateCount() {
  var real = galleryBox.querySelectorAll('.tile').length;
  var empty = galleryBox.querySelector('.tile-empty');
  if (real > 0 && empty) galleryBox.removeChild(empty);
  galleryCount.textContent = real ? (real + ' ' + plural(real)) : '—';
}

// ===== Выбор эпохи =====
function selectEra(idx, opts) {
  idx = Math.max(0, Math.min(eras.length - 1, idx));
  currentIdx = idx;
  var era = eras[idx];

  Array.prototype.forEach.call(railList.children, function (c, i) {
    c.classList.toggle('active', i === idx);
  });
  Array.prototype.forEach.call(barMarks.children, function (c, i) {
    c.classList.toggle('active', i === idx);
  });
  Array.prototype.forEach.call(epochsMenu.children, function (c, i) {
    c.style.background = (i === idx) ? 'rgba(230,184,0,.18)' : '';
  });

  eraRange.textContent = window.eraLabel(era);
  eraTitle.textContent = era.title;
  eraLead.textContent = era.desc;

  eraStory.innerHTML = '';
  (era.story || []).forEach(function (text) {
    var p = document.createElement('p');
    p.textContent = text;
    eraStory.appendChild(p);
  });

  eraFacts.innerHTML = '';
  (era.facts || []).forEach(function (f) {
    var d = document.createElement('div');
    d.className = 'fact';
    d.innerHTML = '<span class="f-l">' + f[0] + '</span><span class="f-v">' + f[1] + '</span>';
    eraFacts.appendChild(d);
  });

  renderRuler(era);
  renderGallery(era);

  slider.value = era.start;
  barYear.textContent = era.start;
  mapLink.setAttribute('href', 'сайт.html#' + era.start);
  prevEraBtn.disabled = idx <= 0;
  nextEraBtn.disabled = idx >= eras.length - 1;

  var railItem = railList.children[idx];
  if (railItem && railItem.scrollIntoView) {
    railItem.scrollIntoView({ block: 'nearest' });
  }

  if (!opts || !opts.silent) {
    detail.classList.remove('fade-in');
    void detail.offsetWidth;
    detail.classList.add('fade-in');
    detail.scrollTop = 0;
  }

  if (location.hash !== '#' + era.start) {
    history.replaceState(null, '', '#' + era.start);
  }
  document.title = era.start + ' — ' + era.title + ' · Хроника эпох';
}

// ===== Пейджер =====
prevEraBtn.addEventListener('click', function () { selectEra(currentIdx - 1); });
nextEraBtn.addEventListener('click', function () { selectEra(currentIdx + 1); });

// ===== Слайдер (любой год) =====
slider.addEventListener('input', function (e) {
  selectEra(eraIndexFor(parseInt(e.target.value, 10)), { silent: true });
});

// ===== Клавиатура =====
document.addEventListener('keydown', function (e) {
  if (lightbox.classList.contains('open')) {
    if (e.key === 'Escape') lightbox.classList.remove('open');
    return;
  }
  if (e.key === 'ArrowRight') { selectEra(currentIdx + 1); }
  else if (e.key === 'ArrowLeft') { selectEra(currentIdx - 1); }
});

// ===== Лайтбокс =====
lightbox.addEventListener('click', function () { lightbox.classList.remove('open'); });
lbClose.addEventListener('click', function (e) {
  e.stopPropagation();
  lightbox.classList.remove('open');
});

// ===== Переход по ссылке с годом =====
window.addEventListener('hashchange', function () {
  var y = yearFromHash();
  if (y === null) return;
  var i = eraIndexFor(y);
  if (i !== currentIdx) selectEra(i);
});

// ===== Инициализация =====
var startIdx = yearFromHash();
selectEra(startIdx === null ? 0 : eraIndexFor(startIdx));
