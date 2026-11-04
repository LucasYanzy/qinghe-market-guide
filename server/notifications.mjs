export function notifyUser(db, userId, kind, entityId, message, values = {}) {
  const result = db.prepare('INSERT OR IGNORE INTO notifications (user_id,kind,entity_id,message_key,values_json) VALUES (?,?,?,?,?)')
    .run(userId, kind, String(entityId), message, JSON.stringify(values));
  if (!result.changes) return;
  const user = db.prepare('SELECT email FROM users WHERE id=?').get(userId);
  if (user && !/@(?:local\.invalid|qinghe\.demo)$/.test(user.email))
    db.prepare('INSERT INTO email_outbox (notification_id,recipient,status) VALUES (?,?,?)')
      .run(result.lastInsertRowid, user.email, process.env.RESEND_API_KEY && process.env.MAIL_FROM ? 'queued' : 'unconfigured');
}

export function notifyOrder(db, orderId, kind, message, values = {}) {
  const order = db.prepare('SELECT client_id FROM orders WHERE id=?').get(orderId);
  if (order) notifyUser(db, order.client_id, kind, orderId, message, { id: orderId, ...values });
}

// An explicit operator command sends the durable outbox; HTTP requests never send mail.
export async function deliverOutbox(db, { apiKey = process.env.RESEND_API_KEY, from = process.env.MAIL_FROM, translate, send = fetch } = {}) {
  if (!apiKey || !from) throw new Error('MAIL_FROM and RESEND_API_KEY are required.');
  const rows = db.prepare(`SELECT e.*,n.message_key,n.values_json FROM email_outbox e JOIN notifications n ON n.id=e.notification_id
    WHERE e.status IN ('queued','failed','unconfigured') AND e.attempts<5 ORDER BY e.id LIMIT 50`).all();
  for (const row of rows) {
    const values = JSON.parse(row.values_json);
    const message = translate ? translate(row.message_key, values) : row.message_key.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? '');
    try {
      const response = await send('https://api.resend.com/emails', { method: 'POST', signal: AbortSignal.timeout(15000),
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `qinghe-notification-${row.notification_id}` },
        body: JSON.stringify({ from, to: [row.recipient], subject: 'Qinghe market update', text: message }) });
      if (!response.ok) throw new Error(`Email provider HTTP ${response.status}`);
      db.prepare("UPDATE email_outbox SET status='sent',attempts=attempts+1,last_error='',sent_at=CURRENT_TIMESTAMP WHERE id=?").run(row.id);
    } catch (error) {
      db.prepare("UPDATE email_outbox SET status='failed',attempts=attempts+1,last_error=? WHERE id=?").run(String(error.message).slice(0, 200), row.id);
    }
  }
  return rows.length;
}
