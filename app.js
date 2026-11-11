'use strict';
const $ = s => document.querySelector(s);
const PRESETS = { seoul:[37.5665,126.978], busan:[35.1796,129.0756], daegu:[35.8714,128.6014], incheon:[37.4563,126.7052],
  gwangju:[35.1595,126.8526], daejeon:[36.3504,127.3845], ulsan:[35.5384,129.3114], jeju:[33.4996,126.5312],
  tokyo:[35.6762,139.6503], beijing:[39.9042,116.4074], newyork:[40.7128,-74.006], london:[51.5074,-0.1278] };
const KEY = { 0:'clear',1:'mostly',2:'partly',3:'overcast',45:'fog',48:'fog',51:'drizzle',53:'drizzle',55:'drizzle',56:'freezing',57:'freezing',
  61:'rain',63:'rain',65:'heavyRain',66:'freezing',67:'freezing',71:'snow',73:'snow',75:'heavySnow',77:'grains',
  80:'shower',81:'shower',82:'heavyShower',85:'snowShower',86:'snowShower',95:'thunder',96:'hail',99:'hail' };
const cat = c => c === 0 ? 'sun' : c <= 2 ? 'partly' : c <= 48 ? 'cloud' : (c >= 95 || c === 82) ? 'storm' : ((c >= 71 && c <= 77) || c === 85 || c === 86) ? 'snow' : 'rain';
const FACE = { sun:'wink', partly:'hug', cloud:'sleepy', rain:'worry', storm:'wow', snow:'cheer' };
const ICON = { partly:[96,73,'i-cloud'], sun:[96,104,'i-sun'], cloud:[96,73,'i-cloud'], rain:[96,88,'i-rain'], storm:[96,92,'i-storm'], snow:[96,73,'i-snow'] };
const ls = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };

let lang = 'ko', T = LANGS.ko, place = null, data = null, lastCat = null;
const BOT = /bot|crawl|spider|slurp|lighthouse|googleother|bingpreview|facebookexternalhit/i.test(navigator.userAgent);
const pick = () => {
  if (BOT) return 'ko';
  const s = ls.get('lang'); if (LANGS[s]) return s;
  for (const l of navigator.languages || [navigator.language || 'en']) {
    const p = l.toLowerCase(); if (p.startsWith('ko')) return 'ko'; if (p.startsWith('ja')) return 'ja'; if (p.startsWith('zh')) return 'zh'; if (p.startsWith('en')) return 'en';
  }
  return 'en';
};
const tpl = (s, n) => s.replace('{n}', n);
const setStatus = (m, err) => { const e = $('#status'); e.textContent = m || ''; e.className = 'status' + (err ? ' err' : ''); };
const pname = p => p.k ? T.city[p.k] : (p.my ? T.myPlace : p.name);

function applyLang(l, explicit) {
  lang = l; T = LANGS[l]; if (explicit) ls.set('lang', l);
  document.documentElement.lang = l === 'zh' ? 'zh-CN' : l;
  // 검색엔진용 메타(제목·설명)는 사용자가 직접 언어를 고른 경우에만 바꾼다 (자동 감지로 바뀌면 색인이 영어로 잡힘)
  const meta = explicit || ls.get('lang');
  if (meta) document.title = T.title;
  const set = (sel, a, v) => { const e = document.querySelector(sel); if (e) e.setAttribute(a, v); };
  if (meta) {
    set('meta[name=description]', 'content', T.desc);
    set('meta[property="og:title"]', 'content', T.title); set('meta[property="og:description"]', 'content', T.desc);
    set('meta[name="twitter:title"]', 'content', T.site); set('meta[name="twitter:description"]', 'content', T.desc);
    set('meta[property="og:locale"]', 'content', T.og);
  }
  document.querySelectorAll('[data-i18n]').forEach(e => { const v = T[e.dataset.i18n]; if (v != null) e.textContent = v; });
  document.querySelectorAll('[data-i18n-ph]').forEach(e => e.placeholder = T[e.dataset.i18nPh]);
  $('#lang').value = l;
  presets(); say(lastCat); if (data) render();
}

function presets() {
  const box = $('#presets'); box.textContent = '';
  for (const k in PRESETS) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = T.city[k];
    if (place && place.k === k) b.className = 'on';
    b.onclick = () => choose({ k, lat: PRESETS[k][0], lon: PRESETS[k][1] }); box.append(b);
  }
}

function say(c) {
  lastCat = c;
  $('#say').textContent = c ? T.say[c] : T.hello;
  $('#face').src = 'img/face-' + (c ? FACE[c] : 'wink') + '.webp';
}

$('#lang').addEventListener('change', e => applyLang(e.target.value, true));

