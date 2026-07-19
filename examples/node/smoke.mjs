import { lookupPhoneNumber, getRegions, normalizePhoneNumber } from 'ru-phone-base';

const cases = ['+7 495 123-45-67', '89031234567', '8 800 555 35 35', 'not-a-phone'];

console.log('node', process.version);
console.log('normalize', normalizePhoneNumber('+7 (495) 123-45-67'));

for (const input of cases) {
  const r = lookupPhoneNumber(input);
  console.log(
    JSON.stringify({
      input: r.input,
      valid: r.valid,
      type: r.data?.type,
      code: r.data?.code,
      operator: r.data?.operator,
      region: r.data?.region?.map((x) => x.slug),
      timezone: r.data?.timezone,
      nationwide: r.data?.nationwide,
      reason: r.reason,
    }),
  );
}

const regions = getRegions();
console.log('regions count', regions.length);
if (!lookupPhoneNumber('+7 495 123-45-67').valid) {
  console.error('expected Moscow fixed number to be valid');
  process.exit(1);
}
if (regions.length < 80) {
  console.error('expected >= 80 regions, got', regions.length);
  process.exit(1);
}
console.log('ESM OK');
