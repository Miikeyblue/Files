

function generateTeamNames(count, mode="spicy", spice="spicy"){
  // "Spicy" / "Nuclear" are cheeky rude (no slurs, no hate, no protected-class punching).
  // Keep it in the “pub banter” lane.
  const pools = {
    clean: {
      adj: ["Mighty","Legendary","Sneaky","Cosmic","Electric","Golden","Rad","Brilliant","Glorious","Sparkly","Wild","Swift","Funky","Rowdy","Heroic","Lucky"],
      noun:["Penguins","Wizards","Tacos","Dragons","Ninjas","Dolphins","Rockets","Unicorns","Badgers","Otters","Pirates","Vikings","Robots","Pandas","Squirrels","Capybaras"]
    },
    mild: {
      adj: ["Chaotic","Unhinged","Questionable","Petty","Sassy","Dodgy","Noisy","Messy","Shameless","Unhelpful","Suspicious","Greasy","Wonky","Loud","Feral","Spiteful"],
      noun:["Muppets","Gremlins","Wombles","Hooligans","Menaces","Problem Children","Chaos Merchants","Keyboard Warriors","Bin Raccoons","Disaster Artists","Clowns","Nincompoops","Absolute Units","Bad Ideas"]
    },
    spicy: {
      adj: ["Ferocious","Mildly Toxic","Absolute","Ruthless","Shady","Filthy","Grimy","Unstable","Unfiltered","Chaotic","Unholy","Brazen","Vile","Nasty","Rabid","Savage"],
      noun:["Gobshites","Bellends","Toe-Rags","Wrong 'Uns","Bin Goblins","Trash Pandas","Grease Wizards","Shitshows","Chaos Gremlins","Menaces","Bad Decisions","Nightmares","Rancid Legends","Clown Car Crew","Wallopers"]
    },
    nuclear: {
      adj: ["Weaponised","Irredeemable","Ferally Unhinged","Profoundly Dodgy","Utterly Rancid","Unreasonably Aggro","Certified Awful","Catastrophically Messy","Absolute Filth","Deeply Unwell","Questionably Legal","Chronically Chaotic","Terminally Petty","Violently Average","Morally Bankrupt","Gloriously Toxic"],
      noun:["Shitbags","Wankers","Absolute Monsters","Gremlin Bastards","Bin Juice Enjoyers","Chaos Criminals","Doom Clowns","Rage Goblins","Trashfire Royalty","Bad Vibes Committee","Disaster Merchants","Menace Syndicate","Problem Factory","Arseholes Anonymous","Villain Support Group"]
    }
  };

  let key = "spicy";
  if (mode === "clean") key = "clean";
  else key = pools[spice] ? spice : "spicy";

  const A = pools[key].adj;
  const N = pools[key].noun;

  const out = new Set();
  let guard = 0;
  while (out.size < count && guard < 200) {
    guard++;
    const a = A[Math.floor(Math.random()*A.length)];
    const n = N[Math.floor(Math.random()*N.length)];
    const templates = [
      `The ${a} ${n}`,
      `${a} ${n}`,
      `Team ${a} ${n}`,
      `The ${n} of ${a}`
    ];
    const name = templates[Math.floor(Math.random()*templates.length)];
    out.add(name);
  }
  return [...out].slice(0, count);
}

function parseTeamsInput(){
  return $("teamsInput").value.split(",").map(s=>s.trim()).filter(Boolean);
}


function baseJoinUrlFor(code){
  try{
    const u = new URL(window.location.href);
    u.searchParams.set("room", code);
    // drop any hash
    u.hash = "";
    return u.toString();
  }catch{
    return window.location.origin + window.location.pathname + "?room=" + code;
  }
}

function updateJoinQr(){
  const el = document.getElementById("qrJoin");
  if (!el) return;
  if (!state.roomCode) { el.innerHTML = ""; return; }

  const url = baseJoinUrlFor(state.roomCode);

  // Clear previous
  el.innerHTML = "";
  try{
    // Uses global QRCode from qrcode library
    QRCode.toCanvas(url, { width: 80, margin: 1 }, (err, canvas) => {
      if (!err && canvas) el.appendChild(canvas);
      else el.textContent = "QR";
    });
  }catch{
    el.textContent = "QR";
  }
}
// Beat The Intro — Multiplayer (Supabase Realtime)
// Full tracks supported: host plays only a clip, can increase clip, or play full track.
// Requires config.js with SUPABASE_URL and SUPABASE_ANON_KEY
// Data: songs.json + rounds.json
//
// Table: public.bti_rooms (see SUPABASE_SETUP.txt)

