/* ==========================================================================
   SUPABASE DATENBANK INITIALISIERUNG
   ========================================================================== */
const SUPABASE_URL = 'https://lrjkmjkwxbdyjdbmvqul.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxyamttamt3eGJkeWpkYm12cXVsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2MzU1NjEsImV4cCI6MjA5ODIxMTU2MX0.YGVLXtBWGtnhnU81EjcA9WkfhPINMVU0UJds61UwsvE';
const { createClient } = window.supabase;

// Verbindung mit dem Supabase-Backend herstellen
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// Status-Variablen für den aktuell angemeldeten Benutzer
let currentUser = null;
let userProfile = null;

/* ==========================================================================
   LOCALSTORAGE HELPER (Lokale Datenverwaltung im Browser)
   ========================================================================== */
const S = {
  // Holt Daten aus dem LocalStorage und parst sie als JSON. Gibt d (Default) zurück, wenn nichts existiert.
  get: (k, d) => {
    try {
      const v = localStorage.getItem(k);
      return v !== null ? JSON.parse(v) : d;
    } catch (e) {
      return d;
    }
  },
  // Speichert Daten im LocalStorage als JSON-String.
  set: (k, v) => {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch (e) { }
  },
};

/* ==========================================================================
   OFFLINE-FIRST SYNC SYSTEM (Synchronisierung mit der Cloud-Datenbank)
   - Alle Aktionen werden sofort lokal im LocalStorage gespeichert
   - Anstehende Änderungen werden in eine Sync-Queue eingereiht
   - Sobald die App online ist, wird die Queue schrittweise abgearbeitet
   ========================================================================== */
const SYNC_Q = '_sync_queue';
let isSyncing = false;

// Trägt einen DB-Schreibvorgang in die Warteschlange ein
function queueSync(table, data) {
  if (!currentUser) return;
  const q = S.get(SYNC_Q, []);
  const idx = q.findIndex(i => i.table === table && i.data.id === data.id);
  const entry = { table, data, ts: Date.now() };
  if (idx >= 0) q[idx] = entry; else q.push(entry);
  S.set(SYNC_Q, q);
  updateSyncDot();
}

// Sendet die Warteschlange an Supabase, wenn eine Internetverbindung besteht
async function processQueue() {
  if (!navigator.onLine || !currentUser || isSyncing) return;
  const q = S.get(SYNC_Q, []);
  if (!q.length) return;
  isSyncing = true;
  updateSyncDot();
  const remaining = [];
  let synced = 0;
  for (const item of q) {
    try {
      const { error } = await db.from(item.table).upsert(item.data, { onConflict: 'id' });
      if (error) {
        console.warn('Sync:', item.table, error.message);
        remaining.push(item);
      } else {
        synced++;
      }
    } catch (e) {
      remaining.push(item);
    }
  }
  S.set(SYNC_Q, remaining);
  isSyncing = false;
  updateSyncDot();
  if (synced > 0) toast(`☁️ ${synced} Einträge gespeichert`);
}

// Aktualisiert den farbigen Sync-Punkt in der Navigationsleiste
function updateSyncDot() {
  const dot = document.getElementById('syncDot');
  if (!dot) return;
  dot.classList.remove('pending', 'syncing');
  if (isSyncing) {
    dot.classList.add('syncing');
    dot.title = 'Synchronisiert...';
  } else {
    const n = S.get(SYNC_Q, []).length;
    if (n > 0) {
      dot.classList.add('pending');
      dot.title = `${n} ausstehend`;
    } else {
      dot.title = 'Alles synchronisiert';
    }
  }
}

// Event-Listener für den Online/Offline-Status des Browsers
window.addEventListener('online', () => {
  toast('📶 Online – synchronisiere...');
  setTimeout(processQueue, 600);
});
window.addEventListener('offline', () => toast('📵 Offline – Daten lokal gespeichert'));

// Automatische Synchronisation alle 60 Sekunden, falls online
setInterval(() => { if (navigator.onLine) processQueue(); }, 60000);

/* ==========================================================================
   AUTHENTIFIZIERUNG (Registrierung, Login & Logout)
   ========================================================================== */
let authMode = 'login';

// Wechselt zwischen Login und Registrierung in der Maske
function switchAuthTab(mode, btn) {
  authMode = mode;
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('on'));
  btn.classList.add('on');
  const r = mode === 'register';
  document.getElementById('authConfirmWrap').style.display = r ? 'block' : 'none';
  document.getElementById('authSubmitBtn').textContent = r ? 'Account erstellen' : 'Einloggen';
  document.getElementById('authMsg').textContent = '';
  document.getElementById('authMsg').className = 'auth-error';
}

// Startet den Login- oder Registrierungsprozess über Supabase
async function handleAuth() {
  const email = document.getElementById('authEmail').value.trim();
  const pass = document.getElementById('authPassword').value;
  const msgEl = document.getElementById('authMsg');
  const btn = document.getElementById('authSubmitBtn');
  if (!email || !pass) {
    msgEl.textContent = 'Bitte E-Mail und Passwort eingeben.';
    return;
  }
  btn.disabled = true;
  btn.textContent = '…';
  msgEl.textContent = '';

  if (authMode === 'register') {
    const confirm = document.getElementById('authConfirm').value;
    if (pass !== confirm) {
      msgEl.textContent = 'Passwörter stimmen nicht überein.';
      btn.disabled = false;
      btn.textContent = 'Account erstellen';
      return;
    }
    if (pass.length < 6) {
      msgEl.textContent = 'Passwort muss mindestens 6 Zeichen haben.';
      btn.disabled = false;
      btn.textContent = 'Account erstellen';
      return;
    }
    const { error } = await db.auth.signUp({ email, password: pass });
    if (error) {
      msgEl.textContent = error.message;
      btn.disabled = false;
      btn.textContent = 'Account erstellen';
    } else {
      msgEl.className = 'auth-success';
      msgEl.textContent = '✓ Account erstellt! Bitte E-Mail bestätigen, dann einloggen.';
      btn.disabled = false;
      btn.textContent = 'Account erstellen';
    }
  } else {
    const { data, error } = await db.auth.signInWithPassword({ email, password: pass });
    if (error) {
      msgEl.textContent = xAuthErr(error.message);
      btn.disabled = false;
      btn.textContent = 'Einloggen';
    } else {
      currentUser = data.user;
      hideAuth();
      await checkProfile();
    }
  }
}

// Übersetzt häufige englische Supabase-Fehlermeldungen ins Deutsche
function xAuthErr(m) {
  if (m.includes('Invalid login')) return 'E-Mail oder Passwort falsch.';
  if (m.includes('Email not confirmed')) return 'Bitte E-Mail zuerst bestätigen.';
  if (m.includes('User already registered')) return 'Diese E-Mail ist bereits registriert.';
  return m;
}

// Blendet das Login-Overlay aus
function hideAuth() {
  const o = document.getElementById('authOverlay');
  o.style.opacity = '0';
  o.style.transition = 'opacity .3s';
  setTimeout(() => o.style.display = 'none', 300);
}

// Loggt den Benutzer aus und setzt alle Formulardaten zurück
async function handleLogout() {
  await db.auth.signOut();
  currentUser = null;
  userProfile = null;
  document.getElementById('appNav').style.display = 'none';
  document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
  const o = document.getElementById('authOverlay');
  o.style.display = 'flex';
  o.style.opacity = '1';
  ['authEmail', 'authPassword'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('authMsg').textContent = '';
  document.getElementById('authSubmitBtn').disabled = false;
  document.getElementById('authSubmitBtn').textContent = 'Einloggen';
}

/* ==========================================================================
   BENUTZERPROFIL-VERWALTUNG (Session-Check & Onboarding)
   ========================================================================== */
// Prüft beim Start der App, ob bereits eine aktive Session/Anmeldung existiert
async function checkSession() {
  const { data: { session } } = await db.auth.getSession();
  if (session) {
    currentUser = session.user;
    hideAuth();
    await checkProfile();
  }
}

// Holt das Profil des Nutzers aus der Tabelle 'profiles'
async function checkProfile() {
  const { data, error } = await db.from('profiles').select('*').eq('id', currentUser.id).single();
  if (error && error.code === 'PGRST116') {
    // Profil existiert noch nicht -> Onboarding-Overlay anzeigen
    document.getElementById('onboardOverlay').style.display = 'flex';
  } else if (data) {
    userProfile = data;
    loadWeightFromDB();
    launchApp();
  } else {
    console.error('Profile error:', error);
    launchApp();
  }
}

// Lädt den Gewichtsverlauf aus der DB und synchronisiert ihn mit dem lokalen Stand
async function loadWeightFromDB() {
  if (!currentUser) return;
  try {
    const { data } = await db.from('weight_logs').select('logged_at,weight_kg,note').eq('user_id', currentUser.id).order('logged_at', { ascending: true });
    if (data && data.length > 0) {
      const local = S.get('weight_logs', []);
      const map = {};
      local.forEach(e => map[e.logged_at] = e);
      data.forEach(e => map[e.logged_at] = e);
      S.set('weight_logs', Object.values(map).sort((a, b) => a.logged_at.localeCompare(b.logged_at)));
    }
    setTimeout(processQueue, 800);
  } catch (e) {
    console.warn('Weight load failed:', e);
  }
}

// Blendet das Onboarding aus, zeigt die App-Navigation an und rendert die Startseite
function launchApp() {
  document.getElementById('onboardOverlay').style.display = 'none';
  document.getElementById('appNav').style.display = 'flex';
  document.querySelectorAll('.page').forEach(p => p.style.removeProperty('display'));

  // Setzt den aktiven Plan basierend auf dem gewählten Ziel des Nutzers
  PLAN = getActivePlan();

  const name = userProfile?.username || currentUser?.email?.split('@')[0] || '?';
  document.getElementById('navAvatar').textContent = name.charAt(0).toUpperCase();
  updateSyncDot();
  renderToday();
}

// Onboarding: Ziel-Auswahl
let obGoal = 'hybrid';
function selectGoal(el) {
  document.querySelectorAll('.goal-card').forEach(c => c.classList.remove('sel'));
  el.classList.add('sel');
  obGoal = el.dataset.val;
}

// Onboarding: Weiter zu Schritt 2
function obNext() {
  if (!document.getElementById('obName').value.trim() || !document.getElementById('obHeight').value || !document.getElementById('obWeight').value) {
    toast('Bitte Name, Größe und Gewicht ausfüllen');
    return;
  }
  document.getElementById('obStep0').classList.remove('on');
  document.getElementById('obStep1').classList.add('on');
  document.getElementById('dot0').classList.remove('on');
  document.getElementById('dot1').classList.add('on');
}

// Onboarding: Speichert das Profil in Supabase
async function saveOnboarding() {
  const name = document.getElementById('obName').value.trim();
  const height = parseFloat(document.getElementById('obHeight').value);
  const weight = parseFloat(document.getElementById('obWeight').value);
  const age = parseInt(document.getElementById('obAge').value) || null;
  const tag = '#' + Math.floor(1000 + Math.random() * 9000); // Zufälliger Tag wie bei Discord (z.B. #1337)
  const btn = document.getElementById('obSaveBtn');
  const errEl = document.getElementById('obSaveError');
  btn.disabled = true;
  btn.textContent = 'Speichern…';

  const { data, error } = await db.from('profiles').insert([{ id: currentUser.id, username: name, tag, height, weight, age, goal: obGoal }]).select().single();
  if (error) {
    errEl.textContent = 'Fehler: ' + error.message;
    btn.disabled = false;
    btn.textContent = 'Profil speichern & loslegen 🚀';
  } else {
    userProfile = data;
    const today = new Date().toISOString().slice(0, 10);
    // Ersten Gewichtseintrag erstellen
    S.set('weight_logs', [{ logged_at: today, weight_kg: weight, note: 'Startwert' }]);
    queueSync('weight_logs', { id: `${currentUser.id}_${today}`, user_id: currentUser.id, logged_at: today, weight_kg: weight, note: 'Startwert', updated_at: new Date().toISOString() });
    toast(`Willkommen, ${name}${tag}! 🎉`);
    launchApp();
  }
}

/* ==========================================================================
   BERECHNUNGEN (Täglicher Bedarf basierend auf dem Onboarding-Ziel)
   ========================================================================== */
function calcUserStats(profile) {
  if (!profile) return null;
  const { height, weight, age, goal } = profile;
  const h = parseFloat(height), w = parseFloat(weight), a = parseInt(age) || 25;
  if (!h || !w) return null;

  // Grundumsatz & Gesamtumsatz (TDEE) schätzen
  const tdee = Math.round((10 * w + 6.25 * h - 5 * a + 5) * 1.55);
  // Kalorienziel je nach Trainingsfokus anpassen
  const calories = { muscle: tdee + 300, fatloss: tdee - 400, hybrid: tdee + 100, health: tdee }[goal] || tdee;
  const water = Math.round((w * 35 + 500) / 100) / 10;
  // Proteinbedarf je nach Fokus berechnen
  const protein = { muscle: Math.round(w * 2.2), fatloss: Math.round(w * 2.0), hybrid: Math.round(w * 1.8), health: Math.round(w * 1.6) }[goal] || Math.round(w * 1.8);
  const steps = goal === 'fatloss' ? 10000 : goal === 'health' ? 8000 : 7500;

  return { calories, water, protein, steps, tdee };
}

/* ==========================================================================
   WOCHEN-NAVIGATOR & KALENDERHELFER
   ========================================================================== */
// Generiert einen eindeutigen Wochenschlüssel (z.B. "2026-W27")
function getWeekKey(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset * 7);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const ys = new Date(d.getFullYear(), 0, 1);
  const wn = Math.ceil((((d - ys) / 86400000) + 1) / 7);
  return `${d.getFullYear()}-W${String(wn).padStart(2, '0')}`;
}

