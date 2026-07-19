const { lookupPhoneNumber, getRegions } = require('ru-phone-base');

console.log('CJS node', process.version);
const r = lookupPhoneNumber('89161234567');
console.log(
  JSON.stringify({
    valid: r.valid,
    type: r.data?.type,
    operator: r.data?.operator,
    timezone: r.data?.timezone,
    region: r.data?.region?.map((x) => x.slug),
  }),
);
if (!r.valid) {
  console.error('expected mobile number to be valid');
  process.exit(1);
}
console.log('regions', getRegions().length);
console.log('CJS OK');
