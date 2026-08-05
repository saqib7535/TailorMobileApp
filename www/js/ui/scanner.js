/* ============================================================
   Scanner — camera-based QR scanner (jsQR) used for "scan an
   invoice label to find its order". Works in any Chromium-based
   WebView (including the compiled Android app) since it only
   needs getUserMedia — no native plugin required.
   ============================================================ */

const Scanner = (function () {
  function open(onResult) {
    let stream = null;
    let rafId = null;

    const sheet = Modal.open(`
      <div class="modal-header">
        <h3 data-i18n="scan.title"></h3>
        <button class="icon-btn" id="m-close">${Icons.svg('close', 20)}</button>
      </div>
      <p class="text-muted center" data-i18n="scan.instructions" style="margin-bottom:10px"></p>
      <div style="border-radius:var(--radius-md);overflow:hidden;background:#000">
        <video id="scan-video" style="width:100%;display:block" playsinline muted autoplay></video>
      </div>
      <canvas id="scan-canvas" class="hidden"></canvas>
      <p class="text-danger center mt-8 hidden" id="scan-error"></p>
    `, { center: true });
    I18n.apply(sheet);

    function stop() {
      if (rafId) cancelAnimationFrame(rafId);
      if (stream) stream.getTracks().forEach((t) => t.stop());
    }

    sheet.querySelector('#m-close').onclick = () => { stop(); Modal.close(); };

    const video = sheet.querySelector('#scan-video');
    const canvas = sheet.querySelector('#scan-canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    function tick() {
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' });
        if (code && code.data) {
          stop();
          Modal.close();
          onResult(code.data);
          return;
        }
      }
      rafId = requestAnimationFrame(tick);
    }

    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      .then((s) => {
        stream = s;
        video.srcObject = s;
        rafId = requestAnimationFrame(tick);
      })
      .catch((err) => {
        console.error('Camera access failed', err);
        const errEl = sheet.querySelector('#scan-error');
        errEl.textContent = I18n.t('scan.cameraError');
        errEl.classList.remove('hidden');
      });
  }

  return { open };
})();
