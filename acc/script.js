// Aquerty Command Center — CMD-like shell (client-side)
const terminal = document.getElementById('terminal');

const ACC_STATE_KEY = 'aquerty_acc_state_v3';
const SETTINGS_KEY = 'aquerty_settings_v1';
const ACC_API = '/api/acc-auth';
const IDENTITY_MODULE_URL = 'https://esm.sh/@netlify/identity@2.0.0';
let identityModulePromise = null;
let aqSession = null;
let accIdentity = null;

function getIdentityApi() {
  if (!identityModulePromise) identityModulePromise = import(IDENTITY_MODULE_URL);
  return identityModulePromise;
}

function getDesktopLang() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    return saved.desktopLanguage === "en" ? "en" : "fr";
  } catch (_) {
    return "fr";
  }
}

const ACC_I18N = {
  fr: {
    intro: [
      "[INIT] Initialisation système...",
      "[FW] Chargement des règles firewall dynamiques",
      "[NET] Connexion hub sécurisé - Établie",
      "[SEC] Chargement des modules de chiffrement - OK"
    ],
    enterSession: "Entrez votre ID ACC :",
    enterPassword: "Mot de passe AQ-NEO :",
    granted: "Accès autorisé",
    denied: "Accès refusé.",
    accessDenied: "Accès refusé.",
    invalidId: "ID non valable. Entrez un nombre entre 1 et 999.",
    unknownId: "ID ACC inconnu.",
    wrongAdminId: "Cet ID administrateur n'est pas associé à la session AQ-NEO active.",
    adminRequired: "Une session AQ-NEO ADMIN est requise pour cet ID.",
    authUnavailable: "Service d'identification ACC indisponible.",
    sessionUser: "Session membre détectée : accès utilisateur direct.",
    sessionGuest: "Session locale : accès utilisateur limité.",
    adminPrompt: "Session ADMIN détectée : authentification ACC requise.",
    usageOpen: (m) => `Usage: ${m} <nom|chemin>`,
    fileNotFound: "Fichier introuvable",
    cannotDisplay: "Le système ne peut pas afficher ce fichier.",
    cannotFindFile: "Le système ne trouve pas le fichier spécifié.",
    pathNotFound: "Le système ne trouve pas le chemin spécifié.",
    cmdSyntax: "La syntaxe de la commande est incorrecte.",
    commands: "Commandes:",
    usage: "Utilisation:",
    helpOpen: "  open <nom|chemin>     Ouvrir un fichier de assets/ ou logs/",
    helpStart: "  start <nom|chemin>    Ouvrir (pdf dans le navigateur)",
    helpTip: 'Astuce: utiliser des guillemets pour les espaces: open "ACC Manual.pdf"',
    directoryOf: " Répertoire de ",
    empty: " <vide>",
    availableFiles: "Fichiers disponibles:",
    more: "Plus ?",
    version: "Aquerty AQ-NEO / AQ-ACC [Build 1.0.0]",
    date: "Date actuelle: ",
    time: "Heure actuelle: ",
    userLabel: "Utilisateur:",
    sessionLabel: "Session:",
    netConfig: "Configuration réseau Aquerty",
    ethernet: "Adaptateur Ethernet Connexion au réseau local :",
    pinging: (h) => `Ping vers ${h} avec 32 octets de données :`,
    reply: (t) => `Réponse de 10.10.0.254: octets=32 temps=${t}ms TTL=64`,
    pingStats: "Statistiques Ping pour 10.10.0.254:",
    pingPackets: "    Paquets: envoyés = 4, reçus = 4, perdus = 0 (0% de perte),",
    tracing: (h) => `Itineraire vers ${h} avec un maximum de 30 sauts`,
    traceComplete: "Trace terminée.",
    unrecognizedA: (cmd) => `'${cmd}' n est pas reconnu en tant que commande interne ou externe,`,
    unrecognizedB: "programme executable ou fichier de commandes.",
    roleAdmin: "Administrateur",
    roleUser: "Utilisateur"
  },
  en: {
    intro: [
      "[INIT] System initialization...",
      "[FW] Loading dynamic firewall rules",
      "[NET] Secure hub connection - Established",
      "[SEC] Encryption modules loading - OK"
    ],
    enterSession: "Enter your ACC ID:",
    enterPassword: "AQ-NEO password:",
    granted: "Access granted",
    denied: "Access denied.",
    accessDenied: "Access is denied.",
    invalidId: "Invalid ID. Enter a number between 1 and 999.",
    unknownId: "Unknown ACC ID.",
    wrongAdminId: "This administrator ID is not linked to the active AQ-NEO session.",
    adminRequired: "An AQ-NEO ADMIN session is required for this ID.",
    authUnavailable: "ACC identity service unavailable.",
    sessionUser: "Member session detected: direct user access.",
    sessionGuest: "Local session: limited user access.",
    adminPrompt: "ADMIN session detected: ACC authentication required.",
    usageOpen: (m) => `Usage: ${m} <name|path>`,
    fileNotFound: "File Not Found",
    cannotDisplay: "The system cannot display this file.",
    cannotFindFile: "The system cannot find the file specified.",
    pathNotFound: "The system cannot find the path specified.",
    cmdSyntax: "The syntax of the command is incorrect.",
    commands: "Commands:",
    usage: "Usage:",
    helpOpen: "  open <name|path>     Open a file from assets/ or logs/",
    helpStart: "  start <name|path>    Open (pdf opens in browser)",
    helpTip: 'Tip: use quotes for spaces: open "ACC Manual.pdf"',
    directoryOf: " Directory of ",
    empty: " <empty>",
    availableFiles: "Available files:",
    more: "More?",
    version: "Aquerty AQ-NEO / AQ-ACC [Build 1.0.0]",
    date: "The current date is: ",
    time: "The current time is: ",
    userLabel: "User:",
    sessionLabel: "Session:",
    netConfig: "Aquerty Network Configuration",
    ethernet: "Ethernet adapter Local Area Connection:",
    pinging: (h) => `Pinging ${h} with 32 bytes of data:`,
    reply: (t) => `Reply from 10.10.0.254: bytes=32 time=${t}ms TTL=64`,
    pingStats: "Ping statistics for 10.10.0.254:",
    pingPackets: "    Packets: Sent = 4, Received = 4, Lost = 0 (0% loss),",
    tracing: (h) => `Tracing route to ${h} over a maximum of 30 hops`,
    traceComplete: "Trace complete.",
    unrecognizedA: (cmd) => `'${cmd}' is not recognized as an internal or external command,`,
    unrecognizedB: "operable program or batch file.",
    roleAdmin: "Administrator",
    roleUser: "User"
  }
};

