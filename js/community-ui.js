export const tr = (fr, en) =>
  document.documentElement.lang === "en" ? en : fr;
export const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const date = (value) =>
  new Intl.DateTimeFormat(
    document.documentElement.lang === "en" ? "en-GB" : "fr-FR",
    { dateStyle: "short", timeStyle: "short" },
  ).format(new Date(value));
export async function api(path, payload, query = {}) {
  const url = new URL(path, location.origin);
  Object.entries(query).forEach(([k, v]) => url.searchParams.set(k, v));
  const response = await fetch(url, {
    method: payload ? "POST" : "GET",
    credentials: "same-origin",
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
    headers: payload ? { "Content-Type": "application/json" } : {},
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "service_unavailable");
  return data;
}
export function errorText(error) {
  const labels = {
    login_required: ["Connecte-toi pour continuer.", "Sign in to continue."],
    recipient_unavailable: [
      "Ce destinataire est indisponible.",
      "This recipient is unavailable.",
    ],
    rate_limited: [
      "Limite horaire atteinte. Réessaie plus tard.",
      "Hourly limit reached. Try again later.",
    ],
    conflict: [
      "Ce contenu a changé ou cette tentative a déjà été utilisée. Actualise avant de réessayer.",
      "This content changed or this attempt was already used. Refresh before retrying.",
    ],
    topic_locked: ["Ce sujet est verrouillé.", "This topic is locked."],
    not_found: [
      "Ce contenu est introuvable ou a été retiré.",
      "This content is unavailable or was removed.",
    ],
    invalid_text: [
      "Vérifie le titre, le texte et leur longueur.",
      "Check the title, text and their length.",
    ],
    admin_required: [
      "Cette action est réservée aux administrateurs.",
      "This action requires an administrator.",
    ],
  };
  return tr(
    ...(labels[error.message] || [
      "Service indisponible. Ton texte est conservé ; réessaie.",
      "Service unavailable. Your text is kept; please retry.",
    ]),
  );
}
