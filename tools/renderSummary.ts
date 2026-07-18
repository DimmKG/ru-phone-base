import type { DiffStats } from '../src/build/diff/computeStats.js';

export function renderSummaryMarkdown(stats: DiffStats): string {
  const lines: string[] = [];
  lines.push(`# Обновление датасета ru-phone-base — ${stats.snapshotDate}`, '');

  lines.push('## Исходные файлы', '', '| Файл | Изменён | SHA-256 (было → стало) |', '|---|---|---|');
  for (const f of stats.sourceFiles) {
    lines.push(`| ${f.file} | ${f.changed ? 'да' : 'нет'} | \`${f.shaBefore ?? '(нет)'}\` → \`${f.shaAfter}\` |`);
  }

  lines.push('', '## Изменения аллокаций', '', '| | Фиксированная | Мобильная | Итого |', '|---|---|---|---|');
  const rows: [string, keyof DiffStats['allocations']['total']][] = [
    ['Добавлено', 'added'],
    ['Удалено', 'removed'],
    ['Изменены (оператор/регион/населённый пункт)', 'changedData'],
    ['Изменены (только часовой пояс)', 'changedTimezone'],
  ];
  for (const [label, field] of rows) {
    lines.push(
      `| ${label} | ${stats.allocations.fixed[field]} | ${stats.allocations.mobile[field]} | ${stats.allocations.total[field]} |`,
    );
  }

  lines.push(
    '',
    '## Расхождения (`reports/discrepancies.json`)',
    '',
    '| Вид | Было | Стало | Δ |',
    '|---|---|---|---|',
  );
  for (const [kind, c] of Object.entries(stats.discrepancies)) {
    lines.push(`| ${kind} | ${c.before} | ${c.after} | ${c.delta >= 0 ? '+' : ''}${c.delta} |`);
  }

  lines.push(
    '',
    '## Несопоставленные токены регионов',
    '',
    `Было: ${stats.unmappedRegions.before}, стало: ${stats.unmappedRegions.after}`,
  );
  if (stats.unmappedRegions.newlyUnmapped.length) {
    lines.push(`Новые несопоставленные: ${stats.unmappedRegions.newlyUnmapped.map((t) => `\`${t}\``).join(', ')}`);
  }
  if (stats.unmappedRegions.newlyResolved.length) {
    lines.push(`Теперь сопоставлены: ${stats.unmappedRegions.newlyResolved.map((t) => `\`${t}\``).join(', ')}`);
  }
  lines.push('');

  return lines.join('\n');
}
