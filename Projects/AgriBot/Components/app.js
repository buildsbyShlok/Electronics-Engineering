/* app.js - final robust version
   - dynamic loader that executes scripts in fetched components
   - forwards realtime updates to components via:
       * onRealtime_<component>
       * update_<component>
       * sf:realtime event
   - fallback re-forward every 3s to guarantee updates
*/

window.globalState = window.globalState || { latest: null, history: {} };
const lastN = 50;
let currentComponent = null;
let lastForwardTimestamp = 0;
const FORWARD_FALLBACK_MS = 3000; // 3s

/***********************
 * loadComponent(name)
 * - fetches components/<name>.html
 * - inserts HTML into #app-content
 * - executes any <script> tags (inline & external)
 * - calls init_<name>() and onInit_<name>() if present
 * - forwards latest data to component
 ***********************/
async function loadComponent(name){
  try{
    currentComponent = name;
    const res = await fetch('components/' + name + '.html', { cache: 'no-store' });
    if(!res.ok) throw new Error('Failed to load component: ' + name + ' (status ' + res.status + ')');
    const html = await res.text();

    const container = document.getElementById('app-content');
    container.innerHTML = html;

    // Execute scripts found in the fetched HTML
    const temp = document.createElement('div');
    temp.innerHTML = html;
    const scripts = temp.querySelectorAll('script');

    for (let s of scripts){
      const newScript = document.createElement('script');
      if (s.src){
        // external script tag
        newScript.src = s.src;
        if (s.async) newScript.async = true;
        if (s.defer) newScript.defer = true;
        document.body.appendChild(newScript);
        // wait for it to load (so dependent inline scripts execute afterward)
        await new Promise((resolve) => {
          newScript.onload = () => resolve();
          newScript.onerror = () => { console.warn('Failed to load external script', s.src); resolve(); };
        });
      } else {
        // inline script: copy text and run
        try{
          newScript.textContent = s.textContent;
          document.body.appendChild(newScript);
        } catch(e){
          console.error('Error executing inline script for component', name, e);
        }
      }
    }

    // Call init_<name>() if available
    const initFn = window['init_' + name];
    if (typeof initFn === 'function'){
      try{ initFn(); } catch(e){ console.error('init_' + name + ' error', e); }
    }

    // Call onInit_<name>() hook if present
    const onInit = window['onInit_' + name];
    if (typeof onInit === 'function'){
      try{ onInit(window.globalState.latest || null); } catch(e){ console.error('onInit_' + name + ' error', e); }
    }

    // If we already have data, forward it immediately (forced)
    if (window.globalState.latest){
      forwardRealtime(window.globalState.latest, true);
    }

    console.log('[app.js] loaded component:', name);
  } catch(err){
    console.error('loadComponent error', err);
    const container = document.getElementById('app-content');
    if (container) container.innerHTML = '<div class="card"><p>Error loading component: ' + err.message + '</p></div>';
  }
}

/***********************
 * forwardRealtime(v, forced)
 * - forwards v to component-specific handlers and dispatches sf:realtime
 ***********************/
function forwardRealtime(v, forced = false){
  if(!v) return;
  lastForwardTimestamp = Date.now();

  // 1) component-specific handler: onRealtime_<component>
  if(currentComponent){
    const compFn = 'onRealtime_' + currentComponent;
    if (typeof window[compFn] === 'function'){
      try{ window[compFn](v); } catch(e){ console.error(compFn + ' error', e); }
    }
  }

  // 2) update_<component> if present
  if(currentComponent){
    const updFn = 'update_' + currentComponent;
    if (typeof window[updFn] === 'function'){
      try{ window[updFn](v); } catch(e){ console.error(updFn + ' error', e); }
    }
  }

  // 3) legacy global event
  try{
    window.dispatchEvent(new CustomEvent('sf:realtime', { detail: v }));
  } catch(e){ console.error('dispatch sf:realtime error', e); }

  if(forced) console.log('[app.js] forwardRealtime (forced) ->', currentComponent, v);
  else console.log('[app.js] forwardRealtime ->', currentComponent);
}

/***********************
 * attachRealtimeListeners()
 * - attaches Firebase listeners and loads histories
 ***********************/
function attachRealtimeListeners(){
  try{
    if(typeof db === 'undefined' || !db){
      console.error('[app.js] db is not defined. Ensure firebase.initializeApp(...) runs before app.js');
      return;
    }

    const sensorsRef = db.ref('/smartFarm/sensors');
    sensorsRef.on('value', snap => {
      const v = snap.val();
      window.globalState.latest = v;
      forwardRealtime(v);
      console.log('[app.js] realtime on -> forwarded to component:', currentComponent);
    });

    // load histories once
    db.ref('/smartFarm/history/soilMoisture').limitToLast(500).once('value').then(snap=>{
      window.globalState.history.soil = snap.val() || {};
      window.dispatchEvent(new CustomEvent('sf:history', { detail: window.globalState.history }));
      console.log('[app.js] history soil loaded');
    }).catch(e=>console.warn('history soil load',e));

    db.ref('/smartFarm/history/soilTemperature').limitToLast(500).once('value').then(snap=>{
      window.globalState.history.temp = snap.val() || {};
      window.dispatchEvent(new CustomEvent('sf:history', { detail: window.globalState.history }));
      console.log('[app.js] history temp loaded');
    }).catch(e=>console.warn('history temp load',e));

    db.ref('/smartFarm/history/sunlight').limitToLast(500).once('value').then(snap=>{
      window.globalState.history.light = snap.val() || {};
      window.dispatchEvent(new CustomEvent('sf:history', { detail: window.globalState.history }));
      console.log('[app.js] history light loaded');
    }).catch(e=>console.warn('history light load',e));

    console.log('[app.js] realtime listeners attached');
  } catch(e){
    console.error('attachRealtimeListeners error', e);
  }
}

/***********************
 * fallback resender
 ***********************/
function startFallbackResender(){
  setInterval(()=>{
    try{
      const now = Date.now();
      const last = lastForwardTimestamp || 0;
      if(window.globalState.latest && (now - last) > FORWARD_FALLBACK_MS){
        console.warn('[app.js] fallback resender triggered — re-forwarding latest data');
        forwardRealtime(window.globalState.latest, true);
      }
    }catch(e){
      console.error('fallback resender error', e);
    }
  }, FORWARD_FALLBACK_MS);
}

/***********************
 * helpers exposed for components
 ***********************/
function tsToLabel(ts){ return new Date(Number(ts)).toLocaleTimeString(); }
function pushChart(chart, label, value){
  if(!chart) return;
  chart.data.labels.push(label);
  chart.data.datasets[0].data.push(value);
  if(chart.data.labels.length > lastN){
    chart.data.labels.shift();
    chart.data.datasets[0].data.shift();
  }
  chart.update();
}

/***********************
 * bootstrap
 ***********************/
window.addEventListener('DOMContentLoaded', ()=>{
  attachRealtimeListeners();
  startFallbackResender();
  loadComponent('home');
});
