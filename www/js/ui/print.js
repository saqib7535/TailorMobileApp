/* ============================================================
   Print — renders a document (label/receipt) into the hidden
   #print-area and triggers the system print dialog. On a real
   Android device this hands off to Android's native print
   framework (save-as-PDF / print over Wi-Fi), fully offline.
   ============================================================ */

const Print = (function () {
  function ensureArea() {
    let area = document.getElementById('print-area');
    if (!area) {
      area = document.createElement('div');
      area.id = 'print-area';
      document.body.appendChild(area);
    }
    return area;
  }

  function show(html, afterInsert) {
    const area = ensureArea();
    area.innerHTML = html;
    if (afterInsert) afterInsert(area);
    return area;
  }

  function printNow(html, afterInsert) {
    show(html, afterInsert);
    setTimeout(() => window.print(), 60);
  }

  return { show, printNow };
})();
