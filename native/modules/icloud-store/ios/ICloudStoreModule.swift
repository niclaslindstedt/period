// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE iCLOUD DOCUMENT STORE, Apple side.
//
// Four operations over the app's own ubiquity container — list, read, write,
// remove — and a fifth that says whether the container can be used at all.
// That is the whole native surface the wrapper adds, and it is deliberately
// file-shaped: the web app's sync engine already speaks a store of files, so
// iCloud slots under the code path it uses for every other backend and no
// part of the cycle log's own logic is reimplemented here. This module
// moves bytes; what is IN them is the app's business.
//
// Three things make this less trivial than a folder on disk, and all three
// are ordinary states a real phone is in:
//
//   • THE FILE MAY NOT BE HERE YET. iCloud lists a file the moment another
//     device writes it, but the bytes arrive later. A plain read then returns
//     nothing and the app would conclude the container is empty — and
//     overwrite a perfectly good document with this device's copy. So a read
//     asks for the download and waits, bounded, for it to land.
//   • ANOTHER PROCESS IS WRITING IT. The sync daemon writes into the same
//     container we do, so every read and write goes through NSFileCoordinator
//     rather than straight at the file. Without it a read can see half a
//     document, which parses as nothing and is indistinguishable from an
//     empty one.
//   • iCLOUD MAY BE SIGNED OUT. Which is the reader's to fix, and a different
//     thing from the container failing to resolve at all — which is the
//     entitlements missing from the build, and the developer's. The two are
//     reported apart because the app says something different about each.

import ExpoModulesCore

/// The container both halves address. Kept in step with `../index.ts` and
/// `app.config.js`'s three iCloud entitlements — changing it after release
/// strands every document already synced under the old identifier.
private let CONTAINER_ID = "iCloud.se.agilator.cycle"

/// The subdirectory the documents sit in. `Documents` is the one iCloud
/// publishes to the Files app, so the user can open the file holding their
/// own reports.
private let DIRECTORY = "Documents"

/// How a failure names itself, so the JavaScript side can route it without
/// depending on how ExpoModulesCore derives an error code. Mirrored in
/// `../index.ts`.
private let SIGNED_OUT_MARKER = "signed-out:"
private let UNAVAILABLE_MARKER = "unavailable:"

/// How long a read waits for iCloud to bring a file down before giving up.
/// A cycle log is tens of kilobytes, so this is generous; the point of the
/// ceiling is that a device with no connection fails as "offline" in a few
/// seconds instead of hanging the sync engine forever.
private let DOWNLOAD_TIMEOUT: TimeInterval = 20

/// How often the download wait re-checks. Short enough that a local file is
/// not made to feel remote, long enough not to spin.
private let DOWNLOAD_POLL: TimeInterval = 0.2

/// Where every one of this module's functions runs.
///
/// Not the module's own queue, and not the main thread: resolving the
/// container reaches the ubiquity daemon, and a read waits — for seconds, on
/// a file another device has only just written. Both would otherwise hold up
/// everything else the module has been asked to do. Serial, so two writes
/// cannot interleave inside the container.
private let WORK_QUEUE = DispatchQueue(
  label: "se.agilator.cycle.icloud-store", qos: .utility
)

