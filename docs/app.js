// ===== Utils / UI =====
const $ = (s) => document.querySelector(s);
const TBody = (s) => $(s).querySelector('tbody');
function log(msg) {
  const ts = new Date().toLocaleTimeString();
  $('#log').textContent = `[${ts}] ${msg}\n` + $('#log').textContent;
}
const fmtUsd = (x) => '$' + Number(x).toLocaleString(undefined, { maximumFractionDigits: 2 });
const pct    = (x) => (x * 100).toFixed(3) + '%';

// ===== Symbol-Mapping je Exchange =====
// Wir normalisieren auf USD/USDT. (Achtung: Formate unterscheiden sich je Börse.)
const MAP = {
  BTC: {
    binance:  'BTCUSDT',
    kraken:   'XBTUSD',
    bybit:    'BTCUSDT',
    okx:      'BTC-USDT',
    coinbase: 'BTC-USD',
    bitstamp: 'btcusd',
    kucoin:   'BTC-USDT'
  },
  ETH: {
    binance:  'ETHUSDT',
    kraken:   'ETHUSD',
    bybit:    'ETHUSDT',
    okx:      'ETH-USDT',
    coinbase: 'ETH-USD',
    bitstamp: 'ethusd',
    kucoin:   'ETH-USDT'
  },
  SOL: {
    binance:  'SOLUSDT',
    kraken:   'SOLUSD',
    bybit:    'SOLUSDT',
    okx:      'SOL-USDT',
    coinbase: 'SOL-USD',
    bitstamp: 'solusd',
    kucoin:   'SOL-USDT'
  },
  XRP: {
    binance:  'XRPUSDT',
    kraken:   'XRPUSD',
    bybit:    'XRPUSDT',
    okx:      'XRP-USDT',
    coinbase: 'XRP-USD',
    bitstamp: 'xrpusd',
    kucoin:   'XRP-USDT'
  },
  ADA: {
    binance:  'ADAUSDT',
    kraken:   'ADAUSD',
    bybit:    'ADAUSDT',
    okx:      'ADA-USDT',
    coinbase: 'ADA-USD',
    bitstamp: 'adausd',
    kucoin:   'ADA-USDT'
  },
  DOGE: {
    binance:  'DOGEUSDT',
    kraken:   'DOGEUSD',
    bybit:    'DOGEUSDT',
    okx:      'DOGE-USDT',
    coinbase: 'DOGE-USD',
    bitstamp: 'dogeusd',
    kucoin:   'DOGE-USDT'
  },
  LTC: {
    binance:  'LTCUSDT',
    kraken:   'LTCUSD',
    bybit:    'LTCUSDT',
    okx:      'LTC-USDT',
    coinbase: 'LTC-USD',
    bitstamp: 'ltcusd',
    kucoin:   'LTC-USDT'
  },
  BNB: {
    binance:  'BNBUSDT',
    kraken:   null,          // i. d. R. nicht als USD auf Kraken
    bybit:    'BNBUSDT',
    okx:      'BNB-USDT',
    coinbase: null,          // nicht auf Coinbase Exchange als USD
    bitstamp: null,
    kucoin:   'BNB-USDT'
  }
};

// ===== REST-Adapter (Top-of-Book) =====
// Alle ohne API-Key. Manche Börsen limitieren/setzen CORS → wir loggen Warnung und fahren fort.

async function fetchBinanceBook(symbol) {
  const url = `https://api.binance.com/api/v3/ticker/bookTicker?symbol=${symbol}`;
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`Binance ${r.status}`);
  const j = await r.json();
  const bid = Number(j.bidPrice), ask = Number(j.askPrice);
  if (!isFinite(bid) || !isFinite(ask)) throw new Error('Binance invalid book');
  return { exchange: 'Binance', bid, ask };
}

