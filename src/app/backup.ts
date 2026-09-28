// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Export and restore. A backup is exactly the document the app stores — no
// wrapper, no proprietary container — so a file taken out of here can be read
// with any text editor and put back with the same code path a cloud pull uses.
//
// The framework owns getting the file out (`saveFile`: a download in a
// browser, the share sheet inside the phone app); this module owns the file's
// name and bytes, and the validation on the way back in.

import {
  MIME_JSON,
  saveFile,
  type SaveFileOutcome,
} from "@niclaslindstedt/oss-framework/files";
import { dayKeyOf } from "@niclaslindstedt/oss-framework/calendar";

import { normalizeDoc, serializeDoc } from "./migrations.ts";
import type { AppData } from "./types.ts";

/** The exported file's name — dated so a folder of backups sorts itself. */
export function backupFileName(today = dayKeyOf(new Date())): string {
  return `cycle-backup-${today}.json`;
}

/** The backup's contents: the stored document, pretty-printed. */
export function backupText(data: AppData): string {
  // Pretty-printed rather than the compact storage form: a backup is a file a
  // person may well open, and the extra bytes are irrelevant at this size.
  return JSON.stringify(JSON.parse(serializeDoc(data)), null, 2);
}

/**
 * Save the whole document to a file the user picks a home for: a download in
 * a browser, the share sheet in the phone app. Rejects only when the phone
 * app could not write or share the file.
 */
export function saveBackup(
  data: AppData,
  today?: string,
): Promise<SaveFileOutcome> {
  return saveFile({
    text: backupText(data),
    filename: backupFileName(today),
    mimeType: MIME_JSON,
  });
}

/**
 * Read a picked file as a document. Throws when the bytes aren't JSON at all;
 * a *shape* problem is not an error — `normalizeDoc` drops what it can't read
 * and keeps every report it can, which is the right outcome for a restore.
 */
export async function readBackupFile(file: File): Promise<AppData> {
  const text = await file.text();
  return normalizeDoc(JSON.parse(text) as unknown);
}