public class ICloudStoreModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ICloudStore")

    /// Whether the store can be used. Never prompts and never reaches the
    /// network: it resolves the container URL, which is a local question.
    AsyncFunction("status") { () -> String in
      if FileManager.default.ubiquityIdentityToken == nil { return "signed-out" }
      return documentsURL() == nil ? "unavailable" : "ready"
    }.runOnQueue(WORK_QUEUE)

    /// Every file in the store's directory, with its revision.
    ///
    /// Placeholders count. A file another device has written but this one has
    /// not downloaded yet is listed by iCloud as `.name.icloud`; reporting it
    /// under its real name is what stops the app from deciding the container
    /// is empty and pushing over it.
    AsyncFunction("list") { () -> [[String: String]] in
      let directory = try requireDocumentsURL()
      let keys: [URLResourceKey] = [
        .fileSizeKey, .contentModificationDateKey, .isDirectoryKey,
      ]
      // NOT `.skipsHiddenFiles`, and that is the whole point: a file another
      // device has written but this one has not downloaded yet is listed as
      // `.name.icloud`, which IS a hidden file. Skipping those would hide
      // exactly the case this listing exists to catch — the app would read an
      // empty container and push its own copy over a newer one. So everything
      // is listed and `isListable` drops the dot-files that are not
      // placeholders.
      let urls =
        (try? FileManager.default.contentsOfDirectory(
          at: directory,
          includingPropertiesForKeys: keys,
          options: []
        )) ?? []

      // A placeholder and its downloaded twin never coexist, but a directory
      // listing is not atomic — folding by name means a read during the
      // transition cannot report the same document twice with two revisions.
      var byName: [String: [String: String]] = [:]
      for url in urls {
        guard isListable(url) else { continue }
        let values = try? url.resourceValues(forKeys: Set(keys))
        if values?.isDirectory == true { continue }
        let name = realName(of: url)
        var entry: [String: String] = ["path": name]
        if let rev = revision(of: url) { entry["rev"] = rev }
        byName[name] = entry
      }
      return Array(byName.values)
    }.runOnQueue(WORK_QUEUE)

    /// One file's text, or `nil` when it is not there.
    ///
    /// Waits for the bytes when iCloud has only the placeholder — see the
    /// header. A file that never finishes downloading is reported as a
    /// failure rather than as an empty document, because "empty" is a
    /// perfectly valid document and would be merged as one.
    AsyncFunction("read") { (path: String) -> String? in
      let url = try fileURL(for: path)
      guard let present = try ensureDownloaded(url) else { return nil }
      var text: String?
      var readError: Error?
      var coordinationError: NSError?
      NSFileCoordinator(filePresenter: nil).coordinate(
        readingItemAt: present, options: [], error: &coordinationError
      ) { readable in
        do {
          text = try String(contentsOf: readable, encoding: .utf8)
        } catch {
          // A file that vanished between the check and the read is simply
          // absent; anything else is a real failure.
          if (error as NSError).code == NSFileReadNoSuchFileError { text = nil } else {
            readError = error
          }
        }
      }
      if let coordinationError { throw ICloudStoreException(coordinationError.localizedDescription) }
      if let readError { throw ICloudStoreException(readError.localizedDescription) }
      return text
    }.runOnQueue(WORK_QUEUE)

    /// Create or overwrite one file.
    ///
    /// `coordinate(writingItemAt:options: .forReplacing)` is what lets the
    /// sync daemon see one complete version rather than a file that grew: it
    /// hands us a URL to write, and publishes the result as a single change.
    AsyncFunction("write") { (path: String, text: String) in
      let url = try fileURL(for: path)
      var writeError: Error?
      var coordinationError: NSError?
      NSFileCoordinator(filePresenter: nil).coordinate(
        writingItemAt: url, options: .forReplacing, error: &coordinationError
      ) { writable in
        do {
          try text.write(to: writable, atomically: true, encoding: .utf8)
        } catch {
          writeError = error
        }
      }
      if let coordinationError { throw ICloudStoreException(coordinationError.localizedDescription) }
      if let writeError { throw ICloudStoreException(writeError.localizedDescription) }
    }.runOnQueue(WORK_QUEUE)

    /// Delete one file. A file that is already gone is not an error — the
    /// caller asked for it to be absent, and it is.
    AsyncFunction("remove") { (path: String) in
      let url = try fileURL(for: path)
      var removeError: Error?
      var coordinationError: NSError?
      NSFileCoordinator(filePresenter: nil).coordinate(
        writingItemAt: url, options: .forDeleting, error: &coordinationError
      ) { deletable in
        do {
          try FileManager.default.removeItem(at: deletable)
        } catch {
          let code = (error as NSError).code
          if code != NSFileNoSuchFileError, code != NSFileReadNoSuchFileError {
            removeError = error
          }
        }
      }
      if let coordinationError { throw ICloudStoreException(coordinationError.localizedDescription) }
      if let removeError { throw ICloudStoreException(removeError.localizedDescription) }
    }.runOnQueue(WORK_QUEUE)
  }
}

// MARK: - the container

/// The store's directory, created on first use, or `nil` when the container
/// does not resolve.
///
/// `url(forUbiquityContainerIdentifier:)` reaches the daemon and can take a
/// moment, which is why every entry point here is an `AsyncFunction` — none
/// of this may run on the main thread.
private func documentsURL() -> URL? {
  guard
    let container = FileManager.default.url(forUbiquityContainerIdentifier: CONTAINER_ID)
  else { return nil }
  let directory = container.appendingPathComponent(DIRECTORY, isDirectory: true)
  if !FileManager.default.fileExists(atPath: directory.path) {
    try? FileManager.default.createDirectory(
      at: directory, withIntermediateDirectories: true
    )
  }
  return directory
}

/// The store's directory, or the failure that says why there isn't one.
private func requireDocumentsURL() throws -> URL {
  if FileManager.default.ubiquityIdentityToken == nil {
    throw ICloudStoreException("\(SIGNED_OUT_MARKER) no iCloud account is signed in on this device.")
  }
  guard let directory = documentsURL() else {
    throw ICloudStoreException(
      "\(UNAVAILABLE_MARKER) the iCloud container \(CONTAINER_ID) did not resolve — check the app's entitlements."
    )
  }
  return directory
}

