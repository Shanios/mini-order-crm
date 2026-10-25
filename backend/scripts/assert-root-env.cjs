const { existsSync, readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const dotenv = require('dotenv');

const rootEnvPath = resolve(__dirname, '..', '..', '.env');

if (!existsSync(rootEnvPath)) {
  process.stderr.write('Repository root .env is required. Add DATABASE_URL there.\n');
  process.exit(1);
}

const rootEnv = dotenv.parse(readFileSync(rootEnvPath));

if (!rootEnv.DATABASE_URL) {
  process.stderr.write('DATABASE_URL is required in the repository root .env file.\n');
  process.exit(1);
}
