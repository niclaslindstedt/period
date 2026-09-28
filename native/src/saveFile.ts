// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT THE WRAPPER DOES WITH AN EXPORT FROM THE PAGE.
//
// The page asks (see `saveFileBridge.ts`); this writes the bytes to the cache
// directory and opens the iOS / Android share sheet over them, then answers.
//
// The bytes are the user's reports — health data. They are never logged,
// only the latest export is kept (in the cache, which the next export clears
// and the OS may purge), and they go to nothing but the share sheet, where
// the user picks the destination.

import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

import {
  UTI,
  bareName,
  saveFileResultScript,
  type SaveFileRequest,
} from "./saveFileBridge";

/** Write the bytes to the cache, open the share sheet, answer. Never throws. */
export async function answerSaveFile(
  request: SaveFileRequest,
  inject: (script: string) => void,
): Promise<void> {
  if (request.version !== 1) {
    inject(saveFileResultScript(request.id, false, "Unsupported version."));
    return;
  }
  // One directory per request, so the file keeps exactly the name the user
  // sees in the sheet. The previous export's directory goes first: it is not
  // deleted when its sheet closes, because an Android target may still be
  // reading it after the chooser has returned.
  const root = `${FileSystem.cacheDirectory}exports/`;
  const dir = `${root}${request.id.replace(/[^\w-]/g, "_")}/`;
  const uri = dir + bareName(request.filename);
  try {
    if (!(await Sharing.isAvailableAsync())) {
      throw new Error("Sharing is not available on this device.");
    }
    await FileSystem.deleteAsync(root, { idempotent: true });
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    await FileSystem.writeAsStringAsync(uri, request.base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    await Sharing.shareAsync(uri, {
      mimeType: request.mimeType,
      UTI: UTI[request.mimeType],
      dialogTitle: bareName(request.filename),
    });
    inject(saveFileResultScript(request.id, true));
  } catch (error) {
    inject(
      saveFileResultScript(
        request.id,
        false,
        error instanceof Error ? error.message : String(error),
      ),
    );
  }
}