/// The URL one relative path names inside the store.
///
/// The store is flat and the app writes exactly one file into it, so a path
/// is a file NAME: anything with a separator in it, or the two relative
/// specials, is refused rather than resolved. A store that let a path climb
/// out of its directory would be a store that could be asked to write
/// anywhere in the container.
private func fileURL(for path: String) throws -> URL {
  let directory = try requireDocumentsURL()
  if path.isEmpty || path.contains("/") || path == "." || path == ".." {
    throw ICloudStoreException("\(path) is not a file name this store can address.")
  }
  return directory.appendingPathComponent(path, isDirectory: false)
}

// MARK: - placeholders and revisions

/// Whether a listed URL is a document of ours at all.
///
/// Everything in the directory is listed, placeholders included (see `list`),
/// so this is where the other dot-files go: `.DS_Store`, and whatever else
/// ends up beside a synced folder. A leading dot is only kept when it is
/// iCloud's own `.name.icloud` stub.
private func isListable(_ url: URL) -> Bool {
  let name = url.lastPathComponent
  if !name.hasPrefix(".") { return true }
  return name.hasSuffix(".icloud") && name.count > ".icloud".count + 1
}

/// What a listed URL is really called. iCloud names a not-yet-downloaded file
/// `.name.icloud`; the document it stands for is `name`.
private func realName(of url: URL) -> String {
  let name = url.lastPathComponent
  guard name.hasPrefix("."), name.hasSuffix(".icloud") else { return name }
  return String(name.dropFirst().dropLast(".icloud".count))
}

/// An opaque token that changes when a file's bytes do: its modification date
/// and its size. Nothing interprets it — the framework only ever compares two
/// of them — so the exact spelling matters less than that it moves.
private func revision(of url: URL) -> String? {
  guard
    let values = try? url.resourceValues(forKeys: [
      .contentModificationDateKey, .fileSizeKey,
    ])
  else { return nil }
  let stamp = values.contentModificationDate?.timeIntervalSince1970 ?? 0
  let size = values.fileSize ?? 0
  // Microseconds as an integer rather than a formatted double: the token is
  // only ever compared with another of its own, so what matters is that it is
  // spelled the same way every time and moves when the file does.
  return "\(Int((stamp * 1_000_000).rounded())):\(size)"
}

/// The URL to read, once its bytes are actually here — or `nil` when the file
/// does not exist at all.
///
/// Three cases: the file is local (return it), iCloud has only a placeholder
/// (ask for the download and wait), or there is nothing under either name
/// (return nil). The wait is bounded; running out of time is a failure, not
/// an empty document.
private func ensureDownloaded(_ url: URL) throws -> URL? {
  let manager = FileManager.default
  if manager.fileExists(atPath: url.path) {
    // Present, but possibly still a stub whose contents are on their way.
    if downloadIsCurrent(url) { return url }
  }

  let placeholder = url
    .deletingLastPathComponent()
    .appendingPathComponent(".\(url.lastPathComponent).icloud", isDirectory: false)
  let exists = manager.fileExists(atPath: url.path) || manager.fileExists(atPath: placeholder.path)
  if !exists { return nil }

  try? manager.startDownloadingUbiquitousItem(at: url)

  let deadline = Date().addingTimeInterval(DOWNLOAD_TIMEOUT)
  while Date() < deadline {
    if manager.fileExists(atPath: url.path), downloadIsCurrent(url) { return url }
    Thread.sleep(forTimeInterval: DOWNLOAD_POLL)
  }
  throw ICloudStoreException(
    "\(UNAVAILABLE_MARKER) \(url.lastPathComponent) is in iCloud but has not finished downloading."
  )
}

/// Whether the file's contents — not just its stub — are on this device.
private func downloadIsCurrent(_ url: URL) -> Bool {
  guard
    let status = try? url.resourceValues(forKeys: [.ubiquitousItemDownloadingStatusKey])
      .ubiquitousItemDownloadingStatus
  else {
    // Not a ubiquitous item as far as the system is concerned, which is what
    // a plain local file looks like. Nothing to wait for.
    return true
  }
  return status == .current
}

/// Every failure this module raises, carrying its own message.
///
/// `GenericException<String>` rather than a bare `Exception` subclass because
/// that is the one ExpoModulesCore shape that takes a payload — and the
/// payload is the whole point here: the message's marker prefix is what the
/// JavaScript side routes on.
internal final class ICloudStoreException: GenericException<String> {
  override var reason: String { param }
}