function t() {
  return ACC_I18N[getDesktopLang()];
}

const ASCII_LOGO = `
    █████╗  ██████╗ ██╗   ██╗███████╗██████╗ ████████╗██╗   ██╗
   ██╔══██╗██╔═══██╗██║   ██║██╔════╝██╔══██╗╚══██╔══╝╚██╗ ██╔╝
   ███████║██║   ██║██║   ██║█████╗  ██████╔╝   ██║    ╚████╔╝ 
   ██╔══██║██║  ███║██║   ██║██╔══╝  ██ ██╔╝    ██║     ╚██╔╝  
   ██║  ██║╚████████╚██████╔╝███████╗██║ ██║    ██║      ██║   
   ╚═╝  ╚═╝ ╚══════╝ ╚═════╝ ╚══════╝╚═╝ ╚═╝    ╚═╝      ╚═╝   

        A Q U E R T Y   I N D U S T R I E S
============================================================
`;

const FILE_INDEX = [
  "assets/omega.txt",
  "logs/security.html"
];

const COMMANDS = [
  "help", "cls", "exit", "shutdown",
  "cd", "dir", "ls", "type", "more", "find", "echo",
  "start",
  "ver", "date", "time",
  "whoami", "ipconfig", "ping", "tracert",
  "history"
];