// Helfer für Keys im LocalStorage
function wkKey(di, wk) { return `wk_${wk}_${di}`; }
function doneKey(di, wk) { return `done_${wk}_${di}`; }

let weekOffset = 0; // Offset zur aktuellen Woche (0 = diese Woche, -1 = letzte Woche etc.)
const todayIdx = (new Date().getDay() + 6) % 7; // Wochentags-Index (Montag = 0, Sonntag = 6)
let selectedDayIdx = todayIdx; // Aktuell ausgewählter Tag im Menü

// Globale Variable für den aktuell geladenen Trainingsplan
let PLAN = [];

/* ==========================================================================
   TRAININGSPLÄNE FÜR DIE 4 FOKUSBEREICHE
   (Jeder Plan hat seinen eigenen Block und kann hier editiert werden)
   ========================================================================== */

// --------------------------------------------------------------------- 1. ⚡ HYBRID-ATHLET PLAN (Kraft + Ausdauer) ---------------------------------------------------------------------
const PLAN_HYBRID = [
  // MONTAG: Kraft-Training OK A
  {
    label: "Mo", type: "Upper A", badge: "upper", sub: "Brust · Schultern · Rücken · Arme", icon: "🏋️",
    exercises: [
      { name: "Bankdrücken", target: "4×6–8", note: "Kraft-Fokus – schwer & kontrolliert" },
      { name: "Klimmzüge / Lat Pull", target: "4×8–10", note: "Breiter Rücken = aufrechte Laufhaltung" },
      { name: "Schulterdrücken", target: "3×10–12", note: "" },
      { name: "Rudern Kabelzug eng", target: "3×10–12", note: "Mittlerer Rücken" },
      { name: "Trizeps Pushdown", target: "3×12", note: "" },
      { name: "Bizeps Curl", target: "3×12", note: "" },
      { name: "Plank", target: "3×45 Sek", note: "Core für Laufhaltung" },
    ]
  },

  // DIENSTAG: Ausdauer
  { label: "Di", type: "Laufen", badge: "run", sub: "Grundlage · 5–7 km", icon: "🏃", run: true },

  // MITTWOCH: Kraft-Training UK A
  {
    label: "Mi", type: "Lower A", badge: "lower", sub: "Knie-dominiert · Quad-Fokus", icon: "🏋️",
    exercises: [
      { name: "Kniebeuge", target: "4×6–8", note: "Hauptübung – tief & kontrolliert" },
      { name: "Bulg. Kniebeuge", target: "3×10/Seite", note: "Einbeinige Stabilität = laufrelevant" },
      { name: "Leg Press", target: "3×12", note: "Zusatzvolumen Oberschenkel" },
      { name: "Nordic Curl", target: "3×6–8", note: "Schutz gegen Hamstring-Verletzung" },
      { name: "Wadenheben stehend", target: "4×15", note: "Laufkraft Waden-Achillessehne" },
      { name: "Dead Bug", target: "3×8/Seite", note: "Core-Antirotation" },
    ]
  },

  // DONNERSTAG: Kraft-Training OK B
  {
    label: "Do", type: "Upper B", badge: "upper", sub: "Schultern · Rücken · Arme", icon: "🏋️",
    exercises: [
      { name: "Schrägbank KH", target: "3×10–12", note: "Andere Winkel = mehr Brust" },
      { name: "Rudern LH vorgebeugt", target: "4×8–10", note: "Stärkster Rückenaufbau" },
      { name: "Seitheben KH", target: "3×15", note: "Schulterbreite aufbauen" },
      { name: "Kabelrudern weit", target: "3×12", note: "Oberer Rücken für Laufhaltung" },
      { name: "Hammer Curl", target: "3×12", note: "" },
      { name: "Overhead Trizeps", target: "3×12", note: "" },
      { name: "Seitstütz", target: "3×30 Sek", note: "Laterale Core-Stabilität" },
    ]
  },

  // FREITAG: Ausdauer / Tempo
  { label: "Fr", type: "Laufen Intervalle", badge: "run", sub: "Schnelligkeit · Pace", icon: "⚡", run: true, interval: true },

  // SAMSTAG: Kraft-Training UK B
  {
    label: "Sa", type: "Lower B", badge: "lower", sub: "Hüft-dominiert · Lauf-Fokus", icon: "🏋️",
    exercises: [
      { name: "Rumän. Kreuzheben", target: "4×8–10", note: "Hintere Kette = Laufantrieb" },
      { name: "Hip Thrust", target: "4×12–15", note: "Glutes = wichtigster Laufmotor" },
      { name: "Bulg. Kniebeuge", target: "3×12/Seite", note: "Laufspezifische Einbeinbewegung" },
      { name: "Leg Curl", target: "3×12", note: "Ischiokrurale direkt stärken" },
      { name: "Wadenheben sitzend", target: "4×20", note: "Soleus = Laufen bergauf" },
      { name: "Pallof Press", target: "3×10/Seite", note: "Rotationsstabilität" },
    ]
  },

  // SONNTAG: Erholung
  {
    label: "So", type: "Mobility + Pause", badge: "mob", sub: "Regeneration", icon: "🧘",
    mobility: [
      { name: "Hüftöffner (Tauben-Pose)", meta: "2×60 Sek/Seite" },
      { name: "Ischiokrurale Dehnung", meta: "2×45 Sek/Seite" },
      { name: "Wadendehnung", meta: "2×45 Sek/Seite" },
      { name: "Thorakale Mobilisation", meta: "2×10 Wdh" },
      { name: "Foam Rolling", meta: "10–15 Min" },
      { name: "Spaziergang (optional)", meta: "30–60 Min" },
    ]
  },
];

// --------------------------------------------------------------------- 2. 🏃 LAUFEN PLAN (Laufspezifisch: Ausdauer, Intervalle & Beinkraft) ---------------------------------------------------------------------
const PLAN_RUN = [
  // MONTAG: Regeneration & Core
  {
    label: "Mo", type: "Regeneration & Core", badge: "mob", sub: "Core-Stabilität für eine gute Laufhaltung", icon: "🧘",
    exercises: [
      { name: "Plank (Unterarmstütz)", target: "3×60 Sek", note: "Core-Kräftigung" },
      { name: "Seitstütz", target: "3×30 Sek/S.", note: "Seitliche Bauchmuskeln stützen das Becken" },
      { name: "Dead Bug", target: "3×10/Seite", note: "" },
      { name: "Bird Dog", target: "3×10/Seite", note: "Rücken- & Gesäßstabilität" },
    ]
  },

  // DIENSTAG: Laufen Grundlage
  { label: "Di", type: "Laufen (Grundlage)", badge: "run", sub: "Lockerer Dauerlauf · 5–8 km", icon: "🏃", run: true },

  // MITTWOCH: Läufer-Krafttraining
  {
    label: "Mi", type: "Krafttraining Läufer", badge: "lower", sub: "Kraft & Verletzungsprophylaxe für Beine", icon: "🏋️",
    exercises: [
      { name: "Kniebeuge (Fokus Tiefe)", target: "3×10–12", note: "Saubere Ausführung" },
      { name: "Bulg. Kniebeuge", target: "3×10/Seite", note: "Gleicht muskuläre Dysbalancen aus" },
      { name: "Rumän. Kreuzheben", target: "3×10", note: "Stärkt die hintere Kette (Antrieb)" },
      { name: "Wadenheben einbeinig", target: "3×15/Seite", note: "Wichtig für Sprunggelenks-Stabilität" },
      { name: "Ausfallschritte", target: "3×12/Seite", note: "" },
    ]
  },

  // DONNERSTAG: Pause oder Mobility
  {
    label: "Do", type: "Mobility & Stretch", badge: "mob", sub: "Dehnen & Beweglichkeit für Läufer", icon: "🧘",
    mobility: [
      { name: "Wadendehnung aktiv", meta: "2×45 Sek/Seite" },
      { name: "Oberschenkeldehnung", meta: "2×45 Sek/Seite" },
      { name: "Hüftbeuger-Stretch", meta: "2×60 Sek/Seite" },
      { name: "Brustwirbelsäule öffnen", meta: "2×12 Wdh" },
    ]
  },

  // FREITAG: Intervalllauf
  { label: "Fr", type: "Laufen Intervalle", badge: "run", sub: "Tempo & Pace-Verbesserung", icon: "⚡", run: true, interval: true },

  // SAMSTAG: Langer Dauerlauf
  { label: "Sa", type: "Langer Lauf", badge: "run", sub: "Grundlagenausdauer lang · 10–15 km", icon: "🏃", run: true },

  // SONNTAG: Erholung / Dehnen
  {
    label: "So", type: "Active Recovery", badge: "mob", sub: "Regenerativer Spaziergang & Blackroll", icon: "🧘",
    mobility: [
      { name: "Spaziergang locker", meta: "45–60 Min" },
      { name: "Foam Rolling Beine/Rücken", meta: "15 Min" },
      { name: "Hüftöffner Dehnung", meta: "2×60 Sek" },
    ]
  },
];