const $ = (id) => document.getElementById(id);

function isConfigured() {
  const ok =
    window.SUPABASE_URL &&
    window.SUPABASE_ANON_KEY &&
    !String(window.SUPABASE_URL).includes("PASTE_") &&
    !String(window.SUPABASE_ANON_KEY).includes("PASTE_");
  if (!ok) {
    alert(
      "Supabase not configured. Paste SUPABASE_URL and SUPABASE_ANON_KEY into config.js (see SUPABASE_SETUP.txt)."
    );
  }
  return ok;
}

const supabaseClient = isConfigured() ? window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY)
  : null;

const state = {
  tracks: [],
  rounds: [],

  // host setup defaults
  baseClipSeconds: 3,
  stepSeconds: 2,
  maxClipSeconds: 10,
  penaltyMode: "off",
  scoringMode: "any",
  questionCount: 20,

  // realtime
  roomCode: null,
  roomState: null,
  channel: null,

  // player identity
  playerId: null,
  playerName: null,
  playerTeam: null,

  // audio (host only)
  audio: new Audio(),
  timer: null,
};

// ===== SFX (in-browser) =====
let audioCtx;
function ensureCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}
function beep(f = 880, ms = 120, type = "sine", gain = 0.04) {
  const ctx = ensureCtx();
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = f;
  g.gain.value = gain;
  o.connect(g);
  g.connect(ctx.destination);
  o.start();
  setTimeout(() => {
    try { o.stop(); } catch {}
  }, ms);
}
const sfxCorrect = () => { beep(880, 110); setTimeout(() => beep(1320, 140), 120); };
const sfxWrong = () => beep(220, 220, "square", 0.05);
const sfxCountdown = () => { beep(880, 80); setTimeout(() => beep(880, 80), 250); setTimeout(() => beep(880, 80), 500); };
const sfxTime = () => { beep(196, 260, "sawtooth", 0.04); setTimeout(() => beep(196, 260, "sawtooth", 0.04), 280); };

// ===== Helpers =====
function show(el) { el.classList.remove("hidden"); }
function hide(el) { el.classList.add("hidden"); }
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function setSegmentActive(containerId, value, attr) {
  const wrap = $(containerId);
  if (!wrap) return;
  [...wrap.querySelectorAll("button")].forEach((b) => {
    b.classList.toggle("active", b.dataset[attr] === value);
  });
}
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (m) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m])
  );
}
function randCode(len = 5) {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}
function getLocalId() {
  const k = "bti_player_id";
  let v = localStorage.getItem(k);
  if (!v) {
    try {
      const b = new Uint8Array(16);
      crypto.getRandomValues(b);
      v = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
    } catch {
      v = String(Date.now()) + "_" + Math.random().toString(16).slice(2);
    }
    localStorage.setItem(k, v);
  }
  return v;
}
function clearTimer() {
  if (state.timer) {
    clearInterval(state.timer);
    state.timer = null;
  }
}
function startBar(barEl, startAtMs, seconds) {
  clearTimer();
  const durMs = seconds * 1000;
  state.timer = setInterval(() => {
    const t = Date.now() - startAtMs;
    const pct = Math.min(100, (t / durMs) * 100);
    barEl.style.width = pct + "%";
    if (t >= durMs) clearTimer();
  }, 50);
}
function stopAudio() {
  try { state.audio.pause(); } catch {}
}

// ===== DOM refs =====
const landingCard = $("landingCard");
const hostSetupCard = $("hostSetupCard");
const joinCard = $("joinCard");
const hostGameCard = $("hostGameCard");
const playerCard = $("playerCard");
const winnerCard = $("winnerCard");

const teamsInput = $("teamsInput");
const roundSelect = $("roundSelect");
const roomCodeInput = $("roomCodeInput");
const playerNameInput = $("playerNameInput");
const teamSelect = $("teamSelect");

const roomPill = $("roomPill");
const clipPill = $("clipPill");
const packName = $("packName");
const trackCounter = $("trackCounter");
const nowPlaying = $("nowPlaying");
const prompt = $("prompt");

const answerBox = $("answerBox");
const ansArtist = $("ansArtist");
const ansSong = $("ansSong");
const badgeDecade = $("badgeDecade");
const badgeCat = $("badgeCat");
const bar = $("bar");

const buzzStatus = $("buzzStatus");
const teamsWrap = $("teams");