async function fetchKrakenBook(pair) {
  if (!pair) throw new Error('Kraken pair not supported');
  const url = `https://api.kraken.com/0/public/Ticker?pair=${pair}`;
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`Kraken ${r.status}`);
  const j = await r.json();
  if (j.error && j.error.length) throw new Error('Kraken ' + j.error.join('; '));
  const key = Object.keys(j.result || {})[0];
  const obj = j.result?.[key];
  const bid = Number(obj?.b?.[0]);
  const ask = Number(obj?.a?.[0]);
  if (!isFinite(bid) || !isFinite(ask)) throw new Error('Kraken invalid book');
  return { exchange: 'Kraken', bid, ask };
}

// Bybit (Spot): v5 market tickers
async function fetchBybitBook(symbol) {
  const url = `https://api.bybit.com/v5/market/tickers?category=spot&symbol=${symbol}`;
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`Bybit ${r.status}`);
  const j = await r.json();
  const it = j?.result?.list?.[0];
  const bid = Number(it?.bid1Price), ask = Number(it?.ask1Price);
  if (!isFinite(bid) || !isFinite(ask)) throw new Error('Bybit invalid book');
  return { exchange: 'Bybit', bid, ask };
}

// OKX: v5 market ticker
async function fetchOKXBook(instId) {
  const url = `https://www.okx.com/api/v5/market/ticker?instId=${instId}`;
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`OKX ${r.status}`);
  const j = await r.json();
  const it = j?.data?.[0];
  const bid = Number(it?.bidPx), ask = Number(it?.askPx);
  if (!isFinite(bid) || !isFinite(ask)) throw new Error('OKX invalid book');
  return { exchange: 'OKX', bid, ask };
}

// Coinbase Exchange: products/:product_id/ticker
async function fetchCoinbaseBook(product) {
  if (!product) throw new Error('Coinbase pair not supported');
  const url = `https://api.exchange.coinbase.com/products/${product}/ticker`;
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`Coinbase ${r.status}`);
  const j = await r.json();
  const bid = Number(j?.bid), ask = Number(j?.ask);
  if (!isFinite(bid) || !isFinite(ask)) throw new Error('Coinbase invalid book');
  return { exchange: 'Coinbase', bid, ask };
}

// Bitstamp: /api/v2/ticker/{pair}
async function fetchBitstampBook(pair) {
  if (!pair) throw new Error('Bitstamp pair not supported');
  const url = `https://www.bitstamp.net/api/v2/ticker/${pair}`;
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`Bitstamp ${r.status}`);
  const j = await r.json();
  const bid = Number(j?.bid), ask = Number(j?.ask);
  if (!isFinite(bid) || !isFinite(ask)) throw new Error('Bitstamp invalid book');
  return { exchange: 'Bitstamp', bid, ask };
}

// KuCoin: level1
async function fetchKucoinBook(symbol) {
  const url = `https://api.kucoin.com/api/v1/market/orderbook/level1?symbol=${symbol}`;
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`KuCoin ${r.status}`);
  const j = await r.json();
  const bid = Number(j?.data?.bestBid), ask = Number(j?.data?.bestAsk);
  if (!isFinite(bid) || !isFinite(ask)) throw new Error('KuCoin invalid book');
  return { exchange: 'KuCoin', bid, ask };
}

// ===== Demo-Fallback =====
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

// ===== Live Aggregation über alle Exchanges =====
async function liveQuotes(symbol) {
  const m = MAP[symbol];
  const tasks = [
    m.binance  ? fetchBinanceBook(m.binance)   : null,
    m.kraken   ? fetchKrakenBook(m.kraken)     : null,
    m.bybit    ? fetchBybitBook(m.bybit)       : null,
    m.okx      ? fetchOKXBook(m.okx)           : null,
    m.coinbase ? fetchCoinbaseBook(m.coinbase) : null,
    m.bitstamp ? fetchBitstampBook(m.bitstamp) : null,
    m.kucoin   ? fetchKucoinBook(m.kucoin)     : null
  ].filter(Boolean).map(p => p.catch(e => { log('Warn: ' + e.message); return null; }));

  const results = await Promise.all(tasks);
  const quotes = results.filter(Boolean).map(q => ({ ...q, symbol }));

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
    log(`${mode === 'live' ? 'Live' : 'Demo'} ${symbol} – Quellen: ${quotes.map(q => q.exchange).join(', ')}`);
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
