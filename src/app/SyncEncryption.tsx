// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import type {
  EncryptionLabels,
  PinGateLabels,
  PinLockControlLabels,
} from "@niclaslindstedt/oss-framework/encryption";
import {
  PASSPHRASE_MIN_LENGTH,
  PIN_MIN_LENGTH,
} from "@niclaslindstedt/oss-framework/encryption";

import { useT } from "./i18n/index.ts";

// The app's words for the framework's encryption kit. The machinery —
// `useEncryption` (wired in `useSyncEngine.ts`), the `EncryptionGate` in the
// shell, `EncryptionSettings` under Sync, and the PIN's `AppLock` and
// `PinLockControl` — is the framework's; this file only translates it, so
// every string still goes through `t()`.

/** The encryption kit's copy, naming the backend the copy goes to. */
export function useEncryptionLabels(providerName: string): EncryptionLabels {
  const t = useT();
  const name = { name: providerName };
  return {
    on: t("encryption.headline"),
    requiredHint: t("encryption.required", name),
    rememberedHint: t("encryption.on"),
    checking: t("encryption.checking", name),
    setupNeeded: t("encryption.paused"),
    lockedStatus: t("encryption.paused"),
    changedStatus: t("encryption.changedHint"),
    unreachable: t("encryption.unreachable", name),
    setPassphrase: t("encryption.set"),
    unlock: t("encryption.unlockSubmit"),
    changePassphrase: t("encryption.change"),
    retry: t("encryption.retry"),
    cancel: t("common.cancel"),
    close: t("common.close"),
    createTitle: t("encryption.createTitle"),
    createHint: t("encryption.createHint", name),
    unlockTitle: t("encryption.unlockTitle"),
    unlockHint: t("encryption.unlockHint", name),
    unlockHintRemote: t("encryption.unlockHint", name),
    changedTitle: t("encryption.changedTitle"),
    changedHint: t("encryption.changedHint"),
    changeTitle: t("encryption.changeTitle"),
    changeHint: t("encryption.changeHint", name),
    noRecovery: t("encryption.noRecovery", name),
    passphrase: t("encryption.passphrase"),
    confirm: t("encryption.confirm"),
    createSubmit: t("encryption.createSubmit"),
    changeSubmit: t("encryption.changeSubmit"),
    tooShort: t("encryption.tooShort", { min: PASSPHRASE_MIN_LENGTH }),
    mismatch: t("encryption.mismatch"),
    wrong: t("encryption.wrong"),
    offline: t("encryption.offline", name),
    failed: t("encryption.failed"),
    steps: {
      reading: t("encryption.working"),
      derivingKey: t("encryption.working"),
      encrypting: t("encryption.working"),
      decrypting: t("encryption.working"),
      saving: t("encryption.working"),
      finalizing: t("encryption.working"),
    },
  };
}

/** The PIN gate's copy. */
export function usePinGateLabels(): PinGateLabels {
  const t = useT();
  return {
    title: t("pin.gateTitle"),
    hint: t("pin.gateHint"),
    pin: t("pin.gateLabel"),
    submit: t("pin.gateSubmit"),
    wrong: t("pin.gateWrong"),
    clear: t("common.close"),
  };
}

/** The app-lock settings control's copy. */
export function usePinControlLabels(): PinLockControlLabels {
  const t = useT();
  return {
    on: t("pin.on"),
    off: t("pin.off"),
    hint: t("pin.hint"),
    softWarning: t("pin.softWarning"),
    set: t("pin.set"),
    change: t("pin.change"),
    remove: t("pin.remove"),
    pin: t("pin.label"),
    confirm: t("pin.confirm"),
    current: t("pin.current"),
    save: t("common.save"),
    cancel: t("common.cancel"),
    tooShort: t("pin.tooShort", { min: PIN_MIN_LENGTH }),
    mismatch: t("pin.mismatch"),
    wrong: t("pin.wrong"),
  };
}