$('#searchForm').addEventListener('submit', async e => {
  e.preventDefault();
  const q = $('#q').value.trim(); if (!q) return;
  setStatus(T.searching);
  try {
    const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=${T.geo}`);
    const list = (await r.json()).results || [];
    const ul = $('#results'); ul.textContent = '';
    if (!list.length) { ul.hidden = true; return setStatus(T.noResult, true); }
    list.forEach(x => {
      const li = document.createElement('li'), b = document.createElement('button'); b.type = 'button';
      b.textContent = [x.name, x.admin1, x.country].filter(Boolean).join(', ');
      b.onclick = () => choose({ name: [x.name, x.admin1].filter(Boolean).join(' '), lat: x.latitude, lon: x.longitude });
      li.append(b); ul.append(li);
    });
    ul.hidden = false; setStatus('');
  } catch { setStatus(T.searchFail, true); }
});

$('#geoBtn').onclick = () => {
  if (!navigator.geolocation) return setStatus(T.geoNo, true);
  setStatus(T.locating);
  navigator.geolocation.getCurrentPosition(p => choose({ my: 1, lat: p.coords.latitude, lon: p.coords.longitude }),
    () => setStatus(T.geoDenied, true), { timeout: 10000 });
};

function choose(p) {
  place = p; ls.set('place', JSON.stringify(p));
  $('#results').hidden = true; $('#q').value = '';
  presets(); load();
}

// ---- 데이터 ----
const inKorea = p => p.lat > 33 && p.lat < 38.7 && p.lon > 124 && p.lon < 132;
const API = (p, model) => `https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}` +
  `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,precipitation_probability_max` +
  `&past_days=3&forecast_days=5&timezone=auto` + (model ? `&models=${model}` : '');
const usable = j => j && j.daily && j.daily.time && j.daily.time.length === 8 &&
  ['weather_code', 'temperature_2m_max', 'temperature_2m_min'].every(k => j.daily[k] && j.daily[k].every(v => v != null));
const get = async u => { try { const r = await fetch(u); return r.ok ? await r.json() : null; } catch { return null; } };
const ck = p => `wx:${p.lat.toFixed(2)},${p.lon.toFixed(2)}`;

async function load() {
  const key = ck(place); let cached = null;
  try { cached = JSON.parse(ls.get(key)); } catch {}
  const age = cached ? Date.now() - cached.t : Infinity;
  if (cached && age < 6 * 36e5 && cached.d.daily.time[3] === localToday(cached.d)) { data = cached.d; render(); setStatus(''); if (age < 30 * 6e4) return; }
  else { $('#view').hidden = true; setStatus(T.loading); }
  let j = null, src = '';
  if (inKorea(place)) { j = await get(API(place, 'kma_seamless')); src = 'kma'; if (!usable(j)) j = null; }
  if (!j) { j = await get(API(place)); src = 'om'; if (!usable(j)) j = null; }
  if (!j) { if (!data) setStatus(T.wxFail, true); return; }
  j.src = src; data = j; ls.set(key, JSON.stringify({ t: Date.now(), d: j }));
  setStatus(''); render();
}
// 캐시가 어제 데이터인지 판별 (현지 날짜 기준)
function localToday(d) {
  try { return new Intl.DateTimeFormat('sv-SE', { timeZone: d.timezone }).format(new Date()); } catch { return null; }
}

// ---- 렌더 ----
const dfmt = () => new Intl.DateTimeFormat(T.loc, { month: 'numeric', day: 'numeric', weekday: 'short', timeZone: 'UTC' });
const dshort = iso => { const [, m, d] = iso.split('-').map(Number); return `${m}/${d}`; };
const dlong = iso => dfmt().format(new Date(iso + 'T00:00:00Z'));

function rows() {
  const d = data.daily;
  return d.time.map((t, i) => ({ date: t, code: d.weather_code[i], hi: d.temperature_2m_max[i], lo: d.temperature_2m_min[i],
    rain: d.precipitation_sum[i] ?? 0, wind: d.wind_speed_10m_max[i] ?? 0,
    pop: d.precipitation_probability_max ? d.precipitation_probability_max[i] : null, off: i - 3, fc: i > 3 }));
}
const icon = c => { const [w, h, n] = ICON[c];
  return `<img src="img/${n}.webp" width="${w}" height="${h}" alt="" loading="lazy" decoding="async">`; };
const wicon = c => c === 'partly'
  ? `<span class="wi partly"><img class="s" src="img/i-sun.webp" width="96" height="104" alt="" loading="lazy" decoding="async"><img class="c" src="img/i-cloud.webp" width="96" height="73" alt="" loading="lazy" decoding="async"></span>`
  : `<span class="wi">${icon(c)}</span>`;
const tag = o => o === 0 ? T.today : o === -1 ? T.yest : o === 1 ? T.tmrw : o < 0 ? tpl(T.ago, -o) : tpl(T.later, o);

function render() {
  if (!data) return;
  const r = rows(); $('#view').hidden = false;
  $('#place').textContent = pname(place);
  $('#range').textContent = `${dlong(r[0].date)} ~ ${dlong(r[r.length - 1].date)} · ${T[data.src]}`;
  $('#days').innerHTML = r.map(x => {
    const c = cat(x.code);
    return `<article class="day${x.off === 0 ? ' today' : ''}${x.fc ? ' fc' : ''}"><div class="d">${dlong(x.date)}</div><div class="tag">${tag(x.off)}</div>
      <span class="badge">${x.fc ? T.fcst : T.actual}</span>${wicon(c)}<div class="cn">${T.cond[KEY[x.code] || 'overcast']}</div>
      <div class="t"><b>${Math.round(x.hi)}°</b> / <span>${Math.round(x.lo)}°</span></div>
      <div class="m">💧 ${x.rain.toFixed(1)}mm${x.fc && x.pop != null ? ` · ${x.pop}%` : ''}<br>💨 ${Math.round(x.wind)}km/h</div></article>`;
  }).join('');
  chart(r); say(cat(r[3].code));
}

function chart(r) {
  const W = 640, H = 230, L = 34, R = 12, T0 = 20, B = 54, n = r.length;
  const temps = r.flatMap(x => [x.hi, x.lo]);
  const mn = Math.floor(Math.min(...temps) - 2), mx = Math.ceil(Math.max(...temps) + 2);
  const maxRain = Math.max(5, ...r.map(x => x.rain));
  const X = i => L + i * (W - L - R) / (n - 1), Y = v => T0 + (mx - v) * (H - T0 - B) / (mx - mn);
  const bw = Math.min(28, (W - L - R) / n * .5), f0 = r.findIndex(x => x.fc);
  let s = '';
  if (f0 > 0) { const x0 = (X(f0 - 1) + X(f0)) / 2;
    s += `<rect x="${x0}" y="${T0 - 12}" width="${W - R - x0}" height="${H - B - T0 + 12}" fill="var(--accent)" opacity=".09" rx="8"/><text x="${W - R - 6}" y="${T0 - 2}" text-anchor="end">${T.fcst}</text>`; }
  const step = Math.max(1, Math.round((mx - mn) / 4));
  for (let t = mn; t <= mx; t += step) s += `<line x1="${L}" x2="${W - R}" y1="${Y(t)}" y2="${Y(t)}" stroke="var(--line)"/><text x="${L - 6}" y="${Y(t) + 4}" text-anchor="end">${t}°</text>`;
  r.forEach((x, i) => {
    const h = x.rain / maxRain * 50, c = cat(x.code), [iw, ih, nm] = ICON[c], w = 22, hh = Math.round(ih * w / iw);
    s += `<rect x="${X(i) - bw / 2}" y="${H - B - h}" width="${bw}" height="${h}" fill="var(--rain)" opacity=".5" rx="4"/>`;
    s += `<text x="${X(i)}" y="${H - 34}" text-anchor="middle">${dshort(x.date)}</text>`;
    s += c === 'partly'
      ? `<image href="img/i-sun.webp" x="${X(i) - 14}" y="${H - 30}" width="16" height="17"/><image href="img/i-cloud.webp" x="${X(i) - 7}" y="${H - 22}" width="20" height="15"/>`
      : `<image href="img/${nm}.webp" x="${X(i) - w / 2}" y="${H - 30 + (22 - hh) / 2}" width="${w}" height="${hh}"/>`;
  });
  const line = (k, c) => {
    const pts = (a, b) => r.slice(a, b).map((x, i) => X(a + i) + ',' + Y(x[k])).join(' ');
    s += `<polyline fill="none" stroke="var(${c})" stroke-width="2.5" stroke-linejoin="round" points="${pts(0, f0 < 0 ? n : f0)}"/>`;
    if (f0 > 0) s += `<polyline fill="none" stroke="var(${c})" stroke-width="2.5" stroke-dasharray="6 4" points="${pts(f0 - 1, n)}"/>`;
    r.forEach((x, i) => s += `<circle cx="${X(i)}" cy="${Y(x[k])}" r="3.5" fill="var(${c})"/><text x="${X(i)}" y="${Y(x[k]) + (k === 'hi' ? -8 : 15)}" text-anchor="middle">${Math.round(x[k])}°</text>`);
  };
  line('hi', '--hi'); line('lo', '--lo');
  $('#chart').innerHTML = s;
}

// ---- 시작 ----
try { place = JSON.parse(ls.get('place')); } catch {}
if (!place || place.lat == null) place = { k: 'seoul', lat: PRESETS.seoul[0], lon: PRESETS.seoul[1] };
applyLang(pick());
// 검색 봇은 외부 API를 못 불러 오류 문구가 색인되므로 날씨 로딩을 건너뛴다
if (!BOT) load();
