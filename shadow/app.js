const MOVES = [
  {n:1, cat:'poings', name:'Jab', side:'avant', esquive:'Slip extérieur / parade'},
  {n:2, cat:'poings', name:'Direct arrière', side:'arrière', esquive:'Slip / roulade'},
  {n:3, cat:'poings', name:'Crochet avant', side:'avant', esquive:'Duck / bloc coude'},
  {n:4, cat:'poings', name:'Crochet arrière', side:'arrière', esquive:'Duck / bloc coude'},
  {n:5, cat:'poings', name:'Uppercut avant', side:'avant', esquive:'Recul / bloc bas'},
  {n:6, cat:'poings', name:'Uppercut arrière', side:'arrière', esquive:'Recul / bloc bas'},
  {n:7, cat:'lowkick', name:'Low kick', side:'jambe avant', esquive:'Check (lever le genou)'},
  {n:8, cat:'lowkick', name:'Low kick', side:'jambe arrière', esquive:'Check (lever le genou)'},
  {n:9, cat:'kickmid', name:'Kick au corps', side:'', esquive:'Bloc coude bas / recul'},
  {n:10, cat:'kickmid', name:'Kick à la tête', side:'', esquive:'Esquive en reculant / bloc avant-bras'},
  {n:11, cat:'knee', name:'Genou', side:'', esquive:'Créer la distance / bloc hanches'},
  {n:12, cat:'knee', name:'Teep', side:'', esquive:'Dévier / pas de côté'},
];

const JAB_N = 1;
// À 100 %, le jab ouvre systématiquement un combo de 2 coups ou plus,
// et représente 70 % des frappes restantes (dont les appels d'un seul coup).
const JAB_LEAD_MAX = 1.0;
const JAB_SHARE_MAX = 0.7;

let activeCats = new Set(['poings','lowkick','kickmid','knee']);
let running = false;
let timerId = null;
let startTime = null;
let sessionEndTime = null;
let clockInterval = null;
let keepAliveInterval = null;
let voiceOn = true;
let nameOn = true;
let audioUnlocked = false;

const callNumberEl = document.getElementById('callNumber');
const callNameEl = document.getElementById('callName');
const callSideEl = document.getElementById('callSide');
const statusEl = document.getElementById('status');
const mainBtn = document.getElementById('mainBtn');
const roundClock = document.getElementById('roundClock');
const soundNote = document.getElementById('soundNote');
const testSoundBtn = document.getElementById('testSoundBtn');

function buildLegend(){
  const table = document.getElementById('legendTable');
  table.innerHTML = MOVES.map(m => `
    <div class="legend-item">
      <div class="n">${m.n}</div>
      <div class="name">${m.name}${m.side ? ' <span style="color:var(--paper-dim)">('+m.side+')</span>' : ''}</div>
      <div class="esquive">${m.esquive}</div>
    </div>
  `).join('');
}
buildLegend();

document.querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => {
    const cat = chip.dataset.cat;
    if(activeCats.has(cat)){
      if(activeCats.size === 1) return;
      activeCats.delete(cat);
      chip.classList.remove('active');
    } else {
      activeCats.add(cat);
      chip.classList.add('active');
    }
    syncJabPanel();
  });
});

function bindSwitch(id, setter, initial){
  const el = document.getElementById(id);
  let state = initial;
  el.addEventListener('click', () => {
    state = !state;
    el.classList.toggle('on', state);
    setter(state);
  });
}
bindSwitch('voiceToggle', v => voiceOn = v, true);
bindSwitch('nameToggle', v => nameOn = v, true);

const minGap = document.getElementById('minGap');
const maxGap = document.getElementById('maxGap');
const comboMin = document.getElementById('comboMin');
const comboMax = document.getElementById('comboMax');
const jabBias = document.getElementById('jabBias');
const sessionDur = document.getElementById('sessionDur');
const minGapVal = document.getElementById('minGapVal');
const maxGapVal = document.getElementById('maxGapVal');
const comboMinVal = document.getElementById('comboMinVal');
const comboMaxVal = document.getElementById('comboMaxVal');
const comboHint = document.getElementById('comboHint');
const jabBiasVal = document.getElementById('jabBiasVal');
const jabHint = document.getElementById('jabHint');
const jabPanel = jabBias.closest('.panel');
const sessionDurVal = document.getElementById('sessionDurVal');

function fmtGap(v){ return (v/10).toFixed(1) + ' s'; }
function fmtCoups(n){ return n + (n === 1 ? ' coup' : ' coups'); }

