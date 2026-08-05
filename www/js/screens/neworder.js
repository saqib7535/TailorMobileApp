/* ============================================================
   New Order screen — customer picker (search or quick-add),
   multi-item garment cart. Each item independently picks:
     - which family member it's for (when the selected customer is a
       family head with members — a single invoice can carry suits
       for several people at once)
     - garment category + that person's measurement profile for it
     - fabric type + one or more design options (both customizable
       catalogs, managed from Settings)
   Live totals, advance/payment method, save -> order detail.

   Also handles editing an existing order: render(app, {id}) loads it,
   pre-fills everything above, and save() calls OrderService.updateOrder
   instead of createOrder. Delivered orders can't be edited — this is
   enforced both here (redirects back out) and in OrderService itself.

   Reachable only for Admin/Manager/Reception (route-gated in app.js
   and the "+ New Order" entry point is hidden from Tailor in
   orders.js — this screen assumes the caller already checked the
   role, but re-checks itself as a last resort).
   ============================================================ */

const NewOrderScreen = (function () {
  let categories = [];
  let fabricTypes = [];
  let designOptionsByCategory = {}; // categoryId -> [options] (lazy-loaded)
  let selectedCustomer = null;
  let familyOptions = [];           // [selectedCustomer, ...its family members] — who an item can be "for"
  let measurementsByCustomer = {};  // customerId -> [measurement profiles] (lazy-loaded)
  let items = [];
  let rowSeq = 0;
  let editingOrderId = null;
  let editingOrder = null;

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  async function render(app, params) {
    if (!AuthService.hasRole('admin', 'manager', 'reception')) {
      app.innerHTML = '<div class="empty-state"><div class="ei">🔒</div><p data-i18n="common.notAuthorized"></p></div>';
      I18n.apply(app);
      return;
    }

    categories = await CategoryService.listEnabled();
    fabricTypes = await FabricTypeService.listEnabled();
    designOptionsByCategory = {};
    selectedCustomer = null;
    familyOptions = [];
    measurementsByCustomer = {};
    items = [];
    rowSeq = 0;
    editingOrderId = null;
    editingOrder = null;

    if (params && params.id) {
      editingOrder = await OrderService.getOrder(parseInt(params.id, 10));
      if (!editingOrder) {
        app.innerHTML = '<div class="empty-state"><div class="ei">🔍</div><p data-i18n="order.notFound"></p></div>';
        I18n.apply(app);
        return;
      }
      if (editingOrder.status === 'Delivered') {
        Toast.error(I18n.t('order.cannotEditDelivered'));
        Router.navigate('/orders/' + editingOrder.id);
        return;
      }
      editingOrderId = editingOrder.id;
      selectedCustomer = { id: editingOrder.customer_id, name: editingOrder.customer_name, phone: editingOrder.customer_phone };
      await loadFamilyOptions();
      await loadCustomerMeasurements(selectedCustomer.id);
      for (const it of editingOrder.items) {
        if (it.for_customer_id && !measurementsByCustomer[it.for_customer_id]) {
          await loadCustomerMeasurements(it.for_customer_id);
        }
        items.push({
          rowId: ++rowSeq,
          categoryId: it.category_id,
          categoryName: it.category_name,
          measurementId: it.measurement_id,
          garmentLabel: it.garment_label || '',
          quantity: it.quantity,
          rate: it.rate,
          rateTouched: true,
          labelTouched: true,
          forCustomerId: it.for_customer_id || selectedCustomer.id,
          forCustomerName: it.for_customer_name || selectedCustomer.name,
          fabricTypeId: it.fabric_type_id || null,
          fabricTypeName: it.fabric_type_name || '',
          designLabels: it.designLabelsArr || [],
          photoData: it.photo_path || null
        });
        if (it.category_id) await loadDesignOptions(it.category_id);
      }
    }

    const invoicePreview = editingOrder ? editingOrder.invoice_no : await OrderService.nextInvoiceNo();

    app.innerHTML = `
      <header class="app-header">
        <button class="icon-btn back-btn" id="btn-back">${Icons.svg('back', 22)}</button>
        <div>
          <h1 data-i18n="${editingOrderId ? 'order.editTitle' : 'order.newTitle'}"></h1>
          <div class="subtitle">${invoicePreview}</div>
        </div>
      </header>
      <div class="page page-pad" style="padding-top:14px;padding-bottom:24px">

        <div class="card" style="margin-bottom:14px">
          <div class="card-title" data-i18n="order.customer"></div>
          <div id="customer-picker"></div>
        </div>

        <div class="card" style="margin-bottom:14px">
          <div class="field-row">
            <div class="field">
              <label data-i18n="order.orderDate"></label>
              <input type="date" id="in-order-date" value="${editingOrder ? editingOrder.order_date : Format.todayIso()}" />
            </div>
            <div class="field">
              <label data-i18n="order.deliveryDate"></label>
              <input type="date" id="in-delivery-date" value="${editingOrder ? (editingOrder.delivery_date || '') : ''}" />
            </div>
          </div>
          <div class="checkbox-row">
            <input type="checkbox" id="in-urgent" ${editingOrder && editingOrder.urgent ? 'checked' : ''} />
            <label for="in-urgent" style="margin:0;text-transform:none;font-weight:600" data-i18n="order.urgent"></label>
          </div>
        </div>

        <div class="section-header" style="padding:0 0 8px">
          <h2 data-i18n="order.items"></h2>
          <a class="link" id="btn-add-item">+ <span data-i18n="order.addItem"></span></a>
        </div>
        <div id="items-container"></div>

        <div class="card" style="margin:14px 0">
          <div class="field-row">
            <div class="field"><label data-i18n="order.discount"></label><input type="number" min="0" id="in-discount" value="${editingOrder ? editingOrder.discount : 0}" /></div>
            <div class="field"><label data-i18n="order.extraCharges"></label><input type="number" min="0" id="in-extra" value="${editingOrder ? editingOrder.extra_charges : 0}" /></div>
          </div>
          <div class="field"><label data-i18n="order.deliveryCharges"></label><input type="number" min="0" id="in-delivery-charges" value="${editingOrder ? editingOrder.delivery_charges : 0}" /></div>
          <div class="flex-between mt-8" style="font-size:14px"><span data-i18n="order.subtotal"></span><b id="sum-subtotal">${Format.money(0)}</b></div>
          <div class="flex-between mt-8" style="font-size:16px;font-weight:800;color:var(--color-primary)"><span data-i18n="order.grandTotal"></span><b id="sum-grand">${Format.money(0)}</b></div>
        </div>

        <div class="card" style="margin-bottom:14px">
          ${editingOrderId ? `
          <div class="flex-between" style="font-size:13px">
            <span class="text-muted" data-i18n="order.alreadyPaid"></span>
            <b>${Format.money(editingOrder.grand_total - editingOrder.remaining_balance)}</b>
          </div>
          <p class="text-muted" style="font-size:11.5px;margin-top:6px" data-i18n="order.paymentsEditedElsewhere"></p>
          ` : `
          <div class="field-row">
            <div class="field"><label data-i18n="order.advancePaid"></label><input type="number" min="0" id="in-advance" value="0" /></div>
            <div class="field">
              <label data-i18n="order.paymentMethod"></label>
              <select id="in-payment-method">
                <option value="Cash" data-i18n="payment.Cash"></option>
                <option value="Card" data-i18n="payment.Card"></option>
                <option value="Bank Transfer" data-i18n="payment.Bank Transfer"></option>
                <option value="Other" data-i18n="payment.Other"></option>
              </select>
            </div>
          </div>
          `}
          <div class="flex-between mt-8" style="font-size:14px"><span class="text-muted" data-i18n="order.remainingBalance"></span><b id="sum-remaining">${Format.money(0)}</b></div>
        </div>

        <div class="field">
          <label data-i18n="order.notes"></label>
          <textarea id="in-notes" rows="2">${editingOrder ? escapeHtml(editingOrder.notes || '') : ''}</textarea>
        </div>

        <button class="btn btn-primary btn-block mt-8" id="btn-save-order" data-i18n="${editingOrderId ? 'order.updateOrder' : 'order.saveOrder'}"></button>
      </div>
    `;
    I18n.apply(app);

    app.querySelector('#btn-back').onclick = () => Router.navigate(editingOrderId ? ('/orders/' + editingOrderId) : '/orders');
    app.querySelector('#btn-add-item').onclick = () => { addItemRow(); renderItems(); };
    app.querySelector('#btn-save-order').onclick = save;

    const totalsInputs = editingOrderId
      ? ['#in-discount', '#in-extra', '#in-delivery-charges']
      : ['#in-discount', '#in-extra', '#in-delivery-charges', '#in-advance'];
    totalsInputs.forEach((sel) => {
      app.querySelector(sel).addEventListener('input', recomputeTotals);
    });

    renderCustomerPicker();
    if (!editingOrderId) addItemRow();
    renderItems();
    recomputeTotals();
  }

  // ---------------- Customer picker ----------------

  async function loadFamilyOptions() {
    if (!selectedCustomer) { familyOptions = []; return; }
    const full = await CustomerService.get(selectedCustomer.id);
    const isHead = full && !full.head_customer_id;
    const members = isHead ? await CustomerService.getFamilyMembers(selectedCustomer.id) : [];
    familyOptions = [selectedCustomer, ...members];
  }

  function renderCustomerPicker() {
    const el = document.getElementById('customer-picker');
    if (!el) return;
    if (selectedCustomer) {
      el.innerHTML = `
        <div class="list-row" style="margin:0">
          <div class="avatar">${Format.initials(selectedCustomer.name)}</div>
          <div class="main">
            <div class="title">${escapeHtml(selectedCustomer.name)}</div>
            <div class="subtitle">${escapeHtml(selectedCustomer.phone || '')}${familyOptions.length > 1 ? ` · <span data-i18n="cust.familyOf"></span>` : ''}</div>
          </div>
          ${editingOrderId ? '' : `<button class="btn btn-sm btn-outline" id="btn-change-cust" data-i18n="common.edit"></button>`}
        </div>
      `;
      I18n.apply(el);
      const changeBtn = el.querySelector('#btn-change-cust');
      if (changeBtn) {
        changeBtn.onclick = () => {
          selectedCustomer = null;
          familyOptions = [];
          items = [];
          renderCustomerPicker();
          renderItems();
          recomputeTotals();
        };
      }
      return;
    }
    el.innerHTML = `
      <input type="text" id="cust-search" data-i18n-placeholder="order.searchCustomer" />
      <div id="cust-suggestions" style="margin-top:8px"></div>
      <a class="link" id="btn-quick-add-cust" data-i18n="order.addNewCustomer" style="display:inline-block;margin-top:8px"></a>
    `;
    I18n.apply(el);
    let debounce = null;
    el.querySelector('#cust-search').addEventListener('input', (e) => {
      clearTimeout(debounce);
      const val = e.target.value;
      debounce = setTimeout(async () => {
        const rows = val.trim() ? await CustomerService.list({ search: val }) : [];
        const box = document.getElementById('cust-suggestions');
        if (!box) return;
        box.innerHTML = rows.slice(0, 6).map((c) => `
          <div class="list-row" style="margin:0 0 8px" data-pick="${c.id}">
            <div class="avatar">${Format.initials(c.name)}</div>
            <div class="main"><div class="title">${escapeHtml(c.name)}</div><div class="subtitle">${escapeHtml(c.phone || '')}</div></div>
          </div>
        `).join('');
        box.querySelectorAll('[data-pick]').forEach((row) => {
          row.onclick = async () => {
            const id = parseInt(row.getAttribute('data-pick'), 10);
            selectedCustomer = rows.find((r) => r.id === id);
            await loadFamilyOptions();
            await loadCustomerMeasurements(selectedCustomer.id);
            renderCustomerPicker();
            renderItems();
          };
        });
      }, 200);
    });
    el.querySelector('#btn-quick-add-cust').onclick = () => {
      CustomersScreen.openNew(async (newId, data) => {
        selectedCustomer = { id: newId, name: data.name, phone: data.phone };
        await loadFamilyOptions();
        await loadCustomerMeasurements(selectedCustomer.id);
        renderCustomerPicker();
        renderItems();
      });
    };
  }

  async function loadCustomerMeasurements(customerId) {
    if (measurementsByCustomer[customerId]) return measurementsByCustomer[customerId];
    const rows = await MeasurementService.listByCustomer(customerId);
    measurementsByCustomer[customerId] = rows;
    return rows;
  }

  async function loadDesignOptions(categoryId) {
    if (!categoryId || designOptionsByCategory[categoryId]) return designOptionsByCategory[categoryId] || [];
    const rows = await DesignOptionService.listForCategory(categoryId);
    designOptionsByCategory[categoryId] = rows;
    return rows;
  }

  // ---------------- Item rows ----------------

  function addItemRow() {
    const cat = categories[0];
    items.push({
      rowId: ++rowSeq,
      categoryId: cat ? cat.id : null,
      categoryName: cat ? cat.name : '',
      measurementId: null,
      garmentLabel: cat ? cat.name : '',
      quantity: 1,
      rate: cat ? Number(cat.default_price) : 0,
      rateTouched: false,
      labelTouched: false,
      forCustomerId: selectedCustomer ? selectedCustomer.id : null,
      forCustomerName: selectedCustomer ? selectedCustomer.name : '',
      fabricTypeId: null,
      fabricTypeName: '',
      designLabels: [],
      photoData: null
    });
    if (cat) loadDesignOptions(cat.id).then(renderItems);
  }

  function profilesFor(customerId, categoryId) {
    const rows = measurementsByCustomer[customerId] || [];
    return rows.filter((m) => m.category_id === categoryId);
  }

  function renderItems() {
    const container = document.getElementById('items-container');
    if (!container) return;
    if (!items.length) {
      container.innerHTML = `<p class="text-muted center" data-i18n="order.noItems" style="padding:16px 0"></p>`;
      I18n.apply(container);
      return;
    }
    container.innerHTML = items.map(itemRowHtml).join('');
    I18n.apply(container);

    items.forEach((it) => {
      const row = container.querySelector(`[data-row="${it.rowId}"]`);
      if (!row) return;

      const selFor = row.querySelector('.sel-for');
      if (selFor) {
        selFor.addEventListener('change', (e) => {
          const person = familyOptions.find((p) => p.id === parseInt(e.target.value, 10));
          it.forCustomerId = person ? person.id : selectedCustomer.id;
          it.forCustomerName = person ? person.name : selectedCustomer.name;
          it.measurementId = null;
          loadCustomerMeasurements(it.forCustomerId).then(renderItems);
        });
      }

      row.querySelector('.sel-category').addEventListener('change', (e) => {
        const cat = categories.find((c) => c.id === parseInt(e.target.value, 10));
        it.categoryId = cat ? cat.id : null;
        it.categoryName = cat ? cat.name : '';
        it.measurementId = null;
        it.designLabels = [];
        if (!it.rateTouched) it.rate = cat ? Number(cat.default_price) : 0;
        if (!it.labelTouched) it.garmentLabel = cat ? cat.name : '';
        if (cat) loadDesignOptions(cat.id).then(renderItems);
        else renderItems();
        recomputeTotals();
      });

      const selMeas = row.querySelector('.sel-measurement');
      if (selMeas) {
        selMeas.addEventListener('change', (e) => {
          const v = e.target.value;
          it.measurementId = v ? parseInt(v, 10) : null;
        });
      }

      const selFabric = row.querySelector('.sel-fabric');
      if (selFabric) {
        selFabric.addEventListener('change', (e) => {
          const fab = fabricTypes.find((f) => f.id === parseInt(e.target.value, 10));
          it.fabricTypeId = fab ? fab.id : null;
          it.fabricTypeName = fab ? fab.name : '';
        });
      }

      row.querySelectorAll('.chk-design').forEach((chk) => {
        chk.addEventListener('change', () => {
          const label = chk.getAttribute('data-label');
          if (chk.checked) {
            if (!it.designLabels.includes(label)) it.designLabels.push(label);
          } else {
            it.designLabels = it.designLabels.filter((l) => l !== label);
          }
        });
      });

      row.querySelector('.in-garment-label').addEventListener('input', (e) => {
        it.labelTouched = true;
        it.garmentLabel = e.target.value;
      });
      row.querySelector('.in-qty').addEventListener('input', (e) => {
        it.quantity = Math.max(0, parseFloat(e.target.value) || 0);
        updateRowSubtotal(it);
        recomputeTotals();
      });
      row.querySelector('.in-rate').addEventListener('input', (e) => {
        it.rateTouched = true;
        it.rate = Math.max(0, parseFloat(e.target.value) || 0);
        updateRowSubtotal(it);
        recomputeTotals();
      });
      row.querySelector('.btn-remove-item').addEventListener('click', () => {
        items = items.filter((x) => x.rowId !== it.rowId);
        renderItems();
        recomputeTotals();
      });
      const pickPhotoBtn = row.querySelector('.btn-pick-item-photo');
      const photoInput = row.querySelector('.in-item-photo');
      if (pickPhotoBtn && photoInput) {
        pickPhotoBtn.onclick = () => photoInput.click();
        photoInput.addEventListener('change', (e) => {
          const file = e.target.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            it.photoData = reader.result;
            renderItems();
          };
          reader.readAsDataURL(file);
        });
      }
      const removePhotoBtn = row.querySelector('.btn-remove-item-photo');
      if (removePhotoBtn) {
        removePhotoBtn.onclick = () => { it.photoData = null; renderItems(); };
      }
      const photoThumb = row.querySelector('.item-photo-thumb');
      if (photoThumb) photoThumb.onclick = () => Lightbox.open(it.photoData);
      const addProfileLink = row.querySelector('.link-add-profile');
      if (addProfileLink) {
        addProfileLink.onclick = async () => {
          if (!it.forCustomerId) return;
          const ok = await Modal.confirm({ message: I18n.t('order.addProfileWarning') });
          if (!ok) return;
          Router.navigate('/measurements/' + it.forCustomerId);
        };
      }
    });
  }

  function updateRowSubtotal(it) {
    const el = document.querySelector(`[data-row="${it.rowId}"] .row-subtotal`);
    if (el) el.textContent = Format.money(it.quantity * it.rate);
  }

  function itemRowHtml(it) {
    const catOptions = categories.map((c) => `<option value="${c.id}" ${c.id === it.categoryId ? 'selected' : ''}>${Icons.categoryEmoji(c.icon)} ${escapeHtml(c.name)}</option>`).join('');

    // "For" (which family member) — only worth showing when there
    // actually is a family to choose from; a lone customer's items
    // are silently "for" themselves.
    const forField = familyOptions.length > 1 ? `
      <div class="field" style="margin-bottom:8px">
        <label data-i18n="order.forWhom"></label>
        <select class="sel-for">
          ${familyOptions.map((p) => `<option value="${p.id}" ${p.id === it.forCustomerId ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
        </select>
      </div>
    ` : '';

    const profiles = it.forCustomerId ? profilesFor(it.forCustomerId, it.categoryId) : [];
    const measurementField = it.forCustomerId ? `
      <div class="field" style="margin-bottom:8px">
        <label data-i18n="order.measurementProfile"></label>
        <select class="sel-measurement">
          <option value="" data-i18n="order.noProfile" ${!it.measurementId ? 'selected' : ''}></option>
          ${profiles.map((p) => `<option value="${p.id}" ${p.id === it.measurementId ? 'selected' : ''}>${escapeHtml(p.profile_label || p.category_name)}</option>`).join('')}
        </select>
        ${!profiles.length ? `<a class="link link-add-profile" data-i18n="order.addProfileLink" style="display:inline-block;margin-top:6px;font-size:12px"></a>` : ''}
      </div>
    ` : `<p class="text-muted" style="font-size:12px;margin-bottom:8px" data-i18n="order.selectCustomerForProfiles"></p>`;

    const fabricField = fabricTypes.length ? `
      <div class="field" style="margin-bottom:8px">
        <label data-i18n="order.fabricType"></label>
        <select class="sel-fabric">
          <option value="" data-i18n="order.noFabric" ${!it.fabricTypeId ? 'selected' : ''}></option>
          ${fabricTypes.map((f) => `<option value="${f.id}" ${f.id === it.fabricTypeId ? 'selected' : ''}>${escapeHtml(FabricTypeService.label(f))}</option>`).join('')}
        </select>
      </div>
    ` : '';

    const designChoices = it.categoryId ? (designOptionsByCategory[it.categoryId] || []) : [];
    const designField = designChoices.length ? `
      <div class="field" style="margin-bottom:8px">
        <label data-i18n="order.designOptions"></label>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px">
          ${designChoices.map((d) => {
            const lbl = DesignOptionService.label(d);
            const checked = it.designLabels.includes(d.name);
            return `<label class="chip-checkbox" style="display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border:1px solid var(--color-border);border-radius:var(--radius-pill);font-size:12px;cursor:pointer">
              <input type="checkbox" class="chk-design" data-label="${escapeHtml(d.name)}" ${checked ? 'checked' : ''} style="width:14px;height:14px" />
              ${escapeHtml(lbl)}
            </label>`;
          }).join('')}
        </div>
      </div>
    ` : '';

    return `
      <div class="card" style="margin-bottom:10px" data-row="${it.rowId}">
        ${forField}
        <div class="field" style="margin-bottom:8px">
          <label data-i18n="order.category"></label>
          <select class="sel-category">${catOptions}</select>
        </div>
        ${measurementField}
        ${fabricField}
        ${designField}
        <div class="field" style="margin-bottom:8px">
          <label data-i18n="order.itemPhoto"></label>
          <div style="display:flex;align-items:center;gap:10px">
            <input type="file" accept="image/*" capture="environment" class="hidden in-item-photo" />
            <button type="button" class="btn btn-outline btn-sm btn-pick-item-photo">${Icons.svg('camera', 14)} <span data-i18n="order.itemPhotoBtn"></span></button>
            ${it.photoData ? `<img src="${it.photoData}" class="item-photo-thumb" style="width:36px;height:36px;object-fit:cover;border-radius:6px;cursor:zoom-in" />` : ''}
            ${it.photoData ? `<button type="button" class="icon-btn sm btn-remove-item-photo" title="${I18n.t('common.delete')}">${Icons.svg('trash', 14)}</button>` : ''}
          </div>
        </div>
        <div class="field" style="margin-bottom:8px">
          <label data-i18n="order.garmentLabel"></label>
          <input class="in-garment-label" data-i18n-placeholder="order.garmentLabelHint" value="${escapeHtml(it.garmentLabel)}" />
        </div>
        <div class="field-row" style="align-items:flex-end">
          <div class="field" style="margin-bottom:0">
            <label data-i18n="order.quantity"></label>
            <input type="number" min="0" step="1" class="in-qty" value="${it.quantity}" />
          </div>
          <div class="field" style="margin-bottom:0">
            <label data-i18n="order.rate"></label>
            <input type="number" min="0" class="in-rate" value="${it.rate}" />
          </div>
          <button class="btn btn-danger btn-icon btn-remove-item" style="width:40px;height:40px;flex-shrink:0">${Icons.svg('trash', 16)}</button>
        </div>
        <div class="flex-between mt-8" style="font-size:13px">
          <span class="text-muted" data-i18n="order.subtotal"></span>
          <b class="row-subtotal">${Format.money(it.quantity * it.rate)}</b>
        </div>
      </div>
    `;
  }

  // ---------------- Totals ----------------

  function recomputeTotals() {
    const discount = parseFloat(document.getElementById('in-discount').value) || 0;
    const extra = parseFloat(document.getElementById('in-extra').value) || 0;
    const delivery = parseFloat(document.getElementById('in-delivery-charges').value) || 0;
    const advanceEl = document.getElementById('in-advance');
    const totals = OrderService.computeTotals(items, { discount, extraCharges: extra, deliveryCharges: delivery });
    document.getElementById('sum-subtotal').textContent = Format.money(totals.subtotal);
    document.getElementById('sum-grand').textContent = Format.money(totals.grandTotal);
    if (editingOrderId) {
      const alreadyPaid = editingOrder.grand_total - editingOrder.remaining_balance;
      document.getElementById('sum-remaining').textContent = Format.money(Math.max(0, totals.grandTotal - alreadyPaid));
    } else {
      const advance = parseFloat(advanceEl.value) || 0;
      document.getElementById('sum-remaining').textContent = Format.money(Math.max(0, totals.grandTotal - advance));
    }
    return totals;
  }

  // ---------------- Save ----------------

  function itemsPayload() {
    return items.map((it) => ({
      categoryId: it.categoryId,
      categoryName: it.categoryName,
      measurementId: it.measurementId,
      garmentLabel: it.garmentLabel,
      quantity: it.quantity,
      rate: it.rate,
      forCustomerId: it.forCustomerId,
      forCustomerName: it.forCustomerName,
      fabricTypeId: it.fabricTypeId,
      fabricTypeName: it.fabricTypeName,
      designLabels: it.designLabels,
      photoPath: it.photoData
    }));
  }

  async function save() {
    if (!selectedCustomer) { Toast.error(I18n.t('order.selectCustomerFirst')); return; }
    if (!items.length) { Toast.error(I18n.t('order.addAtLeastOneItem')); return; }
    const invalidItem = items.some((it) => !it.categoryId || it.quantity <= 0);
    if (invalidItem) { Toast.error(I18n.t('order.invalidItem')); return; }

    const btn = document.getElementById('btn-save-order');
    btn.disabled = true;

    const discount = parseFloat(document.getElementById('in-discount').value) || 0;
    const extra = parseFloat(document.getElementById('in-extra').value) || 0;
    const delivery = parseFloat(document.getElementById('in-delivery-charges').value) || 0;

    const orderData = {
      customerId: selectedCustomer.id,
      orderDate: document.getElementById('in-order-date').value || Format.todayIso(),
      deliveryDate: document.getElementById('in-delivery-date').value || null,
      urgent: document.getElementById('in-urgent').checked,
      items: itemsPayload(),
      discount, extraCharges: extra, deliveryCharges: delivery,
      notes: document.getElementById('in-notes').value.trim()
    };

    try {
      if (editingOrderId) {
        orderData.paymentMethod = editingOrder.payment_method;
        await OrderService.updateOrder(editingOrderId, orderData);
        Toast.success(I18n.t('order.orderUpdated'));
        Router.navigate('/orders/' + editingOrderId);
      } else {
        const advance = parseFloat(document.getElementById('in-advance').value) || 0;
        orderData.advancePaid = advance;
        orderData.paymentMethod = document.getElementById('in-payment-method').value;
        const order = await OrderService.createOrder(orderData);
        Toast.success(I18n.t('order.orderCreated') + ': ' + order.invoice_no);
        Router.navigate('/orders/' + order.id);
      }
    } catch (err) {
      console.error(err);
      Toast.error(I18n.t('common.error'));
      btn.disabled = false;
    }
  }

  return { render };
})();
