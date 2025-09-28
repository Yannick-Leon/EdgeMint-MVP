// ===== EdgeMint Bot (Simulation) – Criterion: % ODER $; Fees; PNL→Notional =====
const BOT_VERSION = '2025-09-28-pnl-to-notional-v1';

const $ = (s) => document.querySelector(s);
const TBody = (s) => $(s)?.querySelector('tbody');
const fmtUsd = (x) => '$' + Number(x).toLocaleString(undefined, { maximumFractionDigits: 2 });
const pct    = (x) => (x * 100).toFixed(3) + '%';
function log(m){ const ts=new Date().toLocaleTimeString(); const el=$('#log'); if(el) el.textContent=`[${ts}] ${m}\n`+el.textContent; console.log('[Bot]', m); }

let timer=null, runId=0, pnl=0;
const MAX_SHOW = 10;

// Symbol-Mapping (wie im Dashboard)
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

// ——— REST-Adapter (gleich wie im Dashboard) ———
async function fetchBinanceBook(s){const r=await fetch(`https://api.binance.com/api/v3/ticker/bookTicker?symbol=${s}`,{cache:'no-store'});if(!r.ok)throw new Error(`Binance ${r.status}`);const j=await r.json();const b=+j.bidPrice,a=+j.askPrice;if(!isFinite(b)||!isFinite(a))throw new Error('Binance invalid');return{exchange:'Binance',bid:b,ask:a};}
async function fetchKrakenBook(p){if(!p)throw new Error('Kraken pair not supported');const r=await fetch(`https://api.kraken.com/0/public/Ticker?pair=${p}`,{cache:'no-store'});if(!r.ok)throw new Error(`Kraken ${r.status}`);const j=await r.json();if(j.error?.length)throw new Error('Kraken '+j.error.join('; '));const k=Object.keys(j.result||{})[0];const o=j.result?.[k];const b=+o?.b?.[0],a=+o?.a?.[0];if(!isFinite(b)||!isFinite(a))throw new Error('Kraken invalid');return{exchange:'Kraken',bid:b,ask:a};}
async function fetchBybitBook(s){const r=await fetch(`https://api.bybit.com/v5/market/tickers?category=spot&symbol=${s}`,{cache:'no-store'});if(!r.ok)throw new Error(`Bybit ${r.status}`);const j=await r.json();const it=j?.result?.list?.[0];const b=+it?.bid1Price,a=+it?.ask1Price;if(!isFinite(b)||!isFinite(a))throw new Error('Bybit invalid');return{exchange:'Bybit',bid:b,ask:a};}
async function fetchOKXBook(i){const r=await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${i}`,{cache:'no-store'});if(!r.ok)throw new Error(`OKX ${r.status}`);const j=await r.json();const it=j?.data?.[0];const b=+it?.bidPx,a=+it?.askPx;if(!isFinite(b)||!isFinite(a))throw new Error('OKX invalid');return{exchange:'OKX',bid:b,ask:a};}
async function fetchCoinbaseBook(p){if(!p)throw new Error('Coinbase pair not supported');const r=await fetch(`https://api.exchange.coinbase.com/products/${p}/ticker`,{cache:'no-store'});if(!r.ok)throw new Error(`Coinbase ${r.status}`);const j=await r.json();const b=+j?.bid,a=+j?.ask;if(!isFinite(b)||!isFinite(a))throw new Error('Coinbase invalid');return{exchange:'Coinbase',bid:b,ask:a};}
async function fetchBitstampBook(p){if(!p)throw new Error('Bitstamp pair not supported');const r=await fetch(`https://www.bitstamp.net/api/v2/ticker/${p}`,{cache:'no-store'});if(!r.ok)throw new Error(`Bitstamp ${r.status}`);const j=await r.json();const b=+j?.bid,a=+j?.ask;if(!isFinite(b)||!isFinite(a))throw new Error('Bitstamp invalid');return{exchange:'Bitstamp',bid:b,ask:a};}
async function fetchKucoinBook(s){const r=await fetch(`https://api.kucoin.com/api/v1/market/orderbook/level1?symbol=${s}`,{cache:'no-store'});if(!r.ok)throw new Error(`KuCoin ${r.status}`);const j=await r.json();const b=+j?.data?.bestBid,a=+j?.data?.bestAsk;if(!isFinite(b)||!isFinite(a))throw new Error('KuCoin invalid');return{exchange:'KuCoin',bid:b,ask:a};}

// Demo-Fallback
function makeBookFromMid(mid, feeBps=5, spreadBps=8){const fee=mid*(feeBps/10000), spr=mid*(spreadBps/10000);return{bid:mid-fee-spr/2,ask:mid+fee+spr/2};}
function mockQuotes(symbol){const base=symbol==='BTC'?60000:symbol==='ETH'?2500:100;const drift=(Math.random()*200-100)*(symbol==='BTC'?1:symbol==='ETH'?0.1:0.02);const a=base+drift,b=base+drift*0.8;return[{exchange:'DemoA',symbol,...makeBookFromMid(a)},{exchange:'DemoB',symbol,...makeBookFromMid(b)}];}

async function liveQuotes(symbol){
  const m=MAP[symbol]; if(!m) return mockQuotes(symbol||'BTC');
  const tasks=[
    m.binance?fetchBinanceBook(m.binance):null,
    m.kraken?fetchKrakenBook(m.kraken):null,
    m.bybit?fetchBybitBook(m.bybit):null,
    m.okx?fetchOKXBook(m.okx):null,
    m.coinbase?fetchCoinbaseBook(m.coinbase):null,
    m.bitstamp?fetchBitstampBook(m.bitstamp):null,
    m.kucoin?fetchKucoinBook(m.kucoin):null
  ].filter(Boolean).map(p=>p.catch(e=>{log('Warn '+(e.message||e)); return null;}));
  const res=await Promise.all(tasks);
  const qs=res.filter(Boolean).map(q=>({...q, symbol}));
  return qs.length?qs:mockQuotes(symbol);
}

function scanArb(quotes, notional){
  const out=[];
  for(let i=0;i<quotes.length;i++){
    for(let j=0;j<quotes.length;j++){
      if(i===j) continue;
      const buy=quotes[i], sell=quotes[j];
      const spread=sell.bid-buy.ask;           // $-Differenz
      if(spread>0){
        const spreadPct = spread / buy.ask;    // %-Spread
        out.push({
          symbol: buy.symbol||'-',
          buyOn: buy.exchange, sellOn: sell.exchange,
          buyAsk: buy.ask,     sellBid: sell.bid,
          spread, spreadPct,
          estProfit: notional * spreadPct      // Brutto (ohne Fees)
        });
      }
    }
  }
  out.sort((a,b)=>b.estProfit-a.estProfit);
  return out;
}

function renderOpps(list){
  const tb = TBody('#opps'); if(!tb) return;
  tb.innerHTML='';
  for(const a of list.slice(0,MAX_SHOW)){
    const tr=document.createElement('tr');
    tr.innerHTML = `
      <td>${a.symbol}</td><td>${a.buyOn}</td><td>${a.sellOn}</td>
      <td>${fmtUsd(a.spread)}</td><td>${pct(a.spreadPct)}</td><td>${fmtUsd(a.estProfit)}</td>`;
    tb.appendChild(tr);
  }
}
function updatePnlDisplay(){
  const pnlEl = $('#pnl'); if(pnlEl) pnlEl.textContent = fmtUsd(pnl);
}
function renderTrade(t){
  const tb = TBody('#trades'); if(!tb) return;
  const tr=document.createElement('tr');
  tr.innerHTML = `
    <td>${new Date(t.ts).toLocaleTimeString()}</td>
    <td>${t.symbol}</td>
    <td>${t.buyOn}</td>
    <td>${t.sellOn}</td>
    <td>${fmtUsd(t.buyAsk)}</td>
    <td>${fmtUsd(t.sellBid)}</td>
    <td>${fmtUsd(t.notional)}</td>
    <td>${fmtUsd(t.pnl)}</td>`;
  tb.prepend(tr);
  updatePnlDisplay();
}

// Netto-PnL nach Gebühren (bps pro Seite; beide Seiten verrechnet)
function pnlAfterFees(notional, spreadPct, feeBpsPerSide){
  const gross = notional * spreadPct;
  const fees  = notional * (2 * feeBpsPerSide / 10000);
  return gross - fees;
}

// 🔽 NEU: PnL → Notional übertragen (nur wenn PnL > 0)
function transferPnlToNotional(){
  const pnlVal = pnl;
  if (pnlVal <= 0) {
    log('Transfer abgebrochen: PnL ≤ 0');
    return;
  }
  const notInput = $('#notional');
  const current  = Number(notInput?.value || 0);
  const next     = current + pnlVal;
  if (notInput) notInput.value = next.toFixed(2);
  pnl = 0;
  updatePnlDisplay();
  log(`PNL → Notional transferiert: +${fmtUsd(pnlVal)} | neues Notional: ${fmtUsd(next)}`);
}

async function botTick(){
  const my = ++runId;

  const mode     = $('#mode')?.value || 'demo';
  const list     = ($('#symbols')?.value || 'BTC,ETH').split(',').map(s=>s.trim().toUpperCase()).filter(Boolean);
  const notional = Number($('#notional')?.value || 1000);
  const feeBps   = Number($('#feeBps')?.value || 8);            // bps pro Seite
  const criterion= ($('#criterion')?.value || 'pct');            // 'pct' | 'usd'
  const minPct   = Number($('#minPct')?.value || 0.15) / 100;   // nur wenn pct
  const minUsd   = Number($('#minUsd')?.value || 2);            // nur wenn usd

  log(`tick – mode=${mode}, crit=${criterion}, minPct=${(minPct*100).toFixed(3)}%, minUsd=$${minUsd.toFixed(2)}, fee=${feeBps}bps/side`);

  try{
    const tasks = list.map(sym =>
      (mode==='live' ? liveQuotes(sym) : Promise.resolve(mockQuotes(sym)))
        .then(qs => scanArb(qs, notional))
        .catch(e => { log(`Warn ${sym}: ${e.message||e}`); return []; })
    );
    const results = await Promise.all(tasks);
    if (my !== runId) return;

    const all = results.flat().sort((a,b)=>b.estProfit-a.estProfit);
    renderOpps(all);

    // Auswahl: Filter-Kriterium + Fees berücksichtigen
    let best = null;
    if (criterion === 'pct') {
      // Netto > 0 & Spread% ≥ minPct
      best = all.find(o => {
        const net = pnlAfterFees(notional, o.spreadPct, feeBps);
        return net > 0 && o.spreadPct >= minPct;
      });
    } else {
      // Netto ≥ minUsd (absoluter Profit in $)
      best = all.find(o => {
        const net = pnlAfterFees(notional, o.spreadPct, feeBps);
        return net >= minUsd;
      });
    }

    if(best){
      const net = pnlAfterFees(notional, best.spreadPct, feeBps);
      pnl += net;

      renderTrade({
        ts: Date.now(),
        symbol: best.symbol,
        buyOn: best.buyOn, sellOn: best.sellOn,
        buyAsk: best.buyAsk, sellBid: best.sellBid,
        notional, pnl: net
      });

      log(`TRADE ${best.symbol}: ${best.buyOn}→${best.sellOn} | net=${fmtUsd(net)} (after ${feeBps}bps/side)`);
    } else {
      log('Keine Chance passend zum Kriterium/Fees gefunden');
    }
  } catch(e){
    log('Fehler: '+(e?.message||String(e)));
  }
}

function start(){
  if(timer) return;
  const interval = Math.max(3, Number($('#refresh')?.value || 6))*1000;
  botTick();
  timer = setInterval(botTick, interval);
  log('Bot gestartet | ' + BOT_VERSION);
}
function stop(){
  if(!timer) return;
  clearInterval(timer); timer=null;
  log('Bot gestoppt');
}

document.addEventListener('DOMContentLoaded', ()=>{
  $('#btnStart')?.addEventListener('click', start);
  $('#btnStop')?.addEventListener('click', stop);
  $('#btnTransfer')?.addEventListener('click', transferPnlToNotional);
});
