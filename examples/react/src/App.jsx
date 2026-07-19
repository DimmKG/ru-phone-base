import { useEffect, useMemo, useRef, useState } from 'react';
import { loadRuPhoneBase } from './ruPhoneBase.js';

const EXAMPLES = [
  { label: 'Москва (городской)', value: '+7 495 123-45-67' },
  { label: 'МТС (мобильный)', value: '+7 916 123-45-67' },
  { label: 'Билайн (мобильный)', value: '+7 903 123-45-67' },
  { label: '8-800 (федеральный)', value: '8 800 555 35 35' },
  { label: 'Неверный формат', value: 'не телефон' },
];

const TYPE_LABEL = { fixed: 'Городской', mobile: 'Мобильный' };
const REASON_LABEL = { 'invalid-format': 'Неверный формат номера', unassigned: 'Номер не назначен' };

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

function ResultCard({ result }) {
  if (!result) {
    return <p className="hint">Введите номер или выберите пример выше.</p>;
  }
  if (!result.valid) {
    return (
      <div className="card card--warn">
        <div className="badge badge--warn">{REASON_LABEL[result.reason] ?? result.reason}</div>
        <p className="mono">{result.input}</p>
      </div>
    );
  }
  const { data } = result;
  return (
    <div className="card card--ok">
      <div className="card-row">
        <span className="badge badge--ok">{data.nationwide ? 'Федеральный' : TYPE_LABEL[data.type]}</span>
        <span className="mono">{result.normalized}</span>
      </div>
      <dl className="fields">
        <dt>Оператор</dt>
        <dd>{data.operator}</dd>
        <dt>Код</dt>
        <dd className="mono">{data.code}</dd>
        {data.settlement && (
          <>
            <dt>Населённый пункт</dt>
            <dd>{data.settlement}</dd>
          </>
        )}
        {data.region.length > 0 && (
          <>
            <dt>Регион{data.region.length > 1 ? 'ы' : ''}</dt>
            <dd>
              <div className="chips">
                {data.region.map((r) => (
                  <span className="chip" key={r.slug}>
                    {r.name}
                  </span>
                ))}
              </div>
            </dd>
          </>
        )}
        {data.timezone && (
          <>
            <dt>Часовой пояс</dt>
            <dd className="mono">{data.timezone}</dd>
          </>
        )}
      </dl>
    </div>
  );
}

export default function App() {
  const [includeFixed, setIncludeFixed] = useState(true);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  const [phone, setPhone] = useState('');
  const libRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setError(null);
    libRef.current = null;

    loadRuPhoneBase({ includeFixed })
      .then(({ lib, stats: s }) => {
        if (cancelled) return;
        libRef.current = lib;
        setStats(s);
        setStatus('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        setError(String(err?.message ?? err));
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [includeFixed]);

  const result = useMemo(() => {
    if (status !== 'ready' || !phone.trim() || !libRef.current) return null;
    return libRef.current.lookupPhoneNumber(phone);
  }, [phone, status]);

  return (
    <main className="app">
      <header>
        <h1>ru-phone-base</h1>
        <p className="subtitle">
          Определение региона, оператора и часового пояса по номеру телефона — прямо в браузере, без сервера.
        </p>
      </header>

      <section className="panel">
        <label className="toggle">
          <input
            type="checkbox"
            checked={includeFixed}
            onChange={(e) => setIncludeFixed(e.target.checked)}
            disabled={status === 'loading'}
          />
          Полная база (городские + мобильные номера)
        </label>
        <p className="hint">
          {includeFixed
            ? 'Загружен fixed.json — самый большой файл базы. Снимите галочку, чтобы загрузить только мобильную базу.'
            : 'fixed.json не загружался — городские номера будут отвечать "номер не назначен". Демонстрирует createRuPhoneBaseFromData({ include: ["mobile"] }).'}
        </p>

        {status === 'loading' && <p className="hint">Загрузка и проверка SHA-256…</p>}
        {status === 'error' && <p className="hint hint--error">Ошибка загрузки: {error}</p>}
        {status === 'ready' && stats && (
          <p className="hint hint--ok">
            Загружено {stats.files.length} файлов ({formatBytes(stats.bytes)}) за {stats.elapsedMs.toFixed(0)} мс,
            SHA-256 проверен ✓
          </p>
        )}
      </section>

      <section className="panel">
        <input
          className="phone-input"
          type="text"
          placeholder="+7 495 123-45-67"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          disabled={status !== 'ready'}
        />
        <div className="examples">
          {EXAMPLES.map((ex) => (
            <button key={ex.value} type="button" onClick={() => setPhone(ex.value)} disabled={status !== 'ready'}>
              {ex.label}
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <ResultCard result={result} />
      </section>

      <footer>
        <a href="https://github.com/DimmKG/ru-phone-base" target="_blank" rel="noreferrer">
          ru-phone-base
        </a>{' '}
        · данные загружены через <code>fetch</code> из <code>public/data</code>, разобраны через{' '}
        <code>createRuPhoneBaseFromData</code> из <code>ru-phone-base/browser</code>
      </footer>
    </main>
  );
}