let sessionId = null;
let activeAccName = null;
let accessLevel = 0; // 1 user, 2 admin
let cwd = "\\ACC";

let currentInput = null;
let history = [];
let historyCursor = 0;
let completionState = null;

async function fetchAccIdentity() {
  try {
    const response = await fetch(ACC_API, {
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Accept": "application/json" }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "acc_identity_failed");
    return data;
  } catch (error) {
    console.warn("[AQ-ACC] identity lookup failed", error);
    return null;
  }
}

async function validateAccId(value) {
  const response = await fetch(ACC_API, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ action: "validate_id", accId: String(value || "").trim() })
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok && data.ok, status: response.status, data };
}

async function verifyCurrentAdminPassword(password) {
  const email = aqSession?.email || accIdentity?.email;
  if (!email || !password) return false;

  try {
    const { login } = await getIdentityApi();
    await login(email, password);
    return true;
  } catch (_) {
    return false;
  }
}

function getParentSession() {
  try {
    return window.parent?.JAJSession || null;
  } catch (_) {
    return null;
  }
}

function htmlEscape(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function writeText(text) {
  terminal.appendChild(document.createTextNode(String(text)));
  terminal.scrollTop = terminal.scrollHeight;
}

function writeLine(text = "") {
  writeText(String(text) + "\n");
}

function writeHtmlLine(html, fallback = "") {
  terminal.insertAdjacentHTML("beforeend", html);
  writeText("\n");
  if (fallback) void fallback;
}

function clearScreen() {
  terminal.innerHTML = "";
}

function promptString() {
  // show C:\ACC\assets> style
  const path = cwd.replaceAll("/", "\\");
  return `C:${path}>`;
}

function isInteractiveTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === "IFRAME" || tag === "VIDEO" || tag === "INPUT" || tag === "BUTTON" || tag === "A" || tag === "IMG";
}

function persistSave() {
  const payload = {
    sessionId,
    accessLevel,
    cwd,
    history: history.slice(-120)
  };
  localStorage.setItem(ACC_STATE_KEY, JSON.stringify(payload));
}

