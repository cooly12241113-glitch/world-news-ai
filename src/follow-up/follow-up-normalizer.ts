const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;

export const MAX_FOLLOW_UP_TEXT_LENGTH = 1_000;

export function normalizeFollowUpText(text: string): string {
  return text.normalize("NFC").trim().replace(/\s+/gu, " ");
}

export function containsDisallowedControlCharacter(text: string): boolean {
  return CONTROL_CHARACTERS.test(text);
}
