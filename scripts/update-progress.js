const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]?.replace(/^--/, '');
    const value = argv[index + 1];
    if (!['objective', 'next', 'blocker', 'evidence'].includes(key) || !value || /[\r\n]/.test(value)) {
      throw new Error(`Invalid argument: ${argv[index] || '(missing)'}`);
    }
    args[key] = value;
  }
  if (!args.objective || !args.next) throw new Error('--objective and --next are required');
  return args;
}

function replaceField(markdown, label, value) {
  const pattern = new RegExp(`^- ${label}:.*$`, 'm');
  if (!pattern.test(markdown)) throw new Error(`Missing PROGRESS.md field: ${label}`);
  return markdown.replace(pattern, `- ${label}: ${value}`);
}

function updateProgress(markdown, values) {
  let next = replaceField(markdown, 'Last Updated', values.date);
  next = replaceField(next, 'Current Objective', values.objective);
  next = replaceField(next, 'Active feature', values.activeFeature);
  next = replaceField(next, 'Blockers', values.blocker);
  next = replaceField(next, 'Files', values.files);
  next = replaceField(next, 'Recommended Next Step', values.next);
  if (values.evidence) {
    next = next.replace('\n## Next Session', `\n- ${values.date}: ${values.evidence}\n\n## Next Session`);
  }
  return next;
}

function changedFiles(status) {
  return status.split(/\r?\n/).filter(Boolean).map((line) => line.slice(3));
}

function selfTest() {
  const source = '- Last Updated: old\n- Current Objective: old\n- Active feature: none\n- Blockers: none\n\n## Verification Evidence\n\n## Next Session\n\n- Files: none\n- Recommended Next Step: old\n';
  const output = updateProgress(source, {
    date: '2026-09-04', objective: 'test', activeFeature: 'feature-1', blocker: 'none',
    files: '`a.js`', next: 'continue', evidence: 'check passed'
  });
  assert.match(output, /Current Objective: test/);
  assert.match(output, /2026-09-04: check passed/);
  assert.deepEqual(changedFiles(' M AGENTS.md\n?? new.js\n'), ['AGENTS.md', 'new.js']);
  assert.throws(() => parseArgs(['--objective', 'test']));
  console.log('Progress writer self-test passed.');
}

if (require.main === module) {
  if (process.argv.includes('--self-test')) {
    selfTest();
  } else {
    try {
      const args = parseArgs(process.argv.slice(2));
      const root = path.resolve(__dirname, '..');
      const progressPath = path.join(root, 'PROGRESS.md');
      const features = JSON.parse(fs.readFileSync(path.join(root, 'feature_list.json'), 'utf8')).features;
      const active = features.filter((feature) => feature.status === 'in_progress');
      if (active.length > 1) throw new Error('More than one feature is in_progress');
      const changed = changedFiles(execFileSync('git', ['status', '--short'], { cwd: root, encoding: 'utf8' }));
      const markdown = fs.readFileSync(progressPath, 'utf8');
      const updated = updateProgress(markdown, {
        date: new Intl.DateTimeFormat('en-CA').format(new Date()),
        objective: args.objective,
        activeFeature: active[0]?.id || 'none',
        blocker: args.blocker || 'none',
        files: changed.length ? changed.map((file) => `\`${file}\``).join(', ') : 'none',
        next: args.next,
        evidence: args.evidence
      });
      fs.writeFileSync(progressPath, updated);
      console.log('PROGRESS.md updated.');
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}

module.exports = { changedFiles, parseArgs, updateProgress };