const btnPlay = $("btnPlay");
const btnMoreTime = $("btnMoreTime");
const btnFull = $("btnFull");
const btnStop = $("btnStop");
const btnReveal = $("btnReveal");
const btnNext = $("btnNext");
const btnClearBuzz = $("btnClearBuzz");
const btnAwardBuzz = $("btnAwardBuzz");
const btnCopyJoin = $("btnCopyJoin");
const btnReset = $("btnReset");
const btnEnd = $("btnEnd");

const playerRoomTitle = $("playerRoomTitle");
const playerTrackCounter = $("playerTrackCounter");
const playerNowPlaying = $("playerNowPlaying");
const playerPrompt = $("playerPrompt");
const btnBuzz = $("btnBuzz");
const playerBuzzHint = $("playerBuzzHint");
const playerAnswerBox = $("playerAnswerBox");
const pAnsArtist = $("pAnsArtist");
const pAnsSong = $("pAnsSong");
const playerBar = $("playerBar");
const playerTeams = $("playerTeams");

const winnerName = $("winnerName");
const winnerScores = $("winnerScores");

// ===== Data load =====
async function loadData() {
  const [songsRes, roundsRes] = await Promise.all([fetch("songs.json"), fetch("rounds.json")]);
  const songsJson = await songsRes.json();
  const roundsJson = await roundsRes.json();
  state.tracks = songsJson.tracks || [];
  state.rounds = roundsJson.rounds || [];
  populateRoundSelect();
}
function populateRoundSelect() {
  roundSelect.innerHTML = "";
  state.rounds.forEach((r) => {
    const opt = document.createElement("option");
    opt.value = r.id;
    opt.textContent = r.name;
    roundSelect.appendChild(opt);
  });
  const mixed = state.rounds.find((r) => r.id === "mixed");
  if (mixed) roundSelect.value = "mixed";
}
function trackById(id) { return state.tracks.find((t) => t.id === id); }

function buildPackQueue(pack) {
  const byRoundName = (roundName) => state.tracks.filter((t) => t.round === roundName);

  let list = [];
  if (pack.sequence && Array.isArray(pack.sequence)) {
    const per = Math.max(1, Math.floor(state.questionCount / pack.sequence.length));
    pack.sequence.forEach((rn) => {
      list = list.concat(shuffle(byRoundName(rn)).slice(0, per));
    });
    if (list.length < state.questionCount) {
      const remaining = state.tracks.filter((t) => !list.some((x) => x.id === t.id));
      list = list.concat(shuffle(remaining).slice(0, state.questionCount - list.length));
    }
    list = list.slice(0, state.questionCount);
  } else {
    if (pack.filter?.round === "*" || !pack.filter) {
      list = shuffle(state.tracks).slice(0, state.questionCount);
    } else {
      list = shuffle(state.tracks.filter((t) => t.round === pack.filter.round)).slice(0, state.questionCount);
    }
  }
  return list.map((t) => t.id);
}

// ===== Room state =====
function defaultRoomState({ teams, packId, baseClipSeconds, stepSeconds, maxClipSeconds, penaltyMode, scoringMode, questionCount, queue }) {
  return {
    v: 2,
    packId,
    baseClipSeconds,
    stepSeconds,
    maxClipSeconds,
    penaltyMode,
    scoringMode,
    questionCount,
    teams,
    scores: Object.fromEntries(teams.map((t) => [t, 0])),
    players: {},
    queue,
    used: [],
    currentId: null,
    revealed: false,
    buzzLocked: false,
    // playback
    playing: false,
    playStartAt: null,
    playDuration: null,    // seconds actually playing
    playMode: "clip",      // clip | full
    clipSeconds: baseClipSeconds,
    hintCount: 0,
    // buzz
    buzz: null, // {playerId, name, team, at}
    phase: "setup" // setup | question | reveal | end
  };
}

// ===== Supabase helpers =====
function cleanupRealtime() {
  if (state.channel) {
    try { supabaseClient.removeChannel(state.channel); } catch {}
    state.channel = null;
  }
}
async function getRoom(code) {
  const { data, error } = await supabaseClient.from("bti_rooms").select("*").eq("code", code).maybeSingle();
  if (error) throw error;
  return data;
}
async function updateRoomState(code, newState) {
  state.roomState = newState;
  const { error } = await supabaseClient.from("bti_rooms").update({ state: newState }).eq("code", code);
  if (error) alert("Update failed: " + error.message);
}
async function joinRealtime(code) {
  cleanupRealtime();
  state.channel = supabaseClient.channel("bti_room_" + code);
  state.channel.on(
    "postgres_changes",
    { event: "*", schema: "public", table: "bti_rooms", filter: `code=eq.${code}` },
    (payload) => {
      if (payload?.new?.state) {
        state.roomState = payload.new.state;
        renderFromRoomState();
      }
    }
  );
  await state.channel.subscribe();

  const room = await getRoom(code);
  if (!room) throw new Error("Room not found");
  state.roomState = room.state;
  renderFromRoomState();
}

