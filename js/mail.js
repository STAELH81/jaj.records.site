import { api, tr, esc, date, errorText } from "./community-ui.js";
const root = document.getElementById("mail-root");
let epoch = 0,
  user = null,
  messages = [],
  members = [],
  blocks = [],
  folder = "inbox",
  selected = null,
  search = "",
  draft = null,
  busy = false,
  notice = "";
const key = () => `aq-mail-draft-v1:${user.id}`;
const emptyDraft = () => ({
  id: crypto.randomUUID(),
  toId: "",
  subject: "",
  text: "",
});
function saveDraft() {
  if (!user || !draft) return;
  try {
    localStorage.setItem(key(), JSON.stringify(draft));
  } catch {
    notice = tr(
      "Stockage local indisponible : garde cette fenêtre ouverte pour conserver ton brouillon.",
      "Local storage unavailable: keep this window open to retain your draft.",
    );
  }
}
function status(message) {
  notice = message;
  const el = root.querySelector("[role=status]");
  if (el) el.textContent = notice;
}
function messageText(value) {
  return value
    .split(/(https?:\/\/[^\s<>]+)/g)
    .map((part) =>
      /^https?:\/\//.test(part)
        ? `<a href="${esc(part)}" target="_blank" rel="noopener noreferrer">${esc(part)}</a>`
        : esc(part),
    )
    .join("");
}
function currentMessage() {
  return messages.find((m) => m.id === selected);
}
function render() {
  const m = currentMessage();
  root.innerHTML = `<aside class="mail-sidebar"><div class="setting-title" style="margin-top:0">${tr("Dossiers", "Folders")}</div>
        ${[
          ["inbox", tr("Boîte de réception", "Inbox")],
          ["sent", tr("Envoyés", "Sent")],
          ["trash", tr("Corbeille", "Trash")],
          ["draft", tr("Brouillon", "Draft")],
          ["members", tr("Membres", "Members")],
        ]
          .map(
            ([id, label]) =>
              `<button class="mail-folder ${folder === id ? "active" : ""}" data-folder="${id}"><img src="medias/img/folderimg.png" class="tray-icon-img" alt=""><span>${label}</span>${id === "inbox" ? ` <b>(${messages.filter((m) => m.unread && m.folder === "inbox").length})</b>` : ""}</button>`,
          )
          .join("")}
        </aside>
        <main class="mail-main"><div class="mail-toolbar"><button class="retro-btn" data-action="compose" ${!user || busy ? "disabled" : ""}>${tr("Nouveau", "New")}</button><button class="retro-btn" data-action="reply" ${!m || busy ? "disabled" : ""}>${tr("Répondre", "Reply")}</button><button class="retro-btn" data-action="${m?.folder === "trash" ? "delete" : "trash"}" ${!m || busy ? "disabled" : ""}>${tr("Supprimer", "Delete")}</button><button class="retro-btn" data-action="refresh" ${busy ? "disabled" : ""}>${tr("Actualiser", "Refresh")}</button><input id="mail-search" aria-label="${tr("Rechercher", "Search")}" placeholder="${tr("Rechercher…", "Search…")}" value="${esc(search)}"></div>
        <div class="mail-account-strip"><span>${tr("Adresse AQ-Mail :", "AQ-Mail address:")}</span> <strong>${esc(user?.aquertyMail || user?.displayName || "guest@aquerty.fr")}</strong></div><div class="community-status" role="status" aria-live="polite">${esc(notice)}</div>
        ${
          !user
            ? `<p class="community-empty">${tr("Connecte-toi pour envoyer et recevoir des messages privés entre comptes JAJ.", "Sign in to send and receive private messages between JAJ accounts.")}</p>`
            : `<div class="mail-split ${m ? "mail-reading" : ""}"><div class="mail-list" id="mail-list"></div><section class="mail-view" id="mail-view">${m ? renderMessage(m) : `<p class="community-empty">${tr("Choisis un message ou écris à un membre.", "Choose a message or write to a member.")}</p>`}</section></div>`
        }</main>
        <dialog id="mail-editor"><form id="mail-form"><header><h2>${tr("Nouveau message", "New message")}</h2><button class="retro-btn" type="button" data-action="close-editor">×</button></header><p>${tr("Entre comptes JAJ · aucun email externe", "Between JAJ accounts · no external email")}</p>
        <label><span>${tr("À", "To")}</span><select id="mail-to" required><option value="">${tr("Choisir un membre…", "Choose a member…")}</option>${members
          .filter((member) => !blocks.includes(member.id))
          .map(
            (member) =>
              `<option value="${esc(member.id)}">${esc(member.name)} · ${esc(member.id.slice(-6))}</option>`,
          )
          .join("")}</select></label>
        <label><span>${tr("Sujet", "Subject")}</span><input id="mail-subject" maxlength="120" required></label><label><span>Msg</span><textarea id="mail-body" maxlength="5000" required rows="6"></textarea></label>
        <p class="mail-draft-hint">${tr("Brouillon enregistré sur cet appareil pour ton compte.", "Draft saved on this device for your account.")}</p><p id="mail-editor-status" role="alert"></p><button class="retro-btn" type="button" data-action="discard">${tr("Effacer le brouillon", "Discard draft")}</button> <button class="retro-btn" id="mail-send" ${busy ? "disabled" : ""}>${tr("Envoyer", "Send")}</button></form></dialog>`;
  renderList();
}
function renderMessage(m) {
  const other = m.fromId === user.id ? m.toId : m.fromId;
  return `<button class="retro-btn mail-back" data-action="back">← ${tr("Liste", "List")}</button><h2>${esc(m.subject)}</h2><div class="mail-meta"><div><strong>${tr("De :", "From:")}</strong> ${esc(m.fromName)}</div><div><strong>${tr("À :", "To:")}</strong> ${esc(m.toName)}</div><div><strong>${tr("Date :", "Date:")}</strong> ${esc(date(m.createdAt))}</div></div><pre>${messageText(m.text)}</pre><div class="mail-actions">

        ${m.toId === user.id ? `<button class="retro-btn" data-action="unread">${tr("Marquer non lu", "Mark unread")}</button>` : ""}
        ${m.folder === "trash" ? `<button class="retro-btn" data-action="restore">${tr("Restaurer", "Restore")}</button>` : ""}

        <button class="retro-btn" data-action="block" data-target="${esc(other)}">${blocks.includes(other) ? tr("Débloquer ce membre", "Unblock member") : tr("Bloquer ce membre", "Block member")}</button></div>`;
}
function renderList() {
  const list = root.querySelector("#mail-list");
  if (!list) return;
  if (folder === "draft") {
    list.innerHTML = `<button class="mail-item" data-action="draft">${tr("Reprendre le brouillon", "Resume draft")}<br>${esc(draft?.subject || tr("Sans sujet", "No subject"))}</button>`;
    return;
  }
  if (folder === "members") {
    list.innerHTML = members.length
      ? members
          .map(
            (m) =>
              `<div class="mail-item"><strong>${esc(m.name)}</strong><small>${esc(m.id.slice(-6))}</small><button class="retro-btn" data-write="${esc(m.id)}">${tr("Écrire", "Write")}</button> <button class="retro-btn" data-action="block" data-target="${esc(m.id)}">${blocks.includes(m.id) ? tr("Débloquer", "Unblock") : tr("Bloquer", "Block")}</button></div>`,
          )
          .join("")
      : `<p class="community-empty">${tr("Les membres apparaîtront après leur première connexion à cette version.", "Members appear after their first sign-in to this version.")}</p>`;
    return;
  }
  const rows = messages.filter(
    (m) =>
      m.folder === folder &&
      `${m.subject} ${m.fromName} ${m.toName} ${m.text}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  list.innerHTML = rows.length
    ? rows
        .map(
          (m) =>
            `<button class="mail-item ${m.unread ? "unread" : ""} ${selected === m.id ? "active" : ""}" data-message="${esc(m.id)}"><strong>${esc(m.subject)}</strong><span>${esc(m.fromId === user.id ? m.toName : m.fromName)}</span><small>${esc(date(m.createdAt))}</small></button>`,
        )
        .join("")
    : `<p class="community-empty">${tr("Aucun message.", "No messages.")}</p>`;
}
async function refresh() {
  if (!user) {
    render();
    return;
  }
  const token = epoch;
  status(tr("Chargement…", "Loading…"));
  try {
    const [box, directory] = await Promise.all([
      api("/api/aq-mail"),
      api("/api/aq-mail", null, { view: "members" }),
    ]);
    if (token !== epoch) return;
    messages = box.messages;
    members = directory.members;
    blocks = directory.blocks;
    notice = "";
    const editing = root.querySelector("#mail-editor")?.open;
    render();
    if (editing) openEditor();
  } catch (error) {
    if (token === epoch) status(errorText(error));
  }
}
function openEditor(prefill) {
  if (!user) return;
  if (prefill) {
    if (
      (draft?.text || draft?.subject) &&
      !confirm(
        tr("Remplacer ton brouillon actuel ?", "Replace your current draft?"),
      )
    )
      return;
    draft = { ...emptyDraft(), ...prefill };
    saveDraft();
  }
  draft ||= emptyDraft();
  root.querySelector("#mail-to").value = draft.toId;
  root.querySelector("#mail-subject").value = draft.subject;
  root.querySelector("#mail-body").value = draft.text;
  root.querySelector("#mail-editor-status").textContent = "";
  root.querySelector("#mail-editor").showModal();
}
root.addEventListener("input", (event) => {
  if (event.target.id === "mail-search") {
    search = event.target.value;
    renderList();
    return;
  }
  if (["mail-to", "mail-subject", "mail-body"].includes(event.target.id)) {
    draft.toId = root.querySelector("#mail-to").value;
    draft.subject = root.querySelector("#mail-subject").value;
    draft.text = root.querySelector("#mail-body").value;
    saveDraft();
  }
});
root.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!user || busy) return;
  const token = epoch;
  busy = true;
  root.querySelector("#mail-send").disabled = true;
  try {
    await api("/api/aq-mail", { action: "send", ...draft });
    if (token !== epoch) return;
    draft = emptyDraft();
    saveDraft();
    folder = "sent";
    selected = null;
    root.querySelector("#mail-editor").close();
    await refresh();
    if (token === epoch)
      status(
        tr(
          "Message remis à la boîte du destinataire.",
          "Message delivered to the recipient’s inbox.",
        ),
      );
  } catch (error) {
    if (token === epoch)
      root.querySelector("#mail-editor-status").textContent = errorText(error);
  } finally {
    if (token === epoch) {
      busy = false;
      const send = root.querySelector("#mail-send");
      if (send) send.disabled = false;
      root
        .querySelectorAll(".mail-toolbar button")
        .forEach((b) => (b.disabled = false));
    }
  }
});
root.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button || busy) return;
  const token = epoch;
  if (button.dataset.folder) {
    folder = button.dataset.folder;
    selected = null;
    render();
    return;
  }
  try {
    if (button.dataset.message) {
      selected = button.dataset.message;
      const m = currentMessage();
      render();
      if (m?.unread) {
        await api("/api/aq-mail", { action: "read", id: m.id });
        if (token === epoch) {
          m.unread = false;
          render();
        }
      }
      return;
    }
    const action = button.dataset.action;
    if (action === "refresh") {
      await refresh();
      return;
    }
    if (action === "compose" || action === "draft") {
      openEditor();
      return;
    }
    if (action === "discard") {
      if (confirm(tr("Effacer ce brouillon ?", "Discard this draft?"))) {
        draft = emptyDraft();
        saveDraft();
        root.querySelector("#mail-editor").close();
        openEditor();
      }
      return;
    }
    if (action === "close-editor") {
      saveDraft();
      root.querySelector("#mail-editor").close();
      return;
    }
    if (action === "back") {
      selected = null;
      render();
      return;
    }
    if (button.dataset.write) {
      openEditor({ toId: button.dataset.write });
      return;
    }
    if (action === "block") {
      await api("/api/aq-mail", {
        action,
        targetId: button.dataset.target,
        blocked: !blocks.includes(button.dataset.target),
      });
      if (token === epoch) await refresh();
      return;
    }
    const m = currentMessage();
    if (!m) return;
    if (action === "reply") {
      openEditor({
        toId: m.fromId === user.id ? m.toId : m.fromId,
        subject: `Re: ${m.subject}`.slice(0, 120),
        text: `\n\n> ${m.text.slice(0, 3000).replace(/\n/g, "\n> ")}`,
      });
      return;
    }
    if (
      action === "delete" &&
      !confirm(
        tr(
          "Supprimer définitivement ce message de ta boîte ?",
          "Permanently delete this message from your mailbox?",
        ),
      )
    )
      return;
    if (["trash", "restore", "delete", "unread"].includes(action)) {
      await api("/api/aq-mail", { action, id: m.id });
    } else return;
    if (token === epoch) {
      selected = null;
      await refresh();
    }
  } catch (error) {
    if (token === epoch) status(errorText(error));
  }
});
function activate() {
  epoch++;
  user = window.JAJSession?.type === "user" ? window.JAJSession : null;
  messages = [];
  members = [];
  blocks = [];
  selected = null;
  search = "";
  folder = "inbox";
  busy = false;
  notice = "";
  draft = null;
  if (user) {
    try {
      const saved = JSON.parse(localStorage.getItem(key()));
      if (
        saved &&
        typeof saved.id === "string" &&
        typeof saved.subject === "string" &&
        typeof saved.text === "string" &&
        typeof saved.toId === "string"
      )
        draft = saved;
    } catch {
      /* Empty draft when storage is unavailable. */
    }
    draft ||= emptyDraft();
  }
  render();
  const token = epoch;
  if (user)
    void api("/api/aq-mail", { action: "join" })
      .then(() => {
        if (token === epoch) return refresh();
      })
      .catch((error) => {
        if (token === epoch) status(errorText(error));
      });
}
window.addEventListener("jaj:session-changed", activate);
window.addEventListener("aq:mail-open", () => {
  if (!root.querySelector("#mail-editor")?.open) void refresh();
});
window.addEventListener("aq:language-changed", () => {
  const wasOpen = root.querySelector("#mail-editor")?.open;
  render();
  if (wasOpen) openEditor();
});
// Private data and editor are cleared immediately when the account picker opens.
let wasPending = document.body.classList.contains("aq-session-pending");
new MutationObserver(() => {
  const pending = document.body.classList.contains("aq-session-pending");
  if (pending && !wasPending) {
    epoch++;
    user = null;
    messages = [];
    members = [];
    blocks = [];
    draft = null;
    selected = null;
    notice = "";
    render();
  }
  wasPending = pending;
}).observe(document.body, { attributes: true, attributeFilter: ["class"] });
activate();

window.AQMail = {
  compose: async (prefill = {}) => {
    window.openWindow("win-mail", "task-mail");
    if (!user) {
      status(
        tr(
          "Connecte-toi pour écrire un message.",
          "Sign in to write a message.",
        ),
      );
      return;
    }
    const token = epoch;
    await refresh();
    if (token === epoch) openEditor(prefill);
  },
};