function syncSliders(lastTouched){
  if(parseInt(minGap.value) > parseInt(maxGap.value)){
    if(lastTouched === maxGap) minGap.value = maxGap.value;
    else maxGap.value = minGap.value;
  }
  if(parseInt(comboMin.value) > parseInt(comboMax.value)){
    if(lastTouched === comboMax) comboMin.value = comboMax.value;
    else comboMax.value = comboMin.value;
  }
  minGapVal.textContent = fmtGap(minGap.value);
  maxGapVal.textContent = fmtGap(maxGap.value);

  const lo = parseInt(comboMin.value);
  const hi = parseInt(comboMax.value);
  comboMinVal.textContent = fmtCoups(lo);
  comboMaxVal.textContent = fmtCoups(hi);
  comboHint.textContent = lo === hi
    ? `Chaque combo fait exactement ${fmtCoups(lo)}.`
    : `Chaque combo tire sa longueur au hasard entre ${lo} et ${hi} coups.`;

  jabBiasVal.textContent = jabBias.value + ' %';
  syncJabPanel();

  const d = parseInt(sessionDur.value);
  sessionDurVal.textContent = d === 0 ? 'Illimitée' : d + ' min';
}

function syncJabPanel(){
  const active = activeCats.has('poings');
  jabPanel.classList.toggle('muted', !active);
  jabBias.disabled = !active;
  jabHint.classList.toggle('warn', !active);
  if(!active){
    jabHint.textContent = "Active les poings (1–6) pour que ce réglage serve à quelque chose.";
    return;
  }
  const b = parseInt(jabBias.value);
  if(b === 0){
    jabHint.textContent = "0 % : le jab sort exactement comme n'importe quel autre coup actif.";
  } else if(b === 100){
    jabHint.textContent = "100 % : le jab ouvre systématiquement les combos de 2 coups et plus, et représente 70 % des autres frappes.";
  } else {
    const lead = Math.round(jabProbability(true, 2) * 100);
    const share = Math.round(jabProbability(false, 1) * 100);
    jabHint.textContent = `${b} % : le jab ouvre ${lead} % des combos et représente ${share} % des autres frappes.`;
  }
}

[minGap, maxGap, comboMin, comboMax, jabBias, sessionDur].forEach(el => {
  el.addEventListener('input', () => syncSliders(el));
});

// ---- Speech synthesis, with mobile-unlock handling ----
let frVoice = null;
function pickVoice(){
  if(!('speechSynthesis' in window)) return;
  const voices = speechSynthesis.getVoices();
  frVoice = voices.find(v => v.lang && v.lang.toLowerCase().startsWith('fr')) || null;
}
if('speechSynthesis' in window){
  pickVoice();
  speechSynthesis.onvoiceschanged = pickVoice;
}

function speak(text, onend){
  if(!voiceOn || !('speechSynthesis' in window)){ if(onend) onend(); return; }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  if(frVoice) u.voice = frVoice;
  u.lang = 'fr-FR';
  u.rate = 1.15;
  u.pitch = 0.9;
  if(onend) u.onend = onend;
  speechSynthesis.speak(u);
}

// Chrome/mobile need speak() called directly inside a user gesture at least once.
function unlockAudio(){
  if(!('speechSynthesis' in window)) return;
  pickVoice();
  const u = new SpeechSynthesisUtterance('.');
  u.volume = 1;
  speechSynthesis.speak(u);
  audioUnlocked = true;
}

testSoundBtn.addEventListener('click', () => {
  if(!('speechSynthesis' in window)){
    soundNote.textContent = "Ton navigateur ne supporte pas la synthèse vocale.";
    soundNote.classList.add('warn');
    return;
  }
  unlockAudio();
  setTimeout(() => speak('Un, deux, trois'), 150);
  soundNote.textContent = 'Tu devrais entendre "un, deux, trois". Si rien ne sort, vérifie le volume / mode silencieux du téléphone.';
  soundNote.classList.remove('warn');
});

// Chrome bug workaround: speechSynthesis can go to sleep after ~15s idle.
function startKeepAlive(){
  keepAliveInterval = setInterval(() => {
    if('speechSynthesis' in window && speechSynthesis.paused){
      speechSynthesis.resume();
    }
  }, 4000);
}
function stopKeepAlive(){ clearInterval(keepAliveInterval); }

function pool(){
  return MOVES.filter(m => activeCats.has(m.cat));
}

