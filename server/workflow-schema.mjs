export function migrateWorkflows(db) {
  for (const [table, name, definition] of [
    ['orders', 'final_total_cents', 'INTEGER'],
    ['orders', 'final_snap_eligible_cents', 'INTEGER'],
    ['market_sessions', 'cancelled', 'INTEGER NOT NULL DEFAULT 0'],
    ['market_sessions', 'notice', "TEXT NOT NULL DEFAULT ''"],
    ['markets', 'official_location_id', "TEXT NOT NULL DEFAULT ''"],
    ['vendor_profiles', 'business_name', "TEXT NOT NULL DEFAULT ''"],
    ['vendor_profiles', 'public_description', "TEXT NOT NULL DEFAULT ''"],
    ['vendor_profiles', 'version', 'INTEGER NOT NULL DEFAULT 0'],
  ]) if (!db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  db.exec(`
    CREATE TABLE IF NOT EXISTS order_submissions (
      client_id INTEGER NOT NULL REFERENCES users(id), submission_key TEXT NOT NULL,
      request_hash TEXT NOT NULL, order_id TEXT NOT NULL REFERENCES orders(id), PRIMARY KEY(client_id,submission_key)
    );
    CREATE TABLE IF NOT EXISTS fulfillment_items (
      order_id TEXT NOT NULL REFERENCES orders(id), product_id INTEGER NOT NULL REFERENCES products(id),
      quantity REAL NOT NULL CHECK(quantity>=0), PRIMARY KEY(order_id,product_id)
    );
    CREATE VIEW IF NOT EXISTS effective_order_items AS SELECT i.order_id,i.product_id,i.name,i.unit,i.price_cents,
      COALESCE(f.quantity,i.quantity) AS quantity,i.retailer_id FROM order_items i
      LEFT JOIN fulfillment_items f ON f.order_id=i.order_id AND f.product_id=i.product_id;
    CREATE TABLE IF NOT EXISTS order_adjustments (
      order_id TEXT PRIMARY KEY REFERENCES orders(id), items_json TEXT NOT NULL, total_cents INTEGER NOT NULL,
      eligible_cents INTEGER NOT NULL, reason TEXT NOT NULL, status TEXT NOT NULL,
      version INTEGER NOT NULL, requested_by INTEGER NOT NULL REFERENCES users(id), reviewed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS user_roles (user_id INTEGER NOT NULL REFERENCES users(id),role TEXT NOT NULL,PRIMARY KEY(user_id,role));
    INSERT OR IGNORE INTO user_roles SELECT id,role FROM users;
    CREATE TABLE IF NOT EXISTS session_roles (token_hash TEXT PRIMARY KEY REFERENCES sessions(token_hash) ON DELETE CASCADE,role TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS vendor_applications (
      id INTEGER PRIMARY KEY,applicant_id INTEGER NOT NULL REFERENCES users(id),market_id INTEGER NOT NULL REFERENCES markets(id),
      business_name TEXT NOT NULL,contact_name TEXT NOT NULL,phone TEXT NOT NULL,description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'submitted',review_note TEXT NOT NULL DEFAULT '',version INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,reviewed_by INTEGER REFERENCES users(id),reviewed_at TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS vendor_application_pending ON vendor_applications(applicant_id,market_id)
      WHERE status IN ('submitted','needs_info','waitlisted');
    CREATE TABLE IF NOT EXISTS vendor_profile_requests (
      id INTEGER PRIMARY KEY,retailer_id INTEGER NOT NULL REFERENCES users(id),
      before_json TEXT NOT NULL,proposed_json TEXT NOT NULL,base_version INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','withdrawn')),
      version INTEGER NOT NULL DEFAULT 0,submitted_by INTEGER NOT NULL REFERENCES users(id),
      review_note TEXT NOT NULL DEFAULT '',reviewed_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,reviewed_at TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS vendor_profile_pending ON vendor_profile_requests(retailer_id) WHERE status='pending';
    CREATE TABLE IF NOT EXISTS session_vendors (
      session_id INTEGER NOT NULL REFERENCES market_sessions(id),retailer_id INTEGER NOT NULL REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'planned',booth TEXT NOT NULL DEFAULT '',note TEXT NOT NULL DEFAULT '',version INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(session_id,retailer_id)
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),kind TEXT NOT NULL,entity_id TEXT NOT NULL,
      message_key TEXT NOT NULL,values_json TEXT NOT NULL DEFAULT '{}',read_at TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id,kind,entity_id)
    );
    CREATE TABLE IF NOT EXISTS email_outbox (
      id INTEGER PRIMARY KEY,notification_id INTEGER NOT NULL UNIQUE REFERENCES notifications(id),recipient TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'unconfigured',attempts INTEGER NOT NULL DEFAULT 0,last_error TEXT NOT NULL DEFAULT '',
      sent_at TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS vendor_sales_reports (
      session_id INTEGER NOT NULL REFERENCES market_sessions(id),retailer_id INTEGER NOT NULL REFERENCES users(id),
      gross_cents INTEGER NOT NULL CHECK(gross_cents>=0),transactions INTEGER NOT NULL CHECK(transactions>=0),
      note TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 0,recorded_by INTEGER NOT NULL REFERENCES users(id),
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(session_id,retailer_id)
    );
    CREATE TABLE IF NOT EXISTS vendor_invoices (
      id INTEGER PRIMARY KEY,market_id INTEGER NOT NULL REFERENCES markets(id),retailer_id INTEGER NOT NULL REFERENCES users(id),
      description TEXT NOT NULL,amount_cents INTEGER NOT NULL CHECK(amount_cents>0),due_on TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'issued',version INTEGER NOT NULL DEFAULT 0,created_by INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS invoice_payments (
      id INTEGER PRIMARY KEY,invoice_id INTEGER NOT NULL REFERENCES vendor_invoices(id),amount_cents INTEGER NOT NULL CHECK(amount_cents>0),
      reference TEXT NOT NULL,recorded_by INTEGER NOT NULL REFERENCES users(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE VIEW IF NOT EXISTS vendor_directory AS SELECT u.*,
      COALESCE(NULLIF(p.business_name,''),u.name) AS business_name
      FROM users u LEFT JOIN vendor_profiles p ON p.retailer_id=u.id;
  `);
}
