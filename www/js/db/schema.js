/* ============================================================
   SQLite schema for Tailor Shop POS.
   SCHEMA_VERSION drives a simple migration runner in db.js —
   bump it and add a branch in runMigrations() when the shape
   of the tables needs to change after the app has shipped.
   ============================================================ */

const SCHEMA_VERSION = 2;

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS meta (
     key TEXT PRIMARY KEY,
     value TEXT
   )`,

  `CREATE TABLE IF NOT EXISTS users (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     username TEXT UNIQUE NOT NULL,
     password_hash TEXT NOT NULL,
     role TEXT NOT NULL DEFAULT 'admin',
     full_name TEXT,
     active INTEGER NOT NULL DEFAULT 1,
     last_login TEXT,
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   )`,

  `CREATE TABLE IF NOT EXISTS settings (
     key TEXT PRIMARY KEY,
     value TEXT
   )`,

  `CREATE TABLE IF NOT EXISTS customers (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT NOT NULL,
     phone TEXT,
     whatsapp TEXT,
     address TEXT,
     notes TEXT,
     photo_path TEXT,
     head_customer_id INTEGER REFERENCES customers(id),
     relation TEXT,
     created_at TEXT NOT NULL DEFAULT (datetime('now')),
     updated_at TEXT NOT NULL DEFAULT (datetime('now'))
   )`,

  `CREATE TABLE IF NOT EXISTS categories (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT NOT NULL,
     icon TEXT NOT NULL DEFAULT 'shirt',
     color TEXT NOT NULL DEFAULT '#7c2d3c',
     default_price REAL NOT NULL DEFAULT 0,
     enabled INTEGER NOT NULL DEFAULT 1,
     sort_order INTEGER NOT NULL DEFAULT 0
   )`,

  `CREATE TABLE IF NOT EXISTS measurement_fields (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     category_id INTEGER NOT NULL REFERENCES categories(id),
     field_key TEXT NOT NULL,
     field_label TEXT NOT NULL,
     field_label_ur TEXT,
     unit TEXT NOT NULL DEFAULT 'in',
     field_order INTEGER NOT NULL DEFAULT 0,
     enabled INTEGER NOT NULL DEFAULT 1,
     UNIQUE(category_id, field_key)
   )`,

  `CREATE TABLE IF NOT EXISTS measurements (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
     category_id INTEGER NOT NULL REFERENCES categories(id),
     profile_label TEXT,
     values_json TEXT NOT NULL DEFAULT '{}',
     notes TEXT,
     created_at TEXT NOT NULL DEFAULT (datetime('now')),
     updated_at TEXT NOT NULL DEFAULT (datetime('now'))
   )`,

  `CREATE TABLE IF NOT EXISTS orders (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     invoice_no TEXT UNIQUE NOT NULL,
     customer_id INTEGER NOT NULL REFERENCES customers(id),
     order_date TEXT NOT NULL,
     delivery_date TEXT,
     urgent INTEGER NOT NULL DEFAULT 0,
     status TEXT NOT NULL DEFAULT 'Order Placed',
     subtotal REAL NOT NULL DEFAULT 0,
     discount REAL NOT NULL DEFAULT 0,
     extra_charges REAL NOT NULL DEFAULT 0,
     delivery_charges REAL NOT NULL DEFAULT 0,
     grand_total REAL NOT NULL DEFAULT 0,
     advance_paid REAL NOT NULL DEFAULT 0,
     remaining_balance REAL NOT NULL DEFAULT 0,
     payment_method TEXT DEFAULT 'Cash',
     notes TEXT,
     delivered_at TEXT,
     delivered_by TEXT,
     signature_data TEXT,
     created_by TEXT,
     created_at TEXT NOT NULL DEFAULT (datetime('now')),
     updated_at TEXT NOT NULL DEFAULT (datetime('now'))
   )`,

  `CREATE TABLE IF NOT EXISTS fabric_types (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT NOT NULL,
     name_ur TEXT,
     enabled INTEGER NOT NULL DEFAULT 1,
     sort_order INTEGER NOT NULL DEFAULT 0
   )`,

  `CREATE TABLE IF NOT EXISTS design_options (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     category_id INTEGER REFERENCES categories(id),
     name TEXT NOT NULL,
     name_ur TEXT,
     enabled INTEGER NOT NULL DEFAULT 1,
     sort_order INTEGER NOT NULL DEFAULT 0
   )`,

  `CREATE TABLE IF NOT EXISTS order_items (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
     category_id INTEGER REFERENCES categories(id),
     category_name TEXT,
     measurement_id INTEGER REFERENCES measurements(id),
     garment_label TEXT,
     for_customer_id INTEGER REFERENCES customers(id),
     for_customer_name TEXT,
     fabric_type_id INTEGER REFERENCES fabric_types(id),
     fabric_type_name TEXT,
     design_labels TEXT,
     quantity INTEGER NOT NULL DEFAULT 1,
     rate REAL NOT NULL DEFAULT 0,
     subtotal REAL NOT NULL DEFAULT 0,
     photo_path TEXT,
     notes TEXT
   )`,

  `CREATE TABLE IF NOT EXISTS order_status_history (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
     status TEXT NOT NULL,
     changed_by TEXT,
     changed_at TEXT NOT NULL DEFAULT (datetime('now'))
   )`,

  `CREATE TABLE IF NOT EXISTS payments (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
     amount REAL NOT NULL,
     method TEXT NOT NULL DEFAULT 'Cash',
     note TEXT,
     received_by TEXT,
     paid_at TEXT NOT NULL DEFAULT (datetime('now'))
   )`,

  `CREATE TABLE IF NOT EXISTS suppliers (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT NOT NULL,
     phone TEXT,
     address TEXT,
     notes TEXT,
     created_at TEXT NOT NULL DEFAULT (datetime('now')),
     updated_at TEXT NOT NULL DEFAULT (datetime('now'))
   )`,

  `CREATE TABLE IF NOT EXISTS purchases (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     purchase_no TEXT UNIQUE NOT NULL,
     supplier_id INTEGER REFERENCES suppliers(id),
     purchase_date TEXT NOT NULL,
     subtotal REAL NOT NULL DEFAULT 0,
     discount REAL NOT NULL DEFAULT 0,
     grand_total REAL NOT NULL DEFAULT 0,
     paid_amount REAL NOT NULL DEFAULT 0,
     balance REAL NOT NULL DEFAULT 0,
     payment_method TEXT DEFAULT 'Cash',
     notes TEXT,
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   )`,

  `CREATE TABLE IF NOT EXISTS inventory_items (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT NOT NULL,
     category TEXT NOT NULL DEFAULT 'Fabric',
     unit TEXT NOT NULL DEFAULT 'meter',
     unit_price REAL NOT NULL DEFAULT 0,
     quantity_in_stock REAL NOT NULL DEFAULT 0,
     low_stock_threshold REAL NOT NULL DEFAULT 5,
     sku TEXT,
     notes TEXT,
     created_at TEXT NOT NULL DEFAULT (datetime('now')),
     updated_at TEXT NOT NULL DEFAULT (datetime('now'))
   )`,

  `CREATE TABLE IF NOT EXISTS purchase_items (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
     inventory_item_id INTEGER REFERENCES inventory_items(id),
     item_name TEXT,
     quantity REAL NOT NULL DEFAULT 0,
     unit TEXT,
     rate REAL NOT NULL DEFAULT 0,
     subtotal REAL NOT NULL DEFAULT 0
   )`,

  `CREATE TABLE IF NOT EXISTS expenses (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     expense_date TEXT NOT NULL,
     category TEXT NOT NULL DEFAULT 'Other',
     description TEXT,
     amount REAL NOT NULL DEFAULT 0,
     payment_method TEXT NOT NULL DEFAULT 'Cash',
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   )`,

  `CREATE TABLE IF NOT EXISTS backups (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     file_name TEXT NOT NULL,
     created_at TEXT NOT NULL DEFAULT (datetime('now')),
     size INTEGER NOT NULL DEFAULT 0
   )`,

  `CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)`,
  `CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id)`,
  `CREATE INDEX IF NOT EXISTS idx_orders_invoice ON orders(invoice_no)`,
  `CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id)`,
  `CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id)`,
  `CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name)`,
  `CREATE INDEX IF NOT EXISTS idx_order_status_history_order ON order_status_history(order_id)`,
  `CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date)`,
  `CREATE INDEX IF NOT EXISTS idx_measurement_fields_category ON measurement_fields(category_id)`,
  `CREATE INDEX IF NOT EXISTS idx_measurements_customer ON measurements(customer_id)`,
  `CREATE INDEX IF NOT EXISTS idx_purchases_supplier ON purchases(supplier_id)`,
  `CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase ON purchase_items(purchase_id)`,
  `CREATE INDEX IF NOT EXISTS idx_inventory_items_name ON inventory_items(name)`,
  `CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name)`,
  `CREATE INDEX IF NOT EXISTS idx_customers_head ON customers(head_customer_id)`,
  `CREATE INDEX IF NOT EXISTS idx_order_items_for_customer ON order_items(for_customer_id)`,
  `CREATE INDEX IF NOT EXISTS idx_design_options_category ON design_options(category_id)`

  /* When SCHEMA_VERSION bumps post-ship, add a migration branch here
     (or in db.js's runMigrations()) instead of editing the statements
     above in place, so upgrading installs never lose existing data. */
];

const DEFAULT_SETTINGS = {
  shop_name: 'Soothmedia Tailors',
  shop_address: '',
  shop_phone: '',
  shop_logo: '',
  currency: 'PKR',
  tax_percent: '0',
  language: 'en',
  theme: 'light',
  auto_backup: '1',
  auto_logout_minutes: '0'
};

const DEFAULT_CATEGORIES = [
  { name: 'Shirt', icon: 'shirt', color: '#0891b2', price: 800 },
  { name: 'Pant', icon: 'pant', color: '#475569', price: 700 },
  { name: 'Suit', icon: 'suit', color: '#6d28d9', price: 2500 },
  { name: 'Ladies Suit', icon: 'ladies_suit', color: '#db2777', price: 1800 },
  { name: 'Abaya', icon: 'abaya', color: '#4b5563', price: 1500 },
  { name: 'Sherwani', icon: 'sherwani', color: '#b45309', price: 3500 },
  { name: 'Waistcoat', icon: 'waistcoat', color: '#78350f', price: 900 },
  { name: 'Kids Wear', icon: 'kids', color: '#16a34a', price: 600 },
  { name: 'Others', icon: 'others', color: '#64748b', price: 500 }
];

const DEFAULT_MEASUREMENT_FIELDS = {
  'Shirt': [
    { field_key: 'chest', field_label: 'Chest', field_label_ur: 'سینہ', unit: 'in', order: 0 },
    { field_key: 'waist', field_label: 'Waist', field_label_ur: 'کمر', unit: 'in', order: 1 },
    { field_key: 'shoulder', field_label: 'Shoulder', field_label_ur: 'کندھا', unit: 'in', order: 2 },
    { field_key: 'sleeve', field_label: 'Sleeve', field_label_ur: 'آستین', unit: 'in', order: 3 },
    { field_key: 'collar', field_label: 'Collar', field_label_ur: 'کالر', unit: 'in', order: 4 },
    { field_key: 'length', field_label: 'Length', field_label_ur: 'لمبائی', unit: 'in', order: 5 }
  ],
  'Pant': [
    { field_key: 'waist', field_label: 'Waist', field_label_ur: 'کمر', unit: 'in', order: 0 },
    { field_key: 'hip', field_label: 'Hip', field_label_ur: 'کولہا', unit: 'in', order: 1 },
    { field_key: 'length', field_label: 'Length', field_label_ur: 'لمبائی', unit: 'in', order: 2 },
    { field_key: 'inseam', field_label: 'Inseam', field_label_ur: 'اندرونی لمبائی', unit: 'in', order: 3 },
    { field_key: 'bottom', field_label: 'Bottom', field_label_ur: 'پائنچہ', unit: 'in', order: 4 }
  ],
  'Suit': [
    { field_key: 'chest', field_label: 'Chest', field_label_ur: 'سینہ', unit: 'in', order: 0 },
    { field_key: 'waist', field_label: 'Waist', field_label_ur: 'کمر', unit: 'in', order: 1 },
    { field_key: 'shoulder', field_label: 'Shoulder', field_label_ur: 'کندھا', unit: 'in', order: 2 },
    { field_key: 'sleeve', field_label: 'Sleeve', field_label_ur: 'آستین', unit: 'in', order: 3 },
    { field_key: 'collar', field_label: 'Collar', field_label_ur: 'کالر', unit: 'in', order: 4 },
    { field_key: 'jacket_length', field_label: 'Jacket Length', field_label_ur: 'کوٹ کی لمبائی', unit: 'in', order: 5 },
    { field_key: 'pant_length', field_label: 'Pant Length', field_label_ur: 'پتلون کی لمبائی', unit: 'in', order: 6 },
    { field_key: 'hip', field_label: 'Hip', field_label_ur: 'کولہا', unit: 'in', order: 7 }
  ],
  'Ladies Suit': [
    { field_key: 'chest', field_label: 'Chest', field_label_ur: 'سینہ', unit: 'in', order: 0 },
    { field_key: 'waist', field_label: 'Waist', field_label_ur: 'کمر', unit: 'in', order: 1 },
    { field_key: 'hip', field_label: 'Hip', field_label_ur: 'کولہا', unit: 'in', order: 2 },
    { field_key: 'shoulder', field_label: 'Shoulder', field_label_ur: 'کندھا', unit: 'in', order: 3 },
    { field_key: 'sleeve', field_label: 'Sleeve', field_label_ur: 'آستین', unit: 'in', order: 4 },
    { field_key: 'length', field_label: 'Length', field_label_ur: 'لمبائی', unit: 'in', order: 5 },
    { field_key: 'shalwar_length', field_label: 'Shalwar Length', field_label_ur: 'شلوار کی لمبائی', unit: 'in', order: 6 }
  ],
  'Abaya': [
    { field_key: 'chest', field_label: 'Chest', field_label_ur: 'سینہ', unit: 'in', order: 0 },
    { field_key: 'waist', field_label: 'Waist', field_label_ur: 'کمر', unit: 'in', order: 1 },
    { field_key: 'hip', field_label: 'Hip', field_label_ur: 'کولہا', unit: 'in', order: 2 },
    { field_key: 'length', field_label: 'Length', field_label_ur: 'لمبائی', unit: 'in', order: 3 },
    { field_key: 'sleeve', field_label: 'Sleeve', field_label_ur: 'آستین', unit: 'in', order: 4 },
    { field_key: 'shoulder', field_label: 'Shoulder', field_label_ur: 'کندھا', unit: 'in', order: 5 }
  ],
  'Sherwani': [
    { field_key: 'chest', field_label: 'Chest', field_label_ur: 'سینہ', unit: 'in', order: 0 },
    { field_key: 'waist', field_label: 'Waist', field_label_ur: 'کمر', unit: 'in', order: 1 },
    { field_key: 'shoulder', field_label: 'Shoulder', field_label_ur: 'کندھا', unit: 'in', order: 2 },
    { field_key: 'sleeve', field_label: 'Sleeve', field_label_ur: 'آستین', unit: 'in', order: 3 },
    { field_key: 'collar', field_label: 'Collar', field_label_ur: 'کالر', unit: 'in', order: 4 },
    { field_key: 'length', field_label: 'Length', field_label_ur: 'لمبائی', unit: 'in', order: 5 }
  ],
  'Waistcoat': [
    { field_key: 'chest', field_label: 'Chest', field_label_ur: 'سینہ', unit: 'in', order: 0 },
    { field_key: 'waist', field_label: 'Waist', field_label_ur: 'کمر', unit: 'in', order: 1 },
    { field_key: 'length', field_label: 'Length', field_label_ur: 'لمبائی', unit: 'in', order: 2 }
  ],
  'Kids Wear': [
    { field_key: 'chest', field_label: 'Chest', field_label_ur: 'سینہ', unit: 'in', order: 0 },
    { field_key: 'waist', field_label: 'Waist', field_label_ur: 'کمر', unit: 'in', order: 1 },
    { field_key: 'length', field_label: 'Length', field_label_ur: 'لمبائی', unit: 'in', order: 2 },
    { field_key: 'shoulder', field_label: 'Shoulder', field_label_ur: 'کندھا', unit: 'in', order: 3 },
    { field_key: 'sleeve', field_label: 'Sleeve', field_label_ur: 'آستین', unit: 'in', order: 4 }
  ],
  'Others': []
};

const DEFAULT_FABRIC_TYPES = [
  { name: 'Cotton', name_ur: 'کاٹن' },
  { name: 'Wash n Wear', name_ur: 'واش اینڈ ویئر' },
  { name: 'Latha', name_ur: 'لٹھا' },
  { name: 'Boski', name_ur: 'بوسکی' },
  { name: 'Linen', name_ur: 'لینن' },
  { name: 'Silk', name_ur: 'ریشم' },
  { name: 'Karandi', name_ur: 'کاریڈی' },
  { name: 'Khaddar', name_ur: 'کھدر' }
];

const DEFAULT_DESIGN_OPTIONS = [
  // category_id is resolved to null (applies to every category) by
  // default; the settings screen lets the shop scope one to a
  // specific category (e.g. "Gol Daman" only for Shirt/Kurta).
  { name: 'Gol Daman', name_ur: 'گول دامن' },
  { name: 'Chorasta Daman', name_ur: 'چوکور دامن' },
  { name: 'Front Pocket', name_ur: 'فرنٹ جیب' },
  { name: 'Side Pocket', name_ur: 'سائیڈ جیب' },
  { name: 'No Pocket', name_ur: 'بغیر جیب' },
  { name: 'Round Collar', name_ur: 'گول کالر' },
  { name: 'Chinese Collar', name_ur: 'چائنیز کالر' },
  { name: 'Plain Collar', name_ur: 'سادہ کالر' },
  { name: 'Single Button Cuff', name_ur: 'ایک بٹن کف' },
  { name: 'Double Button Cuff', name_ur: 'دو بٹن کف' },
  { name: 'Plain Sleeve', name_ur: 'سادہ آستین' }
];
