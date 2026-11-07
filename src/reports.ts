import type { Collection } from '../shared/model';
import { summary } from '../shared/model';

export function download(content: string, filename: string, type: string) {
  const url = URL.createObjectURL(
    new Blob([content], { type: `${type};charset=utf-8` }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function exportPdf(state: Collection, t: (key: string) => string) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF();
  doc.setProperties({ title: 'My Wine Cellar - Wine inventory' });
  doc.setFontSize(22);
  doc.text('My Wine Cellar', 15, 20);
  doc.setFontSize(10);
  doc.text(
    `${t('Total bottles')}: ${summary(state).total} | ${t('Estimated value')}: ${summary(state).value.toFixed(2)} ${state.settings.currency}`,
    15,
    30,
  );
  let y = 42;
  state.bottles.forEach((b) => {
    const text = `${b.name} ${b.vintage} | ${b.type} | ${b.quantity} | ${state.cellars.find((c) => c.id === b.cellarId)?.name} | ${(b.value ?? b.price ?? 0).toFixed(2)} ${state.settings.currency}`;
    const lines = doc.splitTextToSize(text, 178);
    if (y + lines.length * 6 > 280) {
      doc.addPage();
      y = 20;
    }
    doc.text(lines, 15, y);
    y += lines.length * 6 + 4;
  });
  doc.save(`my-wine-cellar-${new Date().toISOString().slice(0, 10)}.pdf`);
}
