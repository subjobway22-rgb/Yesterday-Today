'use strict';
const $ = s => document.querySelector(s);
const PRESETS = [
  ['서울',37.5665,126.978],['부산',35.1796,129.0756],['대구',35.8714,128.6014],['인천',37.4563,126.7052],
  ['광주',35.1595,126.8526],['대전',36.3504,127.3845],['울산',35.5384,129.3114],['제주',33.4996,126.5312]
];
const WMO = {0:['☀️','맑음'],1:['🌤️','대체로 맑음'],2:['⛅','구름 조금'],3:['☁️','흐림'],45:['🌫️','안개'],48:['🌫️','안개'],
  51:['🌦️','가랑비'],53:['🌦️','가랑비'],55:['🌦️','가랑비'],56:['🌧️','어는 비'],57:['🌧️','어는 비'],61:['🌧️','비'],63:['🌧️','비'],65:['🌧️','강한 비'],
  66:['🌧️','어는 비'],67:['🌧️','어는 비'],71:['🌨️','눈'],73:['🌨️','눈'],75:['❄️','강한 눈'],77:['🌨️','싸락눈'],
  80:['🌦️','소나기'],81:['🌦️','소나기'],82:['⛈️','강한 소나기'],85:['🌨️','눈 소나기'],86:['🌨️','눈 소나기'],95:['⛈️','뇌우'],96:['⛈️','뇌우·우박'],99:['⛈️','뇌우·우박']};
const wmo = c => WMO[c] || ['❔','알 수 없음'];

let place = null, data = null;
try { place = JSON.parse(localStorage.getItem('place')); } catch {}

const status = (msg, err) => { const e = $('#status'); e.textContent = msg || ''; e.className = 'status' + (err ? ' err' : ''); };

// 프리셋
PRESETS.forEach(([n, lat, lon]) => {
  const b = document.createElement('button'); b.type = 'button'; b.textContent = n;
  b.onclick = () => choose({ name: n, lat, lon }); $('#presets').append(b);
});

