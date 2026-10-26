const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const envPath = path.join(root, '.env');
const examplePath = path.join(root, '.env.example');
const backendPath = path.join(root, 'backend');
const hashPattern = /^scrypt\$16384\$8\$1\$([a-f0-9]{32})\$([a-f0-9]{128})$/;
const placeholder = /^(?:replace_with(?:_|$)|your[-_])/i;
const report = { env: false, operator: false, session: false, database: 'attention', prisma: 'attention', migrations: 'attention', shopify: 'attention' };

// Keep readline from echoing bytes consumed by hidden() while its TTY is in raw mode.
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });
function ask(question) {
  process.stdin.resume();
  return new Promise((resolve) => rl.question(question, resolve));
}
function yes(value) { return /^y(?:es)?$/i.test(value.trim()); }

function readEnv() {
  const text = fs.readFileSync(envPath, 'utf8');
  const values = Object.create(null);
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (match) values[match[1]] = unquote(match[2]);
  }
  return { text, values };
}
function unquote(value) {
  if (value.length >= 2 && ((value[0] === '"' && value.at(-1) === '"') || (value[0] === "'" && value.at(-1) === "'"))) return value.slice(1, -1);
  return value.replace(/\s+#.*$/, '').trim();
}
function replaceEnv(text, key, value) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^\\s*${escaped}\\s*=.*$`, 'gm');
  const line = `${key}=${quote(value)}`;
  if (re.test(text)) {
    re.lastIndex = 0;
    let found = false;
    text = text.replace(re, () => found ? '' : (found = true, line));
  } else {
    text += `${text.endsWith('\n') || text.length === 0 ? '' : '\n'}${line}\n`;
  }
  return text;
}
function dedupeEnv(text) {
  const lines = text.split(/\r?\n/);
  const lastAt = new Map();
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (match) lastAt.set(match[1], i);
  }
  return lines.filter((line, i) => {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    return !match || lastAt.get(match[1]) === i;
  }).join('\n');
}
function quote(value) {
  return /^[^\s#"'\\]+$/.test(value) ? value : `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
function validDatabase(value) {
  try {
    const url = new URL(value);
    return ['postgres:', 'postgresql:'].includes(url.protocol) && Boolean(url.hostname && url.username && url.pathname.length > 1);
  } catch { return false; }
}
function validUsername(value) { return value.trim().length > 0 && value.trim().length <= 100 && !/[\r\n=]/.test(value); }
function validSecret(value) { return value.length >= 32 && !placeholder.test(value); }
function runNpm(args, cwd) {
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
  return result.status === 0;
}
function hidden(prompt) {
  return new Promise((resolve, reject) => {
    const bytes = [];
    process.stdout.write(prompt);
    const onData = (chunk) => {
      for (const byte of chunk) {
        if (byte === 3) {
          process.stdin.setRawMode(false); process.stdin.pause(); process.stdin.removeListener('data', onData);
          bytes.fill(0); process.stdout.write('\n'); reject(new Error('Setup interrupted. Existing .env was not changed.')); return;
        }
        if (byte === 13 || byte === 10) {
          process.stdin.setRawMode(false); process.stdin.pause(); process.stdin.removeListener('data', onData);
          process.stdout.write('\n'); resolve(Buffer.from(bytes)); bytes.fill(0); return;
        }
        if (byte === 8 || byte === 127) bytes.pop();
        else if (byte >= 32) bytes.push(byte);
      }
    };
    process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.on('data', onData);
  });
}
function writeEnv(text) {
  // Keep the update in memory and write directly to the ignored root .env; no credential-bearing temp/log file is created.
  text = dedupeEnv(text);
  fs.writeFileSync(envPath, text, { encoding: 'utf8', mode: 0o600 });
  try { fs.chmodSync(envPath, 0o600); } catch {}
}

async function main() {
  if (!process.stdin.isTTY || !process.stdout.isTTY || typeof process.stdin.setRawMode !== 'function') {
    throw new Error('Run npm run setup in an interactive terminal (CMD, PowerShell, or a Unix terminal).');
  }
  console.log('Mini Order CRM setup\n');
  if (!fs.existsSync(envPath)) {
    fs.copyFileSync(examplePath, envPath, fs.constants.COPYFILE_EXCL);
    console.log('Created root .env from .env.example.');
  } else {
    console.log('Found the existing root .env. Existing settings will be preserved unless you choose to change them.');
  }
  let { text, values } = readEnv();

  const usernameSet = validUsername(values.CRM_OPERATOR_USERNAME || '');
  const hashSet = hashPattern.test(values.CRM_OPERATOR_PASSWORD_HASH || '');
  if (usernameSet && hashSet && !placeholder.test(values.CRM_OPERATOR_PASSWORD_HASH)) {
    if (yes(await ask(`Operator credentials are already configured for "${values.CRM_OPERATOR_USERNAME}". Change them? [y/N] `))) {
      text = await configureOperator(text, values);
    } else report.operator = true;
  } else text = await configureOperator(text, values);

  values = readEnv().values;
  if (validSecret(values.CRM_SESSION_SECRET)) {
    const rotate = yes(await ask('A session secret is already configured. Rotate it? This signs out existing sessions. [y/N] '));
    if (rotate) text = replaceEnv(text, 'CRM_SESSION_SECRET', crypto.randomBytes(32).toString('hex'));
  } else {
    text = replaceEnv(text, 'CRM_SESSION_SECRET', crypto.randomBytes(32).toString('hex'));
  }
  report.session = true;

  values = readEnv().values;
  console.log('\nPostgreSQL must already be installed and running, or otherwise accessible. Setup will not install it or create database accounts.');
  if (validDatabase(values.DATABASE_URL) && !/replace_with|your[-_]/i.test(values.DATABASE_URL)) {
    const change = await ask('A PostgreSQL URL is present. Keep it? [Y/n] ');
    if (!change.trim() || yes(change)) report.env = true;
    else text = await configureDatabase(text, values);
  } else text = await configureDatabase(text, values);

  values = readEnv().values;
  text = await configureShopify(text, values);

  writeEnv(text);
  report.env = true;
  console.log('\nChecking PostgreSQL with the project’s safe SELECT 1 script…');
  if (validDatabase(readEnv().values.DATABASE_URL) && runNpm(['run', 'prisma:check'], backendPath)) {
    report.database = 'connected';
    console.log('\nGenerating Prisma Client…');
    if (runNpm(['run', 'prisma:generate'], backendPath)) {
      report.prisma = 'ready';
      const migrate = yes(await ask('Run the existing additive Prisma migration deployment? Review your database target first. [y/N] '));
      report.migrations = migrate ? (runNpm(['run', 'prisma:deploy'], backendPath) ? 'applied' : 'attention') : 'not run';
    }
  } else {
    console.log('PostgreSQL check failed. Confirm PostgreSQL is running and the root .env DATABASE_URL is correct.');
  }
  if (report.prisma === 'attention' && process.platform === 'win32') console.log('If Prisma reports EPERM, stop backend Node processes and rerun setup; do not delete locked engine files.');

  values = readEnv().values;
  const shopConfigured = validShop(values);
  if (shopConfigured) {
    console.log('\nShopify configuration fields are present. Running a read-only Shopify connection check…');
    report.shopify = await checkShopify(values) ? 'connected' : 'configured; connection needs attention';
  } else report.shopify = 'requires Shopify store/app credentials';
  rl.close();
  console.log('\nSetup report');
  console.log(`- Root environment file: ${report.env ? 'configured' : 'requires attention'}`);
  console.log(`- Operator account: ${report.operator || validUsername(values.CRM_OPERATOR_USERNAME) && hashPattern.test(values.CRM_OPERATOR_PASSWORD_HASH || '') ? 'configured' : 'requires attention'}`);
  console.log(`- Session secret: ${report.session ? 'configured' : 'requires attention'}`);
  console.log(`- PostgreSQL: ${report.database}`);
  console.log(`- Prisma Client: ${report.prisma}`);
  console.log(`- Migrations: ${report.migrations}`);
  console.log(`- Shopify: ${report.shopify}`);
  console.log('\nStart the backend from backend/: npm run start:dev');
  console.log('Start the frontend from frontend/: npm run dev');
}

async function configureOperator(text, values) {
  let username = '';
  while (!validUsername(username)) username = await ask(`Operator username${validUsername(values.CRM_OPERATOR_USERNAME || '') ? ` [${values.CRM_OPERATOR_USERNAME}]` : ''}: `).then(v => v.trim() || values.CRM_OPERATOR_USERNAME || '');
  let password;
  try {
    do {
      password = await hidden('Operator password (hidden, minimum 12 characters): ');
      if (password.length < 12 || password.length > 1024) { password.fill(0); console.log('Password must be from 12 to 1024 bytes.'); }
    } while (password.length < 12 || password.length > 1024);
    const hash = makePasswordHash(password);
    password.fill(0);
    text = replaceEnv(text, 'CRM_OPERATOR_USERNAME', username);
    text = replaceEnv(text, 'CRM_OPERATOR_PASSWORD_HASH', hash);
    return text;
  } catch (error) { if (password) password.fill(0); throw error; }
}
async function configureDatabase(text, values) {
  console.log('Enter a PostgreSQL connection URL. It will not be echoed or included in logs.');
  while (true) {
    const input = await hidden(`DATABASE_URL${validDatabase(values.DATABASE_URL || '') ? ' (hidden; Enter keeps existing)' : ''}: `);
    if (!input.length && validDatabase(values.DATABASE_URL || '')) return text;
    const candidate = input.toString('utf8'); input.fill(0);
    if (validDatabase(candidate)) return replaceEnv(text, 'DATABASE_URL', candidate);
    console.log('That URL is not a valid PostgreSQL connection URL. Expected postgresql:// or postgres:// with a host, username, and database name.');
  }
}
async function configureShopify(text, values) {
  console.log('\nShopify setup');
  console.log('Required for the integration: store domain, app client ID, app client secret, API version, and a unique SHOPIFY_SYNC_SECRET (32+ characters) for manual sync.');
  console.log('Optional: SHOPIFY_ORDER_CREATE_SECRET is only for trusted backend-only order creation. Local development uses http://localhost:5173 and http://localhost:3000; these URLs are not Shopify credentials.');
  if (!validShop(values) && !yes(await ask('Configure Shopify credentials now? [y/N] '))) return text;
  if (validShop(values)) {
    const keep = await ask('Shopify required settings appear configured. Keep them? [Y/n] ');
    if (!keep.trim() || yes(keep)) return text;
  }
  for (const [key, label, isSecret] of [
    ['SHOPIFY_SHOP_DOMAIN', 'Store domain (example.myshopify.com)', false],
    ['SHOPIFY_CLIENT_ID', 'App client ID', false],
    ['SHOPIFY_CLIENT_SECRET', 'App client secret', true],
    ['SHOPIFY_API_VERSION', 'Admin API version (2026-10)', false],
    ['SHOPIFY_SYNC_SECRET', 'Manual sync secret (32+ unique characters)', true],
  ]) {
    const current = values[key] || '';
    if (validShopField(key, current)) {
      const keep = await ask(`${label} is already present. Keep it? [Y/n] `);
      if (!keep.trim() || yes(keep)) continue;
    }
    while (true) {
      const raw = isSecret ? await hidden(`${label}: `) : Buffer.from(await ask(`${label}: `));
      const answer = raw.toString('utf8').trim(); raw.fill(0);
      if (key === 'SHOPIFY_SHOP_DOMAIN' && /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(answer)
        || key === 'SHOPIFY_API_VERSION' && answer === '2026-10'
        || key === 'SHOPIFY_SYNC_SECRET' && answer.length >= 32
        || ['SHOPIFY_CLIENT_ID', 'SHOPIFY_CLIENT_SECRET'].includes(key) && answer.length > 0) {
        text = replaceEnv(text, key, answer); break;
      }
      console.log('That value does not meet the expected format.');
    }
  }
  return text;
}
function validShop(values) {
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(values.SHOPIFY_SHOP_DOMAIN || '')
    && Boolean(values.SHOPIFY_CLIENT_ID && !placeholder.test(values.SHOPIFY_CLIENT_ID))
    && Boolean(values.SHOPIFY_CLIENT_SECRET && !placeholder.test(values.SHOPIFY_CLIENT_SECRET))
    && values.SHOPIFY_API_VERSION === '2026-10'
    && (values.SHOPIFY_SYNC_SECRET || '').length >= 32 && !placeholder.test(values.SHOPIFY_SYNC_SECRET || '');
}
function validShopField(key, value) {
  if (!value || placeholder.test(value)) return false;
  if (key === 'SHOPIFY_SHOP_DOMAIN') return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(value);
  if (key === 'SHOPIFY_API_VERSION') return value === '2026-10';
  if (key === 'SHOPIFY_SYNC_SECRET') return value.length >= 32;
  return ['SHOPIFY_CLIENT_ID', 'SHOPIFY_CLIENT_SECRET'].includes(key) && !/^your-shop/i.test(value);
}
function makePasswordHash(password) {
  const salt = crypto.randomBytes(16);
  const digest = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$16384$8$1$${salt.toString('hex')}$${digest.toString('hex')}`;
}
async function checkShopify(values) {
  try {
    const tokenResponse = await fetch(`https://${values.SHOPIFY_SHOP_DOMAIN}/admin/oauth/access_token`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client_id: values.SHOPIFY_CLIENT_ID, client_secret: values.SHOPIFY_CLIENT_SECRET, grant_type: 'client_credentials' }),
    });
    if (!tokenResponse.ok) return false;
    const token = await tokenResponse.json();
    if (!token.access_token) return false;
    const response = await fetch(`https://${values.SHOPIFY_SHOP_DOMAIN}/admin/api/${values.SHOPIFY_API_VERSION}/graphql.json`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'X-Shopify-Access-Token': token.access_token },
      body: JSON.stringify({ query: '{ shop { name } }' }),
    });
    const data = await response.json();
    return response.ok && Boolean(data?.data?.shop?.name) && !data.errors;
  } catch { return false; }
}

if (require.main === module) {
  main().catch((error) => {
    rl.close();
    console.error(error.message || 'Setup stopped.');
    process.exitCode = 1;
  });
}

module.exports = { hashPattern, validDatabase, validUsername, validSecret, validShop, validShopField, makePasswordHash, replaceEnv, dedupeEnv, readEnv };
