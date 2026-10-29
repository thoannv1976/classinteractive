// Reads `firebase ... --json` output from stdin (tolerating log lines before it)
// and prints the value of a JS expression evaluated on `r` (the "result" field).
//   firebase apps:list WEB --json | node infrastructure/fbjson.cjs 'r[0] && r[0].appId'
let s = '';
process.stdin.on('data', (d) => (s += d)).on('end', () => {
  const i = s.search(/\{\s*"status"/);
  let r = null;
  try {
    r = JSON.parse(i >= 0 ? s.slice(i) : s).result;
  } catch {
    r = null;
  }
  let v = '';
  try {
    v = r === null ? '' : new Function('r', `return (${process.argv[2]})`)(r);
  } catch {
    v = '';
  }
  process.stdout.write(v === undefined || v === null ? '' : typeof v === 'string' ? v : JSON.stringify(v));
});
