// Aquerty Command Center — CMD-like shell (client-side)
const terminal = document.getElementById('terminal');

const ACC_STATE_KEY = 'aquerty_acc_state_v2';
const SETTINGS_KEY = 'aquerty_settings_v1';

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
      "[INIT] Initialisation systeme...",
      "[FW] Chargement des regles firewall dynamiques",
      "[NET] Connexion hub securise - Etablie",
      "[SEC] Chargement modules de chiffrement - OK"
    ],
    enterSession: "Entrez l identifiant de session:",
    enterPassword: "Entrer le mot de passe:",
    granted: "Acces autorise",
    denied: "Acces refuse.",
    accessDenied: "Acces refuse.",
    usageOpen: (m) => `Usage: ${m} <nom|chemin>`,
    fileNotFound: "Fichier introuvable",
    cannotDisplay: "Le systeme ne peut pas afficher ce fichier.",
    cannotFindFile: "Le systeme ne trouve pas le fichier specifie.",
    pathNotFound: "Le systeme ne trouve pas le chemin specifie.",
    cmdSyntax: "La syntaxe de la commande est incorrecte.",
    commands: "Commandes:",
    usage: "Utilisation:",
    helpOpen: "  open <nom|chemin>     Ouvrir un fichier de assets/ ou logs/",
    helpStart: "  start <nom|chemin>    Ouvrir (pdf dans le navigateur)",
    helpTip: 'Astuce: utiliser des guillemets pour les espaces: open "ACC Manual.pdf"',
    directoryOf: " Repertoire de ",
    empty: " <vide>",
    availableFiles: "Fichiers disponibles:",
    more: "Plus ?",
    version: "Aquerty AQ-NEO [Build 0.9.5]",
    date: "Date actuelle: ",
    time: "Heure actuelle: ",
    userLabel: "Utilisateur:",
    sessionLabel: "Session:",
    netConfig: "Configuration reseau Aquerty",
    ethernet: "Adaptateur Ethernet Connexion au reseau local:",
    pinging: (h) => `Ping vers ${h} avec 32 octets de donnees:`,
    reply: (t) => `Reponse de 10.10.0.254: octets=32 temps=${t}ms TTL=64`,
    pingStats: "Statistiques Ping pour 10.10.0.254:",
    pingPackets: "    Paquets: envoyes = 4, recus = 4, perdus = 0 (0% de perte),",
    tracing: (h) => `Itineraire vers ${h} avec un maximum de 30 sauts`,
    traceComplete: "Trace terminee.",
    unrecognizedA: (cmd) => `'${cmd}' n est pas reconnu en tant que commande interne ou externe,`,
    unrecognizedB: "programme executable ou fichier de commandes.",
    roleAdmin: "Administrateur",
    roleDev: "Developpeur",
    roleGuest: "Invite"
  },
  en: {
    intro: [
      "[INIT] System initialization...",
      "[FW] Loading dynamic firewall rules",
      "[NET] Secure hub connection - Established",
      "[SEC] Encryption modules loading - OK"
    ],
    enterSession: "Enter session ID:",
    enterPassword: "Enter password:",
    granted: "Access granted",
    denied: "Access denied.",
    accessDenied: "Access is denied.",
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
    version: "Aquerty AQ-NEO [Build 0.9.5]",
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
    roleDev: "Developer",
    roleGuest: "Guest"
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
let accessLevel = 0; // 1 guest, 2 dev, 3 admin
let cwd = "\\ACC";

let currentInput = null;
let history = [];
let historyCursor = 0;
let completionState = null;

function accessFromSessionId(id) {
  const n = parseInt(id, 10);
  if (Number.isNaN(n)) return 1;
  if (n <= 99) return 3;
  if (n <= 299) return 2;
  return 1;
}

function expectedPassword() {
  if (accessLevel === 3) return "rootadmin";
  if (accessLevel === 2) return `AQ-DEV-${sessionId}-dev`;
  return `AQ-${sessionId}`;
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
  return FILE_INDEX.filter((p) => p.startsWith(pfx)).map(baseName);
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
    { lvl: "INFO", msg: isEn ? `Console session authenticated (SID=${sid}, level=${accessLevel})` : `Session console authentifiee (SID=${sid}, niveau=${accessLevel})`, ip: "127.0.0.1", act: "OK" },
    { lvl: "WARN", msg: isEn ? "Multiple failed login attempts detected" : "Plusieurs tentatives de connexion echouees detectees", ip: mkIp(), act: isEn ? "THROTTLED" : "RALENTI" },
    { lvl: "INFO", msg: isEn ? "Firewall policy reloaded" : "Politique firewall rechargee", ip: "127.0.0.1", act: "OK" },
    { lvl: "ALERT", msg: isEn ? "Unauthorized probe detected on port 445" : "Sonde non autorisee detectee sur le port 445", ip: mkIp(), act: isEn ? "BLOCKED" : "BLOQUE" }
  ];
  const pick = () => entries[Math.floor(Math.random() * entries.length)];
  const out = [];
  out.push(isEn ? "=== Security Log / Intrusion Detection Report ===" : "=== Journal de securite / Rapport de detection d intrusion ===");
  out.push((isEn ? "Generated: " : "Genere: ") + ts);
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
    if (!requireLevel(2)) return [];
    emit(t().directoryOf + promptString().replace(">", ""));
    emit("");
    const list = knownListForCwd();
    if (list.length === 0) emit(t().empty);
    list.forEach(emit);
  } else if (cmd === "files") {
    // legacy alias
    emit(t().availableFiles);
    FILE_INDEX.map(baseName).forEach(emit);
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
    const role = accessLevel === 3 ? t().roleAdmin : accessLevel === 2 ? t().roleDev : t().roleGuest;
    emit(`${t().userLabel} ${role}`);
    emit(`${t().sessionLabel} ${sessionId || "?"}`);
  } else if (cmd === "ipconfig") {
    if (!requireLevel(2)) return [];
    emit(t().netConfig);
    emit("");
    emit(t().ethernet);
    emit("   Connection-specific DNS Suffix  . : aquerty.local");
    emit("   IPv4 Address. . . . . . . . . . . : 192.168.1.24");
    emit("   Subnet Mask . . . . . . . . . . . : 255.255.255.0");
    emit("   Default Gateway . . . . . . . . . : 192.168.1.1");
  } else if (cmd === "ping") {
    if (!requireLevel(2)) return [];
    const host = args[0] || "aquerty.internal";
    emit(t().pinging(host));
    for (let i = 0; i < 4; i++) emit(t().reply(8 + i));
    emit("");
    emit(t().pingStats);
    emit(t().pingPackets);
  } else if (cmd === "tracert" || cmd === "tracert.") {
    if (!requireLevel(2)) return [];
    const host = args[0] || "aquerty.internal";
    emit(t().tracing(host));
    emit("");
    emit("  1     1 ms     1 ms     1 ms  192.168.1.1");
    emit("  2     4 ms     4 ms     4 ms  10.10.0.254");
    emit("  3     9 ms     9 ms     9 ms  aquerty.internal");
    emit("");
    emit(t().traceComplete);
  } else if (cmd === "history") {
    if (!requireLevel(2)) return [];
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

function mountInput({ showPrompt, onEnter }) {
  const input = document.createElement("input");
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

async function bootFlow() {
  for (const l of t().intro) await typedLine(l, 18);
  await typedLine(t().enterSession, 18);
  mountInput({
    showPrompt: false,
    onEnter: async (value) => {
      sessionId = String(value || "").trim();
      accessLevel = accessFromSessionId(sessionId);
      await typedLine(t().enterPassword, 18);
      mountInput({
        showPrompt: false,
        onEnter: async (pwd) => {
          const p = String(pwd || "").trim();
          if (p === expectedPassword()) {
            writeLine("");
            writeLine(t().granted);
            writeText(ASCII_LOGO + "\n");
            persistSave();
            shellLoop();
            return;
          }
          writeLine("");
          writeLine(t().denied);
          // retry password
          await typedLine(t().enterPassword, 18);
          // recurse by re-running password prompt
          mountInput({
            showPrompt: false,
            onEnter: async (pwd2) => {
              const p2 = String(pwd2 || "").trim();
              if (p2 === expectedPassword()) {
                writeLine("");
                writeLine(t().granted);
                writeText(ASCII_LOGO + "\n");
                persistSave();
                shellLoop();
                return;
              }
              writeLine("");
              writeLine(t().denied);
              await bootFlow();
            }
          });
        }
      });
    }
  });
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
bootFlow();
