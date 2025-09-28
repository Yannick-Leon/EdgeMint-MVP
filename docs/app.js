// ====== EdgeMint Static App (Browser only) ======

// --- Config / Globals ---
const MAX_ROWS = 6;     // Top-N für "Alle Möglichkeiten"
let timer = null;
let tickRunId = 0;      // schützt vor Race Conditions bei parallelen tick()-Durchläufen

// --- DOM Helpers / UI ---
const $ = (s) => document.querySelector(s);
const TBody = (s) => $(s).querySelector('tbody');
const fmtUsd = (x) => '$' + Number(x).toLocaleString(undefined, { maximumFractionDigits: 2 });
const pct    = (x) => (x * 100).toFixed(3) + '%';

function log(msg) {
  const ts = new Date().toLocaleTimeString();
  const el = $('#log');
  if (!el) return;
  el.textContent = `[${ts}] ${msg}\n` + el.textContent;
}

// --- Symbol-Mapping je Exchange (USD/USDT-normiert) ---
const MAP = {
  BTC: { binance:'BTCUSDT', kraken:'XBTUSD', bybit:'BTCUSDT', okx:'BTC-USDT', coinbase:'BTC-USD', bitstamp:'btcusd', kucoin:'BTC-USDT' },
  ETH: { binance:'ETHUSDT', kraken:'ETHUSD', bybit:'ETHUSDT', okx:'ETH-USDT', coinbase:'ETH-USD', bitstamp:'ethusd', kucoin:'ETH-USDT' },
  SOL: { binance:'SOLUSDT', kraken:'SOLUSD', bybit:'SOLUSDT', okx:'SOL-USDT', coinbase:'SOL-USD', bitstamp:'solusd', kucoin:'SOL-USDT' },
  XRP: { binance:'XRPUSDT', kraken:'XRPUSD', bybit:'XRPUSDT', okx:'XRP-USDT', coinbase:'XRP-USD', bitstamp:'xrpusd', kucoin:'XRP-USDT' },
  ADA: { binance:'ADAUSDT', kraken:'ADAUSD', bybit:'ADAUSDT', okx:'ADA-USDT', coinbase:'ADA-USD', bitstamp:'adausd', kucoin:'ADA-USDT' },
  DOGE:{ binance:'DOGEUSDT',kraken:'DOGEUSD',bybit:'DOGEUSDT', okx:'DOGE-USDT', coinbase:'DOGE-USD', bitstamp:'dogeusd', kucoin:'DOGE-USDT' },
  LTC: { binance:'LTCUSDT', kraken:'LTCUSD', bybit:'LTCUSDT', okx:'LTC-USDT', coinbase:'LTC-USD', bitstamp:'ltcusd', kucoin:'LTC-USDT' },
  BNB: { binance:'BNBUSDT', kraken:null,     bybit:'BNBUSDT', okx:'BNB-USDT', coinbase:null,       bitstamp:null,     kucoin:'BNB-USDT' }
};