//---------------------------------------------------------------------  3. 💪 MUSKELAUFBAU PLAN (Klassischer Kraftsport-Split) --------------------------------------------------------------------- 
const PLAN_MUSCLE = [
  // MONTAG: Oberkörper Push
  {
    label: "Mo", type: "Push (Drücken)", badge: "upper", sub: "Brust · Schultern · Trizeps", icon: "🏋️",
    exercises: [
      { name: "Bankdrücken LH/KH", target: "4×6–8", note: "Schwer starten" },
      { name: "Schrägbankdrücken KH", target: "3×8–10", note: "" },
      { name: "Schulterdrücken KH", target: "3×8–10", note: "" },
      { name: "Seitheben KH", target: "4×12–15", note: "Fokus auf Muskelbrennen" },
      { name: "Dips (Körpergewicht)", target: "3×Max", note: "" },
      { name: "Trizepsdrücken Kabel", target: "3×10–12", note: "" },
    ]
  },

  // DIENSTAG: Oberkörper Pull
  {
    label: "Di", type: "Pull (Ziehen)", badge: "upper", sub: "Rücken · Bizeps", icon: "🏋️",
    exercises: [
      { name: "Klimmzüge", target: "4×Max", note: "Ggf. mit Unterstützung" },
      { name: "Rudern vorgebeugt LH", target: "4×8–10", note: "Fokus auf Lat & Trapez" },
      { name: "Latzug breit", target: "3×10–12", note: "" },
      { name: "Kabelrudern eng", target: "3×10–12", note: "" },
      { name: "Face Pulls", target: "3×15", note: "Hintere Schulter & Rotatoren" },
      { name: "Bizepscurls (SZ-Stange)", target: "3×10–12", note: "" },
      { name: "Hammercurls KH", target: "3×12", note: "" },
    ]
  },

  // MITTWOCH: Unterkörper (Beine & Waden)
  {
    label: "Mi", type: "Legs (Beine)", badge: "lower", sub: "Quadrizeps · Hamstrings · Waden", icon: "🏋️",
    exercises: [
      { name: "Kniebeuge (Squats)", target: "4×6–8", note: "Voller Bewegungsumfang" },
      { name: "Rumän. Kreuzheben LH", target: "4×8–10", note: "Hintere Kette belasten" },
      { name: "Beinpresse 45°", target: "3×10–12", note: "" },
      { name: "Beinstrecker", target: "3×12–15", note: "" },
      { name: "Beinbeuger liegend", target: "3×12–15", note: "" },
      { name: "Wadenheben stehend", target: "4×15–20", note: "Am Ende kurz halten" },
    ]
  },

  // DONNERSTAG: Pause
  {
    label: "Do", type: "Regeneration", badge: "mob", sub: "Ruhetag für Muskelwachstum", icon: "🧘",
    mobility: [
      { name: "Leichte Dehnübungen", meta: "10–15 Min" },
      { name: "Spaziergang", meta: "30 Min" },
    ]
  },

  // FREITAG: Ganzkörper-Kraft (Volumen)
  {
    label: "Fr", type: "Ganzkörper Kraft", badge: "lower", sub: "Fokus Verbundübungen", icon: "🏋️",
    exercises: [
      { name: "Kreuzheben (Deadlifts)", target: "3×5", note: "Schwer & technisch sauber" },
      { name: "Schrägbank KH", target: "3×8–10", note: "" },
      { name: "Rudern am Kabel", target: "3×8–10", note: "" },
      { name: "Ausfallschritte KH", target: "3×10/Seite", note: "" },
      { name: "Seitheben", target: "3×12", note: "" },
      { name: "Plank", target: "3×60 Sek", note: "" },
    ]
  },

  // SAMSTAG: Core & Arme (Spezialtraining)
  {
    label: "Sa", type: "Core & Arme", badge: "upper", sub: "Bauch & Arm-Fokus", icon: "🏋️",
    exercises: [
      { name: "Kabel-Crunches", target: "3×15", note: "" },
      { name: "Beinheben hängend", target: "3×Max", note: "" },
      { name: "Trizeps Overhead KH", target: "3×10", note: "" },
      { name: "Konzentrations-Curls", target: "3×12/Seite", note: "" },
      { name: "Plank mit Drehung", target: "3×45 Sek", note: "" },
    ]
  },

  // SONNTAG: Pause
  {
    label: "So", type: "Regeneration", badge: "mob", sub: "Muskelregeneration", icon: "🧘",
    mobility: [
      { name: "Blackroll Massage", meta: "15 Min" },
      { name: "Erholsamer Spaziergang", meta: "30–60 Min" },
    ]
  },
];

// ---------------------------------------------------------------------  4. 🔥 GEWICHTSVERLUST / ABNEHMEN PLAN (Kalorienverbrennung & Zirkeltraining) ---------------------------------------------------------------------
const PLAN_FATLOSS = [
  // MONTAG: Ganzkörper Kraftzirkel (Kraftausdauer)
  {
    label: "Mo", type: "Ganzkörper Zirkel", badge: "gzk", sub: "Hohe Herzfrequenz · hoher Verbrauch", icon: "🏋️",
    exercises: [
      { name: "Kniebeuge mit Zusatzgewicht", target: "3×12–15", note: "Kurze Pausen" },
      { name: "Liegestütze (Push-Ups)", target: "3×12–15", note: "" },
      { name: "Ausfallschritte im Wechsel", target: "3×12/Seite", note: "" },
      { name: "Rudern KH beidarmig", target: "3×12", note: "" },
      { name: "Mountain Climbers", target: "3×45 Sek", note: "Intensiver Core-Fokus" },
      { name: "Plank", target: "3×60 Sek", note: "" },
    ]
  },

  // DIENSTAG: Laufen Grundlage (Fettverbrennung)
  { label: "Di", type: "Laufen (Fettverbrennung)", badge: "run", sub: "Lockerer Lauf im Fettverbrennungsbereich (60-70% HF) · 5–6 km", icon: "🏃", run: true },

  // MITTWOCH: Ganzkörper Zirkeltraining B
  {
    label: "Mi", type: "Kraft-Ausdauer Zirkel", badge: "gzk", sub: "Ganzkörpertraining mit Kettlebell/Kurzhantel", icon: "🏋️",
    exercises: [
      { name: "Kreuzheben KH", target: "3×12", note: "" },
      { name: "Schulterdrücken stehend", target: "3×12", note: "" },
      { name: "Goblet Squats", target: "3×15", note: "" },
      { name: "Klimmzüge / Latzug", target: "3×10–12", note: "" },
      { name: "Bicycle Crunches", target: "3×15/Seite", note: "" },
      { name: "Burpees", target: "3×10", note: "Optional durch Hampelmänner ersetzen" },
    ]
  },

  // DONNERSTAG: Pause & Spaziergang
  {
    label: "Do", type: "Aktive Erholung", badge: "mob", sub: "Regenerativer Tag", icon: "🧘",
    mobility: [
      { name: "Zügiger Spaziergang", meta: "45 Min" },
      { name: "Ganzkörper-Dehnung", meta: "15 Min" },
    ]
  },

  // FREITAG: Intervalllauf (HIIT Cardio)
  { label: "Fr", type: "Laufen Intervalle (HIIT)", badge: "run", sub: "Sehr hohe Nachverbrennung durch Sprints", icon: "⚡", run: true, interval: true },

  // SAMSTAG: Core & HIIT Home-Workout
  {
    label: "Sa", type: "HIIT & Core Zirkel", badge: "gzk", sub: "Schnelles, intensives Training", icon: "🏋️",
    exercises: [
      { name: "Jumping Squats", target: "3×12", note: "Explosiv nach oben springen" },
      { name: "Plank-Jacks", target: "3×45 Sek", note: "" },
      { name: "Beinheben liegend", target: "3×15", note: "" },
      { name: "Russischer Twist", target: "3×20/Seite", note: "" },
      { name: "Hampelmänner (Jumping Jacks)", target: "3×60 Sek", note: "" },
    ]
  },

  // SONNTAG: Dehnen & Spazieren
  {
    label: "So", type: "Regeneration", badge: "mob", sub: "Entspannung und Regeneration", icon: "🧘",
    mobility: [
      { name: "Mobilisation Hüfte/Beine", meta: "15 Min" },
      { name: "Erholsamer Spaziergang", meta: "30–60 Min" },
    ]
  },
];

// Hilfsfunktion zur Rückgabe des richtigen Plans basierend auf dem Onboarding-Ziel
function getActivePlan() {
  const goal = userProfile?.goal || 'hybrid';
  if (goal === 'muscle') return PLAN_MUSCLE;
  if (goal === 'fatloss') return PLAN_FATLOSS;
  if (goal === 'health' || goal === 'run') return PLAN_RUN;
  return PLAN_HYBRID;
}

/* ==========================================================================
   AUSDAUER- & PACE-BERECHNUNG
   ========================================================================== */
// Berechnet die Pace (Minuten pro Kilometer)
function calcPace(km, min) {
  if (!km || !min || km <= 0 || min <= 0) return null;
  const d = min / km;
  return {
    str: `${Math.floor(d)}:${String(Math.round((d % 1) * 60)).padStart(2, '0')}`,
    decimal: d
  };
}

// Kategorisiert die Pace für den visuellen Fortschrittsbalken
function paceCategory(d) {
  if (!d) return { label: '–', pct: 0 };
  if (d <= 4) return { label: 'Sehr schnell', pct: 95 };
  if (d <= 4.5) return { label: 'Schnell', pct: 80 };
  if (d <= 5) return { label: 'Gut', pct: 65 };
  if (d <= 5.5) return { label: 'Flott', pct: 55 };
  if (d <= 6) return { label: 'Moderat', pct: 45 };
  if (d <= 6.5) return { label: 'Gemütlich', pct: 35 };
  if (d <= 7.5) return { label: 'Locker', pct: 25 };
  return { label: 'Spazieren', pct: 15 };
}

/* ==========================================================================
   TOAST & PLAN-PHASE SYSTEM
   ========================================================================== */
