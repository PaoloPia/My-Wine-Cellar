import ts from 'typescript';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const it: Record<string, string> = JSON.parse(
  await readFile(path.join('src', 'locales', 'it.json'), 'utf8'),
);
const keys = new Set(Object.keys(it));
for (const name of await readdir('src')) {
  if (!name.endsWith('.tsx')) continue;
  const source = ts.createSourceFile(
    name,
    await readFile(path.join('src', name), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const visit = (node: ts.Node) => {
    if (
      ts.isStringLiteral(node) &&
      (/[A-Z ]/.test(node.text) ||
        [
          'required',
          'results',
          'selected',
          'wines',
          'cellars',
          'bottles',
        ].includes(node.text)) &&
      !/[/{}]/.test(node.text.replace(/ \/ /g, '')) &&
      !node.text.includes('className')
    )
      keys.add(node.text);
    ts.forEachChild(node, visit);
  };
  visit(source);
}
await writeFile(
  path.join('src', 'locales', 'en.json'),
  JSON.stringify(
    Object.fromEntries([...keys].sort().map((key) => [key, key])),
    null,
    2,
  ) + '\n',
);