function persistLoad() {
  try {
    const saved = JSON.parse(localStorage.getItem(ACC_STATE_KEY) || "{}");
    if (typeof saved.cwd === "string") cwd = saved.cwd;
    if (Array.isArray(saved.history)) history = saved.history.map(String);
    historyCursor = history.length;
  } catch (_) {
    // ignore
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function typedLine(text, delay = 20) {
  const s = String(text);
  for (let i = 0; i < s.length; i++) {
    writeText(s[i]);
    await sleep(delay);
  }
  writeText("\n");
}

function tokenize(line) {
  const s = String(line || "").trim();
  if (!s) return [];
  const tokens = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (!inQuotes && /\s/.test(ch)) {
      if (cur) { tokens.push(cur); cur = ""; }
      continue;
    }
    cur += ch;
  }
  if (cur) tokens.push(cur);
  return tokens;
}

function splitPipes(line) {
  const s = String(line || "");
  const segments = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"') { inQuotes = !inQuotes; cur += ch; continue; }
    if (!inQuotes && ch === "|") {
      segments.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) segments.push(cur.trim());
  return segments;
}

function normalizePath(p) {
  return String(p || "").replaceAll("\\", "/").replace(/^\s+|\s+$/g, "");
}

function joinPath(base, child) {
  const parts = `${base}/${child}`.split("/").filter(Boolean);
  const stack = [];
  for (const part of parts) {
    if (part === ".") continue;
    if (part === "..") { stack.pop(); continue; }
    stack.push(part);
  }
  return stack.join("/");
}

function cwdPrefix() {
  // cwd is like \ACC\assets -> "ACC/assets"
  return cwd.replace(/^[\\\/]+/, "").replaceAll("\\", "/");
}

function resolvePath(arg) {
  const raw = normalizePath(arg);
  if (!raw) return "";
  if (raw.startsWith("assets/") || raw.startsWith("logs/")) return raw;
  const base = cwdPrefix();
  return joinPath(base, raw);
}

function baseName(path) {
  return normalizePath(path).split("/").pop() || "";
}

function shortName(path) {
  const b = baseName(path);
  return b.includes(".") ? b.slice(0, b.lastIndexOf(".")) : b;
}

function knownListForCwd() {
  const prefix = cwdPrefix();
  const pfx = prefix ? `${prefix}/` : "";
  return FILE_INDEX
    .filter((p) => p.startsWith(pfx))
    .filter((p) => accessLevel >= 2 || p !== "logs/security.html")
    .map(baseName);
}

function findKnownByName(name) {
  const n = String(name || "").trim().toLowerCase();
  if (!n) return null;
  return FILE_INDEX.find((p) => {
    const b = baseName(p).toLowerCase();
    const sn = shortName(p).toLowerCase();
    return b === n || sn === n;
  }) || null;
}

async function exists(path) {
  try {
    const res = await fetch(path, { cache: "no-store" });
    return res.ok;
  } catch (_) {
    return false;
  }
}

function requireLevel(level) {
  if (accessLevel < level) {
    writeLine(t().accessDenied);
    return false;
  }
  return true;
}

function formatHelpColumns(items, colWidth = 14, cols = 4) {
  const lines = [];
  for (let i = 0; i < items.length; i += cols) {
    const row = items.slice(i, i + cols);
    lines.push(row.map((it) => it.padEnd(colWidth, " ")).join(""));
  }
  return lines.join("\n");
}

function generateSecurityLogText() {
  const isEn = getDesktopLang() === "en";
  const now = new Date();
  const ts = now.toISOString().replace("T", " ").slice(0, 19);
  const mkIp = () => `${10 + Math.floor(Math.random()*10)}.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}`;
  const sid = sessionId || "???";
  const entries = [
    { lvl: "INFO", msg: isEn ? `Console session authenticated (SID=${sid}, level=${accessLevel})` : `Session console authentifiée (SID=${sid}, niveau=${accessLevel})`, ip: "127.0.0.1", act: "OK" },
    { lvl: "WARN", msg: isEn ? "Multiple failed login attempts detected" : "Plusieurs tentatives de connexion échouées détectées", ip: mkIp(), act: isEn ? "THROTTLED" : "RALENTI" },
    { lvl: "INFO", msg: isEn ? "Firewall policy reloaded" : "Politique firewall rechargée", ip: "127.0.0.1", act: "OK" },
    { lvl: "ALERT", msg: isEn ? "Unauthorized probe detected on port 445" : "Sonde non autorisée détectée sur le port 445", ip: mkIp(), act: isEn ? "BLOCKED" : "BLOQUÉ" }
  ];
  const pick = () => entries[Math.floor(Math.random() * entries.length)];
  const out = [];
  out.push(isEn ? "=== Security Log / Intrusion Detection Report ===" : "=== Journal de sécurité / Rapport de détection d’intrusion ===");
  out.push((isEn ? "Generated: " : "Généré : ") + ts);
  out.push("");
  for (let i = 0; i < 6; i++) {
    const e = pick();
    out.push(`[${e.lvl}] ${e.msg}`);
    out.push(`  ${isEn ? "Remote" : "Source"}: ${e.ip}`);
    out.push(`  ${isEn ? "Action" : "Action"}: ${e.act}`);
    out.push("");
  }
  return out.join("\n").trimEnd();
}

async function openLikeCmd(arg, mode = "open") {
  const raw = String(arg || "").trim();
  if (!raw) {
    writeLine(t().usageOpen(mode));
    return;
  }

  // prefer known index
  const fromKnown = findKnownByName(raw);
  const candidates = [];
  if (fromKnown) candidates.push(fromKnown);
  candidates.push(resolvePath(raw));

  if (!raw.includes(".") && !raw.includes("/") && !raw.includes("\\")) {
    candidates.push(`assets/${raw}.txt`, `assets/${raw}.pdf`, `assets/${raw}.png`, `assets/${raw}.jpg`, `assets/${raw}.mp4`);
  }

  const unique = [...new Set(candidates.filter(Boolean))];
  let chosen = null;
  for (const c of unique) {
    if (FILE_INDEX.includes(c)) { chosen = c; break; }
    if (await exists(c)) { chosen = c; break; }
  }

  if (!chosen) {
    writeLine(t().fileNotFound);
    return;
  }

  // logs: render as text (dynamic for security)
  if (chosen.startsWith("logs/") && chosen.endsWith(".html")) {
    if (!requireLevel(2)) return;
    if (chosen === "logs/security.html") {
      writeLine(generateSecurityLogText());
      return;
    }
    try {
      const html = await fetch(chosen).then((r) => r.text());
      const doc = new DOMParser().parseFromString(html, "text/html");
      const text = doc.body?.innerText?.trim() || "";
      writeLine(text || "(empty)");
    } catch (_) {
      writeLine(t().cannotDisplay);
    }
    return;
  }

  // pdf: avoid modern embed
  if (chosen.toLowerCase().endsWith(".pdf")) {
    writeLine(`[PDF] ${chosen}`);
    terminal.insertAdjacentHTML(
      "beforeend",
      `<div style="margin-top:6px;">
        <a href="${htmlEscape(chosen)}" target="_blank" rel="noopener noreferrer" style="color:#3b78ff; text-decoration:underline;">Open</a>
        <span style="color:#888;"> (opens in browser)</span>
      </div>`
    );
    writeText("\n");
    if (mode === "start") window.open(chosen, "_blank", "noopener,noreferrer");
    return;
  }

  // txt
  if (chosen.toLowerCase().endsWith(".txt")) {
    try {
      const t = await fetch(chosen).then((r) => r.text());
      writeLine(String(t).trimEnd());
    } catch (_) {
      writeLine(t().cannotFindFile);
    }
    return;
  }

  // media (simple embed is OK)
  const lower = chosen.toLowerCase();
  if (lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".gif")) {
    terminal.insertAdjacentHTML("beforeend", `<img src="${htmlEscape(chosen)}" style="max-width:520px;">`);
    writeText("\n");
    return;
  }
  if (lower.endsWith(".mp4") || lower.endsWith(".webm")) {
    terminal.insertAdjacentHTML("beforeend", `<video src="${htmlEscape(chosen)}" controls style="max-width:520px; max-height:260px;"></video>`);
    writeText("\n");
    return;
  }

  writeLine(t().cannotDisplay);
}