let toastTimer;
// Blendet einen kurzen Hinweis am unteren Bildschirmrand ein
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2500);
}

// Ermittelt die Trainingsphase basierend auf dem Startdatum des Programms
function getPhase() {
  let st = S.get('start_ts', null);
  if (!st) {
    st = Date.now();
    S.set('start_ts', st);
  }
  const w = Math.floor((Date.now() - st) / (7 * 86400000));
  if (w < 2) return { n: 'Woche 1–2', desc: 'Einstieg & Fundament', tip: 'Technik vor Last. Konsistenz > Intensität.' };
  if (w < 4) return { n: 'Woche 3–4', desc: 'Aufbau', tip: 'Gewichte +5–10%. Laufdistanz auf 7 km.' };
  return { n: 'Woche 5', desc: 'Deload & Test', tip: 'Volumen –30%. 5km-Zeit testen!' };
}

/* ==========================================================================
   SEITENNAVIGATION (Routing)
   ========================================================================== */
function showPage(id) {
  // Alle Seiten unsichtbar machen
  document.querySelectorAll('.page').forEach(p => p.classList.remove('on'));
  // Aktiven Nav-Button-Style entfernen
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('on'));

  // Die gewünschte Seite anzeigen
  const page = document.getElementById(id);
  if (page) page.classList.add('on');

  // Navigations-Button als aktiv markieren
  const btn = document.querySelector(`.nav-btn[data-page="${id}"]`);
  if (btn) btn.classList.add('on');

  // Den jeweiligen Seiteninhalt frisch rendern
  switch (id) {
    case 'today': renderToday(); break;
    case 'week': renderWeek(); break;
    case 'body': renderBodyPage(); break;
    case 'stats': renderStats(); break;
    case 'log': renderLog(); break;
    case 'plan': renderPlanPage(); break;
    case 'settings': renderSettings(); break;
  }
}

/* ==========================================================================
   DATENSPEICHERUNG (Lokale & Server-Verbindung)
   ========================================================================== */
// Speichert die eingegebenen Kraftwerte (Kg, Wiederholungen, Sätze)
function saveEx(di, j, field, val) {
  const wk = getWeekKey(), key = wkKey(di, wk), d = S.get(key, {});
  if (!d[j]) d[j] = {};
  d[j][field] = val;
  S.set(key, d);

  if (currentUser) {
    queueSync('workout_sets', {
      id: `${currentUser.id}_${wk}_${di}_${j}`,
      user_id: currentUser.id,
      week_key: wk,
      day_index: di,
      exercise_index: j,
      exercise_name: PLAN[di]?.exercises?.[j]?.name || '',
      kg: parseFloat(d[j].kg) || null,
      reps: parseInt(d[j].reps) || null,
      sets: parseInt(d[j].sets) || null,
      updated_at: new Date().toISOString()
    });
    processQueue();
  }
}

// Speichert die eingegebenen Lauf-Daten (Kilometer, Dauer etc.)
function saveRun(di, field, val) {
  const wk = getWeekKey(), key = wkKey(di, wk), d = S.get(key, {});
  if (!d.run) d.run = {};
  d.run[field] = val;
  S.set(key, d);

  if (currentUser) {
    const r = d.run;
    queueSync('run_sessions', {
      id: `${currentUser.id}_${wk}_${di}`,
      user_id: currentUser.id,
      week_key: wk,
      day_index: di,
      distance_km: parseFloat(r.dist) || null,
      duration_min: parseFloat(r.time) || null,
      heart_rate: parseInt(r.hr) || null,
      calories: parseInt(r.kcal) || null,
      elevation_m: parseInt(r.elev) || null,
      feel: parseInt(r.feel) || null,
      notes: r.notes || null,
      updated_at: new Date().toISOString()
    });
    processQueue();
  }
}

// Schaltet eine Mobility-Übung auf erledigt / unerledigt
function toggleMob(di, i) {
  const wk = getWeekKey(), key = wkKey(di, wk) + '_mob', d = S.get(key, {});
  if (d[i]) delete d[i]; else d[i] = true;
  S.set(key, d);
  renderToday();
}

// Markiert eine ganze Tageseinheit als komplett abgeschlossen
function toggleDone(di) {
  const wk = getWeekKey(), key = doneKey(di, wk), curr = S.get(key, false);
  S.set(key, !curr);
  toast(!curr ? '✓ Einheit abgeschlossen!' : 'Markierung entfernt');

  if (currentUser) {
    queueSync('workouts', {
      id: `${currentUser.id}_${wk}_${di}`,
      user_id: currentUser.id,
      week_key: wk,
      day_index: di,
      done: !curr,
      completed_at: !curr ? new Date().toISOString() : null
    });
    processQueue();
  }
  renderToday();
}

// Erhöht/Verringert die Werte der Dashboard-Widgets (Wasser, Schritte)
function addWidget(field, val) {
  const today = new Date().toISOString().slice(0, 10), key = 'wd_' + today;
  const wd = S.get(key, { water: 0, steps: 0, calories: 0 });
  wd[field] = Math.round((wd[field] + val) * 100) / 100;
  S.set(key, wd);
  syncDailyLog(today, wd);
  renderToday();
}

// Setzt den Wert eines Widgets direkt fest
function setWidget(field, val) {
  const today = new Date().toISOString().slice(0, 10), key = 'wd_' + today;
  const wd = S.get(key, { water: 0, steps: 0, calories: 0 });
  wd[field] = parseFloat(val) || 0;
  S.set(key, wd);
  syncDailyLog(today, wd);
  renderToday();
}

// Synchronisiert das tägliche Widget-Log (Wasser & Schritte) mit Supabase
function syncDailyLog(date, data) {
  if (!currentUser) return;
  queueSync('daily_logs', {
    id: `${currentUser.id}_${date}`,
    user_id: currentUser.id,
    log_date: date,
    water_l: data.water || null,
    steps: data.steps || null,
    calories_eaten: data.calories || null,
    updated_at: new Date().toISOString()
  });
  processQueue();
}

/* ==========================================================================
   SEITE: HEUTE (Dashboard & Tagesplanung)
   ========================================================================== */
function renderToday() {
  const wk = getWeekKey(), day = PLAN[selectedDayIdx];
  const saved = S.get(wkKey(selectedDayIdx, wk), {}), done = S.get(doneKey(selectedDayIdx, wk), false);
  const stats = calcUserStats(userProfile), phase = getPhase();
  const tcol = { upper: 'var(--cat-upper-color)', lower: 'var(--cat-lower-color)', run: 'var(--cat-run-color)', mob: 'var(--cat-mob-color)', gzk: 'var(--cat-gzk-color)' };

  // Wochentagsleiste rendern
  const miniGrid = PLAN.map((d, i) => {
    const isDone = S.get(doneKey(i, wk), false), isSel = i === selectedDayIdx;
    return `<div class="wday cat-${d.badge}${isDone ? ' done' : ''}${isSel ? ' selected' : ''}" onclick="selectedDayIdx=${i};renderToday()">
      <div class="wday-label">${d.label}</div>
      <div style="font-size:12px;margin-top:2px">${d.run ? '🏃' : d.mobility ? '🧘' : '💪'}</div>
      <div class="wday-dot"></div>
    </div>`;
  }).join('');

  // Prozentring Berechnungen
  const r = 34, circ = 2 * Math.PI * r;
  let total = 1, doneCount = done ? 1 : 0;
  if (day.exercises) {
    total = day.exercises.length;
    doneCount = day.exercises.filter((_, j) => saved[j]?.kg).length;
  } else if (day.mobility) {
    total = day.mobility.length;
    doneCount = Object.keys(S.get(wkKey(selectedDayIdx, wk) + '_mob', {})).length;
  }
  const pct = Math.round(doneCount / total * 100);
  const fill = circ - circ * (pct / 100);

  // HTML Struktur für das Tagesziel bestimmen
  let bodyHTML = '';
  if (day.mobility) {
    const mc = S.get(wkKey(selectedDayIdx, wk) + '_mob', {});
    bodyHTML = `<div class="mob-list">${day.mobility.map((m, i) => `
      <div class="mob-item${mc[i] ? ' checked' : ''}" onclick="toggleMob(${selectedDayIdx},${i})">
        <div class="mob-check">✓</div>
        <div><div class="mob-name">${m.name}</div><div class="mob-meta">${m.meta}</div></div>
      </div>`).join('')}</div>`;
  } else if (day.run) {
    bodyHTML = renderRunFields(selectedDayIdx, wk, saved, day.interval);
  } else if (day.exercises) {
    bodyHTML = renderExerciseTable(selectedDayIdx, wk, saved, day.exercises);
  }

  // Profil-Banner
  const profBanner = userProfile ? `<div class="profile-banner">
    <div class="profile-avatar">${(userProfile.username || '?').charAt(0).toUpperCase()}</div>
    <div>
      <div style="font-size:14px;font-weight:600">${userProfile.username}${userProfile.tag || ''}</div>
      <div style="font-size:11px;color:var(--muted2)">Ziel: ${{ hybrid: 'Hybrid-Athlet', muscle: 'Muskelaufbau', fatloss: 'Gewichtsverlust', health: 'Gesundheit' }[userProfile.goal] || userProfile.goal}</div>
    </div></div>` : '';

  document.getElementById('today').innerHTML = `
    ${profBanner}
    <div class="phase-banner"><span class="phase-icon">📈</span>
      <div><div class="phase-text">${phase.n}: ${phase.desc}</div><div class="phase-sub">${phase.tip}</div></div>
    </div>
    ${stats ? renderWidgets(stats) : ''}
    <div class="slabel">Diese Woche</div>
    <div class="week-grid">${miniGrid}</div>
    <div class="card">
      <div class="card-header">
        <div class="card-title"><span>${day.icon}</span><span>${day.type}</span>
          <span class="badge b-${day.badge}">${{ upper: 'Oberkörper', lower: 'Unterkörper', run: 'Laufen', mob: 'Mobility', gzk: 'Zirkel' }[day.badge]}</span>
        </div>
        <div class="ring-wrap">
          <svg width="80" height="80" viewBox="0 0 80 80">
            <circle cx="40" cy="40" r="${r}" fill="none" stroke="var(--bg4)" stroke-width="6"/>
            <circle cx="40" cy="40" r="${r}" fill="none" stroke="${tcol[day.badge]}" stroke-width="6"
              stroke-dasharray="${circ.toFixed(2)}" stroke-dashoffset="${fill.toFixed(2)}" stroke-linecap="round"/>
          </svg>
          <div class="ring-center"><div class="ring-n">${pct}%</div><div class="ring-l">${day.run ? 'Bereit' : doneCount + '/' + total}</div></div>
        </div>
      </div>
      <div style="font-size:11px;color:var(--muted2);margin-bottom:14px;font-weight:500">${day.sub}</div>
      ${bodyHTML}
      <button class="done-btn${done ? ' marked' : ''}" onclick="toggleDone(${selectedDayIdx})">
        ${done ? '✓ Einheit abgeschlossen' : 'Als abgeschlossen markieren'}
      </button>
    </div>
    ${renderPrevValues(selectedDayIdx)}`;
}