// Part du jab pour une frappe donnée : on interpole entre sa part naturelle
// (curseur à 0, tirage uniforme) et la cible du curseur à 100 %.
function jabProbability(isLead, comboLength){
  const p = pool();
  const hasJab = p.some(m => m.n === JAB_N);
  if(!hasJab || p.length === 1) return hasJab ? 1 : 0;
  const natural = 1 / p.length;
  const target = (isLead && comboLength > 1) ? JAB_LEAD_MAX : JAB_SHARE_MAX;
  const bias = parseInt(jabBias.value) / 100;
  return natural + bias * (target - natural);
}

function pickMove(isLead, comboLength){
  const p = pool();
  if(Math.random() < jabProbability(isLead, comboLength)){
    const jab = p.find(m => m.n === JAB_N);
    if(jab) return jab;
  }
  const others = p.filter(m => m.n !== JAB_N);
  const from = others.length ? others : p;
  return from[Math.floor(Math.random() * from.length)];
}

function randomGapMs(){
  const lo = parseInt(minGap.value) * 100;
  const hi = parseInt(maxGap.value) * 100;
  return lo + Math.random() * (hi - lo);
}

function randomComboLength(){
  const lo = parseInt(comboMin.value);
  const hi = parseInt(comboMax.value);
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

function flashCall(m){
  callNumberEl.textContent = m.n;
  callNumberEl.classList.remove('hit');
  void callNumberEl.offsetWidth;
  callNumberEl.classList.add('hit');
  callNameEl.textContent = nameOn ? m.name : '';
  callSideEl.textContent = nameOn && m.side ? m.side : '';
  speak(String(m.n));
}

function sessionOver(){
  return sessionEndTime !== null && Date.now() >= sessionEndTime;
}

function fireCombo(){
  if(!running || sessionOver()){ if(sessionOver()) endSession(); return; }
  const p = pool();
  if(p.length === 0) return;
  const len = randomComboLength();
  const combo = [];
  for(let i=0;i<len;i++){
    combo.push(pickMove(i === 0, len));
  }
  let i = 0;
  statusEl.textContent = 'Ça arrive';
  function step(){
    if(!running || sessionOver()){ if(sessionOver()) endSession(); return; }
    flashCall(combo[i]);
    i++;
    if(i < combo.length){
      // random timing between two strikes, same range whether inside or between combos
      timerId = setTimeout(step, randomGapMs());
    } else {
      statusEl.textContent = 'Reset';
      scheduleNext();
    }
  }
  step();
}

function scheduleNext(){
  if(!running || sessionOver()){ if(sessionOver()) endSession(); return; }
  timerId = setTimeout(fireCombo, randomGapMs());
}

function startClock(){
  startTime = Date.now();
  clockInterval = setInterval(() => {
    if(sessionEndTime !== null){
      const remaining = Math.max(0, Math.round((sessionEndTime - Date.now())/1000));
      const mm = String(Math.floor(remaining/60)).padStart(2,'0');
      const ss = String(remaining%60).padStart(2,'0');
      roundClock.textContent = `${mm}:${ss}`;
      if(remaining <= 0) endSession();
    } else {
      const s = Math.floor((Date.now() - startTime)/1000);
      const mm = String(Math.floor(s/60)).padStart(2,'0');
      const ss = String(s%60).padStart(2,'0');
      roundClock.textContent = `${mm}:${ss}`;
    }
  }, 250);
}

function endSession(){
  stop();
  statusEl.textContent = 'Session terminée';
  speak('Fin de session');
}

function start(){
  if(pool().length === 0) return;
  if(!audioUnlocked) unlockAudio(); // ensure gesture-linked unlock even if user skipped the test button
  running = true;
  mainBtn.textContent = 'Stopper';
  mainBtn.classList.add('on');
  statusEl.textContent = 'En garde';
  const durMin = parseInt(sessionDur.value);
  sessionEndTime = durMin === 0 ? null : Date.now() + durMin*60000;
  startClock();
  startKeepAlive();
  timerId = setTimeout(fireCombo, randomGapMs());
}

function stop(){
  running = false;
  clearTimeout(timerId);
  clearInterval(clockInterval);
  stopKeepAlive();
  mainBtn.textContent = "Démarrer l'assaut";
  mainBtn.classList.remove('on');
  if(statusEl.textContent !== 'Session terminée') statusEl.textContent = 'Pause';
  if('speechSynthesis' in window) speechSynthesis.cancel();
}

mainBtn.addEventListener('click', () => {
  if(running) stop(); else start();
});

syncSliders();

if('serviceWorker' in navigator){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  });
}