async function execOne(segment, inputLines) {
  const tokens = tokenize(segment);
  if (tokens.length === 0) return [];
  const cmd = tokens[0].toLowerCase();
  const args = tokens.slice(1);

  const out = [];
  const emit = (s = "") => out.push(String(s));

  if (cmd === "help") {
    emit(t().commands);
    emit(formatHelpColumns(COMMANDS, 14, 4));
    emit("");
    emit(t().usage);
    emit(t().helpOpen);
    emit(t().helpStart);
    emit(t().helpTip);
  } else if (cmd === "cls") {
    clearScreen();
    return [];
  } else if (cmd === "exit") {
    clearScreen();
    await bootFlow();
    return [];
  } else if (cmd === "shutdown") {
    if (!requireLevel(1)) return [];
    location.reload();
    return [];
  } else if (cmd === "cd") {
    const target = args.join(" ").trim();
    if (!target) {
      emit(promptString().replace(">", ""));
    } else {
      const p = normalizePath(target);
      if (p === "\\" || p === "/" || p.toLowerCase() === "acc" || p.toLowerCase() === "acc/") {
        cwd = "\\ACC";
      } else if (p === "..") {
        cwd = "\\ACC";
      } else if (p.toLowerCase() === "assets" || p.toLowerCase() === "acc/assets") {
        cwd = "\\ACC\\assets";
      } else if (p.toLowerCase() === "logs" || p.toLowerCase() === "acc/logs") {
        cwd = "\\ACC\\logs";
      } else {
        emit(t().pathNotFound);
      }
      persistSave();
    }
  } else if (cmd === "dir" || cmd === "ls") {
    emit(t().directoryOf + promptString().replace(">", ""));
    emit("");
    const list = knownListForCwd();
    if (list.length === 0) emit(t().empty);
    list.forEach(emit);
  } else if (cmd === "files") {
    // legacy alias
    emit(t().availableFiles);
    FILE_INDEX
      .filter((p) => accessLevel >= 2 || p !== "logs/security.html")
      .map(baseName)
      .forEach(emit);
  } else if (cmd === "open") {
    await openLikeCmd(args.join(" "), "open");
    return [];
  } else if (cmd === "start") {
    await openLikeCmd(args.join(" "), "start");
    return [];
  } else if (cmd === "type") {
    const target = args.join(" ").trim();
    if (!target) {
      emit(t().cmdSyntax);
    } else {
      const known = findKnownByName(target) || resolvePath(target);
      if (!known) {
        emit(t().fileNotFound);
      } else if (known === "logs/security.html") {
        if (!requireLevel(2)) return [];
        emit(generateSecurityLogText());
      } else if (known.startsWith("logs/") && known.endsWith(".html")) {
        if (!requireLevel(2)) return [];
        try {
          const html = await fetch(known).then((r) => r.text());
          const doc = new DOMParser().parseFromString(html, "text/html");
          emit(doc.body?.innerText?.trim() || "(empty)");
        } catch (_) {
          emit(t().cannotDisplay);
        }
      } else if (known.endsWith(".txt")) {
        try {
          const t = await fetch(known).then((r) => r.text());
          emit(String(t).trimEnd());
        } catch (_) {
          emit(t().cannotFindFile);
        }
      } else {
        emit(t().cannotDisplay);
      }
    }
  } else if (cmd === "more") {
    // minimal: pass-through; (real interactive --More-- can be added later)
    const src = inputLines || [];
    if (src.length === 0) emit(t().more);
    else src.forEach(emit);
  } else if (cmd === "find") {
    const needle = args.join(" ").replaceAll('"', "").trim();
    const src = inputLines || [];
    if (!needle) {
      emit(t().cmdSyntax);
    } else {
      src.filter((l) => l.toLowerCase().includes(needle.toLowerCase())).forEach(emit);
    }
  } else if (cmd === "echo") {
    emit(args.join(" "));
  } else if (cmd === "ver") {
    emit(t().version);
  } else if (cmd === "date") {
    emit(t().date + new Date().toLocaleDateString());
  } else if (cmd === "time") {
    emit(t().time + new Date().toLocaleTimeString());
  } else if (cmd === "whoami") {
    const role = accessLevel >= 2 ? t().roleAdmin : t().roleUser;
    emit(`${t().userLabel} ${role}`);
    emit(`${t().sessionLabel} ${sessionId || "?"}`);
  } else if (cmd === "ipconfig") {
    emit(t().netConfig);
    emit("");
    emit(t().ethernet);
    emit("   Connection-specific DNS Suffix  . : aquerty.local");
    emit("   IPv4 Address. . . . . . . . . . . : 192.168.1.24");
    emit("   Subnet Mask . . . . . . . . . . . : 255.255.255.0");
    emit("   Default Gateway . . . . . . . . . : 192.168.1.1");
  } else if (cmd === "ping") {
    const host = args[0] || "aquerty.internal";
    emit(t().pinging(host));
    for (let i = 0; i < 4; i++) emit(t().reply(8 + i));
    emit("");
    emit(t().pingStats);
    emit(t().pingPackets);
  } else if (cmd === "tracert" || cmd === "tracert.") {
    const host = args[0] || "aquerty.internal";
    emit(t().tracing(host));
    emit("");
    emit("  1     1 ms     1 ms     1 ms  192.168.1.1");
    emit("  2     4 ms     4 ms     4 ms  10.10.0.254");
    emit("  3     9 ms     9 ms     9 ms  aquerty.internal");
    emit("");
    emit(t().traceComplete);
  } else if (cmd === "history") {
    history.slice(-40).forEach(emit);
  } else {
    emit(t().unrecognizedA(tokens[0]));
    emit(t().unrecognizedB);
  }

  return out;
}

