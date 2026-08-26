// Every document has a file behind it.
//
// A row in `documents` names a storage path. Nothing made that path exist, and
// in a seeded workspace nothing ever did: Preview said "Object not found", the
// access log recorded reads of nothing, and the seven-year retention protected
// nothing. The whole document half of the app was a demonstration of a filing
// cabinet rather than a filing cabinet.
//
// This walks every document a real user can see, asks for the signed URL the
// app would use, and fetches it. A placeholder fails here.
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const API = 'http://127.0.0.1:54321';

let bad = 0;
const check = (ok, label, detail = '') => {
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok || !detail ? '' : ` — ${detail}`}`);
};

async function login(email) {
  const r = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'snoopy123' }),
  });
  const s = await r.json();
  if (!s.access_token) throw new Error(`login failed for ${email}: ${JSON.stringify(s)}`);
  return { token: s.access_token, id: s.user.id };
}

const rest = (who, path, init = {}) => fetch(`${API}/rest/v1/${path}`, {
  ...init,
  headers: {
    apikey: ANON, Authorization: `Bearer ${who.token}`,
    'Content-Type': 'application/json', Prefer: 'return=representation',
    ...init.headers,
  },
});

/** The same signed URL the app asks for when somebody clicks Preview. */
async function signed(who, path) {
  const r = await fetch(`${API}/storage/v1/object/sign/documents/${path}`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${who.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn: 60 }),
  });
  if (!r.ok) return null;
  const { signedURL, signedUrl } = await r.json();
  return `${API}/storage/v1${signedURL ?? signedUrl}`;
}

const lucy = await login('lucy@peanutsstudio.test');
const charlie = await login('charlie@peanutsstudio.test');

const documents = await rest(lucy, 'documents?select=id,name,storage_path,file_type,owner_id')
  .then((r) => r.json());
check(Array.isArray(documents) && documents.length > 0, 'there are documents to check',
  `${documents.length}`);

let missing = [];
let notPdf = [];
for (const doc of documents) {
  const url = await signed(lucy, doc.storage_path);
  if (!url) { missing.push(doc.name); continue; }
  const file = await fetch(url);
  if (!file.ok) { missing.push(doc.name); continue; }
  const bytes = new Uint8Array(await file.arrayBuffer());
  // A PDF starts %PDF-. Checking the bytes rather than the declared type,
  // because the declared type is a column somebody typed.
  const header = String.fromCharCode(...bytes.slice(0, 5));
  if (header !== '%PDF-') notPdf.push(`${doc.name} (${header})`);
}

check(missing.length === 0, 'every document has a file behind it',
  missing.length ? `missing: ${missing.join(', ')}` : '');
check(notPdf.length === 0, 'and every one of them is a real PDF, by its bytes',
  notPdf.join(', '));

// ------------------------------------------------------- an agreement is one
const [agreement] = await rest(lucy, 'documents?select=id,storage_path&name=ilike.*agreement*&limit=1')
  .then((r) => r.json());
if (agreement) {
  const url = await signed(lucy, agreement.storage_path);
  const text = await fetch(url).then((r) => r.arrayBuffer()).then((b) => Buffer.from(b).toString('latin1'));
  // pdf-lib compresses content streams, so the words are not greppable. Size
  // and structure are what can be asserted from outside without a parser.
  check(text.startsWith('%PDF-') && text.includes('/Type') && text.length > 800,
    'an employment agreement is a structured document, not an empty file',
    `${text.length} bytes`);
}

// --------------------------------------------------- and the rules still hold
//
// Making the files real must not have widened who can read them.
const someoneElses = documents.find((d) => d.owner_id && d.owner_id !== charlie.id);
if (someoneElses) {
  const url = await signed(charlie, someoneElses.storage_path);
  let reachable = false;
  if (url) reachable = (await fetch(url)).ok;
  check(!reachable, 'an employee still cannot fetch a colleague\'s file',
    `${someoneElses.name} was reachable`);
}

const own = documents.find((d) => d.owner_id === charlie.id);
if (own) {
  const url = await signed(charlie, own.storage_path);
  const ok = url ? (await fetch(url)).ok : false;
  check(ok, 'and can still fetch their own', own.name);
}

process.exit(bad === 0 ? 0 : 1);
