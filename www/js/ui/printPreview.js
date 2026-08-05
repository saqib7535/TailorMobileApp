/* ============================================================
   PrintPreview — modal that shows what an invoice/tailor-copy/report
   will look like before printing, with a Thermal 58mm / Thermal
   80mm / A4 paper-size toggle.

   IMPORTANT: the on-screen preview is an HTML mock-up (opts.buildPreviewHtml),
   NOT the actual generated PDF rendered in an <iframe>. Android's system
   WebView has no built-in PDF renderer for embedded content, so an
   <iframe src="blob:..."> reliably shows blank on real devices —
   that was the "print preview khali aata hai" bug. Plain HTML/CSS
   always renders, so that's what the preview uses.

   The real jsPDF document (opts.buildDoc) is still generated in the
   background and is what actually gets downloaded/shared/printed —
   see ui/nativeSave.js for why that also can't just be a `<a download>`
   click on Android.

   PrintPreview.open({
     title: 'Invoice',
     filename: 'TS-2026-000001.pdf',
     defaultSize: 'thermal80',
     buildDoc: async (paperSize) => jsPDFInstance,
     buildPreviewHtml: async (paperSize) => '<div>...</div>'   // optional but recommended
   })
   ============================================================ */

const PrintPreview = (function () {
  function sizeLabel(size) {
    return { thermal58: 'print.thermal58', thermal80: 'print.thermal80', a4: 'print.a4' }[size];
  }

  async function open(opts) {
    const sizes = opts.sizes || ['thermal58', 'thermal80', 'a4'];
    let activeSize = opts.defaultSize || sizes[0];

    const sheet = Modal.open(`
      <div class="modal-header">
        <h3>${opts.title || I18n.t('print.title')}</h3>
        <button class="icon-btn" id="pp-close">${Icons.svg('close', 20)}</button>
      </div>
      <div class="field" style="margin-bottom:10px">
        <label data-i18n="print.paperSize"></label>
        <div class="tabs" id="pp-size-tabs" style="padding:0">
          ${sizes.map((s) => `<div class="tab-chip ${s === activeSize ? 'active' : ''}" data-size="${s}" data-i18n="${sizeLabel(s)}"></div>`).join('')}
        </div>
      </div>
      <div id="pp-viewer-wrap" style="background:var(--color-surface-alt);border:1px solid var(--color-border);border-radius:var(--radius-md);overflow-y:auto;height:52vh;position:relative">
        <div id="pp-spinner" style="display:flex;flex-direction:column;align-items:center;gap:10px;justify-content:center;height:100%">
          <div class="spinner dark"></div>
          <span class="text-muted" style="font-size:12.5px" data-i18n="print.generating"></span>
        </div>
        <div id="pp-viewer" style="display:none"></div>
      </div>
      <div class="flex gap-8 mt-16">
        <button class="btn btn-outline btn-block" id="pp-download">${Icons.svg('download', 16)} <span data-i18n="print.downloadBtn"></span></button>
        <button class="btn btn-primary btn-block" id="pp-print">${Icons.svg('printer', 16)} <span data-i18n="print.printBtn"></span></button>
      </div>
    `, { center: true });
    I18n.apply(sheet);
    sheet.style.maxWidth = '520px';
    sheet.style.width = '94vw';

    const viewer = sheet.querySelector('#pp-viewer');
    const spinner = sheet.querySelector('#pp-spinner');
    let currentDoc = null;

    async function rebuild(size) {
      activeSize = size;
      spinner.style.display = 'flex';
      viewer.style.display = 'none';
      sheet.querySelectorAll('#pp-size-tabs .tab-chip').forEach((el) => {
        el.classList.toggle('active', el.getAttribute('data-size') === size);
      });
      try {
        const [doc, html] = await Promise.all([
          opts.buildDoc(size),
          opts.buildPreviewHtml ? opts.buildPreviewHtml(size) : Promise.resolve(null)
        ]);
        currentDoc = doc;
        if (html) {
          viewer.innerHTML = html;
        } else {
          // Fallback for any caller without buildPreviewHtml yet —
          // best-effort, may still render blank on some Android
          // WebView builds since it still relies on the real PDF.
          viewer.innerHTML = `<div class="empty-state"><div class="ei">📄</div><p data-i18n="print.noPreview"></p></div>`;
          I18n.apply(viewer);
        }
      } catch (e) {
        console.error('Print preview generation failed', e);
        Toast.error(I18n.t('common.error'));
      } finally {
        spinner.style.display = 'none';
        viewer.style.display = 'block';
      }
    }

    sheet.querySelector('#pp-close').onclick = () => Modal.close();
    sheet.querySelectorAll('#pp-size-tabs .tab-chip').forEach((el) => {
      el.onclick = () => rebuild(el.getAttribute('data-size'));
    });

    sheet.querySelector('#pp-download').onclick = async () => {
      if (!currentDoc) return;
      const filename = opts.filename || 'document.pdf';
      try {
        await NativeSave.shareBlob(currentDoc.output('blob'), filename, {
          title: opts.title || filename,
          dialogTitle: I18n.t('print.saveShareTitle')
        });
      } catch (e) {
        console.error('Save/share failed', e);
        Toast.error(I18n.t('common.error'));
      }
    };

    sheet.querySelector('#pp-print').onclick = async () => {
      if (!currentDoc) return;
      const filename = opts.filename || 'document.pdf';
      if (NativeSave.isNative()) {
        // No embedded PDF viewer/print pipeline exists inside the
        // WebView, so hand the real file to Android's native Share
        // sheet — from there the user can pick a connected printer,
        // "Save as PDF", or any PDF viewer app with its own print button.
        try {
          await NativeSave.shareBlob(currentDoc.output('blob'), filename, {
            title: opts.title || filename,
            dialogTitle: I18n.t('print.printBtn')
          });
        } catch (e) {
          console.error('Print hand-off failed', e);
          Toast.error(I18n.t('common.error'));
        }
        return;
      }
      // Desktop/browser dev fallback.
      try {
        const url = currentDoc.output('bloburl');
        const win = window.open(url, '_blank');
        if (win) win.addEventListener('load', () => win.print());
      } catch (e) {
        console.error('Print failed', e);
        Toast.error(I18n.t('common.error'));
      }
    };

    await rebuild(activeSize);
  }

  return { open };
})();