async function runPipeline(line) {
  const segments = splitPipes(line);
  let pipe = null;
  for (const seg of segments) {
    pipe = await execOne(seg, pipe);
  }
  if (pipe && pipe.length) {
    for (const l of pipe) writeLine(l);
  }
}

function mountInput({ showPrompt, onEnter, secret = false }) {
  const input = document.createElement("input");
  if (secret) {
    input.type = "password";
    input.autocomplete = "current-password";
  }
  if (showPrompt) {
    terminal.insertAdjacentHTML("beforeend", `<span class="prompt">${htmlEscape(promptString()).replaceAll(">", "&gt;")}</span> `);
  }
  terminal.appendChild(input);
  input.focus();
  currentInput = input;
  completionState = null;
  historyCursor = history.length;

  input.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      const value = input.value;
      input.remove();
      currentInput = null;
      completionState = null;
      await onEnter(value);
      return;
    }

    if (!showPrompt) return;

    if (e.key === "ArrowUp") {
      if (history.length === 0) return;
      e.preventDefault();
      historyCursor = Math.max(0, historyCursor - 1);
      input.value = history[historyCursor] || "";
      return;
    }
    if (e.key === "ArrowDown") {
      if (history.length === 0) return;
      e.preventDefault();
      historyCursor = Math.min(history.length, historyCursor + 1);
      input.value = historyCursor >= history.length ? "" : (history[historyCursor] || "");
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      const next = getCompletion(input.value);
      if (next != null) input.value = next;
      return;
    }
    completionState = null;
  });
}

