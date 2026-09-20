import { api, tr, esc, date, errorText } from "./community-ui.js";
const categoryLabels = {
  general: ["Général", "General"],
  music: ["Musique", "Music"],
  sport: ["Sport", "Sport"],
  gaming: ["Jeux vidéo", "Gaming"],
  culture: ["Culture", "Culture"],
  tech: ["Tech", "Tech"],
};
let host = null,
  generation = 0,
  category = "all",
  query = "",
  page = 0,
  topics = [],
  requests = [],
  current = null,
  replies = [],
  wide = false;
try {
  wide = localStorage.getItem("aq-forum-wide") === "true";
} catch {}
const member = () => window.JAJSession?.type === "user";
const admin = () => member() && window.JAJSession.roles?.includes("admin");
const label = (key) => tr(...(categoryLabels[key] || categoryLabels.general));
const catOptions = () =>
  Object.keys(categoryLabels)
    .map((key) => `<option value="${key}">${label(key)}</option>`)
    .join("");
function status(value) {
  const el = host?.querySelector("[role=status]");
  if (el) el.textContent = value;
}
function applyWide() {
  document
    .getElementById("win-myspace")
    .classList.toggle("forum-wide", !!host && wide);
}
function chrome() {
  host.innerHTML = `<section class="forum-shell"><header class="forum-header"><div><small>JAJ COMMUNITY</small><h2>Forums AQ-NET</h2><p>${tr("Musique, sport, jeux et discussions entre membres.", "Music, sport, games and conversations between members.")}</p></div><button class="myspace-btn" data-forum="wide" aria-pressed="${wide}">${wide ? tr("Vue classique", "Classic view") : tr("Vue large", "Wide view")}</button></header>
        <p class="community-status" role="status" aria-live="polite"></p><div id="forum-body"></div></section>`;
}
function renderIndex() {
  current = null;
  chrome();
  const body = host.querySelector("#forum-body");
  body.innerHTML = `<nav class="forum-categories" aria-label="${tr("Catégories", "Categories")}"><button data-category="all" class="${category === "all" ? "active" : ""}">${tr("Tout", "All")}</button>${Object.keys(
    categoryLabels,
  )
    .map(
      (key) =>
        `<button data-category="${key}" class="${category === key ? "active" : ""}">${label(key)} <small>(${topics.filter((t) => t.category === key).length})</small></button>`,
    )
    .join("")}</nav>
        <div class="forum-tools"><input id="forum-search" aria-label="${tr("Rechercher un sujet", "Search topics")}" placeholder="${tr("Rechercher un sujet…", "Search topics…")}" value="${esc(query)}"><button class="myspace-btn" data-forum="refresh">${tr("Actualiser", "Refresh")}</button></div><div id="forum-topics"></div>
        ${member() ? `<details class="forum-compose"><summary>${admin() ? tr("Créer un sujet", "Create topic") : tr("Demander un sujet", "Request a topic")}</summary><form id="forum-create"><h3>${admin() ? tr("Ouvrir une discussion", "Start a discussion") : tr("Proposer une discussion", "Suggest a discussion")}</h3><p>${admin() ? tr("Ce message sera public.", "This message will be public.") : tr("Un administrateur doit approuver ta demande avant sa publication.", "An administrator must approve your request before publication.")}</p><label>${tr("Catégorie", "Category")}<select name="category">${catOptions()}</select></label><label>${tr("Titre", "Title")}<input name="title" required maxlength="90"></label><label>${tr("Message", "Message")}<textarea name="text" required maxlength="2000" rows="5"></textarea></label><button class="myspace-btn primary">${admin() ? tr("Publier le sujet", "Post topic") : tr("Envoyer la demande", "Send request")}</button><p class="forum-form-status" role="alert"></p></form></details>` : `<p class="community-empty">${tr("Connecte-toi pour demander un sujet ou répondre.", "Sign in to request a topic or reply.")}</p>`}`;
  const select = body.querySelector("select");
  if (select && category !== "all") select.value = category;
  if (member()) {
    const panel = document.createElement("section");
    panel.className = "forum-requests";
    panel.innerHTML = `<h3>${admin() ? tr("Demandes en attente", "Pending requests") : tr("Mes demandes", "My requests")}</h3>${requests.length ? requests.map((r) => `<article class="myspace-box myspace-box-body"><strong>${esc(r.title)}</strong><p>${esc(r.requesterName)} · ${label(r.category)}</p><p style="white-space:pre-wrap">${esc(r.text)}</p>${admin() ? `<button class="myspace-btn" data-request="${esc(r.id)}" data-decision="approve">${tr("Approuver", "Approve")}</button> <button class="myspace-btn" data-request="${esc(r.id)}" data-decision="reject">${tr("Refuser", "Reject")}</button>` : `<small>${r.state === "approved" ? tr("Approuvée", "Approved") : r.state === "rejected" ? tr("Refusée", "Rejected") : tr("En attente de validation", "Awaiting approval")}</small>`}</article>`).join("") : `<p>${tr("Aucune demande en attente.", "No pending requests.")}</p>`}`;
    body.append(panel);
  }
  renderRows();
}
function renderRows() {
  const rows = topics.filter(
    (t) =>
      (category === "all" || t.category === category) &&
      `${t.title} ${t.authorName}`.toLowerCase().includes(query.toLowerCase()),
  );
  const pages = Math.max(1, Math.ceil(rows.length / 20));
  page = Math.min(page, pages - 1);
  host.querySelector("#forum-topics").innerHTML = rows.length
    ? `<table class="forum-table"><thead><tr><th>${tr("Sujet", "Topic")}</th><th>${tr("Réponses", "Replies")}</th><th>${tr("Dernière activité", "Last activity")}</th></tr></thead><tbody>${rows
        .slice(page * 20, page * 20 + 20)
        .map(
          (t) =>
            `<tr><td><button data-topic="${esc(t.id)}">${t.locked ? "🔒 " : ""}${esc(t.title)}</button><small>${label(t.category)} · ${esc(t.authorName)}</small></td><td>${t.replyCount}</td><td>${esc(date(t.lastActivityAt))}</td></tr>`,
        )
        .join(
          "",
        )}</tbody></table><div class="forum-pagination"><button class="myspace-btn" data-forum="previous" ${page === 0 ? "disabled" : ""}>←</button> ${page + 1} / ${pages} <button class="myspace-btn" data-forum="next" ${page + 1 === pages ? "disabled" : ""}>→</button></div>`
    : `<p class="community-empty">${tr("Aucun sujet ici. Lance la première discussion !", "No topics here. Start the first discussion!")}</p>`;
}
async function loadIndex() {
  const token = ++generation;
  chrome();
  status(tr("Chargement…", "Loading…"));
  try {
    const data = await api("/api/forums");
    if (token !== generation || !host) return;
    const pending = member()
      ? await api("/api/forums", null, { view: "requests" })
      : { requests: [] };
    if (token !== generation || !host) return;
    topics = data.topics;
    requests = pending.requests;
    renderIndex();
  } catch (error) {
    if (token === generation && host) status(errorText(error));
  }
}
function postMarkup(post, opening = false) {
  return `<article class="forum-post"><aside><div class="forum-avatar">${esc((post.authorName || "?").slice(0, 1))}</div><strong>${esc(post.authorName)}</strong><small>${tr("Membre", "Member")}</small></aside><div class="forum-post-copy"><header><time>${esc(date(post.createdAt))}</time>${!post.hidden && member() && !current.locked ? `<button class="myspace-btn" data-quote="${esc(post.id)}">${tr("Citer", "Quote")}</button>` : ""}</header><p>${esc(post.hidden ? tr("Message retiré par la modération.", "Message removed by moderation.") : post.text)}</p>${admin() && !opening && !post.hidden ? `<button class="myspace-btn" data-hide-reply="${esc(post.id)}">${tr("Masquer", "Hide")}</button>` : ""}</div></article>`;
}
function renderTopic() {
  chrome();
  host.querySelector("#forum-body").innerHTML =
    `<button class="myspace-btn" data-forum="index">← ${tr("Catégories et sujets", "Categories and topics")}</button><div class="forum-thread-heading"><small>${label(current.category)}</small><h2>${esc(current.title)}</h2>${current.locked ? `<p>${tr("Sujet verrouillé", "Topic locked")}</p>` : ""}
        ${admin() ? `<button class="myspace-btn" data-forum="${current.locked ? "unlock" : "lock"}">${current.locked ? tr("Déverrouiller", "Unlock") : tr("Verrouiller", "Lock")}</button> <button class="myspace-btn" data-forum="hide">${tr("Masquer le sujet", "Hide topic")}</button>` : ""}</div>
        ${postMarkup(current, true)}${replies.map((reply) => postMarkup(reply)).join("")}
        ${member() && !current.locked ? `<form id="forum-reply" class="forum-compose"><label>${tr("Ta réponse", "Your reply")}<textarea name="text" required maxlength="1200" rows="5"></textarea></label><button class="myspace-btn primary">${tr("Publier la réponse", "Post reply")}</button><p class="forum-form-status" role="alert"></p></form>` : `<p>${current.locked ? tr("Les nouvelles réponses sont fermées.", "New replies are closed.") : tr("Connecte-toi pour répondre.", "Sign in to reply.")}</p>`}`;
}
async function openTopic(id) {
  const token = ++generation;
  status(tr("Chargement…", "Loading…"));
  try {
    const data = await api("/api/forums", null, { view: "topic", id });
    if (token !== generation || !host) return;
    current = data.topic;
    replies = data.replies;
    renderTopic();
  } catch (error) {
    if (token === generation && host) status(errorText(error));
  }
}
async function onClick(event) {
  const button = event.target.closest("button");
  if (!button || !host) return;
  if (button.dataset.request) {
    const token = generation;
    button.disabled = true;
    try {
      const data = await api("/api/forums", {
        action: "moderate_request",
        id: button.dataset.request,
        decision: button.dataset.decision,
      });
      if (token !== generation || !host) return;
      if (data.decision === "approve") await openTopic(data.id);
      else await loadIndex();
    } catch (error) {
      if (token === generation && host) {
        status(errorText(error));
        button.disabled = false;
      }
    }
    return;
  }
  if (button.dataset.category) {
    category = button.dataset.category;
    page = 0;
    renderIndex();
    return;
  }
  if (button.dataset.topic) {
    await openTopic(button.dataset.topic);
    return;
  }
  if (button.dataset.quote) {
    const post = [current, ...replies].find(
        (p) => p.id === button.dataset.quote,
      ),
      input = host.querySelector("#forum-reply textarea");
    if (input && post) {
      input.value = (
        `> ${post.authorName}: ${post.text.slice(0, 450).replace(/\n/g, "\n> ")}\n\n` +
        input.value
      ).slice(0, 1200);
      input.focus();
    }
    return;
  }
  const action = button.dataset.forum;
  if (action === "wide") {
    wide = !wide;
    try {
      localStorage.setItem("aq-forum-wide", String(wide));
    } catch {}
    applyWide();
    button.textContent = wide
      ? tr("Vue classique", "Classic view")
      : tr("Vue large", "Wide view");
    button.setAttribute("aria-pressed", String(wide));
    return;
  }
  if (action === "index" || action === "refresh") {
    await loadIndex();
    return;
  }
  if (action === "previous" || action === "next") {
    page += action === "next" ? 1 : -1;
    renderRows();
    return;
  }
  if (["hide", "lock", "unlock"].includes(action) || button.dataset.hideReply) {
    if (
      (action === "hide" || button.dataset.hideReply) &&
      !confirm(tr("Masquer ce contenu public ?", "Hide this public content?"))
    )
      return;
    const token = generation;
    button.disabled = true;
    try {
      await api("/api/forums", {
        action: "moderate",
        topicId: current.id,
        replyId: button.dataset.hideReply,
        operation: button.dataset.hideReply ? "hide" : action,
      });
      if (token !== generation || !host) return;
      if (action === "hide") await loadIndex();
      else await openTopic(current.id);
    } catch (error) {
      if (token === generation && host) {
        status(errorText(error));
        button.disabled = false;
      }
    }
  }
}
async function onSubmit(event) {
  if (!["forum-create", "forum-reply"].includes(event.target.id)) return;
  event.preventDefault();
  const form = event.target,
    token = generation,
    button = form.querySelector("button");
  if (button.disabled) return;
  const values = Object.fromEntries(new FormData(form));
  // Keep the ID across network retries, but a changed payload is a new submission.
  const fingerprint = JSON.stringify(values);
  if (form.dataset.payload !== fingerprint) {
    form.dataset.id = crypto.randomUUID();
    form.dataset.payload = fingerprint;
  }
  button.disabled = true;
  try {
    const create = form.id === "forum-create";
    const data = await api("/api/forums", {
      action: create
        ? admin()
          ? "create_topic"
          : "request_topic"
        : "reply_topic",
      id: form.dataset.id,
      ...values,
      ...(!create ? { topicId: current.id } : {}),
    });
    if (token !== generation || !host) return;
    if (create && !admin()) {
      await loadIndex();
      status(
        tr(
          "Demande envoyée aux administrateurs.",
          "Request sent to the administrators.",
        ),
      );
    } else await openTopic(create ? data.id : current.id);
  } catch (error) {
    if (token === generation && host) {
      form.querySelector("[role=alert]").textContent = errorText(error);
      button.disabled = false;
    }
  }
}
function onInput(event) {
  if (event.target.id === "forum-search") {
    query = event.target.value;
    page = 0;
    renderRows();
  }
}
export function mountForums(element) {
  unmountForums();
  host = element;
  host.addEventListener("click", onClick);
  host.addEventListener("submit", onSubmit);
  host.addEventListener("input", onInput);
  applyWide();
  void loadIndex();
}
export function unmountForums() {
  generation++;
  if (host) {
    host.removeEventListener("click", onClick);
    host.removeEventListener("submit", onSubmit);
    host.removeEventListener("input", onInput);
  }
  host = null;
  applyWide();
}
