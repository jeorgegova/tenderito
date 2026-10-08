export function normalizeDocument(document: string): string {
  return document
    .trim()
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '');
}

// Supabase Auth necesita un identificador tipo correo. Este correo interno
// nunca se muestra ni se usa para enviar mensajes al cliente.
export function customerAuthEmail(document: string): string {
  return `cliente.${normalizeDocument(document)}@login.tenderito.app`;
}