function getCompletion(value) {
  const v = String(value || "");
  const t = v.trim();
  const makeKey = (base, candidates) => base + "::" + candidates.join("|");
  const cycle = (base, candidates) => {
    if (candidates.length === 0) return null;
    const key = makeKey(base, candidates);
    if (!completionState || completionState.key !== key) {
      completionState = { key, idx: 0, candidates };
      return candidates[0];
    }
    completionState.idx = (completionState.idx + 1) % completionState.candidates.length;
    return completionState.candidates[completionState.idx];
  };

  if (t.toLowerCase().startsWith("open ") || t.toLowerCase().startsWith("start ")) {
    const [head, ...rest] = t.split(/\s+/);
    const needle = rest.join(" ").toLowerCase();
    const all = [...new Set(FILE_INDEX.map(shortName))];
    const hits = all.filter((n) => n.toLowerCase().startsWith(needle)).map((n) => `${head} ${n}`);
    return cycle(t, hits);
  }
  if (t.toLowerCase().startsWith("cd ")) {
    const needle = t.slice(3).trim().toLowerCase();
    const dirs = ["\\", "..", "assets", "logs"];
    const hits = dirs.filter((d) => d.toLowerCase().startsWith(needle)).map((d) => `cd ${d}`);
    return cycle(t, hits);
  }
  const hits = COMMANDS.filter((c) => c.toLowerCase().startsWith(t.toLowerCase()));
  return cycle(t, hits);
}

async function printIntro() {
  clearScreen();
  for (const l of t().intro) await typedLine(l, 15);
}

function showSessionBanner() {
  const role = accessLevel >= 2 ? "ADMIN" : "USER";
  document.body.dataset.accMode = role.toLowerCase();
  writeLine("");
  writeText(ASCII_LOGO + "\n");
  writeLine(`[SESSION] ACC-ID ${sessionId || "LOCAL"} // ${role}${activeAccName ? " // " + activeAccName : ""}`);
  writeLine("");
  persistSave();
  shellLoop();
}