// ===== Navigation =====
function toLanding() {
  hide(hostSetupCard); hide(joinCard); hide(hostGameCard); hide(playerCard); hide(winnerCard);
  show(landingCard);
  cleanupRealtime();
}
$("goHost").addEventListener("click", () => { hide(landingCard); show(hostSetupCard); });
$("goJoin").addEventListener("click", () => { hide(landingCard); show(joinCard); });
$("backToLanding1").addEventListener("click", toLanding);
$("backToLanding2").addEventListener("click", toLanding);
$("btnPlayAgain").addEventListener("click", toLanding);
$("btnWinnerLeave").addEventListener("click", toLanding);
$("btnLeave").addEventListener("click", toLanding);

$("btnFullscreen").addEventListener("click", async () => {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  } catch {}
});
$("btnHelp").addEventListener("click", () => show($("helpModal")));
$("btnCloseHelp").addEventListener("click", () => hide($("helpModal")));
$("helpModal").addEventListener("click", (e) => { if (e.target === $("helpModal")) hide($("helpModal")); });

// ===== Setup selectors =====
$("lengthSelector").addEventListener("click", (e) => {
  if (e.target.tagName !== "BUTTON") return;
  state.baseClipSeconds = Number(e.target.dataset.len);
  setSegmentActive("lengthSelector", String(state.baseClipSeconds), "len");
});
$("stepSelector").addEventListener("click", (e) => {
  if (e.target.tagName !== "BUTTON") return;
  state.stepSeconds = Number(e.target.dataset.step);
  setSegmentActive("stepSelector", String(state.stepSeconds), "step");
});
$("maxSelector").addEventListener("click", (e) => {
  if (e.target.tagName !== "BUTTON") return;
  state.maxClipSeconds = Number(e.target.dataset.max);
  setSegmentActive("maxSelector", String(state.maxClipSeconds), "max");
});

$("penaltySelector").addEventListener("click", (e) => {
  if (e.target.tagName !== "BUTTON") return;
  state.penaltyMode = e.target.dataset.penalty;
  setSegmentActive("penaltySelector", state.penaltyMode, "penalty");
});

$("scoringSelector").addEventListener("click", (e) => {
  if (e.target.tagName !== "BUTTON") return;
  state.scoringMode = e.target.dataset.mode;
  setSegmentActive("scoringSelector", state.scoringMode, "mode");
});
$("countSelector").addEventListener("click", (e) => {
  if (e.target.tagName !== "BUTTON") return;
  state.questionCount = Number(e.target.dataset.count);
  setSegmentActive("countSelector", String(state.questionCount), "count");
});

// ===== Host: create room =====
$("btnCreateRoom").addEventListener("click", async () => {
  if (!supabase) return;

  const teams = teamsInput.value.split(",").map((s) => s.trim()).filter(Boolean);
  const finalTeams = teams.length >= 2 ? teams : ["Team A", "Team B"];

  const packId = roundSelect.value;
  const pack = state.rounds.find((r) => r.id === packId) || state.rounds[0];
  const queue = buildPackQueue(pack);
  const code = randCode(5);

  const rs = defaultRoomState({
    teams: finalTeams,
    packId,
    baseClipSeconds: state.baseClipSeconds,
    stepSeconds: state.stepSeconds,
    maxClipSeconds: state.maxClipSeconds,
    penaltyMode: state.penaltyMode,
    scoringMode: state.scoringMode,
    questionCount: state.questionCount,
    queue
  });

let teamGenMode = "spicy";
let teamGenCount = 2;
let teamGenSpice = "spicy";

const teamCountSelector = document.getElementById("teamCountSelector");
const spiceSelector = document.getElementById("spiceSelector");

function setTeamCount(n){
  teamGenCount = n;
  setSegmentActive("teamCountSelector", String(n), "teamcount");
}
function setSpice(s){
  teamGenSpice = s;
  setSegmentActive("spiceSelector", s, "spice");
}

if (teamCountSelector) teamCountSelector.addEventListener("click", (e) => {
  if (e.target.tagName !== "BUTTON") return;
  setTeamCount(Number(e.target.dataset.teamcount || "2"));
});
if (spiceSelector) spiceSelector.addEventListener("click", (e) => {
  if (e.target.tagName !== "BUTTON") return;
  setSpice(e.target.dataset.spice || "spicy");
});

const btnGenTeams = document.getElementById("btnGenTeams");
const btnGenTeamsClean = document.getElementById("btnGenTeamsClean");
if (btnGenTeams) btnGenTeams.addEventListener("click", () => {
  const names = generateTeamNames(teamGenCount, teamGenMode, teamGenSpice);
  $("teamsInput").value = names.join(", ");
});
if (btnGenTeamsClean) btnGenTeamsClean.addEventListener("click", () => {
  teamGenMode = "clean";
  const names = generateTeamNames(teamGenCount, teamGenMode, teamGenSpice);
  $("teamsInput").value = names.join(", ");
});


  const { error } = await supabaseClient.from("bti_rooms").insert({ code, state: rs });
  if (error) {
    alert("Couldn't create room. Check SUPABASE_SETUP.txt\n\n" + error.message);
    return;
  }

  state.roomCode = code;
  state.roomState = rs;

  hide(hostSetupCard);
  show(hostGameCard);
  roomPill.textContent = "Room: " + code;
  try{ updateJoinQr(); }catch{}

  await joinRealtime(code);
  await hostAdvanceToNextTrack(); // set first track
});

