# Обновление датасета из реестра Минцифры

## Почему это делается вручную

Реестр нумерации скачивается с `opendata.digital.gov.ru`. GitHub-хостед раннеры GitHub Actions
работают из дата-центров Microsoft Azure (США/ЕС) — портал Минцифры возвращает на запросы
оттуда `403 Forbidden` (похоже на блокировку не-российских адресов). Поэтому
автоматизация через обычный GitHub Actions workflow не работает без прокси/VPN с российским
IP.

Пока обновление датасета делается вручную, с машины/сети, у которой есть доступ к порталу
(российский IP или VPN).

## Инструменты в репозитории

| Команда                                                                                     | Что делает                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run build:data`                                                                        | Скачивает свежие CSV реестра (`ABC-3xx/4xx/8xx.csv`, `DEF-9xx.csv`) в `raw-data/`, если их там ещё нет, и пересобирает `src/data/*.json` + `src/reports/*.json`.                                                                                                                                                                                                                                                                                                                                                                     |
| `npm run diff:data -- --old <dir> --new-data <dir> --new-reports <dir> --output <dir>`      | Сравнивает старый снапшот (`<dir>/data/*.json` + `<dir>/reports/*.json`) с указанным текущим (обычно `src/data`/`src/reports`), пишет `stats.json` и детальные JSON-файлы диффа, печатает краткую сводку в консоль. Публикуется вместе с пакетом как `ru-phone-base-diff` (`src/bin/diff-dataset.ts` + `src/build/diff/`).                                                                                                                                                                                                           |
| `npm run diff:analyze -- --old <dir> --new-data <dir> --new-reports <dir> [--output <dir>]` | Более глубокий разбор того же диффа: делит `changed`-аллокации на реальные передачи операторам (ИНН изменился) и косметику реестра (перерегистр названия, смена формулировки НП), и считает чистое изменение ёмкости по каждому оператору напрямую по декодированным блокам — это устойчиво к артефакту слияния диапазонов, из-за которого `added`/`removed` в `diff:data` часто сильно раздуты. Публикуется вместе с пакетом как `ru-phone-base-diff-analyze` (`src/bin/diff-deep-analysis.ts` + `src/build/diff/deepAnalysis.ts`). |
| `npx tsx tools/build-pr-summary.ts --stats <stats.json> --output <file.md>`                 | Рендерит `stats.json` в Markdown для описания PR. Не часть библиотеки, чисто вспомогательный скрипт для человека, открывающего PR.                                                                                                                                                                                                                                                                                                                                                                                                   |

## Пошаговый процесс

1. **Отложить текущий снапшот** (для дальнейшего сравнения):

   ```bash
   mkdir -p /tmp/old-snapshot
   cp -r src/data /tmp/old-snapshot/data
   cp -r src/reports /tmp/old-snapshot/reports
   ```

2. **Скачать базу из сайта Минцифры и пересобрать датасет**:
   Для скачивания требуется сертификат Минцифры Russian Trusted Root CA. Если файла нет проверку можно игнорировать через аргумент --insecure

   ```bash
   npm run build:data -- --download --ca-cert russian_trusted_root_ca.cer
   ```

3. **Проверить, реально ли что-то изменилось** — сравнить хэши исходных CSV в `meta.json`
   (дата `builtAt` меняется всегда, хэши — только если реестр реально обновился):

   ```bash
   diff <(jq -S '.sourceFiles' /tmp/old-snapshot/data/meta.json) <(jq -S '.sourceFiles' src/data/meta.json)
   ```

   Если разницы нет — откатить `git checkout -- src/data src/reports` и на этом всё, обновляться
   нечему.

4. **Прогнать проверки** на пересобранном датасете:

   ```bash
   npm run typecheck && npm run lint && npm test
   ```

5. **Посчитать дифф/статистику**:

   ```bash
   npm run diff:data -- --old /tmp/old-snapshot --new-data src/data --new-reports src/reports --output /tmp/diff-output
   ```

   В консоли — краткая сводка (добавлено/удалено/изменено аллокаций, изменения часовых поясов,
   расхождения, несопоставленные регионы). В `/tmp/diff-output/` — `stats.json` и детальные
   `allocations-added.json` / `allocations-removed.json` / `allocations-changed.json` /
   `timezone-changes.json` для более глубокого разбора при необходимости.

   Числа `added`/`removed` тут часто сильно раздуты артефактом слияния диапазонов (переименование
   одного оператора может задеть границы соседних блоков и превратиться в тысячи added/removed).
   Если добавленное/удалённое/изменённое выглядит подозрительно много — прогнать более глубокий
   разбор:

   ```bash
   npm run diff:analyze -- --old /tmp/old-snapshot --new-data src/data --new-reports src/reports
   ```

   Он делит изменения на реальные передачи номеров операторам и косметику реестра (регистр
   названия, формулировка НП), и ранжирует операторов по чистому изменению ёмкости — тем самым
   показывает, что на самом деле произошло, а не сколько строк JSON изменилось.

6. **Собрать описание PR** (по желанию, если планируется MR, а не прямой коммит):

   ```bash
   npx tsx tools/build-pr-summary.ts --stats /tmp/diff-output/stats.json --output /tmp/diff-output/pr-body.md
   ```

7. **Закоммитить и открыть PR**:
   ```bash
   git checkout -b data-update-$(date +%Y-%m-%d)
   git add src/data src/reports
   git commit -m "fix(data): database update ($(date +%Y-%m-%d))"
   git push -u origin HEAD
   gh pr create --title "fix(data): database update ($(date +%Y-%m-%d))" \
     --body-file /tmp/diff-output/pr-body.md --label database-update
   ```
   (`gh label create database-update --force` — один раз, если лейбла ещё нет в репозитории.)

`fix(data): ...` — коммит такого типа триггерит patch-релиз через semantic-release при мёрдже
в `master`