$('#searchForm').addEventListener('submit', async e => {
  e.preventDefault();
  const q = $('#q').value.trim(); if (!q) return;
  status('검색 중…');
  try {
    const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=ko`);
    const j = await r.json(); const list = j.results || [];
    const ul = $('#results'); ul.innerHTML = '';
    if (!list.length) { ul.hidden = true; return status('검색 결과가 없어요.', true); }
    list.forEach(x => {
      const li = document.createElement('li'), b = document.createElement('button');
      b.type = 'button';
      b.textContent = [x.name, x.admin1, x.country].filter(Boolean).join(', ');
      b.onclick = () => choose({ name: [x.name, x.admin1].filter(Boolean).join(' '), lat: x.latitude, lon: x.longitude });
      li.append(b); ul.append(li);
    });
    ul.hidden = false; status('');
  } catch { status('검색에 실패했어요. 네트워크를 확인해주세요.', true); }
});

$('#geoBtn').onclick = () => {
  if (!navigator.geolocation) return status('이 브라우저는 위치 기능을 지원하지 않아요.', true);
  status('위치 확인 중…');
  navigator.geolocation.getCurrentPosition(
    p => choose({ name: '내 위치', lat: p.coords.latitude, lon: p.coords.longitude }),
    () => status('위치 권한이 거부되었어요.', true), { timeout: 10000 });
};

function choose(p) {
  place = p; try { localStorage.setItem('place', JSON.stringify(p)); } catch {}
  $('#results').hidden = true; $('#q').value = '';
  load();
}

const inKorea = p => p.lat > 33 && p.lat < 38.7 && p.lon > 124 && p.lon < 132;
const API = (p, model) => `https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}` +
  `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,precipitation_probability_max` +
  `&past_days=3&forecast_days=5&timezone=auto` + (model ? `&models=${model}` : '');
const usable = j => j && j.daily && j.daily.time && j.daily.time.length === 8 &&
  ['weather_code', 'temperature_2m_max', 'temperature_2m_min'].every(k => j.daily[k] && j.daily[k].every(v => v != null));

async function get(url) { try { const r = await fetch(url); return r.ok ? await r.json() : null; } catch { return null; } }

async function load() {
  status('날씨 불러오는 중…'); $('#view').hidden = true;
  let j = null, src = '';
  if (inKorea(place)) { j = await get(API(place, 'kma_seamless')); src = '기상청(KMA) 모델'; if (!usable(j)) j = null; }
  if (!j) { j = await get(API(place)); src = 'Open-Meteo 통합 모델'; if (!usable(j)) j = null; }
  if (!j) return status('날씨 정보를 불러오지 못했어요.', true);
  // 모델 지정 시 변수명에 접미사가 붙을 수 있어 정규화
  Object.keys(j.daily).forEach(k => { const m = k.match(/^(.*)_kma_seamless$/); if (m) j.daily[m[1]] = j.daily[k]; });
  data = j; data.src = src; status(''); render();
}

const fmt = iso => { const [y, m, d] = iso.split('-').map(Number); const w = '일월화수목금토'[new Date(y, m - 1, d).getDay()]; return `${m}/${d} (${w})`; };

function rows() {
  const d = data.daily, today = d.time.length - 5; // 인덱스 3 = 오늘
  return d.time.map((t, i) => ({
    date: t, code: d.weather_code[i], hi: d.temperature_2m_max[i], lo: d.temperature_2m_min[i],
    rain: d.precipitation_sum[i] ?? 0, wind: d.wind_speed_10m_max[i] ?? 0, pop: d.precipitation_probability_max ? d.precipitation_probability_max[i] : null,
    off: i - today, fc: i > today }));
}

function render() {
  if (!data) return;
  const r = rows();
  $('#view').hidden = false;
  $('#place').textContent = place.name;
  $('#range').textContent = `${fmt(r[0].date)} ~ ${fmt(r[r.length - 1].date)} · ${data.src} · 실제 ${r.filter(x => !x.fc).length}일 + 예보 ${r.filter(x => x.fc).length}일`;
  $('#days').innerHTML = r.map(x => {
    const [ic, tx] = wmo(x.code);
    const tag = x.off === 0 ? '오늘 · 실제' : x.off === -1 ? '어제 · 실제' : x.off < 0 ? `${-x.off}일 전 · 실제` : x.off === 1 ? '내일 · 예보' : `${x.off}일 후 · 예보`;
    return `<div class="day${x.off === 0 ? ' today' : ''}${x.fc ? ' fc' : ''}"><div class="d">${fmt(x.date)}</div><div class="tag">${tag}</div>
      <div class="ico" aria-hidden="true">${ic}</div><div>${tx}</div>
      <div class="t"><b>${Math.round(x.hi)}°</b> / <span>${Math.round(x.lo)}°</span></div>
      <div class="m">💧 ${x.rain.toFixed(1)}mm${x.fc && x.pop != null ? ` (${x.pop}%)` : ''} · 💨 ${Math.round(x.wind)}km/h</div></div>`;
  }).join('');
  chart(r);
}

function chart(r) {
  const W = 640, H = 220, L = 34, R = 12, T = 18, B = 44, n = r.length;
  const temps = r.flatMap(x => [x.hi, x.lo]);
  let mn = Math.floor(Math.min(...temps) - 2), mx = Math.ceil(Math.max(...temps) + 2);
  const maxRain = Math.max(5, ...r.map(x => x.rain));
  const X = i => L + (n === 1 ? (W - L - R) / 2 : i * (W - L - R) / (n - 1));
  const Y = v => T + (mx - v) * (H - T - B) / (mx - mn);
  const bw = Math.min(28, (W - L - R) / n * .5);
  let s = '';
  const f0 = r.findIndex(x => x.fc);
  if (f0 > 0) s += `<rect x="${(X(f0 - 1) + X(f0)) / 2}" y="${T - 10}" width="${W - R - (X(f0 - 1) + X(f0)) / 2}" height="${H - B - T + 10}" fill="var(--accent)" opacity=".08"/><text x="${W - R - 4}" y="${T - 2}" text-anchor="end">예보</text>`;
  for (let t = mn; t <= mx; t += Math.max(1, Math.round((mx - mn) / 4)))
    s += `<line x1="${L}" x2="${W - R}" y1="${Y(t)}" y2="${Y(t)}" stroke="var(--line)"/><text x="${L - 6}" y="${Y(t) + 4}" text-anchor="end">${t}°</text>`;
  r.forEach((x, i) => {
    const h = x.rain / maxRain * 50;
    s += `<rect x="${X(i) - bw / 2}" y="${H - B - h}" width="${bw}" height="${h}" fill="var(--rain)" opacity=".45" rx="3"/>`;
    s += `<text x="${X(i)}" y="${H - 24}" text-anchor="middle">${fmt(x.date).split(' ')[0]}</text><text x="${X(i)}" y="${H - 10}" text-anchor="middle">${wmo(x.code)[0]}</text>`;
  });
  const line = (k, c) => {
    const pts = (a, b) => r.slice(a, b).map((x, i) => X(a + i) + ',' + Y(x[k])).join(' ');
    const e = f0 < 0 ? r.length : f0;
    s += `<polyline fill="none" stroke="var(${c})" stroke-width="2.5" points="${pts(0, e)}"/>`;
    if (f0 > 0) s += `<polyline fill="none" stroke="var(${c})" stroke-width="2.5" stroke-dasharray="6 4" points="${pts(f0 - 1, r.length)}"/>`;
    r.forEach((x, i) => s += `<circle cx="${X(i)}" cy="${Y(x[k])}" r="3.5" fill="var(${c})"/><text x="${X(i)}" y="${Y(x[k]) + (k === 'hi' ? -8 : 15)}" text-anchor="middle">${Math.round(x[k])}°</text>`);
  };
  line('hi', '--hi'); line('lo', '--lo');
  $('#chart').innerHTML = s;
}

if (place && place.lat != null) load(); else choose({ name: PRESETS[0][0], lat: PRESETS[0][1], lon: PRESETS[0][2] });