// ===== Join room (player) =====
async function refreshTeamSelectFromRoom(code) {
  try {
    const room = await getRoom(code);
    const teams = room?.state?.teams || ["Team A", "Team B"];
    teamSelect.innerHTML = "";
    teams.forEach((t) => {
      const opt = document.createElement("option");
      opt.value = t;
      opt.textContent = t;
      teamSelect.appendChild(opt);
    });
  } catch {}
}
roomCodeInput.addEventListener("change", async () => {
  const code = roomCodeInput.value.trim().toUpperCase();
  if (!code) return;
  await refreshTeamSelectFromRoom(code);
});

$("btnJoinRoom").addEventListener("click", async () => {
  if (!supabase) return;

  const code = roomCodeInput.value.trim().toUpperCase();
  if (!code) { alert("Enter a room code."); return; }

  const room = await getRoom(code);
  if (!room) { alert("Room not found."); return; }

  state.roomCode = code;
  state.roomState = room.state;

  state.playerId = getLocalId();
  state.playerName = (playerNameInput.value || "").trim() || "Player";
  state.playerTeam = teamSelect.value || null;

  hide(joinCard);
  show(playerCard);

  await joinRealtime(code);
});

$("btnRefreshTeam").addEventListener("click", async () => {
  if (!state.roomCode) return;
  await refreshTeamSelectFromRoom(state.roomCode);
  state.playerTeam = teamSelect.value || state.playerTeam;
});
teamSelect.addEventListener("change", () => { state.playerTeam = teamSelect.value; });

// ===== Host actions =====
async function hostAdvanceToNextTrack() {
  const rs = state.roomState;
  if (!rs) return;

  stopAudio(); clearTimer();
  bar.style.width = "0%";

  if (!rs.queue || rs.queue.length === 0) {
    await updateRoomState(state.roomCode, { ...rs, phase: "end", playing: false, revealed: true, buzz: null });
    return;
  }

  const nextId = rs.queue[0];
  const nextQueue = rs.queue.slice(1);
  const nextUsed = [...(rs.used || []), nextId];

  const updated = {
    ...rs,
    queue: nextQueue,
    used: nextUsed,
    currentId: nextId,
    revealed: false,
    buzzLocked: false,
    playing: false,
    playStartAt: null,
    playDuration: null,
    playMode: "clip",
    clipSeconds: rs.baseClipSeconds ?? 3,
    hintCount: 0,
    buzz: null,
    phase: "question"
  };
  await updateRoomState(state.roomCode, updated);
}

async function hostReveal() {
  const rs = state.roomState;
  if (!rs) return;
  await updateRoomState(state.roomCode, { ...rs, revealed: true, phase: "reveal", playing: false, buzzLocked: true });
}

async function hostClearBuzz() {
  const rs = state.roomState;
  if (!rs) return;
  await updateRoomState(state.roomCode, { ...rs, buzz: null });
}

async function hostAwardBuzz() {
  const rs = state.roomState;
  if (!rs?.buzz) { alert("No buzz yet."); return; }
  const team = rs.buzz.team;
  if (!team || !rs.scores?.hasOwnProperty(team)) { alert("Buzz winner has no valid team."); return; }

  const base = (rs.scoringMode === "both") ? 2 : 1;
  const hints = rs.hintCount || 0;
  let delta = base;
  if ((rs.penaltyMode || "off") === "minus1") {
    delta = Math.max(0, base - hints);
  } else if ((rs.penaltyMode || "off") === "half") {
    delta = (hints > 0) ? Math.max(1, Math.floor(base / 2)) : base;
  }
  const newScores = { ...rs.scores, [team]: Math.max(0, (rs.scores[team] || 0) + delta) };
  await updateRoomState(state.roomCode, { ...rs, scores: newScores });
  sfxCorrect();
}

