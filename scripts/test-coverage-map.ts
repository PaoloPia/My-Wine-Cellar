import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const plan: { id: string; title: string; requirements: string }[] = JSON.parse(
  await readFile(path.join('reference', 'test-cases.json'), 'utf8'),
);
const files = [
  'tests/domain.test.ts',
  'tests/api.test.ts',
  'tests/e2e/app.spec.ts',
];
const sources = await Promise.all(
  files.map((f) => readFile(path.join(...f.split('/')), 'utf8')),
);
const manual = new Set([
  'TC-023',
  'TC-040',
  'TC-041',
  'TC-042',
  'TC-043',
  'TC-044',
  'TC-046',
  'TC-048',
  'TC-050',
  'TC-051',
]);
const map = plan.map((test) => {
  const automation = files.filter((_, index) =>
    [...sources[index].matchAll(/TC-(\d{3}(?:\/\d{3})*)/g)].some((match) =>
      match[1].split('/').includes(test.id.slice(3)),
    ),
  );
  return {
    ...test,
    automation,
    manualStepsRequired: manual.has(test.id),
    executionStatus:
      'Not reported by traceability generation; inspect runner output and perform manual steps.',
  };
});
await writeFile(
  path.join('reference', 'coverage-map.json'),
  JSON.stringify(map, null, 2),
);
console.log(
  `${map.filter((test) => test.automation.length).length}/${plan.length} scenarios have automated coverage. ${manual.size} also require manual acceptance.`,
);
if (map.some((test) => !test.automation.length)) process.exitCode = 1;
