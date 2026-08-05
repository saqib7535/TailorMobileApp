/* ============================================================
   NativeSave — the one place in the app that knows how to get a
   generated file (invoice PDF, tailor copy, backup, ...) out of the
   WebView and onto the device.

   WHY THIS EXISTS
   ----------------
   Two things that work fine in a desktop browser silently fail
   inside an Android WebView (Capacitor):

   1. `<a download href="blob:...">.click()` — desktop browsers save
      this straight to Downloads. Android's WebView has no download
      manager wired up for it by default, so the click does nothing.

   2. `<iframe src="blob:...">` for previewing a PDF — desktop Chrome
      has a built-in PDF viewer that renders blob: PDFs inline.
      Android's system WebView does NOT expose that viewer to embedded
      content, so the iframe just stays blank.

   THE FIX
   -------
   On a native Android build we never rely on blob: URLs at all.
   Instead we write the file to the app's cache folder via
   @capacitor/filesystem, and:
     - for PREVIEW: the caller renders a plain HTML mock-up instead of
       trying to show the real PDF inline (see ui/documents.js) — no
       file write needed at all for that.
     - for DOWNLOAD / PRINT: hand the saved file to Android's native
       Share sheet via @capacitor/share, so the user can save it to
       Downloads/Drive, send it over WhatsApp, or open it in any PDF
       viewer that has its own Print button.

   On a plain desktop browser (npm run dev) none of this is needed,
   so we keep the original blob:/`<a download>` behaviour there.
   ============================================================ */

const NativeSave = (function () {
  function isNative() {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  }

  function plugins() {
    return (window.Capacitor && window.Capacitor.Plugins) || {};
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = String(reader.result || '');
        const comma = result.indexOf(',');
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      reader.onerror = () => reject(reader.error || new Error('Failed to read blob'));
      reader.readAsDataURL(blob);
    });
  }

  function safeFileName(name) {
    return String(name).replace(/[\\/:*?"<>|]+/g, '_');
  }

  async function writeToCache(blob, fileName) {
    const { Filesystem } = plugins();
    if (!Filesystem) throw new Error('Filesystem plugin not available');
    const name = safeFileName(fileName);
    const data = await blobToBase64(blob);
    await Filesystem.writeFile({ path: name, data, directory: 'CACHE' });
    const { uri } = await Filesystem.getUri({ path: name, directory: 'CACHE' });
    return { uri, fileName: name };
  }

  /* Save-and-share flow used by "Download" / "Print" buttons.
     - native: writes the file, then opens Android's native Share sheet
       (Save to Files/Drive, send via WhatsApp/Email, or open with any
       PDF viewer/print service that registers as a share target).
     - web: normal same-tab download via a temporary <a download>. */
  async function shareBlob(blob, fileName, opts) {
    opts = opts || {};
    if (!isNative()) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = safeFileName(fileName);
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      return { via: 'download' };
    }
    const { Share } = plugins();
    const { uri } = await writeToCache(blob, fileName);
    if (!Share || !Share.share) throw new Error('Share plugin not available');
    await Share.share({
      title: opts.title || fileName,
      dialogTitle: opts.dialogTitle || 'Save / Print / Share',
      url: uri
    });
    return { via: 'share', uri };
  }

  return { isNative, blobToBase64, writeToCache, shareBlob };
})();
