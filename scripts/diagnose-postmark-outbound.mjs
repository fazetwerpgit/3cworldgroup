// Read-only diagnostic: list recent Postmark outbound messages (to, subject,
// status, received time) to see what alert emails actually went out and when.
//   node scripts/diagnose-postmark-outbound.mjs [--count 60]
import { readFileSync } from 'node:fs';

const i = process.argv.indexOf('--count');
const count = i >= 0 ? Number(process.argv[i + 1]) : 60;

for (const line of readFileSync('.env.local', 'utf-8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const token = process.env.POSTMARK_SERVER_TOKEN;
if (!token) {
  console.error('POSTMARK_SERVER_TOKEN not set');
  process.exit(1);
}

const res = await fetch(`https://api.postmarkapp.com/messages/outbound?count=${count}&offset=0`, {
  headers: { Accept: 'application/json', 'X-Postmark-Server-Token': token },
});
if (!res.ok) {
  console.error('Postmark API error', res.status, await res.text());
  process.exit(1);
}
const data = await res.json();
for (const msg of data.Messages ?? []) {
  console.log(
    JSON.stringify({
      to: (msg.Recipients ?? []).join(','),
      subject: msg.Subject,
      status: msg.Status,
      receivedAt: msg.ReceivedAt,
    })
  );
}
console.log(`${(data.Messages ?? []).length} of ${data.TotalCount} total outbound messages.`);
