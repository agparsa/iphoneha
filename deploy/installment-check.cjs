#!/usr/bin/env node
/*
 * Checks one installment service from this server, with exactly the settings
 * the API uses (.env, loaded by installments.sh). Run in apps/api, after a build:
 *
 *   node installment-check.cjs snappay|tara|digipay|bajet|azkivam
 *
 * Prints one line: «OK <what worked>», «UNSURE <what came back>» or
 * «FAIL <why>». Nothing is bought: SnapPay answers an eligibility question,
 * DigiPay and Bajet a sign-in, Tara a sign-in and the list of its merchandise
 * groups, AzkiVam the status of a ticket that does not exist. No key is ever
 * printed.
 */
'use strict';
const path = require('node:path');
const { createRequire } = require('node:module');

// resolve the app's own build and packages, as the API does
const app = createRequire(path.join(process.cwd(), 'package.json'));
const say = (line) => process.stdout.write(`${String(line).replace(/\s+/g, ' ').trim()}\n`);
const METHODS = {
  snappay: 'SNAPPAY',
  tara: 'TARA',
  digipay: 'DIGIPAY',
  bajet: 'BOJET',
  bojet: 'BOJET',
  azkivam: 'AZKIVAM',
};

async function check(method) {
  // the clients log through Nest; this script speaks for itself
  app('@nestjs/common').Logger.overrideLogger(false);
  const env = app('./dist/config/env.config');
  const { liveInstallmentClient } = app('./dist/modules/payments/providers/installment/live/factory');

  const config = env.buildAppConfig(process.env);
  const driver = env.installmentDriver(config, method);
  if (driver === 'mock') return 'FAIL not connected (its driver is mock)';
  const missing = env.missingLiveKeys(config, method);
  if (missing.length > 0) return `FAIL not offered: ${missing.join(', ')}`;

  const where = `${driver === 'sandbox' ? 'test environment' : 'live'}: ${env.installmentBaseUrl(config, method)}`;
  const result = await liveInstallmentClient(method, config).probe();
  return `${result.status} ${result.detail} [${where}]`;
}

const method = METHODS[process.argv[2]];
if (!method) {
  say('FAIL usage: installment-check.cjs snappay|tara|digipay|bajet|azkivam');
  process.exit(2);
}
check(method).then(say, (error) => say(`FAIL ${error && error.message ? error.message : String(error)}`));
