// -----------------------------------------------------------------------------
// Every text the container produces, in the four languages of the Gladys
// interface, with the words of the Miniflux interface (fr "non lus", "flux",
// "catégorie", de "Ungelesen", "Abonnement", es "no leídos", "fuente").
// German says "du", Spanish "usted" (test/i18n.test.js).
// -----------------------------------------------------------------------------

// Feature names (frozen by Gladys at creation).
export const NAMES = {
  en: { unread: 'Unread entries', errors: 'Feeds in error' },
  fr: { unread: 'Articles non lus', errors: 'Flux en erreur' },
  de: { unread: 'Ungelesene Artikel', errors: 'Feeds mit Fehler' },
  es: { unread: 'Artículos no leídos', errors: 'Fuentes con error' },
};

export const STATUS_TEXT = {
  en: {
    none: 'Enter the address of Miniflux and an API key in the configuration.',
    invalid: 'The Miniflux address is not valid: enter an address like 192.168.1.50:8080.',
    token: 'Enter an API key (Miniflux → Settings → API Keys).',
    unauthorized: 'Miniflux refused the API key: create a new one in Settings → API Keys.',
    unreachable: 'Miniflux does not answer: check its address and that it is running.',
    error: 'Miniflux answered with an error: see the logs of the integration.',
    invalid_answer: 'This address does not answer like Miniflux: check the address and the port.',
  },
  fr: {
    none: "Saisissez l'adresse de Miniflux et une clé d'API dans la configuration.",
    invalid:
      "L'adresse de Miniflux n'est pas valide : saisissez une adresse comme 192.168.1.50:8080.",
    token: "Saisissez une clé d'API (Miniflux → Paramètres → Clés d'API).",
    unauthorized:
      "Miniflux a refusé la clé d'API : créez-en une nouvelle dans Paramètres → Clés d'API.",
    unreachable: "Miniflux ne répond pas : vérifiez son adresse et qu'il est démarré.",
    error: "Miniflux a répondu par une erreur : consultez les journaux de l'intégration.",
    invalid_answer: "Cette adresse ne répond pas comme Miniflux : vérifiez l'adresse et le port.",
  },
  de: {
    none: 'Gib in der Konfiguration die Adresse von Miniflux und einen API-Schlüssel ein.',
    invalid: 'Die Miniflux-Adresse ist ungültig: Gib eine Adresse wie 192.168.1.50:8080 ein.',
    token: 'Gib einen API-Schlüssel ein (Miniflux → Einstellungen → API-Schlüssel).',
    unauthorized:
      'Miniflux hat den API-Schlüssel abgelehnt: Erstelle einen neuen unter Einstellungen → API-Schlüssel.',
    unreachable: 'Miniflux antwortet nicht: Prüfe die Adresse und ob es läuft.',
    error: 'Miniflux hat mit einem Fehler geantwortet: Sieh dir die Logs der Integration an.',
    invalid_answer: 'Diese Adresse antwortet nicht wie Miniflux: Prüfe Adresse und Port.',
  },
  es: {
    none: 'Introduzca la dirección de Miniflux y una clave de API en la configuración.',
    invalid:
      'La dirección de Miniflux no es válida: introduzca una dirección como 192.168.1.50:8080.',
    token: 'Introduzca una clave de API (Miniflux → Ajustes → Claves de API).',
    unauthorized: 'Miniflux rechazó la clave de API: cree una nueva en Ajustes → Claves de API.',
    unreachable: 'Miniflux no responde: compruebe su dirección y que esté en marcha.',
    error: 'Miniflux respondió con un error: consulte los registros de la integración.',
    invalid_answer: 'Esta dirección no responde como Miniflux: compruebe la dirección y el puerto.',
  },
};

/** "Test the connection" once Miniflux answered. */
export const TEST_TEXT = {
  en: (user, unread, feeds, errors) =>
    `Connected to Miniflux as ${user}: ${unread} unread entr${unread === 1 ? 'y' : 'ies'}, ${feeds} feed(s), ${errors} in error.`,
  fr: (user, unread, feeds, errors) =>
    `Connecté à Miniflux en tant que ${user} : ${unread} article(s) non lu(s), ${feeds} flux, dont ${errors} en erreur.`,
  de: (user, unread, feeds, errors) =>
    `Mit Miniflux verbunden als ${user}: ${unread} ungelesene(r) Artikel, ${feeds} Feed(s), ${errors} mit Fehler.`,
  es: (user, unread, feeds, errors) =>
    `Conectado a Miniflux como ${user}: ${unread} artículo(s) no leído(s), ${feeds} fuente(s), ${errors} con error.`,
};

