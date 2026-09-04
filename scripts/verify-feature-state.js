const assert = require('node:assert/strict');
const fs = require('node:fs');

function validate(features) {
  const errors = [];

  for (const feature of features) {
    if (typeof feature.ui !== 'boolean') errors.push(`${feature.id}: ui must be true or false`);
    if (feature.status !== 'passing' || feature.ui !== true) continue;

    const evidence = feature.browser_verification;
    for (const field of ['routes', 'interactions']) {
      if (!Array.isArray(evidence?.[field]) || evidence[field].length === 0) {
        errors.push(`${feature.id}: browser_verification.${field} must not be empty`);
      }
    }
    for (const field of ['console_errors', 'page_errors']) {
      if (!Array.isArray(evidence?.[field]) || evidence[field].length !== 0) {
        errors.push(`${feature.id}: browser_verification.${field} must be an empty array`);
      }
    }
    if (!evidence?.checked_at) errors.push(`${feature.id}: browser_verification.checked_at is required`);
  }

  return errors;
}

if (process.argv.includes('--self-test')) {
  const clean = {
    id: 'ui-clean', status: 'passing', ui: true,
    browser_verification: {
      routes: ['/'], interactions: ['load page'],
      console_errors: [], page_errors: [], checked_at: '2026-09-04'
    }
  };
  assert.deepEqual(validate([clean]), []);
  assert.ok(validate([{ ...clean, browser_verification: { ...clean.browser_verification, console_errors: ['boom'] } }]).length);
  assert.ok(validate([{ id: 'ui-missing', status: 'passing', ui: true }]).length);
  console.log('Harness feature-state self-test passed.');
} else {
  const data = JSON.parse(fs.readFileSync('feature_list.json', 'utf8'));
  const errors = validate(data.features);
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
  } else {
    console.log('Feature state verification passed.');
  }
}

module.exports = { validate };
