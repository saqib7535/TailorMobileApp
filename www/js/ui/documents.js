/* ============================================================
   Documents — builds the real jsPDF invoice document (QR + barcode
   of the invoice number, shop header, garment items, totals,
   payment status), sized for Thermal 58mm, Thermal 80mm, or A4
   paper. Used together with PrintPreview so the user always sees
   the page before printing/exporting.

   Phase 3: reworked from the Phase 1 scaffold (which mirrored the
   sibling dry-cleaning project's tracking_no/return_date shape) to
   the tailor order shape — invoice_no, delivery_date, garment
   items with category/garment_label, and a payment-status line.

   Phase 5: adds buildReportPdf()/openReportPreview() — a second,
   fully generic document builder for ReportService's
   {title, columns, rows, totals} shape, used by the Reports screen.
   Unlike invoices, reports are always A4 (see that section's header
   comment for why).
   ============================================================ */

const Documents = (function () {
  const PAGE_MM = { thermal58: [58, null], thermal80: [80, null], a4: [210, 297] };

  function qrDataUrl(text) {
    try {
      const qr = qrcode(0, 'M');
      qr.addData(text);
      qr.make();
      return qr.createDataURL(6, 4);
    } catch (e) {
      console.error('QR generation failed', e);
      return null;
    }
  }

  function barcodeDataUrl(text) {
    try {
      const canvas = document.createElement('canvas');
      JsBarcode(canvas, text, { format: 'CODE128', width: 2, height: 50, displayValue: false, margin: 4 });
      return { url: canvas.toDataURL('image/png'), w: canvas.width, h: canvas.height };
    } catch (e) {
      console.error('Barcode generation failed', e);
      return null;
    }
  }

  async function shopInfo() {
    return {
      name: await SettingsService.get('shop_name', 'Tailor Shop POS'),
      address: await SettingsService.get('shop_address', ''),
      phone: await SettingsService.get('shop_phone', ''),
      currency: await SettingsService.get('currency', 'PKR'),
      invoiceMessage: await SettingsService.get('invoice_message', 'Thank you for your business!')
    };
  }

  function newDoc(paperSize, estimatedHeightMM) {
    const { jsPDF } = window.jspdf;
    if (paperSize === 'a4') {
      return new jsPDF({ unit: 'mm', format: 'a4' });
    }
    const width = PAGE_MM[paperSize][0];
    const height = Math.max(60, estimatedHeightMM || 150);
    return new jsPDF({ unit: 'mm', format: [width, height] });
  }

  function addCenteredImage(doc, dataUrl, pageWidth, y, boxSize) {
    const x = (pageWidth - boxSize) / 2;
    doc.addImage(dataUrl, 'PNG', x, y, boxSize, boxSize);
    return y + boxSize;
  }

  function addCenteredBarcode(doc, barcode, pageWidth, y, targetHeight) {
    if (!barcode) return y;
    const w = targetHeight * (barcode.w / barcode.h);
    const boxW = Math.min(w, pageWidth - 8);
    const x = (pageWidth - boxW) / 2;
    doc.addImage(barcode.url, 'PNG', x, y, boxW, targetHeight);
    return y + targetHeight;
  }

  function paymentStatusLine(order) {
    if (order.status === 'Cancelled') return 'CANCELLED';
    if (Number(order.remaining_balance) <= 0.001) return 'PAID IN FULL';
    return 'Balance Due';
  }

  function itemLabel(it) {
    return it.garment_label && it.garment_label.trim() ? it.garment_label : it.category_name;
  }

  // Sub-line under a garment's label: which family member it's for
  // (only when it's not simply the order's own customer — a lone
  // customer's order doesn't need "For: <themselves>" on every line).
  function itemForLine(order, it) {
    if (!it.for_customer_name || it.for_customer_name === order.customer_name) return '';
    return it.for_customer_name;
  }

  // Groups an order's items by who they're actually for. A lone
  // customer's order comes back as a single group (isFamily: false)
  // so the invoice stays a simple flat list; a family order with
  // items for several members comes back as one group per person,
  // each with its own subtotal — this is what lets the customer copy
  // show "who ordered what" instead of one undifferentiated list.
  function groupItemsByPerson(order) {
    const map = new Map();
    order.items.forEach((it) => {
      const key = it.for_customer_id || order.customer_id;
      const name = it.for_customer_name || order.customer_name;
      if (!map.has(key)) map.set(key, { name, items: [], subtotal: 0 });
      const g = map.get(key);
      g.items.push(it);
      g.subtotal += Number(it.subtotal || 0);
    });
    const groups = Array.from(map.values());
    return { groups, isFamily: groups.length > 1 };
  }

  // ---------------- Invoice / Receipt ----------------

  async function buildInvoicePdf(order, paperSize) {
    const shop = await shopInfo();
    Format.setCurrencySymbol(shop.currency);
    const qrUrl = qrDataUrl(order.invoice_no);
    const barcode = barcodeDataUrl(order.invoice_no);
    const isA4 = paperSize === 'a4';

    if (isA4) return buildInvoiceA4(order, shop, qrUrl, barcode);
    // Item count (and now per-person grouping headers) makes thermal
    // invoice height genuinely variable — measure-then-render avoids
    // ever guessing a page height that's too short and clipping the
    // bottom of the invoice (the QR/barcode/thank-you line).
    return newMeasuredDoc(paperSize, (doc) => drawInvoiceThermalBody(doc, order, shop, qrUrl, barcode));
  }

  function drawInvoiceThermalBody(doc, order, shop, qrUrl, barcode) {
    const lineH = 4.6;
    const pageWidth = doc.internal.pageSize.getWidth();
    const cx = pageWidth / 2;
    const marginX = 4;
    let y = 8;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(shop.name, cx, y, { align: 'center' }); y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    if (shop.address) { doc.text(shop.address, cx, y, { align: 'center' }); y += 4; }
    if (shop.phone) { doc.text(shop.phone, cx, y, { align: 'center' }); y += 4; }
    y += 1;
    dashedLine(doc, marginX, pageWidth - marginX, y); y += 4;

    doc.setFontSize(8.5);
    y = kv(doc, marginX, pageWidth - marginX, y, 'Invoice #', order.invoice_no);
    y = kv(doc, marginX, pageWidth - marginX, y, 'Date', Format.shortDate(order.order_date));
    y = kv(doc, marginX, pageWidth - marginX, y, 'Customer', order.customer_name);
    if (order.delivery_date) y = kv(doc, marginX, pageWidth - marginX, y, 'Delivery', Format.shortDate(order.delivery_date));
    if (order.urgent) y = kv(doc, marginX, pageWidth - marginX, y, 'Priority', 'URGENT');
    y += 1;
    dashedLine(doc, marginX, pageWidth - marginX, y); y += 4;

    const { groups, isFamily } = groupItemsByPerson(order);

    doc.setFont('helvetica', 'bold');
    doc.text('Garment', marginX, y);
    doc.text('Qty', pageWidth - 32, y, { align: 'right' });
    doc.text('Amt', pageWidth - marginX, y, { align: 'right' });
    y += 4;

    groups.forEach((g, gi) => {
      if (isFamily) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.text('— ' + g.name, marginX, y);
        y += 4;
      }
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      g.items.forEach((it) => {
        doc.text(truncate(doc, itemLabel(it), pageWidth - 40), marginX + (isFamily ? 2 : 0), y);
        doc.text(String(it.quantity), pageWidth - 32, y, { align: 'right' });
        doc.text(Format.money(it.subtotal), pageWidth - marginX, y, { align: 'right' });
        y += lineH;
      });
      if (isFamily) {
        doc.setFont('helvetica', 'bold');
        doc.text('Subtotal (' + g.name + ')', marginX + 2, y);
        doc.text(Format.money(g.subtotal), pageWidth - marginX, y, { align: 'right' });
        y += lineH;
      }
      if (gi < groups.length - 1) y += 1;
    });
    y += 1;
    dashedLine(doc, marginX, pageWidth - marginX, y); y += 4;

    y = kv(doc, marginX, pageWidth - marginX, y, 'Subtotal', Format.money(order.subtotal));
    y = kv(doc, marginX, pageWidth - marginX, y, 'Discount', '-' + Format.money(order.discount));
    y = kv(doc, marginX, pageWidth - marginX, y, 'Extra Charges', Format.money(order.extra_charges));
    y = kv(doc, marginX, pageWidth - marginX, y, 'Delivery', Format.money(order.delivery_charges));
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    y = kv(doc, marginX, pageWidth - marginX, y, 'Grand Total', Format.money(order.grand_total));
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    const paid = Number(order.grand_total) - Number(order.remaining_balance);
    y = kv(doc, marginX, pageWidth - marginX, y, 'Paid', Format.money(paid));
    y = kv(doc, marginX, pageWidth - marginX, y, 'Remaining', Format.money(order.remaining_balance));
    y += 1;
    dashedLine(doc, marginX, pageWidth - marginX, y); y += 5;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(paymentStatusLine(order), cx, y, { align: 'center' }); y += 5;

    if (qrUrl) y = addCenteredImage(doc, qrUrl, pageWidth, y, 26) + 3;
    y = addCenteredBarcode(doc, barcode, pageWidth, y, 10) + 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.splitTextToSize(shop.invoiceMessage, pageWidth - marginX * 2).forEach((line) => {
      doc.text(line, cx, y, { align: 'center' });
      y += 3.6;
    });
    y += 1;

    return y;
  }

  function buildInvoiceA4(order, shop, qrUrl, barcode) {
    const doc = newDoc('a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const marginX = 16;
    let y = 20;

    doc.setFillColor(124, 45, 60);
    doc.rect(0, 0, pageWidth, 4, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.text(shop.name, marginX, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(100);
    if (shop.address) { y += 6; doc.text(shop.address, marginX, y); }
    if (shop.phone) { y += 5; doc.text(shop.phone, marginX, y); }
    doc.setTextColor(0);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(124, 45, 60);
    doc.text('INVOICE', pageWidth - marginX, 20, { align: 'right' });
    doc.setTextColor(0);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(order.invoice_no, pageWidth - marginX, 27, { align: 'right' });
    doc.text(Format.shortDate(order.order_date), pageWidth - marginX, 33, { align: 'right' });
    if (order.urgent) {
      doc.setTextColor(220, 38, 38);
      doc.setFont('helvetica', 'bold');
      doc.text('URGENT', pageWidth - marginX, 39, { align: 'right' });
      doc.setTextColor(0);
      doc.setFont('helvetica', 'normal');
    }

    y = Math.max(y, 33) + 10;
    doc.setDrawColor(124, 45, 60);
    doc.setLineWidth(0.6);
    doc.line(marginX, y, pageWidth - marginX, y);
    doc.setLineWidth(0.2);
    doc.setDrawColor(200);
    y += 8;

    doc.setFont('helvetica', 'bold');
    doc.text('Bill To', marginX, y);
    doc.setFont('helvetica', 'normal');
    y += 6;
    doc.text(order.customer_name, marginX, y);
    if (order.customer_phone) { y += 5; doc.text(order.customer_phone, marginX, y); }
    if (order.delivery_date) {
      doc.setFont('helvetica', 'bold');
      doc.text('Delivery Date', pageWidth - marginX - 45, y - (order.customer_phone ? 5 : 0));
      doc.setFont('helvetica', 'normal');
      doc.text(Format.shortDate(order.delivery_date), pageWidth - marginX, y - (order.customer_phone ? 5 : 0), { align: 'right' });
    }
    y += 10;

    const { groups, isFamily } = groupItemsByPerson(order);
    const tableBody = [];
    if (isFamily) {
      groups.forEach((g) => {
        tableBody.push([{ content: g.name, colSpan: 4, styles: { fontStyle: 'bold', fillColor: [243, 232, 234], textColor: [124, 45, 60] } }]);
        g.items.forEach((it) => tableBody.push([itemLabel(it), String(it.quantity), Format.money(it.rate), Format.money(it.subtotal)]));
        tableBody.push([{ content: 'Subtotal (' + g.name + ')', colSpan: 3, styles: { fontStyle: 'bold', halign: 'right' } }, { content: Format.money(g.subtotal), styles: { fontStyle: 'bold' } }]);
      });
    } else {
      order.items.forEach((it) => tableBody.push([itemLabel(it), String(it.quantity), Format.money(it.rate), Format.money(it.subtotal)]));
    }

    doc.autoTable({
      startY: y,
      margin: { left: marginX, right: marginX },
      head: [['Garment', 'Qty', 'Rate', 'Amount']],
      body: tableBody,
      styles: { fontSize: 9.5 },
      headStyles: { fillColor: [124, 45, 60] }
    });
    y = doc.lastAutoTable.finalY + 10;

    const totalsX1 = pageWidth - marginX - 70;
    const totalsX2 = pageWidth - marginX;
    const paid = Number(order.grand_total) - Number(order.remaining_balance);

    doc.setFillColor(248, 250, 252);
    doc.roundedRect(totalsX1 - 6, y - 6, (totalsX2 - totalsX1) + 12, 6.5 * 5 + 8 + 6, 3, 3, 'F');
    y += 2;

    function totalRow(label, value, bold) {
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      doc.setFontSize(bold ? 12 : 10);
      doc.text(label, totalsX1, y);
      doc.text(String(value), totalsX2, y, { align: 'right' });
      y += bold ? 8 : 6.5;
    }
    totalRow('Subtotal', Format.money(order.subtotal));
    totalRow('Discount', '-' + Format.money(order.discount));
    totalRow('Extra Charges', Format.money(order.extra_charges));
    totalRow('Delivery Charges', Format.money(order.delivery_charges));
    doc.setDrawColor(220);
    doc.line(totalsX1, y - 4, totalsX2, y - 4);
    totalRow('Grand Total', Format.money(order.grand_total), true);
    totalRow('Paid', Format.money(paid));
    totalRow('Remaining Balance', Format.money(order.remaining_balance));

    y += 8;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(order.remaining_balance > 0.001 ? 220 : 22, order.remaining_balance > 0.001 ? 38 : 163, order.remaining_balance > 0.001 ? 38 : 74);
    doc.text(paymentStatusLine(order), totalsX2, y, { align: 'right' });
    doc.setTextColor(0);

    y += 12;
    if (qrUrl) doc.addImage(qrUrl, 'PNG', marginX, y, 28, 28);
    if (barcode) {
      const h = 16;
      const w = h * (barcode.w / barcode.h);
      doc.addImage(barcode.url, 'PNG', marginX + 34, y + 6, Math.min(w, 70), h);
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(shop.invoiceMessage, pageWidth - marginX, y + 20, { align: 'right' });

    return doc;
  }

  // ---------------- small pdf layout helpers ----------------

  function dashedLine(doc, x1, x2, y) {
    doc.setLineDashPattern([1, 1], 0);
    doc.setDrawColor(150);
    doc.line(x1, y, x2, y);
    doc.setLineDashPattern([], 0);
  }

  function kv(doc, x1, x2, y, label, value) {
    doc.text(label, x1, y);
    doc.text(String(value), x2, y, { align: 'right' });
    return y + 4.6;
  }

  function truncate(doc, text, maxWidth) {
    let t = String(text);
    while (doc.getTextWidth(t) > maxWidth && t.length > 3) t = t.slice(0, -2) + '…';
    return t;
  }

  // ---------------- HTML preview (what the modal actually shows) ----------------
  /* Android's system WebView has no built-in PDF renderer for embedded
     content, so showing the real generated PDF inside the app (via an
     <iframe>) reliably renders blank on real devices. These functions
     build a plain HTML mock of the same layout instead, which always
     renders because it's just normal DOM/CSS. The *real* PDF is still
     what gets downloaded/shared/printed — see buildInvoicePdf etc. */

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  function previewBoxWidth(paperSize) {
    return { thermal58: 210, thermal80: 280, a4: 380 }[paperSize] || 280;
  }

  function previewShell(paperSize, innerHtml) {
    const w = previewBoxWidth(paperSize);
    return `
      <div style="display:flex;justify-content:center;padding:14px 0">
        <div style="width:${w}px;max-width:100%;background:#fff;color:#111;box-shadow:0 2px 10px rgba(0,0,0,.15);padding:14px 12px;font-family:'Courier New',monospace;font-size:11.5px;line-height:1.5">
          ${innerHtml}
        </div>
      </div>`;
  }

  function previewDashed() {
    return `<div style="border-top:1px dashed #999;margin:6px 0"></div>`;
  }

  function previewRow(label, value, opts) {
    opts = opts || {};
    const weight = opts.bold ? '700' : '400';
    const size = opts.big ? '13px' : 'inherit';
    return `<div style="display:flex;justify-content:space-between;gap:8px;font-weight:${weight};font-size:${size};margin:2px 0">
      <span>${escapeHtml(label)}</span><span>${escapeHtml(value)}</span>
    </div>`;
  }

  async function buildInvoicePreviewHtml(order, paperSize) {
    const shop = await shopInfo();
    Format.setCurrencySymbol(shop.currency);
    const qrUrl = qrDataUrl(order.invoice_no);
    const barcode = barcodeDataUrl(order.invoice_no);
    const { groups, isFamily } = groupItemsByPerson(order);

    const itemRow = (it) => `
      <div style="display:flex;justify-content:space-between;gap:6px;margin:2px 0">
        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(itemLabel(it))}</span>
        <span style="width:24px;text-align:right">${it.quantity}</span>
        <span style="width:60px;text-align:right">${escapeHtml(Format.money(it.subtotal))}</span>
      </div>`;

    const groupsHtml = groups.map((g) => `
      ${isFamily ? `<div style="font-weight:700;margin-top:8px;color:#7c2d3c">👤 ${escapeHtml(g.name)}</div>` : ''}
      ${g.items.map(itemRow).join('')}
      ${isFamily ? previewRow('Subtotal (' + g.name + ')', Format.money(g.subtotal), { bold: true }) : ''}
    `).join('');

    const paid = Number(order.grand_total) - Number(order.remaining_balance);
    const inner = `
      <div style="text-align:center;font-weight:700;font-size:13px">${escapeHtml(shop.name)}</div>
      ${shop.address ? `<div style="text-align:center;color:#666;font-size:10.5px">${escapeHtml(shop.address)}</div>` : ''}
      ${shop.phone ? `<div style="text-align:center;color:#666;font-size:10.5px">${escapeHtml(shop.phone)}</div>` : ''}
      ${previewDashed()}
      ${previewRow('Invoice #', order.invoice_no)}
      ${previewRow('Date', Format.shortDate(order.order_date))}
      ${previewRow('Customer', order.customer_name)}
      ${order.delivery_date ? previewRow('Delivery', Format.shortDate(order.delivery_date)) : ''}
      ${order.urgent ? previewRow('Priority', 'URGENT', { bold: true }) : ''}
      ${previewDashed()}
      <div style="display:flex;justify-content:space-between;gap:6px;font-weight:700">
        <span style="flex:1">Garment</span><span style="width:24px;text-align:right">Qty</span><span style="width:60px;text-align:right">Amt</span>
      </div>
      ${groupsHtml}
      ${previewDashed()}
      ${previewRow('Subtotal', Format.money(order.subtotal))}
      ${previewRow('Discount', '-' + Format.money(order.discount))}
      ${previewRow('Extra Charges', Format.money(order.extra_charges))}
      ${previewRow('Delivery', Format.money(order.delivery_charges))}
      ${previewRow('Grand Total', Format.money(order.grand_total), { bold: true, big: true })}
      ${previewRow('Paid', Format.money(paid))}
      ${previewRow('Remaining', Format.money(order.remaining_balance))}
      ${previewDashed()}
      <div style="text-align:center;font-weight:700">${escapeHtml(paymentStatusLine(order))}</div>
      ${qrUrl ? `<div style="text-align:center;margin-top:6px"><img src="${qrUrl}" style="width:70px;height:70px" /></div>` : ''}
      ${barcode ? `<div style="text-align:center;margin-top:6px"><img src="${barcode.url}" style="height:28px" /></div>` : ''}
      <div style="text-align:center;margin-top:8px;color:#666">${escapeHtml(shop.invoiceMessage)}</div>`;
    return previewShell(paperSize, inner);
  }

  async function buildTailorCopyPreviewHtml(order, paperSize) {
    const itemLines = await Promise.all(order.items.map((it) => itemMeasurementLines(it)));
    const groups = groupItemsForTailorCopy(order);
    let seq = 0;

    const measTableHtml = (pairs) => {
      if (!pairs.length) return `<div style="font-size:10.5px;color:#aaa;margin-top:3px">(no measurement profile)</div>`;
      const rows = [];
      for (let i = 0; i < pairs.length; i += 2) rows.push([pairs[i], pairs[i + 1]]);
      return `
        <table style="width:100%;border-collapse:collapse;margin-top:4px;font-size:10.5px">
          ${rows.map(([a, b]) => `
            <tr>
              <td style="border:1px solid #ddd;padding:3px 5px;color:#555;font-weight:700">${escapeHtml(a.label)}</td>
              <td style="border:1px solid #ddd;padding:3px 5px">${escapeHtml(a.value)}</td>
              ${b ? `<td style="border:1px solid #ddd;padding:3px 5px;color:#555;font-weight:700">${escapeHtml(b.label)}</td><td style="border:1px solid #ddd;padding:3px 5px">${escapeHtml(b.value)}</td>` : '<td style="border:1px solid #ddd"></td><td style="border:1px solid #ddd"></td>'}
            </tr>`).join('')}
        </table>`;
    };

    const groupsHtml = groups.map((g) => `
      ${groups.length > 1 ? `<div style="font-weight:700;color:#7c2d3c;margin-top:12px">👤 ${escapeHtml(g.name)} (${g.items.length} item${g.items.length > 1 ? 's' : ''})</div>` : ''}
      ${g.items.map(({ it, idx }) => {
        seq += 1;
        const designs = parseDesignLabels(it);
        return `
          <div style="margin-top:10px;padding-top:8px;border-top:1px dashed #999">
            <div style="font-weight:700">${seq}. ${escapeHtml(itemLabel(it))} (x${it.quantity})</div>
            ${it.fabric_type_name ? `<div style="font-size:11px;color:#444">Fabric: ${escapeHtml(it.fabric_type_name)}</div>` : ''}
            ${designs.length ? `<div style="font-size:11px;color:#444">Design: ${escapeHtml(designs.join(', '))}</div>` : ''}
            ${measTableHtml(itemLines[idx] || [])}
          </div>`;
      }).join('')}
    `).join('');

    const inner = `
      <div style="text-align:center;font-weight:700;font-size:13px">TAILOR COPY</div>
      ${previewDashed()}
      ${previewRow('Invoice #', order.invoice_no)}
      ${previewRow('Customer ID', 'C-' + order.customer_id)}
      ${previewRow('Customer', order.customer_name)}
      ${order.delivery_date ? previewRow('Delivery', Format.shortDate(order.delivery_date)) : ''}
      ${order.urgent ? previewRow('Priority', 'URGENT', { bold: true }) : ''}
      ${groupsHtml}
      ${previewDashed()}
      ${previewRow('Total Suits', String(order.items.reduce((s, it) => s + Number(it.quantity || 0), 0)), { bold: true })}
    `;
    return previewShell(paperSize, inner);
  }

  async function buildReportPreviewHtml(report, paperSize) {
    const rowsHtml = report.rows.map((r) => `
      <div style="display:flex;justify-content:space-between;font-size:11px;margin:2px 0">
        ${report.columns.map((c) => `<span>${escapeHtml(String(r[c.key] != null ? r[c.key] : ''))}</span>`).join('')}
      </div>`).join('');
    const inner = `
      <div style="text-align:center;font-weight:700;font-size:13px">${escapeHtml(report.title || 'Report')}</div>
      ${previewDashed()}
      <div style="display:flex;justify-content:space-between;font-weight:700;font-size:11px">
        ${report.columns.map((c) => `<span>${escapeHtml(c.label)}</span>`).join('')}
      </div>
      ${rowsHtml}
    `;
    return previewShell(paperSize, inner);
  }

  async function openInvoicePreview(order) {
    await PrintPreview.open({
      title: I18n.t('order.printInvoice'),
      filename: order.invoice_no + '.pdf',
      defaultSize: 'thermal80',
      buildDoc: (size) => buildInvoicePdf(order, size),
      buildPreviewHtml: (size) => buildInvoicePreviewHtml(order, size)
    });
  }

  // Thermal tailor-copy content length is genuinely unpredictable
  // (each garment can carry a different number of measurement
  // fields), so instead of guessing a page height like the customer
  // copy does, this draws the body once on a tall scratch page just
  // to measure how far it actually goes, then creates the real page
  // sized to fit. Single source of truth (drawBody) — never drifts
  // out of sync the way a hand-guessed constant would.
  function newMeasuredDoc(paperSize, drawBody) {
    const scratch = newDoc(paperSize, 1000);
    const measuredY = drawBody(scratch);
    const doc = newDoc(paperSize, measuredY + 6);
    drawBody(doc);
    return doc;
  }

  async function itemMeasurementLines(it) {
    if (!it.measurement_id) return [];
    const meas = await MeasurementService.get(it.measurement_id);
    if (!meas) return [];
    const fields = await MeasurementFieldService.listEnabledByCategory(meas.category_id);
    return fields
      .filter((f) => meas.values[f.field_key] !== '' && meas.values[f.field_key] != null)
      .map((f) => ({ label: MeasurementFieldService.label(f), value: `${meas.values[f.field_key]}${f.unit || ''}` }));
  }

  // Groups an order's items by who they're for (reuses the same
  // grouping the customer copy uses), so the tailor copy reads
  // "customer-wise, then each of their garments in sequence" instead
  // of one flat undifferentiated list — exactly what someone cutting
  // for a multi-person family order needs.
  function groupItemsForTailorCopy(order) {
    const map = new Map();
    order.items.forEach((it, idx) => {
      const key = it.for_customer_id || order.customer_id;
      const name = it.for_customer_name || order.customer_name;
      if (!map.has(key)) map.set(key, { name, items: [] });
      map.get(key).items.push({ it, idx });
    });
    return Array.from(map.values());
  }

  function parseDesignLabels(it) {
    if (Array.isArray(it.designLabelsArr)) return it.designLabelsArr;
    try { return it.design_labels ? JSON.parse(it.design_labels) : []; } catch (e) { return []; }
  }

  // ---------------- Tailor copy ----------------
  // Goes to the tailor/cutter, not the customer: invoice #, customer
  // id, and — the part the customer copy deliberately omits — every
  // garment's fabric, design choices, and full measurement sheet.

  async function buildTailorCopyPdf(order, paperSize) {
    const shop = await shopInfo();
    const isA4 = paperSize === 'a4';
    // Pre-fetch every item's measurement lines up front (async), so
    // the synchronous draw-body function used for measure-then-render
    // can run twice without re-hitting the DB.
    const itemLines = await Promise.all(order.items.map((it) => itemMeasurementLines(it)));
    if (isA4) return buildTailorCopyA4(order, shop, itemLines);
    return newMeasuredDoc(paperSize, (doc) => drawTailorCopyThermal(doc, order, shop, itemLines));
  }

  function drawMeasurementGridThermal(doc, pairs, marginX, width, y) {
    doc.setFontSize(7.3);
    doc.setTextColor(70);
    const colW = width / 2;
    for (let i = 0; i < pairs.length; i += 2) {
      const left = pairs[i];
      const right = pairs[i + 1];
      doc.text(`${left.label}: ${left.value}`, marginX, y);
      if (right) doc.text(`${right.label}: ${right.value}`, marginX + colW, y);
      y += 3.6;
    }
    doc.setTextColor(0);
    return y;
  }

  function drawTailorCopyThermal(doc, order, shop, itemLines) {
    const pageWidth = doc.internal.pageSize.getWidth();
    const cx = pageWidth / 2;
    const marginX = 4;
    const contentWidth = pageWidth - marginX * 2;
    let y = 8;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(shop.name, cx, y, { align: 'center' }); y += 5;
    doc.setFontSize(9);
    doc.text('TAILOR COPY', cx, y, { align: 'center' }); y += 5;
    dashedLine(doc, marginX, pageWidth - marginX, y); y += 4;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    y = kv(doc, marginX, pageWidth - marginX, y, 'Invoice #', order.invoice_no);
    y = kv(doc, marginX, pageWidth - marginX, y, 'Customer ID', 'C-' + order.customer_id);
    y = kv(doc, marginX, pageWidth - marginX, y, 'Customer', order.customer_name);
    if (order.delivery_date) y = kv(doc, marginX, pageWidth - marginX, y, 'Delivery', Format.shortDate(order.delivery_date));
    if (order.urgent) y = kv(doc, marginX, pageWidth - marginX, y, 'Priority', 'URGENT');
    y += 1;
    dashedLine(doc, marginX, pageWidth - marginX, y); y += 5;

    const groups = groupItemsForTailorCopy(order);
    let seq = 0;
    groups.forEach((g, gi) => {
      if (groups.length > 1) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.text(`${g.name}  (${g.items.length} item${g.items.length > 1 ? 's' : ''})`, marginX, y, { maxWidth: contentWidth });
        y += 5;
      }

      g.items.forEach(({ it, idx }) => {
        seq += 1;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text(`${seq}. ${itemLabel(it)}  (x${it.quantity})`, marginX, y, { maxWidth: contentWidth });
        y += 4.6;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        if (it.fabric_type_name) {
          doc.text('Fabric: ' + it.fabric_type_name, marginX, y, { maxWidth: contentWidth });
          y += 4;
        }
        const designs = parseDesignLabels(it);
        if (designs.length) {
          const lines = doc.splitTextToSize('Design: ' + designs.join(', '), contentWidth);
          lines.forEach((line) => { doc.text(line, marginX, y); y += 3.8; });
        }
        const pairs = itemLines[idx] || [];
        if (pairs.length) {
          y = drawMeasurementGridThermal(doc, pairs, marginX, contentWidth, y);
        } else {
          doc.setTextColor(150);
          doc.text('(no measurement profile)', marginX, y);
          doc.setTextColor(0);
          y += 3.8;
        }
        y += 2;
      });
      if (gi < groups.length - 1) { dashedLine(doc, marginX, pageWidth - marginX, y); y += 4; }
    });

    y += 2;
    dashedLine(doc, marginX, pageWidth - marginX, y); y += 4;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(`Total Suits: ${order.items.reduce((s, it) => s + Number(it.quantity || 0), 0)}`, marginX, y);
    y += 5;

    return y;
  }

  function buildTailorCopyA4(order, shop, itemLines) {
    const doc = newDoc('a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const marginX = 16;
    let y = 20;

    doc.setFillColor(124, 45, 60);
    doc.rect(0, 0, pageWidth, 4, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text(shop.name, marginX, y);
    doc.setFontSize(11);
    doc.setTextColor(124, 45, 60);
    doc.text('TAILOR COPY', pageWidth - marginX, y, { align: 'right' });
    doc.setTextColor(0);

    y += 8;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Invoice: ${order.invoice_no}   Customer ID: C-${order.customer_id}   Customer: ${order.customer_name}`, marginX, y);
    y += 6;
    if (order.delivery_date) { doc.text('Delivery: ' + Format.shortDate(order.delivery_date), marginX, y); y += 6; }
    y += 4;

    const groups = groupItemsForTailorCopy(order);
    let seq = 0;
    groups.forEach((g) => {
      if (y > 265) { doc.addPage(); y = 20; }
      if (groups.length > 1) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        doc.setTextColor(124, 45, 60);
        doc.text(`${g.name}  (${g.items.length} item${g.items.length > 1 ? 's' : ''})`, marginX, y);
        doc.setTextColor(0);
        y += 8;
      }

      g.items.forEach(({ it, idx }) => {
        seq += 1;
        const forLine = itemForLine(order, it);
        const designs = parseDesignLabels(it);
        const pairs = itemLines[idx] || [];

        if (y > 255) { doc.addPage(); y = 20; }

        doc.setFillColor(248, 250, 252);
        doc.roundedRect(marginX, y, pageWidth - marginX * 2, 8, 2, 2, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text(`${seq}. ${itemLabel(it)}${forLine ? ' — ' + forLine : ''}  (x${it.quantity})`, marginX + 3, y + 5.5);
        y += 11;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.5);
        const detailBits = [];
        if (it.fabric_type_name) detailBits.push('Fabric: ' + it.fabric_type_name);
        if (designs.length) detailBits.push('Design: ' + designs.join(', '));
        if (detailBits.length) {
          const lines = doc.splitTextToSize(detailBits.join('    '), pageWidth - marginX * 2 - 6);
          lines.forEach((line) => { doc.text(line, marginX + 3, y); y += 5.2; });
        }
        y += 1;

        if (pairs.length) {
          // A real bordered table — "tabular form" as asked for —
          // instead of a joined line of measurements.
          const rows = [];
          for (let i = 0; i < pairs.length; i += 2) {
            rows.push([pairs[i].label, pairs[i].value, pairs[i + 1] ? pairs[i + 1].label : '', pairs[i + 1] ? pairs[i + 1].value : '']);
          }
          doc.autoTable({
            startY: y,
            margin: { left: marginX + 3, right: marginX + 3 },
            body: rows,
            theme: 'grid',
            styles: { fontSize: 8.5, cellPadding: 2 },
            columnStyles: { 0: { fontStyle: 'bold', textColor: [90, 90, 90] }, 2: { fontStyle: 'bold', textColor: [90, 90, 90] } }
          });
          y = doc.lastAutoTable.finalY + 4;
        } else {
          doc.setTextColor(150);
          doc.text('(no measurement profile on file)', marginX + 3, y);
          doc.setTextColor(0);
          y += 6;
        }
        y += 3;
      });
    });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(`Total Suits: ${order.items.reduce((s, it) => s + Number(it.quantity || 0), 0)}`, marginX, y + 4);

    return doc;
  }

  async function openTailorCopyPreview(order) {
    await PrintPreview.open({
      title: I18n.t('order.tailorCopy'),
      filename: order.invoice_no + '_tailor.pdf',
      defaultSize: 'thermal80',
      buildDoc: (size) => buildTailorCopyPdf(order, size),
      buildPreviewHtml: (size) => buildTailorCopyPreviewHtml(order, size)
    });
  }

  // ---------------- Generic report table (Phase 5) ----------------
  //
  // Reports are back-office documents — multi-column tables with a
  // totals footer — not counter receipts, so unlike invoices they are
  // always A4: a 58/80mm thermal roll can't usefully lay out 4-6
  // columns of numbers side by side the way it can a short garment
  // list. openReportPreview() passes sizes:['a4'] to PrintPreview, so
  // the thermal58/thermal80 toggle simply never appears for reports
  // (still the same preview/print/download flow invoices use, just
  // scoped to one paper size).
  //
  // Fully generic over ReportService's {title, columns, rows, totals}
  // contract — this function never needs to know which report type
  // produced the data.

  function reportCellText(col, row) {
    const val = row[col.key];
    if (col.money) return Format.money(val);
    return val == null ? '' : String(val);
  }

  function buildReportPdf(report) {
    const doc = newDoc('a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const marginX = 14;
    let y = 18;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(report.title || 'Report', marginX, y);
    y += 8;

    const totalsLine = (report.totals || [])
      .map((t) => `${t.label}: ${t.money ? Format.money(t.value) : t.value}`)
      .join('    |    ');
    if (totalsLine) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(90);
      doc.text(totalsLine, marginX, y, { maxWidth: pageWidth - marginX * 2 });
      doc.setTextColor(0);
      y += 8;
    }

    doc.autoTable({
      startY: y,
      margin: { left: marginX, right: marginX },
      head: [(report.columns || []).map((c) => c.label)],
      body: (report.rows || []).map((r) => (report.columns || []).map((c) => reportCellText(c, r))),
      styles: { fontSize: 8.5 },
      headStyles: { fillColor: [124, 45, 60] }
    });

    return doc;
  }

  async function openReportPreview(report) {
    await PrintPreview.open({
      title: report.title,
      filename: (report.title || 'report').replace(/[^a-z0-9]+/gi, '_') + '.pdf',
      sizes: ['a4'],
      defaultSize: 'a4',
      buildDoc: () => buildReportPdf(report),
      buildPreviewHtml: () => buildReportPreviewHtml(report, 'a4')
    });
  }

  return {
    buildInvoicePdf, openInvoicePreview,
    buildTailorCopyPdf, openTailorCopyPreview,
    buildReportPdf, openReportPreview, qrDataUrl, barcodeDataUrl
  };
})();