async function promptAdminPassword() {
  await typedLine(t().enterPassword, 15);
  mountInput({
    showPrompt: false,
    secret: true,
    onEnter: async (pwd) => {
      const ok = await verifyCurrentAdminPassword(String(pwd || ""));
      if (!ok) {
        writeLine("");
        writeLine(t().denied);
        await promptAdminPassword();
        return;
      }

      writeLine("");
      writeLine(t().granted);
      accessLevel = 2;
      activeAccName = accIdentity?.displayName || activeAccName;
      showSessionBanner();
    }
  });
}

async function promptAccId() {
  await typedLine(t().enterSession, 15);
  mountInput({
    showPrompt: false,
    onEnter: async (value) => {
      const raw = String(value || "").trim();

      if (!/^\d{1,3}$/.test(raw) || Number(raw) < 1 || Number(raw) > 999) {
        writeLine("");
        writeLine(t().invalidId);
        await promptAccId();
        return;
      }

      let checked;
      try {
        checked = await validateAccId(raw);
      } catch (_) {
        checked = null;
      }

      if (!checked) {
        writeLine("");
        writeLine(t().authUnavailable);
        await promptAccId();
        return;
      }

      if (!checked.ok) {
        const error = checked.data?.error;
        writeLine("");
        if (error === "invalid_id_format" || error === "invalid_id_range") writeLine(t().invalidId);
        else if (error === "unknown_id") writeLine(t().unknownId);
        else if (error === "admin_role_required") writeLine(t().adminRequired);
        else if (error === "admin_id_not_current_session") writeLine(t().wrongAdminId);
        else writeLine(t().denied);
        await promptAccId();
        return;
      }

      sessionId = String(checked.data.accId);
      activeAccName = checked.data.displayName || null;
      if (checked.data.mode === "user") {
        accessLevel = 1;
        writeLine("");
        writeLine(t().granted);
        showSessionBanner();
        return;
      }

      if (checked.data.mode === "admin_password") {
        accessLevel = 0;
        await promptAdminPassword();
        return;
      }

      writeLine("");
      writeLine(t().denied);
      await promptAccId();
    }
  });
}

async function bootFlow() {
  currentInput?.remove();
  currentInput = null;
  aqSession = getParentSession();
  accIdentity = await fetchAccIdentity();

  await printIntro();

  if (!aqSession || aqSession.type === "guest" || !accIdentity?.authenticated) {
    accessLevel = 1;
    sessionId = "GUEST";
    activeAccName = "Invité";
    showSessionBanner();
    return;
  }

  if (accIdentity.role !== "admin") {
    accessLevel = 1;
    sessionId = String(accIdentity.accId || "USER");
    activeAccName = accIdentity.displayName || null;
    showSessionBanner();
    return;
  }

  accessLevel = 0;
  sessionId = null;
  activeAccName = accIdentity.displayName || null;
  await typedLine(`${t().adminPrompt} [ID ACC: ${accIdentity.accId}]`, 12);
  await promptAccId();
}

function shellLoop() {
  mountInput({
    showPrompt: true,
    onEnter: async (line) => {
      const raw = String(line || "");
      writeLine(raw);
      if (raw.trim()) {
        history.push(raw.trim());
        historyCursor = history.length;
        persistSave();
      }
      await runPipeline(raw);
      shellLoop();
    }
  });
}

document.addEventListener("mousedown", (e) => {
  if (!currentInput) return;
  if (isInteractiveTarget(e.target)) return;
  currentInput.focus();
});

persistLoad();
clearScreen();
writeLine("AQ-ACC prêt. Ouvrez la fenêtre depuis AQ-NEO.");

window.addEventListener("message", (event) => {
  if (event.origin !== window.location.origin) return;
  if (event.data?.type !== "aq-acc-open" && event.data?.type !== "aq-session-changed") return;
  bootFlow();
});

try {
  if (window.parent === window || window.parent?.document?.getElementById("win-acc")?.style.display === "block") {
    bootFlow();
  }
} catch (_) {
  bootFlow();
}
