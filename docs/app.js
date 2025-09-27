// ===== Utils / UI =====
const $ = (s) => document.querySelector(s);
const TBody = (s) => $(s).querySelector('tbody');

function log(msg) {
  const ts = new Date().toLocaleTimeString();
  $('#log').textContent = `[${ts}] ${msg}\n` + $('#log').textContent;
}
const fmtUsd = (x) => '$' + Number(x).toLocaleString(undefined, { maximumFractionDigits: 2 });
const pct    = (x) => (x * 100).toFixed(3) + '%';

// ===== Pair Mapping =====
// Wir normalisieren auf USD/USDT. Binance nutzt meist USDT; Kraken USD (BTC = XBT).
const PAIRS = {
  BTC: { binance: 'BTCUSDT', kraken: 'XBTUSD' },
  ETH: { binance: 'ETHUSDT', kraken: 'ETHUSD' },
  SOL: { binance: 'SOLUSDT', kraken: 'SOLUSD' },
  XRP: { binance: 'XRPUSDT', kraken: 'XRPUSD' },
  ADA: { binance: 'ADAUSDT', kraken: 'ADAUSD' },
  DOGE:{ binance: 'DOGEUSDT', kraken: 'DOGEUSD' },
  LTC: { binance: 'LTCUSDT', kraken: 'LTCUSD' },
  BNB: { binance: 'BNBUSDT', kraken: null } // BNB meist nicht als USD-Spot auf Kraken
};

// ===== REST Fetcher (ohne Keys) =====
async function fetchBinanceBook(symbol) {
  const url = `https://api.binance.com/api/v3/ticker/bookTicker?symbol=${symbol}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Binance ${res.status}`);
  const j = await res.json();
  const bid = Number(j.bidPrice), ask = Number(j.askPrice);
  if (!isFinite(bid) || !isFinite(ask)) throw new Error('Binance invalid book');
  return { exchange: 'Binance', bid, ask };
}

async function fetchKrakenBook(pair) {
  if (!pair) throw new Error('Kraken pair not supported');
  const url = `https://api.kraken.com/0/public/Ticker?pair=${pair}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Kraken ${res.status}`);
  const j = await res.json();
  if (j.error && j.error.length) throw new Error('Kraken ' + j.error.join('; '));
  const key = Object.keys(j.result || {})[0];
  const obj = j.result?.[key];
  const bid = Number(obj?.b?.[0]);
  const ask = Number(obj?.a?.[0]);
  if (!isFinite(bid) || !isFinite(ask)) throw new Error('Kraken invalid book');
  return { exchange: 'Kraken', bid, ask };
}

// ===== Demo / Synthese =====
function makeBookFromMid(mid, feeBps = 5, spreadBps = 8) {
  const fee = mid * (feeBps / 10000);
  const spr = mid * (spreadBps / 10000);
  return { bid: mid - fee - spr / 2, ask: mid + fee + spr / 2 };
}
function mockQuotes(symbol) {
  const base = symbol === 'BTC' ? 60000 : symbol === 'ETH' ? 2500 : 100;
  const drift = (Math.random() * 200 - 100) * (symbol === 'BTC' ? 1 : symbol === 'ETH' ? 0.1 : 0.02);
  const a = base + drift;
  const b = base + drift * 0.8;
  return [
    { exchange: 'DemoA', symbol, ...makeBookFromMid(a) },
    { exchange: 'DemoB', symbol, ...makeBookFromMid(b) }
  ];
}

// ===== Live Aggregation =====
async function liveQuotes(symbol) {
  const map = PAIRS[symbol];
  const results = await Promise.allSettled([
    fetchBinanceBook(map.binance),
    map.kraken ? fetchKrakenBook(map.kraken) : Promise.resolve(null)
  ]);

  const quotes = [];
  results.forEach((r) => {
    if (r.status === 'fulfilled' && r.value) quotes.push({ ...r.value, symbol });
    if (r.status === 'rejected') log('Warn: ' + r.reason?.message || r.reason);
  });

  // Fallback, falls beides fehlschlägt
  return quotes.length ? quotes : mockQuotes(symbol);
}

// ===== Arbitrage =====
function scanArb(quotes, notional) {
  const out = [];
  for (let i = 0; i < quotes.length; i++) {
    for (let j = 0; j < quotes.length; j++) {
      if (i === j) continue;
      const buy = quotes[i];   // buy at ask
      const sell = quotes[j];  // sell at bid
      const spread = sell.bid - buy.ask;
      if (spread > 0) {
        const spreadPct = spread / buy.ask;
        out.push({
          buyOn: buy.exchange,
          sellOn: sell.exchange,
          spread,
          spreadPct,
          estProfit: notional * spreadPct
        });
      }
    }
  }
  out.sort((a, b) => b.estProfit - a.estProfit);
  return out;
}

// ===== Render =====
function renderQuotes(symbol, quotes) {
  const tb = TBody('#quotes');
  tb.innerHTML = '';
  for (const q of quotes) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${q.exchange}</td>
      <td>${symbol}</td>
      <td class="good">${fmtUsd(q.bid)}</td>
      <td class="bad">${fmtUsd(q.ask)}</td>
    `;
    tb.appendChild(tr);
  }
}
function renderArbs(arbs) {
  const tb = TBody('#arbs');
  tb.innerHTML = '';
  if (!arbs.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="5" style="color:#a8b3c7">Keine positive Spanne gefunden</td>`;
    tb.appendChild(tr);
    return;
  }
  for (const a of arbs) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${a.buyOn}</td>
      <td>${a.sellOn}</td>
      <td>${fmtUsd(a.spread)}</td>
      <td>${pct(a.spreadPct)}</td>
      <td>${fmtUsd(a.estProfit)}</td>
    `;
    tb.appendChild(tr);
  }
}

// ===== Controller =====
let timer = null;

async function tick() {
  const mode = $('#mode').value;
  const symbol = $('#symbol').value;
  const notional = Number($('#notional').value || 1000);

  try {
    const quotes = mode === 'live' ? await liveQuotes(symbol) : mockQuotes(symbol);
    renderQuotes(symbol, quotes);
    const arbs = scanArb(quotes, notional);
    renderArbs(arbs);
    log(`${mode === 'live' ? 'Live' : 'Demo'} Update ${symbol} – Quellen: ${quotes.map(q => q.exchange).join(' & ')}`);
  } catch (e) {
    log('Fehler: ' + (e?.message || String(e)));
  }
}

function start() {
  if (timer) return;
  const interval = Math.max(2, Number($('#refresh').value || 5)) * 1000;
  tick();
  timer = setInterval(tick, interval);
  log('⏱️ Auto-Refresh gestartet');
}
function stop() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
  log('⏸️ Auto-Refresh gestoppt');
}

document.addEventListener('DOMContentLoaded', () => {
  $('#btnStart').addEventListener('click', start);
  $('#btnStop').addEventListener('click', stop);
  start();
});