// --- REST-Adapter (Top-of-Book, ohne API-Key) ---
async function fetchBinanceBook(s){const r=await fetch(`https://api.binance.com/api/v3/ticker/bookTicker?symbol=${s}`,{cache:'no-store'});if(!r.ok)throw new Error(`Binance ${r.status}`);const j=await r.json();const b=+j.bidPrice,a=+j.askPrice;if(!isFinite(b)||!isFinite(a))throw new Error('Binance invalid');return{exchange:'Binance',bid:b,ask:a};}
async function fetchKrakenBook(p){if(!p)throw new Error('Kraken pair not supported');const r=await fetch(`https://api.kraken.com/0/public/Ticker?pair=${p}`,{cache:'no-store'});if(!r.ok)throw new Error(`Kraken ${r.status}`);const j=await r.json();if(j.error?.length)throw new Error('Kraken '+j.error.join('; '));const k=Object.keys(j.result||{})[0];const o=j.result?.[k];const b=+o?.b?.[0],a=+o?.a?.[0];if(!isFinite(b)||!isFinite(a))throw new Error('Kraken invalid');return{exchange:'Kraken',bid:b,ask:a};}
async function fetchBybitBook(s){const r=await fetch(`https://api.bybit.com/v5/market/tickers?category=spot&symbol=${s}`,{cache:'no-store'});if(!r.ok)throw new Error(`Bybit ${r.status}`);const j=await r.json();const it=j?.result?.list?.[0];const b=+it?.bid1Price,a=+it?.ask1Price;if(!isFinite(b)||!isFinite(a))throw new Error('Bybit invalid');return{exchange:'Bybit',bid:b,ask:a};}
async function fetchOKXBook(i){const r=await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${i}`,{cache:'no-store'});if(!r.ok)throw new Error(`OKX ${r.status}`);const j=await r.json();const it=j?.data?.[0];const b=+it?.bidPx,a=+it?.askPx;if(!isFinite(b)||!isFinite(a))throw new Error('OKX invalid');return{exchange:'OKX',bid:b,ask:a};}
async function fetchCoinbaseBook(p){if(!p)throw new Error('Coinbase pair not supported');const r=await fetch(`https://api.exchange.coinbase.com/products/${p}/ticker`,{cache:'no-store'});if(!r.ok)throw new Error(`Coinbase ${r.status}`);const j=await r.json();const b=+j?.bid,a=+j?.ask;if(!isFinite(b)||!isFinite(a))throw new Error('Coinbase invalid');return{exchange:'Coinbase',bid:b,ask:a};}
async function fetchBitstampBook(p){if(!p)throw new Error('Bitstamp pair not supported');const r=await fetch(`https://www.bitstamp.net/api/v2/ticker/${p}`,{cache:'no-store'});if(!r.ok)throw new Error(`Bitstamp ${r.status}`);const j=await r.json();const b=+j?.bid,a=+j?.ask;if(!isFinite(b)||!isFinite(a))throw new Error('Bitstamp invalid');return{exchange:'Bitstamp',bid:b,ask:a};}
async function fetchKucoinBook(s){const r=await fetch(`https://api.kucoin.com/api/v1/market/orderbook/level1?symbol=${s}`,{cache:'no-store'});if(!r.ok)throw new Error(`KuCoin ${r.status}`);const j=await r.json();const b=+j?.data?.bestBid,a=+j?.data?.bestAsk;if(!isFinite(b)||!isFinite(a))throw new Error('KuCoin invalid');return{exchange:'KuCoin',bid:b,ask:a};}

// --- Demo-Fallback (synthetische Bid/Ask) ---
function makeBookFromMid(mid, feeBps=5, spreadBps=8){
  const fee=mid*(feeBps/10000), spr=mid*(spreadBps/10000);
  return { bid: mid - fee - spr/2, ask: mid + fee + spr/2 };
}
function mockQuotes(symbol){
  const base = symbol==='BTC'?60000 : symbol==='ETH'?2500 : 100;
  const drift = (Math.random()*200-100)*(symbol==='BTC'?1 : symbol==='ETH'?0.1 : 0.02);
  const a=base+drift, b=base+drift*0.8;
  return [
    { exchange:'DemoA', symbol, ...makeBookFromMid(a) },
    { exchange:'DemoB', symbol, ...makeBookFromMid(b) }
  ];
}

// --- Aggregation: Live-Quotes für EIN Symbol ---
async function liveQuotes(symbol){
  const m = MAP[symbol];
  const tasks = [
    m.binance  ? fetchBinanceBook(m.binance)   : null,
    m.kraken   ? fetchKrakenBook(m.kraken)     : null,
    m.bybit    ? fetchBybitBook(m.bybit)       : null,
    m.okx      ? fetchOKXBook(m.okx)           : null,
    m.coinbase ? fetchCoinbaseBook(m.coinbase) : null,
    m.bitstamp ? fetchBitstampBook(m.bitstamp) : null,
    m.kucoin   ? fetchKucoinBook(m.kucoin)     : null
  ].filter(Boolean).map(p => p.catch(e => { log('Warn: '+(e.message||e)); return null; }));

  const results = await Promise.all(tasks);
  const quotes = results.filter(Boolean).map(q => ({ ...q, symbol }));
  return quotes.length ? quotes : mockQuotes(symbol);
}

// --- Arbitrage-Berechnung ---
function scanArb(quotes, notional){
  const out=[];
  for(let i=0;i<quotes.length;i++){
    for(let j=0;j<quotes.length;j++){
      if(i===j) continue;
      const buy=quotes[i], sell=quotes[j];
      const spread = sell.bid - buy.ask;
      if(spread > 0){
        const spreadPct = spread / buy.ask;
        out.push({
          symbol: buy.symbol || '-',
          buyOn: buy.exchange,
          sellOn: sell.exchange,
          spread,
          spreadPct,
          estProfit: notional * spreadPct
        });
      }
    }
  }
  out.sort((a,b)=> b.estProfit - a.estProfit);
  return out;
}

// --- Rendering ---
function renderQuotes(symbol, quotes){
  const tb = TBody('#quotes'); if(!tb) return;
  tb.innerHTML = '';
  for(const q of quotes){
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${q.exchange}</td>
      <td>${symbol}</td>
      <td class="good">${fmtUsd(q.bid)}</td>
      <td class="bad">${fmtUsd(q.ask)}</td>`;
    tb.appendChild(tr);
  }
}
function renderArbs(arbs){
  const tb = TBody('#arbs'); if(!tb) return;
  tb.innerHTML = '';
  if(!arbs.length){
    const tr=document.createElement('tr');
    tr.innerHTML = `<td colspan="5" style="color:#a8b3c7">Keine positive Spanne</td>`;
    tb.appendChild(tr);
    return;
  }
  for(const a of arbs){
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${a.buyOn}</td>
      <td>${a.sellOn}</td>
      <td>${fmtUsd(a.spread)}</td>
      <td>${pct(a.spreadPct)}</td>
      <td>${fmtUsd(a.estProfit)}</td>`;
    tb.appendChild(tr);
  }
}
function renderAllOpps(list){
  const tb = TBody('#allOpps'); if(!tb) return;
  tb.innerHTML = '';

  if(!list || !list.length){
    const tr=document.createElement('tr');
    tr.innerHTML = `<td colspan="6" style="color:#a8b3c7">Keine positiven Spreads gefunden</td>`;
    tb.appendChild(tr);
    return;
  }

  // Dedupe (symbol, buyOn, sellOn) und hart auf MAX_ROWS begrenzen
  const seen = new Set(), deduped=[];
  for(const o of list){
    const key = `${o.symbol}|${o.buyOn}|${o.sellOn}`;
    if(seen.has(key)) continue;
    seen.add(key); deduped.push(o);
  }
  const top = deduped.slice(0, MAX_ROWS);

  for(const a of top){
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${a.symbol}</td>
      <td>${a.buyOn}</td>
      <td>${a.sellOn}</td>
      <td>${fmtUsd(a.spread)}</td>
      <td>${pct(a.spreadPct)}</td>
      <td>${fmtUsd(a.estProfit)}</td>`;
    tb.appendChild(tr);
  }
}

// --- Ticker-Loop (mit Race-Guard) ---
async function tick(){
  const myRun = ++tickRunId; // markiert diesen Durchlauf als "der neueste"

  const mode     = $('#mode').value;
  const symbol   = $('#symbol').value;
  const notional = Number($('#notional').value || 1000);
  const scanAll  = $('#scanAll').checked;

  try {
    // 1) aktuelles Symbol
    const quotes = mode==='live' ? await liveQuotes(symbol) : mockQuotes(symbol);
    if(myRun !== tickRunId) return; // Ergebnis ist veraltet -> nicht mehr rendern

    renderQuotes(symbol, quotes);
    renderArbs(scanArb(quotes, notional));

    // 2) alle Symbole (optional)
    if (scanAll) {
      const symbols = Object.keys(MAP);
      const tasks = symbols.map(sym =>
        (mode==='live' ? liveQuotes(sym) : Promise.resolve(mockQuotes(sym)))
          .then(qs => scanArb(qs, notional).map(o => ({ ...o, symbol: sym })))
          .catch(e => { log(`Warn ${sym}: ${e.message || e}`); return []; })
      );

      const results = await Promise.all(tasks);
      if(myRun !== tickRunId) return; // veraltet

      const allOpps = results.flat().sort((a,b)=> b.estProfit - a.estProfit);
      renderAllOpps(allOpps.slice(0, MAX_ROWS)); // Guard 1
      log(`${mode==='live'?'Live':'Demo'} Scan ALL – Ergebnisse: ${allOpps.length}`);
    } else {
      renderAllOpps([]); // Panel leeren, wenn deaktiviert
    }

    log(`${mode==='live'?'Live':'Demo'} Update ${symbol}: ${quotes.map(q=>q.exchange).join(', ')}`);
  } catch (e) {
    log('Fehler: ' + (e?.message || String(e)));
  }
}

// --- Start/Stop & Refresh Handling ---
function start(){
  if (timer) return;
  const interval = Math.max(3, Number($('#refresh').value || 6)) * 1000;
  tick();
  timer = setInterval(() => tick(), interval);
  log('⏱️ Auto-Refresh gestartet');
}
function stop(){
  if (!timer) return;
  clearInterval(timer);
  timer = null;
  log('⏸️ Auto-Refresh gestoppt');
}

// --- Boot ---
document.addEventListener('DOMContentLoaded', ()=>{
  $('#btnStart')?.addEventListener('click', start);
  $('#btnStop')?.addEventListener('click', stop);
  $('#refresh')?.addEventListener('change', ()=>{ if(timer){ stop(); start(); } });
  start();
});