// Rendert die Dashboard-Widgets (Wasser und Schritte)
function renderWidgets(stats) {
  const today = new Date().toISOString().slice(0, 10);
  const wd = S.get('wd_' + today, { water: 0, steps: 0, calories: 0 });
  const wp = Math.min(100, Math.round(wd.water / stats.water * 100));
  const sp = Math.min(100, Math.round(wd.steps / stats.steps * 100));

  return `<div class="slabel">Tages-Dashboard</div>
    <div class="widget-grid">
      <div class="widget">
        <div class="widget-label">💧 Wasser</div>
        <div class="widget-val">${wd.water.toFixed(1)}<span style="font-size:14px;font-weight:500;color:var(--muted2)"> / ${stats.water}L</span></div>
        <div class="widget-bar"><div class="widget-bar-fill" style="width:${wp}%;background:var(--stat-accent)"></div></div>
        <div class="widget-input-row">
          <button class="widget-add-btn" onclick="addWidget('water',0.25)">+0.25L</button>
          <button class="widget-add-btn" onclick="addWidget('water',0.5)">+0.5L</button>
        </div>
      </div>
      <div class="widget">
        <div class="widget-label">👟 Schritte</div>
        <div class="widget-val">${wd.steps.toLocaleString('de')}<span style="font-size:11px;color:var(--muted2)"> / ${stats.steps.toLocaleString('de')}</span></div>
        <div class="widget-bar"><div class="widget-bar-fill" style="width:${sp}%;background:var(--cat-run-color)"></div></div>
        <div class="widget-input-row">
          <input class="widget-input" type="number" inputmode="numeric" placeholder="Schritte" id="stepsInput" onfocus="this.select()">
          <button class="widget-add-btn" onclick="setWidget('steps',document.getElementById('stepsInput').value)">✓</button>
        </div>
      </div>
    </div>
    <div class="calcs-grid">
      <div class="calc-card"><div class="calc-n" style="color:var(--cat-mob-color)">${stats.calories}</div><div class="calc-l">🔥 Kalorien-Ziel</div></div>
      <div class="calc-card"><div class="calc-n" style="color:var(--cat-run-color)">${stats.protein}g</div><div class="calc-l">🥩 Protein-Ziel</div></div>
    </div>`;
}

// Rendert die Eingabetabelle für ein Kraft-Workout
function renderExerciseTable(dayIdx, wk, saved, exercises) {
  const pWk = getWeekKey(-1);
  const prev = S.get(wkKey(dayIdx, pWk), {});

  return `<div class="ex-wrap"><table class="ex-table">
    <thead><tr><th style="width:42%">Übung</th><th>Kg</th><th>Wdh</th><th>Sätze</th></tr></thead>
    <tbody>${exercises.map((ex, j) => {
    const s = saved[j] || {};
    const p = prev[j] || {};
    const sug = p.kg && !s.kg ? `<div class="ex-suggest">💡 Vorwoche: ${p.kg}kg × ${p.reps || '?'}</div>` : '';
    return `<tr>
        <td><div class="ex-name">${ex.name}</div><div class="ex-target">${ex.target}</div>${ex.note ? `<div class="ex-note">${ex.note}</div>` : ''}${sug}</td>
        <td><input class="val${s.kg ? ' has-val' : ''}" type="number" inputmode="decimal" placeholder="${p.kg || '—'}" value="${s.kg || ''}" onfocus="this.select()" oninput="saveEx(${dayIdx},${j},'kg',this.value)"></td>
        <td><input class="val${s.reps ? ' has-val' : ''}" type="number" inputmode="numeric" placeholder="${p.reps || '—'}" value="${s.reps || ''}" onfocus="this.select()" oninput="saveEx(${dayIdx},${j},'reps',this.value)"></td>
        <td><input class="val${s.sets ? ' has-val' : ''}" type="number" inputmode="numeric" placeholder="${p.sets || '—'}" value="${s.sets || ''}" onfocus="this.select()" oninput="saveEx(${dayIdx},${j},'sets',this.value)"></td>
      </tr>`;
  }).join('')}</tbody></table></div>`;
}

// Rendert die Eingabefelder für eine Laufeinheit
function renderRunFields(dayIdx, wk, saved, isInterval) {
  const rd = saved.run || {};
  const pace = calcPace(parseFloat(rd.dist), parseFloat(rd.time));
  const cat = paceCategory(pace?.decimal);
  const feelEmojis = ['😫', '😔', '😐', '😊', '🔥'];

  const iv = isInterval ? `<div class="card-sm" style="margin-bottom:12px">
    <div style="font-size:11px;color:var(--cat-run-color);font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">⚡ Intervall-Plan</div>
    <div style="font-size:12px;color:var(--muted2);line-height:1.7">Warm-up 5 Min → <strong style="color:var(--text)">6–8× 2 Min schnell</strong> / 2 Min locker → Cool-down 10 Min<br><span style="color:var(--cat-run-color)">Schnell = 80–85% HF · Locker = Traben</span></div>
  </div>` : '';

  return `${iv}
    <div class="run-grid">
      <div class="run-field"><label>Distanz (km)</label><input type="number" step="0.1" inputmode="decimal" placeholder="5.0" value="${rd.dist || ''}" class="${rd.dist ? 'has-val' : ''}" id="run_dist_${dayIdx}" onfocus="this.select()" oninput="saveRun(${dayIdx},'dist',this.value);updPace(${dayIdx})"></div>
      <div class="run-field"><label>Zeit (min)</label><input type="number" step="1" inputmode="numeric" placeholder="30" value="${rd.time || ''}" class="${rd.time ? 'has-val' : ''}" id="run_time_${dayIdx}" onfocus="this.select()" oninput="saveRun(${dayIdx},'time',this.value);updPace(${dayIdx})"></div>
      <div class="run-field"><label>HF Ø (bpm)</label><input type="number" inputmode="numeric" placeholder="145" value="${rd.hr || ''}" class="${rd.hr ? 'has-val' : ''}" onfocus="this.select()" oninput="saveRun(${dayIdx},'hr',this.value)"></div>
    </div>
    <div class="run-grid" style="grid-template-columns:1fr 1fr;margin-top:0">
      <div class="run-field"><label>Kalorien (kcal)</label><input type="number" inputmode="numeric" placeholder="300" value="${rd.kcal || ''}" class="${rd.kcal ? 'has-val' : ''}" onfocus="this.select()" oninput="saveRun(${dayIdx},'kcal',this.value)"></div>
      <div class="run-field"><label>Höhenmeter (m)</label><input type="number" inputmode="numeric" placeholder="0" value="${rd.elev || ''}" class="${rd.elev ? 'has-val' : ''}" onfocus="this.select()" oninput="saveRun(${dayIdx},'elev',this.value)"></div>
    </div>
    <div class="pace-display" id="pace_disp_${dayIdx}">
      <div class="pace-label">⚡ Automatische Pace</div>
      <div class="pace-value" id="pace_val_${dayIdx}">${pace ? pace.str : '—:——'}</div>
      <div class="pace-unit">min/km</div>
      <div class="pace-bar-wrap"><div class="pace-bar-label"><span>Langsam</span><span id="pace_cat_${dayIdx}">${cat.label}</span><span>Schnell</span></div>
      <div class="pace-bar"><div class="pace-bar-fill" id="pace_fill_${dayIdx}" style="width:${cat.pct}%"></div></div></div>
    </div>
    <div style="margin-top:12px">
      <div style="font-size:10px;color:var(--muted2);font-weight:600;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">Wie war die Einheit?</div>
      <div class="feel-row">${feelEmojis.map((e, i) => `<div class="feel-btn${rd.feel == i + 1 ? ' on' : ''}" onclick="saveRun(${dayIdx},'feel',${i + 1});renderToday()">${e}</div>`).join('')}</div>
    </div>
    <div class="card-sm" style="margin-top:12px">
      <div style="font-size:10px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">Notizen</div>
      <textarea style="width:100%;background:transparent;border:none;color:var(--muted2);font-size:13px;resize:none;outline:none;min-height:52px;font-family:var(--font);line-height:1.5"
        placeholder="Wie lief's? Streckenbeschreibung..." oninput="saveRun(${dayIdx},'notes',this.value)">${rd.notes || ''}</textarea>
    </div>`;
}

// Aktualisiert die Pace-Wert-Anzeige live beim Tippen
function updPace(di) {
  const dist = parseFloat(document.getElementById('run_dist_' + di)?.value) || 0;
  const time = parseFloat(document.getElementById('run_time_' + di)?.value) || 0;
  const pace = calcPace(dist, time);
  const cat = paceCategory(pace?.decimal);

  const pv = document.getElementById('pace_val_' + di);
  const fill = document.getElementById('pace_fill_' + di);
  const catEl = document.getElementById('pace_cat_' + di);

  if (pv) pv.textContent = pace ? pace.str : '—:——';
  if (fill) fill.style.width = cat.pct + '%';
  if (catEl) catEl.textContent = cat.label;
}

// Vergleicht den aktuellen Tag mit der Vorwoche und zeigt die alten Werte an
function renderPrevValues(di) {
  const pWk = getWeekKey(-1), day = PLAN[di];
  const prev = S.get(wkKey(di, pWk), {});
  const curr = S.get(wkKey(di, getWeekKey()), {});
  const prMap = {};

  for (let w = 0; w >= -20; w--) {
    const d = S.get(wkKey(di, getWeekKey(w)), {});
    day.exercises?.forEach((_, j) => {
      const kg = parseFloat(d[j]?.kg);
      if (kg && (!prMap[j] || kg > prMap[j])) prMap[j] = kg;
    });
  }

  if (day.run) {
    const pr = prev.run || {};
    if (!pr.dist && !pr.time) return `<div class="empty">Noch keine Vorwochenwerte</div>`;
    const pp = calcPace(parseFloat(pr.dist), parseFloat(pr.time));
    const cp = calcPace(parseFloat(curr.run?.dist), parseFloat(curr.run?.time));

    return `<div class="prev-header"><span class="prev-title">Vorwoche</span></div><div class="card-sm">
      ${pr.dist ? `<div class="prev-row"><span class="prev-key">Distanz</span><span class="prev-val">${pr.dist} km</span></div>` : ''}
      ${pr.time ? `<div class="prev-row"><span class="prev-key">Zeit</span><span class="prev-val">${pr.time} Min</span></div>` : ''}
      ${pp ? `<div class="prev-row"><span class="prev-key">Pace</span><span class="prev-val">${pp.str} min/km${cp && cp.decimal < pp.decimal ? '<span class="pr-tag">schneller</span>' : ''}</span></div>` : ''}
      ${pr.hr ? `<div class="prev-row"><span class="prev-key">HF Ø</span><span class="prev-val">${pr.hr} bpm</span></div>` : ''}
    </div>`;
  }

  if (!day.exercises) return '';
  const hasAny = day.exercises.some((_, j) => prev[j]?.kg || prev[j]?.reps);
  if (!hasAny) return `<div class="empty">Noch keine Vorwochenwerte</div>`;

  return `<div class="prev-header"><span class="prev-title">Vorwoche</span><span class="prev-badge">Vergleich</span></div>
    <div class="card-sm">${day.exercises.map((ex, j) => {
    const p = prev[j];
    if (!p || (!p.kg && !p.reps)) return '';
    const ckg = parseFloat(curr[j]?.kg);
    const isPR = ckg && ckg > (prMap[j] || 0) && ckg > parseFloat(p.kg || 0);
    return `<div class="prev-row"><span class="prev-key">${ex.name}</span>
        <span class="prev-val">${p.kg ? p.kg + ' kg ' : ''} ${p.reps ? '×' + p.reps : ''} ${p.sets ? p.sets + 'S' : ''}${isPR ? '<span class="pr-tag">PR</span>' : ''}</span></div>`;
  }).join('')}</div>`;
}

