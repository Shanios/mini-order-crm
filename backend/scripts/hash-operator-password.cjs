const { randomBytes, scryptSync } = require('node:crypto');

if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
  process.stderr.write('Run this helper in an interactive terminal so password input stays hidden.\n');
  process.exit(1);
}

const input = [];
process.stdout.write('Operator password (hidden, minimum 12 characters): ');
process.stdin.setRawMode(true);
process.stdin.resume();

function finish() {
  process.stdin.setRawMode(false);
  process.stdin.pause();
  const password = Buffer.from(input);
  process.stdout.write('\n');
  if (password.length < 12 || password.length > 1024) {
    password.fill(0);
    process.stderr.write('Password length must be from 12 to 1024 bytes.\n');
    process.exitCode = 1;
    return;
  }

  const salt = randomBytes(16);
  const digest = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  password.fill(0);
  process.stdout.write(`CRM_OPERATOR_PASSWORD_HASH=scrypt$16384$8$1$${salt.toString('hex')}$${digest.toString('hex')}\n`);
}

process.stdin.on('data', (chunk) => {
  for (const byte of chunk) {
    if (byte === 3) {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      input.fill(0);
      process.stdout.write('\n');
      process.exitCode = 130;
      return;
    }
    if (byte === 13 || byte === 10) {
      finish();
      return;
    }
    if (byte === 8 || byte === 127) {
      input.pop();
      continue;
    }
    if (byte >= 32) input.push(byte);
  }
});