async function hostAddPoint(team, delta) {
  const rs = state.roomState;
  const newScores = { ...rs.scores, [team]: Math.max(0, (rs.scores[team] || 0) + delta) };
  await updateRoomState(state.roomCode, { ...rs, scores: newScores });
  if (delta > 0) sfxCorrect();
}

async function checkTrackExists(filename) {
  const url = `assets/tracks/${filename}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    clearTimeout(timeout);
    return false;
  }
}

async function hostPlay(seconds, mode) {
  const rs = state.roomState;
  if (!rs?.currentId) return;

  const ctx = ensureCtx();
  if (ctx.state === "suspended") { try { await ctx.resume(); } catch {} }

  const track = trackById(rs.currentId);
  if (!track) return;

  const exists = await checkTrackExists(track.filename);
  if (!exists) {
    alert(`Missing audio file:\nassets/tracks/${track.filename}\n\nAdd it (see song_filenames.txt) then try again.`);
    await hostAdvanceToNextTrack();
    return;
  }

  const url = `assets/tracks/${track.filename}`;
  const playStartAt = Date.now();

  // update shared playback state (players get the timer)
  await updateRoomState(state.roomCode, {
    ...rs,
    playing: true,
    playStartAt,
    playDuration: seconds,
    playMode: mode
  });

  // host plays audio
  state.audio.src = url;
  state.audio.currentTime = 0;
  try {
    await state.audio.play();
    sfxCountdown();

    startBar(bar, playStartAt, seconds);

    if (mode === "clip") {
      setTimeout(async () => {
        stopAudio();
        sfxTime();
        const latest = state.roomState;
        if (latest?.playing) await updateRoomState(state.roomCode, { ...latest, playing: false });
      }, seconds * 1000);
    } else {
      // full: stop only when track naturally ends, but still show bar as "indeterminate-ish" by filling over 30s max
      state.audio.onended = async () => {
        const latest = state.roomState;
        if (latest?.playing) await updateRoomState(state.roomCode, { ...latest, playing: false });
      };
    }
  } catch {
    alert("Audio didn't play. Try tapping again. If casting, HDMI from laptop is usually best.");
  }
}

async function hostPlayClip() {
  const rs = state.roomState;
  if (!rs) return;
  await hostPlay(rs.clipSeconds ?? rs.baseClipSeconds ?? 3, "clip");
}

async function hostMoreTime() {
  const rs = state.roomState;
  if (!rs) return;
  const step = rs.stepSeconds ?? 2;
  const max = rs.maxClipSeconds ?? 10;
  const next = Math.min(max, (rs.clipSeconds ?? rs.baseClipSeconds ?? 3) + step);

  const updated = { ...rs, clipSeconds: next, hintCount: (rs.hintCount || 0) + 1 };
  await updateRoomState(state.roomCode, updated);
  await hostPlay(next, "clip");
}

async function hostPlayFull() {
  const rs = state.roomState;
  if (!rs) return;
  // For bar timing, use maxClipSeconds as a rough fill; players just need "playing" state anyway.
  await hostPlay(rs.maxClipSeconds ?? 30, "full");
}

btnPlay.addEventListener("click", hostPlayClip);
btnMoreTime.addEventListener("click", hostMoreTime);
btnFull.addEventListener("click", hostPlayFull);
btnStop.addEventListener("click", () => { stopAudio(); });
btnReveal.addEventListener("click", hostReveal);
btnNext.addEventListener("click", hostAdvanceToNextTrack);
btnClearBuzz.addEventListener("click", hostClearBuzz);
btnAwardBuzz.addEventListener("click", hostAwardBuzz);

btnCopyJoin.addEventListener("click", async () => {
  const txt = `Join Beat The Intro\nRoom code: ${state.roomCode}\nOpen: ${location.href.replace(/#.*$/,"")}`;
  try {
    await navigator.clipboard.writeText(txt);
    alert("Copied join info to clipboard.");
  } catch {
    alert(txt);
  }
});

btnReset.addEventListener("click", () => {
  if (confirm("Hard reset? This will end the room for everyone and return to start.")) toLanding();
});

btnEnd.addEventListener("click", () => {
  hide(hostGameCard);
  show(winnerCard);
  renderWinner(state.roomState);
});

// ===== Player actions =====
async function playerBuzz() {
  const rs = state.roomState;
  if (!rs || rs.phase === "setup" || rs.phase === "end" || rs.revealed || rs.buzzLocked) return;

  if (rs.buzz) { sfxWrong(); return; }

  const buzz = {
    playerId: state.playerId,
    name: state.playerName || "Player",
    team: state.playerTeam || null,
    at: Date.now()
  };

  // race-safe-ish: re-fetch latest, only set if still empty
  try {
    const room = await getRoom(state.roomCode);
    if (!room) return;
    if (room.state?.buzz || room.state?.revealed || room.state?.buzzLocked) { sfxWrong(); return; }
    await updateRoomState(state.roomCode, { ...room.state, buzz });
  } catch {}
}
btnBuzz.addEventListener("click", playerBuzz);

// ===== Rendering =====
function renderScoreboard(container, rs, hostControls) {
  container.innerHTML = "";
  (rs.teams || []).forEach((name) => {
    const div = document.createElement("div");
    div.className = "team";

    const left = document.createElement("div");
    left.innerHTML = `<div class="teamName">${escapeHtml(name)}</div>`;

    const right = document.createElement("div");
    right.style.display = "flex";
    right.style.alignItems = "center";
    right.style.gap = "10px";

    if (hostControls) {
      const btns = document.createElement("div");
      btns.className = "teamBtns";

      const plus = document.createElement("button");
      plus.className = "smallBtn";
      plus.textContent = "+";
      plus.addEventListener("click", () => hostAddPoint(name, +1));

      const minus = document.createElement("button");
      minus.className = "smallBtn";
      minus.textContent = "−";
      minus.addEventListener("click", () => hostAddPoint(name, -1));

      const wrong = document.createElement("button");
      wrong.className = "smallBtn";
      wrong.textContent = "✖";
      wrong.title = "Buzzer";
      wrong.addEventListener("click", () => sfxWrong());

      btns.appendChild(plus);
      btns.appendChild(minus);
      btns.appendChild(wrong);
      right.appendChild(btns);
    }

    const score = document.createElement("div");
    score.className = "score";
    score.textContent = rs.scores?.[name] ?? 0;

    right.appendChild(score);
    div.appendChild(left);
    div.appendChild(right);
    container.appendChild(div);
  });
}

function renderWinner(rs) {
  const entries = Object.entries(rs?.scores || {}).sort((a, b) => b[1] - a[1]);
  const top = entries[0];
  winnerName.textContent = top ? `${top[0]} (${top[1]} pts)` : "—";

  winnerScores.innerHTML = "";
  entries.forEach(([name, score]) => {
    const row = document.createElement("div");
    row.className = "winnerRow";
    row.innerHTML = `<div>${escapeHtml(name)}</div><div>${score}</div>`;
    winnerScores.appendChild(row);
  });
}

function renderFromRoomState() {
  const rs = state.roomState;
  if (!rs) return;

  const total = (rs.queue?.length || 0) + (rs.used?.length || 0);
  const done = (rs.used?.length || 0);
  const track = rs.currentId ? trackById(rs.currentId) : null;

  // Host screen
  if (!hostGameCard.classList.contains("hidden")) {
    packName.textContent = (state.rounds.find((r) => r.id === rs.packId)?.name) || "Round Pack";
    roomPill.textContent = "Room: " + state.roomCode;
    try{ updateJoinQr(); }catch{}
    trackCounter.textContent = `${done} / ${total}`;
    nowPlaying.textContent = track ? `${track.round} • ${track.category}` : "—";
    clipPill.textContent = `Clip: ${(rs.clipSeconds ?? rs.baseClipSeconds ?? 3)}s`;
    const basePts = (rs.scoringMode === "both") ? 2 : 1;
    const hints = rs.hintCount || 0;
    let avail = basePts;
    if ((rs.penaltyMode || "off") === "minus1") avail = Math.max(0, basePts - hints);
    else if ((rs.penaltyMode || "off") === "half") avail = (hints > 0) ? Math.max(1, Math.floor(basePts/2)) : basePts;
    const pp = document.getElementById("pointsPill");
    if (pp) pp.textContent = `Points: ${avail}`;

    // Disable play/escalation once revealed (keeps flow snappy)
    const lock = !!rs.revealed || !!rs.buzzLocked || rs.phase === "reveal" || rs.phase === "end";
    if (btnPlay) btnPlay.disabled = lock;
    if (btnMoreTime) btnMoreTime.disabled = lock;
    if (btnFull) btnFull.disabled = lock;

    prompt.textContent = rs.phase === "end" ? "That’s the lot! 🎉" : "Guess the intro!";

    if (track) {
      badgeDecade.textContent = track.round;
      badgeCat.textContent = track.category;

      if (rs.revealed) {
        ansArtist.textContent = track.artist;
        ansSong.textContent = track.title;
        show(answerBox);
      } else {
        hide(answerBox);
      }
    } else {
      hide(answerBox);
    }

    if (rs.buzz) {
      buzzStatus.innerHTML = `🚨 <b>${escapeHtml(rs.buzz.name)}</b> buzzed (${escapeHtml(rs.buzz.team || "no team")})`;
    } else {
      buzzStatus.textContent = "No buzz yet.";
    }

    renderScoreboard(teamsWrap, rs, true);

    bar.style.width = "0%";
    if (rs.playing && rs.playStartAt && rs.playDuration) startBar(bar, rs.playStartAt, rs.playDuration);
  }

    // If overlay is open, keep it live-updated
  try { if (scoresModal && !scoresModal.classList.contains("hidden")) renderScoresOverlay(); } catch {}

  // Player screen
  if (!playerCard.classList.contains("hidden")) {
    playerRoomTitle.textContent = "Room " + state.roomCode;
    playerTrackCounter.textContent = `${done} / ${total}`;
    playerNowPlaying.textContent = track ? `${track.round} • ${track.category}` : "—";
    playerPrompt.textContent =
      rs.phase === "end" ? "Game over!" : (rs.playing ? "Listening… 🔊" : "Waiting for host…");

    if (track && rs.revealed) {
      pAnsArtist.textContent = track.artist;
      pAnsSong.textContent = track.title;
      show(playerAnswerBox);
    } else {
      hide(playerAnswerBox);
    }

    if (rs.buzz) {
      playerBuzzHint.textContent =
        rs.buzz.playerId === state.playerId ? "You buzzed first! 🎉" : `${rs.buzz.name} buzzed first.`;
    } else {
      playerBuzzHint.textContent = "First buzz wins.";

    const buzzLock = !!rs.revealed || !!rs.buzzLocked || rs.phase === "reveal" || rs.phase === "end";
    if (btnBuzz) btnBuzz.disabled = buzzLock;
    }

    renderScoreboard(playerTeams, rs, false);

    playerBar.style.width = "0%";
    if (rs.playing && rs.playStartAt && rs.playDuration) startBar(playerBar, rs.playStartAt, rs.playDuration);
  }
}


// ===== Scoreboard overlay (players) =====
const scoresModal = $("scoresModal");
const btnScoresOverlay = $("btnScoresOverlay");
const btnCloseScores = $("btnCloseScores");
const scoresOverlayList = $("scoresOverlayList");
const scoreOverlayMeta = $("scoreOverlayMeta");

function openScoresOverlay() {
  if (!scoresModal) return;
  renderScoresOverlay();
  show(scoresModal);
}
function closeScoresOverlay() {
  if (!scoresModal) return;
  hide(scoresModal);
}
function renderScoresOverlay() {
  const rs = state.roomState;
  if (!rs || !scoresOverlayList) return;

  const entries = Object.entries(rs.scores || {}).sort((a, b) => b[1] - a[1]);
  scoresOverlayList.innerHTML = "";
  entries.forEach(([name, score]) => {
    const row = document.createElement("div");
    row.className = "winnerRow";
    row.innerHTML = `<div>${escapeHtml(name)}</div><div>${score}</div>`;
    scoresOverlayList.appendChild(row);
  });

  if (scoreOverlayMeta) {
    const total = (rs.queue?.length || 0) + (rs.used?.length || 0);
    const done = (rs.used?.length || 0);
    scoreOverlayMeta.textContent = `Room ${state.roomCode} • ${done}/${total} • ${rs.teams?.length || 0} teams`;
  }
}

if (btnScoresOverlay) btnScoresOverlay.addEventListener("click", openScoresOverlay);
if (btnCloseScores) btnCloseScores.addEventListener("click", closeScoresOverlay);
if (scoresModal) scoresModal.addEventListener("click", (e) => { if (e.target === scoresModal) closeScoresOverlay(); });

// ===== Boot =====
(async function boot() {
  if (!supabase) return;
  state.playerId = getLocalId();

  // default team select
  teamSelect.innerHTML = "";
  ["Team A", "Team B"].forEach((t) => {
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t;
    teamSelect.appendChild(opt);
  });

  try {
    await loadData();
  } catch {
    alert("Couldn't load songs.json / rounds.json. If running locally, use GitHub Pages.");
  }
})();