/* ==========================================================================
   SEITE: WOCHE (Wochenfortschritt & Übersicht)
   ========================================================================== */
function renderWeek() {
  const wk = getWeekKey(weekOffset);
  const doneDays = PLAN.filter((_, i) => S.get(doneKey(i, wk), false));
  const pct = Math.round(doneDays.length / PLAN.length * 100);
  const bgC = { upper: 'var(--cat-upper-bg)', lower: 'var(--cat-lower-bg)', run: 'var(--cat-run-bg)', mob: 'var(--cat-mob-bg)', gzk: 'var(--cat-gzk-bg)' };

  const cards = PLAN.map((day, i) => {
    const done = S.get(doneKey(i, wk), false);
    const saved = S.get(wkKey(i, wk), {});
    let detail = '';

    if (day.run && saved.run?.dist) {
      const p = calcPace(parseFloat(saved.run.dist), parseFloat(saved.run.time));
      detail = `${saved.run.dist} km${p ? ' · ' + p.str + ' /km' : ''}${saved.run.feel ? ' · ' + ['😫', '😔', '😐', '😊', '🔥'][saved.run.feel - 1] : ''}`;
    } else if (day.exercises) {
      const f = day.exercises.filter((_, j) => saved[j]?.kg).length;
      if (f) detail = `${f}/${day.exercises.length} Übungen`;
    } else if (day.mobility) {
      const mc = S.get(wkKey(i, wk) + '_mob', {});
      const c = Object.keys(mc).length;
      if (c) detail = `${c}/${day.mobility.length} erledigt`;
    }

    return `<div class="day-sum${done ? ' done-card' : ''}" onclick="selectedDayIdx=${i};showPage('today')">
      <div class="day-icon" style="background:${bgC[day.badge]}">${day.icon}</div>
      <div style="flex:1;min-width:0"><div style="font-size:14px;font-weight:600;margin-bottom:2px">${day.label} — ${day.type}</div><div style="font-size:11px;color:var(--muted2)">${detail || day.sub}</div></div>
      ${done ? '<span style="font-size:11px;color:var(--success-color);font-weight:600">✓</span>' : i === todayIdx && weekOffset === 0 ? '<span style="font-size:10px;color:var(--input-focus);font-weight:700;border:1px solid var(--input-focus);padding:2px 7px;border-radius:10px">Heute</span>' : ''}
    </div>`;
  }).join('');

  document.getElementById('week').innerHTML = `
    <div class="week-sel">
      <button class="week-nav" onclick="weekOffset--;renderWeek()">‹</button>
      <span class="week-label">${weekOffset === 0 ? 'Diese Woche' : weekOffset === -1 ? 'Letzte Woche' : `Vor ${-weekOffset} Wochen`}</span>
      <button class="week-nav" onclick="weekOffset=Math.min(0,weekOffset+1);renderWeek()" ${weekOffset >= 0 ? 'disabled' : ''}>›</button>
    </div>
    <div class="card"><div class="prog-wrap">
      <div class="prog-lbl"><span>Wochenfortschritt</span><span>${doneDays.length}/${PLAN.length} · ${pct}%</span></div>
      <div class="prog-bar"><div class="prog-fill" style="width:${pct}%;background:linear-gradient(90deg,var(--pace-bar-grad-1),var(--pace-bar-grad-2))"></div></div>
    </div></div>
    <div class="slabel">Einheiten</div>${cards}`;
}

/* ==========================================================================
   SEITE: KÖRPER & GEWICHT (Gewichtstracker und Diagramm)
   ========================================================================== */