export const INIT_FAILED = {
  en: 'The integration could not start: see its logs.',
  fr: "L'intégration n'a pas pu démarrer : consultez ses journaux.",
  de: 'Die Integration konnte nicht starten: Sieh dir ihre Logs an.',
  es: 'La integración no pudo iniciarse: consulte sus registros.',
};

// Errors of the scene actions and of the widget buttons. `{detail}` is the
// reason Miniflux gave.
export const COMMAND_ERRORS = {
  en: {
    timeout: 'Miniflux answered too late: the change may have been made anyway.',
    http: 'Miniflux could not do it: {detail}',
    read: 'Miniflux could not be read: {detail}',
    unreachable: 'Miniflux does not answer: nothing was done.',
    unauthorized: 'Miniflux refused the API key: nothing was done.',
    category: 'This category is not in Miniflux any more: pick another one.',
    ids: 'Enter one or more entry ids (numbers separated by commas).',
  },
  fr: {
    timeout: 'Miniflux a répondu trop tard : la modification a peut-être été faite quand même.',
    http: "Miniflux n'a pas pu le faire : {detail}",
    read: "Miniflux n'a pas pu être lu : {detail}",
    unreachable: "Miniflux ne répond pas : rien n'a été fait.",
    unauthorized: "Miniflux a refusé la clé d'API : rien n'a été fait.",
    category: "Cette catégorie n'existe plus dans Miniflux : choisissez-en une autre.",
    ids: "Saisissez un ou plusieurs identifiants d'article (nombres séparés par des virgules).",
  },
  de: {
    timeout: 'Miniflux hat zu spät geantwortet: Die Änderung wurde vielleicht trotzdem gemacht.',
    http: 'Miniflux konnte es nicht ausführen: {detail}',
    read: 'Miniflux konnte nicht gelesen werden: {detail}',
    unreachable: 'Miniflux antwortet nicht: Es wurde nichts getan.',
    unauthorized: 'Miniflux hat den API-Schlüssel abgelehnt: Es wurde nichts getan.',
    category: 'Diese Kategorie gibt es in Miniflux nicht mehr: Wähle eine andere.',
    ids: 'Gib eine oder mehrere Artikel-IDs ein (Zahlen, durch Kommas getrennt).',
  },
  es: {
    timeout:
      'Miniflux respondió demasiado tarde: puede que el cambio se haya hecho de todos modos.',
    http: 'Miniflux no pudo hacerlo: {detail}',
    read: 'No se pudo leer Miniflux: {detail}',
    unreachable: 'Miniflux no responde: no se ha hecho nada.',
    unauthorized: 'Miniflux rechazó la clave de API: no se ha hecho nada.',
    category: 'Esta categoría ya no existe en Miniflux: elija otra.',
    ids: 'Introduzca uno o varios identificadores de artículo (números separados por comas).',
  },
};

/** The toasts of the widget buttons. */
export const DONE_TEXT = {
  en: { read: 'Marked as read in Miniflux.', refresh: 'Miniflux is refreshing the feeds.' },
  fr: {
    read: 'Marqué comme lu dans Miniflux.',
    refresh: 'Miniflux actualise les flux.',
  },
  de: {
    read: 'In Miniflux als gelesen markiert.',
    refresh: 'Miniflux aktualisiert die Feeds.',
  },
  es: {
    read: 'Marcado como leído en Miniflux.',
    refresh: 'Miniflux está actualizando las fuentes.',
  },
};

/** A coded message in every language, details filled in. */
export function commandMessage(code, values = {}) {
  return Object.fromEntries(
    Object.entries(COMMAND_ERRORS).map(([language, table]) => [
      language,
      (table[code] ?? table.unreachable).replace('{detail}', values.detail ?? '').slice(0, 200),
    ]),
  );
}

/** Every language of a table entry: `{ en: table.en[key], ... }`. */
export const each = (table, key) =>
  Object.fromEntries(Object.entries(table).map(([language, entries]) => [language, entries[key]]));

export const pick = (table, language) => table[language] ?? table.en;
