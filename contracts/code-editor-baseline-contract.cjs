'use strict';

const STAGE_NAMES = Object.freeze([
  'clickToGrantMs',
  'grantMs',
  'managerLookupMs',
  'cloneMs',
  'containerCreateMs',
  'containerStartMs',
  'httpReadyMs',
  'htmlTtfbMs',
  'immutableAssetsMs',
  'webSocketOpenMs',
  'extensionHostMs',
  'targetFileReadyMs',
  'firstInputReadyMs',
]);

const REQUIRED_KEYS = Object.freeze([
  'schemaVersion', 'capturedAt', 'scenario', 'endpoint', 'edgeCacheStatus',
  'edgeRequestIdPresent', 'stages', 'missingStages',
]);

const ALLOWED_KEYS = new Set([
  ...REQUIRED_KEYS, 'status', 'redirected', 'cacheControl', 'totalMs',
]);

function invalidOptionalNumber(value, minimum, maximum) {
  return !Number.isFinite(value) || value < minimum || value > maximum;
}

function validateSample(sample) {
  if (!sample || typeof sample !== 'object' || Array.isArray(sample)) throw new Error('sample must be an object');
  for (const key of Object.keys(sample)) {
    if (!ALLOWED_KEYS.has(key)) throw new Error(`unknown sample field: ${key}`);
  }
  for (const key of REQUIRED_KEYS) {
    if (!Object.hasOwn(sample, key)) throw new Error(`missing sample field: ${key}`);
  }
  if (sample.schemaVersion !== 1) throw new Error('invalid sample schema version');
  if (typeof sample.capturedAt !== 'string' || !Number.isFinite(Date.parse(sample.capturedAt))) throw new Error('invalid sample capture time');
  if (typeof sample.endpoint !== 'string' || sample.endpoint.length > 512) throw new Error('invalid sample endpoint');
  let endpoint;
  try { endpoint = new URL(sample.endpoint); } catch { throw new Error('invalid sample endpoint'); }
  if ((endpoint.protocol !== 'http:' && endpoint.protocol !== 'https:') || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new Error('invalid sample endpoint');
  }
  if (!['cold', 'hot', 'reconnect', 'http-only'].includes(sample.scenario)) throw new Error('invalid probe scenario');
  if (!['hit', 'miss', 'bypass', 'unknown'].includes(sample.edgeCacheStatus)) throw new Error('invalid edge cache status');
  if (typeof sample.edgeRequestIdPresent !== 'boolean') throw new Error('invalid edge request marker');
  if (Object.hasOwn(sample, 'status') && (!Number.isInteger(sample.status) || sample.status < 100 || sample.status > 599)) throw new Error('invalid HTTP status');
  if (Object.hasOwn(sample, 'redirected') && typeof sample.redirected !== 'boolean') throw new Error('invalid redirect marker');
  if (Object.hasOwn(sample, 'cacheControl') && (typeof sample.cacheControl !== 'string' || sample.cacheControl.length > 512)) throw new Error('invalid cache control');
  if (Object.hasOwn(sample, 'totalMs') && invalidOptionalNumber(sample.totalMs, 0, 300_000)) throw new Error('invalid total timing');
  if (!sample.stages || typeof sample.stages !== 'object' || Array.isArray(sample.stages)) throw new Error('sample stages must be an object');
  for (const stage of Object.keys(sample.stages)) {
    if (!STAGE_NAMES.includes(stage)) throw new Error(`unknown stage value: ${stage}`);
  }
  for (const stage of STAGE_NAMES) {
    if (!Object.hasOwn(sample.stages, stage)) throw new Error(`missing stage value: ${stage}`);
    const value = sample.stages[stage];
    if (value !== null && invalidOptionalNumber(value, 0, 300_000)) {
      throw new Error(`invalid stage value: ${stage}`);
    }
  }
  if (!Array.isArray(sample.missingStages)) throw new Error('missingStages must be an array');
  for (const stage of sample.missingStages) {
    if (!STAGE_NAMES.includes(stage)) throw new Error(`unknown missing stage: ${stage}`);
  }
  const expectedMissing = STAGE_NAMES.filter((stage) => sample.stages[stage] === null).sort();
  const actualMissing = [...new Set(sample.missingStages)].sort();
  if (actualMissing.length !== sample.missingStages.length || JSON.stringify(actualMissing) !== JSON.stringify(expectedMissing)) {
    throw new Error('missingStages does not match stage values');
  }
  return sample;
}

module.exports = { STAGE_NAMES, validateSample };
