// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useEffect, useState } from "react";

import {
  Button,
  LockIcon,
  UnlockGate,
} from "@niclaslindstedt/oss-framework/components";
import {
  PASSPHRASE_MIN_LENGTH,
  PIN_MIN_LENGTH,
  PassphraseDialog,
  PinLockControl,
  WrongPasswordError,
  type PassphraseDialogMode,
  type PinLock,
  type RequiredEncryption,
} from "@niclaslindstedt/oss-framework/encryption";
import { isOfflineError } from "@niclaslindstedt/oss-framework/storage";

import { useT } from "./i18n/index.ts";

// The app's side of two framework pieces: encryption that a copy outside this
// device requires (`useRequiredEncryption`, wired in `useSyncEngine.ts`), and
// the PIN app lock (`usePinLock`, wired in `App.tsx`). The framework owns the
// state and the dialogs; this file owns the words and where they sit.

/** The states in which sync is held until a passphrase is given. */
const ASKING: ReadonlySet<string> = new Set(["create", "unlock", "changed"]);

/**
 * Which passphrase question is open, if any. Opens by itself whenever sync
 * lands in a state that needs an answer — after a connect, on a device that
 * finds an encrypted copy, after the passphrase changed elsewhere — and can be
 * put off with Cancel; Settings reopens it.
 */
export function usePassphrasePrompt(
  encryption: RequiredEncryption,
  paused: boolean,
) {
  const [mode, setMode] = useState<PassphraseDialogMode | null>(null);
  useEffect(() => {
    if (paused) return;
    if (ASKING.has(encryption.state)) {
      setMode(encryption.state as PassphraseDialogMode);
    } else if (encryption.state !== "ready") {
      setMode(null);
    }
  }, [encryption.state, paused]);
  return { mode, open: setMode, close: () => setMode(null) };
}

export function PassphrasePrompt({
  encryption,
  providerName,
  mode,
  onClose,
  onChanged,
}: {
  encryption: RequiredEncryption;
  providerName: string;
  mode: PassphraseDialogMode | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const t = useT();
  const name = { name: providerName };
  return (
    <PassphraseDialog
      open={mode !== null}
      mode={mode ?? "create"}
      onClose={onClose}
      onSubmit={async (passphrase) => {
        if (mode === "create") await encryption.create(passphrase);
        else if (mode === "change") {
          await encryption.change(passphrase);
          onChanged();
        } else await encryption.unlock(passphrase);
        onClose();
      }}
      mapError={(err) =>
        err instanceof WrongPasswordError
          ? t("encryption.wrong")
          : isOfflineError(err)
            ? t("encryption.offline", name)
            : null
      }
      minLength={PASSPHRASE_MIN_LENGTH}
      labels={{
        createTitle: t("encryption.createTitle"),
        createHint: t("encryption.createHint", name),
        unlockTitle: t("encryption.unlockTitle"),
        unlockHint: t("encryption.unlockHint", name),
        changedTitle: t("encryption.changedTitle"),
        changedHint: t("encryption.changedHint"),
        changeTitle: t("encryption.changeTitle"),
        changeHint: t("encryption.changeHint", name),
        noRecovery: t("encryption.noRecovery", name),
        passphrase: t("encryption.passphrase"),
        confirm: t("encryption.confirm"),
        createSubmit: t("encryption.createSubmit"),
        unlockSubmit: t("encryption.unlockSubmit"),
        changeSubmit: t("encryption.changeSubmit"),
        cancel: t("common.cancel"),
        close: t("common.close"),
        tooShort: t("encryption.tooShort", { min: PASSPHRASE_MIN_LENGTH }),
        mismatch: t("encryption.mismatch"),
        wrong: t("encryption.wrong"),
        failed: t("encryption.failed"),
        working: t("encryption.working"),
      }}
    />
  );
}

/** The encryption lines under the sync picker, while a copy is connected. */
export function EncryptionStatus({
  encryption,
  providerName,
  onAsk,
  disabled,
}: {
  encryption: RequiredEncryption;
  providerName: string;
  onAsk: (mode: PassphraseDialogMode) => void;
  disabled?: boolean;
}) {
  const t = useT();
  const name = { name: providerName };
  const { state } = encryption;
  if (state === "off") return null;
  return (
    <div className="flex items-start gap-2 rounded-md border border-line bg-surface-2 px-2.5 py-2">
      <LockIcon
        className={`mt-0.5 h-4 w-4 shrink-0 ${state === "ready" ? "text-accent" : "text-muted"}`}
      />
      <div className="flex flex-1 flex-col gap-1.5">
        <p className="text-xs text-muted">{t("encryption.required", name)}</p>
        <p className="text-xs font-medium text-fg">
          {state === "ready"
            ? t("encryption.on")
            : state === "checking"
              ? t("encryption.checking", name)
              : state === "unreachable"
                ? t("encryption.unreachable", name)
                : t("encryption.paused")}
        </p>
        <div className="flex flex-wrap gap-2">
          {state === "ready" && (
            <Button onClick={() => onAsk("change")} disabled={disabled}>
              {t("encryption.change")}
            </Button>
          )}
          {state === "create" && (
            <Button
              variant="primary"
              onClick={() => onAsk("create")}
              disabled={disabled}
            >
              {t("encryption.set")}
            </Button>
          )}
          {(state === "unlock" || state === "changed") && (
            <Button
              variant="primary"
              onClick={() => onAsk(state)}
              disabled={disabled}
            >
              {t("encryption.enter")}
            </Button>
          )}
          {state === "unreachable" && (
            <Button onClick={encryption.recheck} disabled={disabled}>
              {t("encryption.retry")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** The full-screen PIN gate. Rendered instead of the app while locked. */
export function AppLockGate({ pin }: { pin: PinLock }) {
  const t = useT();
  return (
    <UnlockGate
      open={pin.locked}
      inputMode="numeric"
      icon={<LockIcon className="h-6 w-6" />}
      onUnlock={async (code) => {
        if (!(await pin.unlock(code))) throw new Error("wrong PIN");
      }}
      labels={{
        title: t("pin.gateTitle"),
        hint: t("pin.gateHint"),
        passphrase: t("pin.gateLabel"),
        unlock: t("pin.gateSubmit"),
        error: t("pin.gateWrong"),
        clear: t("common.close"),
      }}
    />
  );
}

/** The PIN control, for the app-lock section in Settings. */
export function AppLockSettings({
  pin,
  disabled,
}: {
  pin: PinLock;
  disabled?: boolean;
}) {
  const t = useT();
  return (
    <PinLockControl
      pin={pin}
      disabled={disabled}
      labels={{
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
      }}
    />
  );
}
