/* ============================================================
   Format — small display-formatting helpers shared across screens.
   ============================================================ */

const Format = (function () {
  let currencySymbol = 'Rs.';

  function setCurrencySymbol(sym) { currencySymbol = sym || 'Rs.'; }

  function money(value) {
    const n = Number(value || 0);
    const rounded = Math.round(n * 100) / 100;
    const parts = rounded.toFixed(rounded % 1 === 0 ? 0 : 2).toString().split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return currencySymbol + ' ' + parts.join('.');
  }

  function shortDate(isoOrDateStr) {
    if (!isoOrDateStr) return '—';
    const d = new Date(isoOrDateStr);
    if (isNaN(d.getTime())) return isoOrDateStr;
    return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function dateTime(isoOrDateStr) {
    if (!isoOrDateStr) return '—';
    const d = new Date(isoOrDateStr);
    if (isNaN(d.getTime())) return isoOrDateStr;
    return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  function todayIso() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function initials(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
  }

  // Slugifies a status label into a CSS class suffix, e.g.
  // "Order Placed" -> "badge-orderplaced" (matches the --status-*
  // custom properties in theme.css, which use the same slugs).
  function statusBadgeClass(status) {
    const slug = String(status || 'pending').toLowerCase().replace(/[^a-z0-9]/g, '');
    return 'badge badge-' + slug;
  }

  function toWhatsappNumber(phone, countryCode) {
    let digits = String(phone || '').replace(/\D/g, '');
    if (!digits) return '';
    const cc = String(countryCode || '92').replace(/\D/g, '');
    if (digits.startsWith(cc)) return digits;
    if (digits.startsWith('0')) digits = digits.slice(1);
    return cc + digits;
  }

  return { setCurrencySymbol, money, shortDate, dateTime, todayIso, initials, statusBadgeClass, toWhatsappNumber };
})();