// Formatiert Datumsstrings für Deutsch (DD.MM.YY)
function fmtDate(s) {
  if (!s) return '';
  return new Date(s + 'T00:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

// Formatiert Datumsstrings kurz (DD.MM.)
function fmtDateShort(s) {
  if (!s) return '';
  return new Date(s + 'T00:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}

// Erstellt ein SVG-Bögen-Verlaufsdiagramm basierend auf den Gewichtseinträgen
function buildWeightChart(logs) {
  if (!logs || logs.length === 0) return `<div class="empty" style="padding:40px 0">📊<br><br>Trage dein erstes Gewicht ein!</div>`;
  if (logs.length === 1) return `<div style="text-align:center;padding:32px 0">
    <div style="font-size:40px;font-weight:800;color:var(--stat-accent);letter-spacing:-2px">${logs[0].weight_kg} <span style="font-size:16px;font-weight:500;color:var(--muted2)">kg</span></div>
    <div style="font-size:11px;color:var(--muted2);margin-top:8px">Erster Eintrag · ${fmtDate(logs[0].logged_at)}</div>
    <div style="font-size:12px;color:var(--muted);margin-top:8px">Trage morgen erneut ein – dann siehst du deinen Verlauf</div>
  </div>`;

  const display = logs.slice(-60); // Maximal 60 Einträge anzeigen
  const weights = display.map(e => e.weight_kg);
  const rawMin = Math.min(...weights), rawMax = Math.max(...weights);
  const pad = Math.max((rawMax - rawMin) * 0.22, 0.9);
  const yMin = rawMin - pad, yMax = rawMax + pad, range = yMax - yMin;

  const W = 340, H = 172, PL = 40, PR = 14, PT = 18, PB = 28;
  const cW = W - PL - PR, cH = H - PT - PB;
  const toX = i => PL + (i / (display.length - 1 || 1)) * cW;
  const toY = w => PT + cH - ((w - yMin) / range) * cH;

  const pts = display.map((e, i) => ({ x: toX(i), y: toY(e.weight_kg), w: e.weight_kg, d: e.logged_at }));

  // Erzeugt eine weiche Kurve (Bezier-Spline) zwischen den Messpunkten
  function smoothPath(pts) {
    let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1], curr = pts[i], cx = (curr.x - prev.x) * 0.42;
      d += ` C${(prev.x + cx).toFixed(1)},${prev.y.toFixed(1)} ${(curr.x - cx).toFixed(1)},${curr.y.toFixed(1)} ${curr.x.toFixed(1)},${curr.y.toFixed(1)}`;
    }
    return d;
  }

  const lineD = smoothPath(pts);
  const last = pts[pts.length - 1];
  const areaD = lineD + ` L${last.x.toFixed(1)},${(PT + cH).toFixed(1)} L${PL},${(PT + cH).toFixed(1)} Z`;

  // Grid Linien & Y-Beschriftungen
  const ySteps = 3;
  const grid = Array.from({ length: ySteps + 1 }, (_, i) => {
    const w = yMin + (range / ySteps) * i, y = toY(w);
    return `<line x1="${PL}" y1="${y.toFixed(1)}" x2="${W - PR}" y2="${y.toFixed(1)}" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>
      <text x="${PL - 5}" y="${(y + 3).toFixed(1)}" fill="rgba(255,255,255,0.28)" font-size="8.5" text-anchor="end">${w.toFixed(1)}</text>`;
  }).join('');

  // X-Achsen Beschriftung (Anfang, Mitte, Ende des Zeitraums)
  const xIdxs = [0, Math.floor((display.length - 1) / 2), display.length - 1].filter((v, i, a) => a.indexOf(v) === i);
  const xLabels = xIdxs.map(i => `<text x="${toX(i).toFixed(1)}" y="${H - 5}" fill="rgba(255,255,255,0.28)" font-size="8.5" text-anchor="middle">${fmtDateShort(display[i].logged_at)}</text>`).join('');

  // Kreise für die Datenpunkte (nur einzeichnen, wenn nicht zu viele Punkte)
  const showDots = display.length <= 30;
  const dots = showDots ? pts.slice(0, -1).map(p => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" fill="var(--stat-accent)" stroke="var(--bg2)" stroke-width="1.5"><title>${p.w} kg · ${fmtDate(p.d)}</title></circle>`).join('') : '';

  // Trend-Vergleich zum vorletzten Wert
  const trend = logs.length >= 2 ? (logs[logs.length - 1].weight_kg - logs[logs.length - 2].weight_kg) : 0;
  const tSign = trend > 0 ? '+' : '';
  const tColor = trend > 0 ? '#f87171' : '#34d399';

  return `<div class="weight-chart-wrap">
    <svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet" style="display:block;overflow:visible;font-family:inherit">
      <defs>
        <linearGradient id="wGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stop-color="#5b8fff" stop-opacity="0.32"/>
          <stop offset="65%"  stop-color="#5b8fff" stop-opacity="0.06"/>
          <stop offset="100%" stop-color="#5b8fff" stop-opacity="0"/>
        </linearGradient>
        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.5" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <clipPath id="cClip"><rect x="${PL}" y="${PT}" width="${cW}" height="${cH}"/></clipPath>
      </defs>
      ${grid}
      <path d="${areaD}" fill="url(#wGrad)" clip-path="url(#cClip)"/>
      <path d="${lineD}" fill="none" stroke="var(--stat-accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" clip-path="url(#cClip)" filter="url(#glow)"/>
      ${dots}
      <circle cx="${last.x.toFixed(1)}" cy="${last.y.toFixed(1)}" r="5.5" fill="var(--stat-accent)" stroke="var(--bg)" stroke-width="2" filter="url(#glow)"/>
      <text x="${last.x.toFixed(1)}" y="${(last.y - 12).toFixed(1)}" fill="var(--stat-accent)" font-size="11" font-weight="700" text-anchor="middle">${last.w}</text>
      ${trend !== 0 ? `<text x="${last.x.toFixed(1)}" y="${(last.y - 24).toFixed(1)}" fill="${tColor}" font-size="9" font-weight="600" text-anchor="middle">${tSign}${trend.toFixed(1)}</text>` : ''}
      ${xLabels}
    </svg>
  </div>`;
}

// Speichert einen neuen Gewichtseintrag
function saveWeight() {
  const kg = parseFloat(document.getElementById('weightInput')?.value);
  if (!kg || kg < 20 || kg > 400) {
    toast('❌ Bitte gültiges Gewicht eingeben (20–400 kg)');
    return;
  }
  const today = new Date().toISOString().slice(0, 10);
  const note = document.getElementById('weightNote')?.value || '';
  const logs = S.get('weight_logs', []);
  const idx = logs.findIndex(l => l.logged_at === today);
  const entry = { logged_at: today, weight_kg: kg, note };

  if (idx >= 0) logs[idx] = entry; else logs.push(entry);
  logs.sort((a, b) => a.logged_at.localeCompare(b.logged_at));
  S.set('weight_logs', logs);

  if (currentUser) {
    queueSync('weight_logs', {
      id: `${currentUser.id}_${today}`,
      user_id: currentUser.id,
      logged_at: today,
      weight_kg: kg,
      note,
      updated_at: new Date().toISOString()
    });
    processQueue();
  }

  const inp = document.getElementById('weightInput');
  if (inp) inp.value = '';
  const noteInp = document.getElementById('weightNote');
  if (noteInp) noteInp.value = '';

  toast('✓ Gewicht gespeichert!');
  renderBodyPage();
}

// Rendert die Benutzeroberfläche für Gewicht, BMI und Verlauf
function renderBodyPage() {
  const logs = S.get('weight_logs', []);
  const latest = logs[logs.length - 1], prev2 = logs[logs.length - 2];
  const curW = latest?.weight_kg || userProfile?.weight || null;

  // BMI-Widget berechnen
  let bmiHTML = '';
  if (curW && userProfile?.height) {
    const h = parseFloat(userProfile.height) / 100;
    const bmi = (curW / (h * h));
    let lbl = '', col = 'var(--muted2)';
    if (bmi < 18.5) { lbl = 'Untergewicht'; col = 'var(--pr-tag-color)'; }
    else if (bmi < 25) { lbl = 'Normalgewicht'; col = 'var(--success-color)'; }
    else if (bmi < 30) { lbl = 'Übergewicht'; col = 'var(--pr-tag-color)'; }
    else { lbl = 'Adipositas'; col = 'var(--danger)'; }
    bmiHTML = `<div class="widget"><div class="widget-label">📊 BMI</div><div class="widget-val" style="color:${col}">${bmi.toFixed(1)}</div><div class="widget-unit" style="color:${col}">${lbl}</div></div>`;
  }

  // Trend berechnen
  let trendHTML = '';
  if (latest && prev2) {
    const d = (latest.weight_kg - prev2.weight_kg);
    const sign = d > 0 ? '+' : '';
    const col = d > 0 ? 'var(--danger)' : 'var(--success-color)';
    trendHTML = `<div style="font-size:11px;color:${col};font-weight:600;margin-top:4px">${sign}${d.toFixed(1)} kg seit ${fmtDate(prev2.logged_at)}</div>`;
  }

  const statsHTML = curW ? `<div class="widget-grid">
    <div class="widget"><div class="widget-label">⚖️ Aktuell</div>
      <div class="widget-val">${curW}<span style="font-size:14px;font-weight:500;color:var(--muted2)"> kg</span></div>
      ${trendHTML}<div class="widget-unit" style="margin-top:2px">${logs.length} Einträge gesamt</div>
    </div>
    ${bmiHTML}
  </div>` : '';

  const formHTML = `<div class="slabel">Gewicht eintragen</div>
    <div class="card">
      <div style="display:flex;gap:8px;margin-bottom:10px;align-items:center">
        <input id="weightInput" type="number" step="0.1" inputmode="decimal" placeholder="75.5"
          style="flex:2;background:var(--bg4);border:1px solid var(--border2);border-radius:10px;color:var(--text);font-size:22px;font-weight:700;padding:12px;outline:none;text-align:center;transition:border-color .15s;-webkit-appearance:none"
          onfocus="this.style.borderColor='var(--input-focus)';this.select()" onblur="this.style.borderColor=''"
          onkeydown="if(event.key==='Enter')saveWeight()">
        <span style="color:var(--muted2);font-size:16px;flex-shrink:0">kg</span>
        <button onclick="saveWeight()" style="flex:1;background:linear-gradient(135deg,var(--auth-accent),var(--auth-accent-2));border:none;border-radius:10px;color:#fff;font-size:14px;font-weight:600;padding:14px 8px;cursor:pointer">Speichern</button>
      </div>
      <input id="weightNote" type="text" placeholder="Notiz (optional, z.B. nach dem Aufstehen)" class="auth-input" style="margin-bottom:0">
    </div>`;

  const chartHTML = `<div class="slabel">Gewichtsverlauf</div>
    <div class="card" style="padding:16px 8px 12px">${buildWeightChart(logs)}</div>`;

  const recent = [...logs].reverse().slice(0, 10);
  const entriesHTML = recent.length > 0 ? `<div class="slabel">Letzte Einträge</div><div class="card">
    ${recent.map((e, i) => {
    const prevE = logs[logs.length - 2 - i];
    const diff = prevE != null ? (e.weight_kg - prevE.weight_kg) : null;
    const dStr = diff != null ? (diff > 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1)) : null;
    const dCol = diff > 0 ? 'var(--danger)' : diff < 0 ? 'var(--success-color)' : 'var(--muted)';
    return `<div class="prev-row">
        <span class="prev-key">${fmtDate(e.logged_at)}</span>
        <span class="prev-val" style="display:flex;align-items:center;gap:10px">
          <strong>${e.weight_kg} kg</strong>
          ${dStr != null ? `<span style="font-size:10px;color:${dCol};font-weight:600">${dStr}</span>` : ''}
          ${e.note ? `<span style="font-size:10px;color:var(--muted);font-style:italic">${e.note}</span>` : ''}
        </span>
      </div>`;
  }).join('')}
  </div>` : '';

  document.getElementById('body').innerHTML = `
    <h1 style="font-size:18px;font-weight:700;margin-bottom:16px">⚖️ Körper & Gewicht</h1>
    ${statsHTML}${formHTML}${chartHTML}${entriesHTML}`;
}

/* ==========================================================================
   SEITE: STATISTIKEN (Gesamtzusammenfassung & PRs)
   ========================================================================== */
function renderStats() {
  let totalSessions = 0, totalKm = 0, totalMin = 0, bestPace = null, bestDist = 0;
  const weeklyData = [], prMap = {};

  for (let w = 0; w >= -16; w--) {
    const wk = getWeekKey(w);
    let ws = 0;

    PLAN.forEach((_, i) => {
      if (S.get(doneKey(i, wk), false)) {
        totalSessions++;
        ws++;
      }
    });
    weeklyData.push(ws);

    // Laufsessions (Di=Index 1, Fr=Index 4) herausfiltern
    [1, 4].forEach(i => {
      const d = S.get(wkKey(i, wk), {});
      if (d.run?.dist) {
        const km = parseFloat(d.run.dist) || 0;
        const min = parseFloat(d.run.time) || 0;
        totalKm += km;
        totalMin += min;
        if (km > bestDist) bestDist = km;
        const p = calcPace(km, min);
        if (p && (!bestPace || p.decimal < bestPace.decimal)) bestPace = p;
      }
    });

    // Gym-Bestleistungen (PRs) herausfiltern
    PLAN.filter(d => !d.run && !d.mobility).forEach(day => {
      const ri = PLAN.indexOf(day);
      const sv = S.get(wkKey(ri, wk), {});
      day.exercises?.forEach((ex, j) => {
        const kg = parseFloat(sv[j]?.kg);
        if (kg && (!prMap[ex.name] || kg > prMap[ex.name])) prMap[ex.name] = kg;
      });
    });
  }

  const last8 = weeklyData.reverse().slice(-8), maxW = Math.max(...last8, 1);
  const wkLabels = ['W-7', 'W-6', 'W-5', 'W-4', 'W-3', 'W-2', 'VW', 'DW'];

  // HTML-Balkendiagramm generieren
  const barChart = last8.map((n, i) => `<div class="bar-col"><div class="bar-inner${n > 0 ? ' filled' : ''}" style="height:${Math.round(n / maxW * 60) + 8}px"></div><div class="bar-lbl">${wkLabels[i] || ''}</div></div>`).join('');
  const prEntries = Object.entries(prMap).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const maxKg = prEntries[0]?.[1] || 100;
  const avgPace = calcPace(totalKm, totalMin);

  document.getElementById('stats').innerHTML = `
    <div class="slabel">Gesamt</div>
    <div class="stats-big-grid">
      <div class="stat-big"><div class="stat-big-n" style="color:var(--stat-accent)">${totalSessions}</div><div class="stat-big-l">Einheiten</div><div class="stat-big-sub">letzte 16 Wochen</div></div>
      <div class="stat-big"><div class="stat-big-n" style="color:var(--cat-run-color)">${totalKm.toFixed(1)}</div><div class="stat-big-l">km gelaufen</div><div class="stat-big-sub">${bestDist ? 'Best: ' + bestDist.toFixed(1) + ' km' : ''}</div></div>
      <div class="stat-big"><div class="stat-big-n" style="color:var(--cat-mob-color)">${bestPace ? bestPace.str : '—'}</div><div class="stat-big-l">Beste Pace</div><div class="stat-big-sub">${avgPace ? 'Ø ' + avgPace.str + ' /km' : ''}</div></div>
      <div class="stat-big"><div class="stat-big-n" style="color:var(--cat-lower-color)">${totalMin > 0 ? (totalMin / 60).toFixed(1) : '—'}</div><div class="stat-big-l">Laufstunden</div><div class="stat-big-sub">${totalKm > 0 ? '~' + Math.round(totalKm * 70) + ' kcal' : ''}</div></div>
    </div>
    <div class="slabel">Wochenaktivität</div>
    <div class="card"><div class="chart-bars">${barChart}</div></div>
    <div class="slabel">Persönliche Bestleistungen</div>
    <div class="card">${prEntries.length ? prEntries.map(([name, kg]) => `<div class="pr-item"><div class="pr-name">${name}</div><div class="pr-bar-wrap"><div class="mini-bar"><div class="mini-fill" style="width:${Math.round(kg / maxKg * 100)}%"></div></div></div><div class="pr-val">${kg} kg</div></div>`).join('') : '<div class="empty">Noch keine Gewichte eingetragen</div>'}</div>`;
}

/* ==========================================================================
   SEITE: VERLAUF (Liste aller vergangenen Workouts)
   ========================================================================== */
function renderLog() {
  let entries = [];
  for (let w = 0; w >= -16; w--) {
    const wk = getWeekKey(w);
    PLAN.forEach((day, i) => {
      if (S.get(doneKey(i, wk), false)) entries.push({ wk, w, day, i, saved: S.get(wkKey(i, wk), {}) });
    });
  }
  entries.reverse();

  if (!entries.length) {
    document.getElementById('log').innerHTML = '<div class="empty" style="margin-top:60px">📋<br><br>Noch keine abgeschlossenen Einheiten</div>';
    return;
  }

  document.getElementById('log').innerHTML = `<div class="slabel">Alle Einheiten</div>` + entries.map(e => {
    const d = e.day, sv = e.saved;
    let rows = '';

    if (d.run && sv.run) {
      const r = sv.run, p = calcPace(parseFloat(r.dist), parseFloat(r.time));
      rows = [
        r.dist ? `<div class="log-row"><span class="log-key">Distanz</span><span class="log-val">${r.dist} km</span></div>` : '',
        r.time ? `<div class="log-row"><span class="log-key">Zeit</span><span class="log-val">${r.time} Min</span></div>` : '',
        p ? `<div class="log-row"><span class="log-key">Pace</span><span class="log-val">${p.str} min/km</span></div>` : '',
        r.hr ? `<div class="log-row"><span class="log-key">HF Ø</span><span class="log-val">${r.hr} bpm</span></div>` : '',
        r.feel ? `<div class="log-row"><span class="log-key">Gefühl</span><span class="log-val">${['😫', '😔', '😐', '😊', '🔥'][r.feel - 1]}</span></div>` : '',
        r.notes ? `<div class="log-row" style="flex-direction:column;align-items:flex-start;gap:3px"><span class="log-key">Notizen</span><span style="font-size:12px;color:var(--muted2);margin-top:2px">${r.notes}</span></div>` : ''
      ].join('');
    } else if (d.exercises) {
      rows = d.exercises.map((ex, j) => {
        const s = sv[j];
        if (!s || (!s.kg && !s.reps)) return '';
        return `<div class="log-row"><span class="log-key">${ex.name}</span><span class="log-val">${s.kg ? s.kg + ' kg' : ''} ${s.reps ? '×' + s.reps : ''} ${s.sets ? '(' + s.sets + 'S)' : ''}</span></div>`;
      }).join('');
    } else if (d.mobility) {
      const mc = S.get(wkKey(e.i, e.wk) + '_mob', {}), c = Object.keys(mc).length;
      if (c) rows = `<div class="log-row"><span class="log-key">Erledigt</span><span class="log-val">${c}/${d.mobility.length}</span></div>`;
    }

    const wLabel = e.w === 0 ? 'Diese Woche' : e.w === -1 ? 'Letzte Woche' : `Vor ${-e.w} Wochen`;
    return `<div class="log-entry"><div class="log-date"><span class="log-when">${d.label} – ${d.type}</span><span class="badge b-${d.badge}">${wLabel}</span></div>${rows || '<div style="color:var(--muted);font-size:12px">Keine Details</div>'}</div>`;
  }).join('');
}

/* ==========================================================================
   SEITE: WORKOUT-PLAN (Phaseneinteilung & Übersicht über alle Trainingstage)
   ========================================================================== */
function renderPlanPage() {
  const phase = getPhase();
  const phases = [
    { n: 'Woche 1–2', title: 'Einstieg & Fundament', col: 'var(--stat-accent)', pts: ['Gewichte moderat – Technik vor Last', 'Laufdistanz bei 5–6 km halten', 'Mobility (So) nicht überspringen', 'Körper ans kombinierte Training gewöhnen'] },
    { n: 'Woche 3–4', title: 'Aufbau', col: 'var(--cat-run-color)', pts: ['Gewichte um 5–10% erhöhen', 'Laufdistanz (Di) auf 7 km erhöhen', 'Intervalle (Fr) auf 8×2 Min erhöhen', 'Optional: 5. Einheit als Zusatzlaufen'] },
    { n: 'Woche 5', title: 'Deload & Test', col: 'var(--cat-mob-color)', pts: ['Volumen um 30–40% reduzieren', 'Gewichte gleich lassen', '5km-Zeit zum Vergleich testen', 'Körper erholen & Fortschritte festigen'] }
  ];

  document.getElementById('plan').innerHTML = `
    <div class="phase-banner"><span class="phase-icon">📍</span><div><div class="phase-text">Aktuell: ${phase.n}</div><div class="phase-sub">${phase.desc}</div></div></div>
    <div class="slabel">Phasen</div>
    ${phases.map(p => `<div class="card"><div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
      <span style="font-size:11px;font-weight:700;color:${p.col};background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);padding:3px 10px;border-radius:20px">${p.n}</span>
      <span style="font-size:14px;font-weight:600">${p.title}</span></div>
      ${p.pts.map(pt => `<div style="display:flex;gap:8px;padding:5px 0;font-size:13px;color:var(--muted2)"><span style="color:${p.col};font-weight:700;flex-shrink:0">→</span>${pt}</div>`).join('')}
    </div>`).join('')}
    <div class="slabel" style="margin-top:16px">Alle Trainingstage</div>
    ${PLAN.map((day, i) => `<div class="card" style="cursor:pointer" onclick="selectedDayIdx=${i};showPage('today')">
      <div class="card-header">
        <div class="card-title"><span>${day.icon}</span><span>${day.label} – ${day.type}</span><span class="badge b-${day.badge}">${{ upper: 'OK', lower: 'UK', run: 'Lauf', mob: 'Mob', gzk: 'Zirkel' }[day.badge]}</span></div>
        <span style="font-size:11px;color:var(--input-focus)">öffnen →</span>
      </div>
      <div style="font-size:11px;color:var(--muted2);margin-bottom:${(day.exercises || day.mobility) ? '10px' : '0'}">${day.sub}</div>
      ${day.exercises ? `<div>${day.exercises.map(ex => `<div style="display:flex;justify-content:space-between;font-size:12px;padding:4px 0;border-bottom:1px solid var(--border)"><span style="color:var(--muted2)">${ex.name}</span><span style="font-weight:500">${ex.target}</span></div>`).join('')}</div>` : ''}
      ${day.mobility ? `<div>${day.mobility.map(m => `<div style="display:flex;justify-content:space-between;font-size:12px;padding:4px 0;border-bottom:1px solid var(--border)"><span style="color:var(--muted2)">${m.name}</span><span style="font-weight:500">${m.meta}</span></div>`).join('')}</div>` : ''}
      ${day.run ? `<div style="font-size:12px;color:var(--muted2)">${day.interval ? '6–8× 2 Min schnell / 2 Min locker · 80–85% HF' : '5–7 km ruhig @ 65–70% Herzfrequenz'}</div>` : ''}
    </div>`).join('')}`;
}

/* ==========================================================================
   SEITE: EINSTELLUNGEN (Profilübersicht, Export/Import, Reset)
   ========================================================================== */
function renderSettings() {
  const phase = getPhase(), st = S.get('start_ts', null);
  const start = st ? new Date(st).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'Nicht gesetzt';
  const stats = calcUserStats(userProfile), pending = S.get(SYNC_Q, []).length;

  const profHTML = userProfile ? `<div class="slabel">Profil</div><div class="card">
    <div class="settings-row">
      <div><div class="settings-label">${userProfile.username} ${userProfile.tag || ''}</div><div class="settings-sub">${currentUser?.email}</div></div>
      <div style="width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,var(--avatar-grad-1),var(--avatar-grad-2));display:flex;align-items:center;justify-content:center;font-weight:700;color:#fff;font-size:14px">${(userProfile.username || '?').charAt(0).toUpperCase()}</div>
    </div>
    <div class="settings-row"><div><div class="settings-label">Körperdaten</div><div class="settings-sub">${userProfile.height} cm · ${userProfile.weight} kg${userProfile.age ? ' · ' + userProfile.age + ' Jahre' : ''}</div></div></div>
    ${stats ? `<div class="settings-row"><div><div class="settings-label">Empfehlungen</div><div class="settings-sub">${stats.calories} kcal · ${stats.protein}g Protein · ${stats.water}L Wasser · ${stats.steps.toLocaleString('de')} Schritte</div></div></div>` : ''}
  </div>` : '';

  document.getElementById('settings').innerHTML = `
    ${profHTML}
    <div class="slabel">Sync & Verbindung</div>
    <div class="card">
      <div class="settings-row">
        <div><div class="settings-label">Verbindung</div>
          <div class="settings-sub">${navigator.onLine ? '🟢 Online' : '🔴 Offline'} · ${pending > 0 ? pending + ' ausstehend' : 'Alles synchronisiert'}</div>
        </div>
        <button class="settings-btn" onclick="processQueue().then(()=>renderSettings())">Jetzt sync</button>
      </div>
    </div>
    <div class="slabel">Programm</div>
    <div class="card">
      <div class="settings-row">
        <div><div class="settings-label">Startdatum</div><div class="settings-sub">${start}</div></div>
        <button class="settings-btn" onclick="if(confirm('Startdatum auf heute zurücksetzen?')){S.set('start_ts',Date.now());renderSettings();toast('Startdatum gesetzt')}">Zurücksetzen</button>
      </div>
      <div class="settings-row"><div><div class="settings-label">Aktuelle Phase</div><div class="settings-sub">${phase.n}: ${phase.desc}</div></div></div>
    </div>
    <div class="slabel">Daten</div>
    <div class="card">
      <div class="settings-row"><div><div class="settings-label">Exportieren</div><div class="settings-sub">Lokale Daten als JSON sichern</div></div><button class="settings-btn" onclick="exportData()">📥 Export</button></div>
      <div class="settings-row"><div><div class="settings-label">Importieren</div><div class="settings-sub">Backup wiederherstellen</div></div><button class="settings-btn" onclick="document.getElementById('importFile').click()">📤 Import</button></div>
      <div class="settings-row"><div><div class="settings-label">Lokale Daten löschen</div><div class="settings-sub">Workout-Einträge entfernen</div></div><button class="danger-btn" onclick="if(confirm('Alle lokalen Workout-Daten löschen?')){localStorage.clear();toast('Lokale Daten gelöscht');renderToday()}">Löschen</button></div>
    </div>
    <div class="slabel">Account</div>
    <div class="card">
      <div class="settings-row"><div><div class="settings-label">Ausloggen</div><div class="settings-sub">Kehrt zum Login zurück</div></div><button class="danger-btn" onclick="handleLogout()">Logout</button></div>
    </div>`;
}

/* ==========================================================================
   DATEN EXPORT & IMPORT (Backupverwaltung im JSON-Format)
   ========================================================================== */
// Exportiert alle Einträge im LocalStorage als JSON-Download
function exportData() {
  const data = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    try {
      data[k] = JSON.parse(localStorage.getItem(k));
    } catch (e) {
      data[k] = localStorage.getItem(k);
    }
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fitness_backup_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('✓ Daten exportiert!');
}

// Importiert Daten aus einer ausgewählten JSON-Backup-Datei
function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const data = JSON.parse(e.target.result);
      Object.keys(data).forEach(k => localStorage.setItem(k, typeof data[k] === 'object' ? JSON.stringify(data[k]) : data[k]));
      toast('✓ Daten erfolgreich importiert!');
      setTimeout(() => location.reload(), 1000);
    } catch (err) {
      toast('❌ Fehler beim Parsen der Datei');
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

/* ==========================================================================
   INITIALISIERUNG BEIM APP-START
   ========================================================================== */
checkSession();