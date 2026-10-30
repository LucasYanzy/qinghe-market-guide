import { openDatabase } from '../server/db.mjs';
import { deliverOutbox } from '../server/notifications.mjs';
import { translate } from '../src/translations/translate.ts';

// Deliberately explicit: starting the API never sends email.
if (!process.env.DATABASE_PATH || !process.env.RESEND_API_KEY || !process.env.MAIL_FROM) {
  console.error('Set DATABASE_PATH, RESEND_API_KEY, and MAIL_FROM before delivering notifications.');
  process.exitCode = 1;
} else {
  const db = openDatabase(process.env.DATABASE_PATH, { demo: false });
  try {
    const attempted = await deliverOutbox(db, { translate: (message, values) => translate('en', message, values) });
    const statuses = db.prepare('SELECT status,COUNT(*) AS count FROM email_outbox GROUP BY status').all();
    console.log(JSON.stringify({ attempted, statuses }));
    if (statuses.some(row => row.status === 'failed' && row.count > 0)) process.exitCode = 1;
  } finally { db.close(); }
}
