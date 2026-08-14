// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Export and restore. A backup is exactly the document the app stores — no
// wrapper, no proprietary container — so a file taken out of here can be read
// with any text editor and put back with the same code path a cloud pull uses.
//
// The framework owns the browser download plumbing (`downloadText`); this
// module owns the file name and the validation on the way back in.

import { MIME_JSON, downloadText } from "@niclaslindstedt/oss-framework/files";
import { dayKeyOf } from "@niclaslindstedt/oss-framework/calendar";

import { normalizeDoc, serializeDoc } from "./migrations.ts";
import type { AppData } from "./types.ts";

/** The exported file's name — dated so a folder of backups sorts itself. */
export function backupFileName(today = dayKeyOf(new Date())): string {
  return `period-backup-${today}.json`;
}

/** Save the whole document to a file the user picks a home for. */
export function downloadBackup(data: AppData): void {
  // Pretty-printed rather than the compact storage form: a backup is a file a
  // person may well open, and the extra bytes are irrelevant at this size.
  const pretty = JSON.stringify(JSON.parse(serializeDoc(data)), null, 2);
  downloadText(backupFileName(), pretty, MIME_JSON);
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
