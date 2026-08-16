/* 冒烟测试：需先在默认端口启动 server.js（node server.js） */
const BASE = process.env.BASE_URL || 'http://localhost:3000';

let pass = 0;
let fail = 0;

function ok(name, cond, extra = '') {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name} ${extra}`);
  }
}

async function req(method, path, { token, apiToken, body } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (apiToken) headers['X-API-Token'] = apiToken;
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

async function waitForServer() {
  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch(`${BASE}/api/records`);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  throw new Error('server not reachable');
}

async function main() {
  console.log('waiting for server...');
  await waitForServer();

  // 1. login
  let r = await req('POST', '/auth/login', { body: { username: 'admin', password: 'admin123' } });
  ok('admin login', r.status === 200 && !!r.json.token, `status=${r.status}`);
  const jwt = r.json.token;

  r = await req('GET', '/auth/me', { token: jwt });
  ok('GET /auth/me', r.status === 200 && r.json.user.username === 'admin');

  // 2. records: create public + private
  r = await req('POST', '/records', { token: jwt, body: { name: 'public', data: { a: 1 }, anonymous_access: true } });
  ok('create public record', r.status === 201, `status=${r.status}`);
  const publicId = r.json.record.id;

  r = await req('POST', '/records', { token: jwt, body: { name: 'private', data: { b: 2 } } });
  ok('create private record', r.status === 201, `status=${r.status}`);
  const privateId = r.json.record.id;

  // 3. arbitrary data type (string, array, number)
  r = await req('POST', '/records', { token: jwt, body: { data: 'just a string' } });
  ok('create record with string data', r.status === 201 && r.json.record.data === 'just a string');
  const strId = r.json.record.id;

  // 4. anonymous access
  r = await req('GET', '/records');
  const anonIds = r.json.records.map((x) => x.id);
  ok('anonymous list shows public only', r.status === 200 && anonIds.includes(publicId) && !anonIds.includes(privateId));

  r = await req('GET', `/records/${publicId}`);
  ok('anonymous read public ok', r.status === 200);
  r = await req('GET', `/records/${privateId}`);
  ok('anonymous read private denied', r.status === 401, `status=${r.status}`);

  // 5. authed sees all
  r = await req('GET', '/records', { token: jwt });
  const authedIds = r.json.records.map((x) => x.id);
  ok('authed list shows all', authedIds.includes(publicId) && authedIds.includes(privateId));

  // 6. user management
  r = await req('POST', '/users', { token: jwt, body: { username: 'smoketest', password: 'test123456' } });
  ok('create user', r.status === 201, `status=${r.status}`);
  const userId = r.json.user.id;

  r = await req('POST', '/auth/login', { body: { username: 'smoketest', password: 'test123456' } });
  ok('login new user', r.status === 200);
  const userJwt = r.json.token;

  r = await req('POST', '/auth/change-password', { token: userJwt, body: { current_password: 'test123456', new_password: 'newpass123' } });
  ok('change password', r.status === 200, `status=${r.status}`);

  r = await req('POST', '/auth/login', { body: { username: 'smoketest', password: 'newpass123' } });
  ok('login with new password', r.status === 200);
  r = await req('POST', '/auth/login', { body: { username: 'smoketest', password: 'test123456' } });
  ok('old password rejected', r.status === 401);

  // 7. API token
  r = await req('POST', '/tokens', { token: jwt, body: { name: 'smoke-token' } });
  ok('create token', r.status === 201 && !!r.json.secret, `status=${r.status}`);
  const secret = r.json.secret;
  const tokenId = r.json.token.id;

  r = await req('POST', '/records', { apiToken: secret, body: { name: 'via-token', data: { src: 'external' } } });
  ok('token create record', r.status === 201, `status=${r.status}`);
  const tokenRecId = r.json.record.id;

  r = await req('PUT', `/records/${tokenRecId}`, { apiToken: secret, body: { data: { src: 'external', updated: true } } });
  ok('token update record', r.status === 200 && r.json.record.data.updated === true);

  r = await req('GET', '/records', { apiToken: secret });
  const tokenIds = r.json.records.map((x) => x.id);
  ok('token reads all records', tokenIds.includes(privateId));

  r = await req('GET', '/users', { apiToken: secret });
  ok('token cannot manage users', r.status !== 200, `status=${r.status}`);

  r = await req('DELETE', `/records/${tokenRecId}`, { apiToken: secret });
  ok('token delete record', r.status === 200, `status=${r.status}`);

  // 8. update + delete via session
  r = await req('PUT', `/records/${publicId}`, { token: jwt, body: { anonymous_access: false } });
  ok('update record field', r.status === 200 && r.json.record.anonymous_access === false);

  // 9. cleanup
  await req('DELETE', `/tokens/${tokenId}`, { token: jwt });
  await req('DELETE', `/records/${publicId}`, { token: jwt });
  await req('DELETE', `/records/${privateId}`, { token: jwt });
  await req('DELETE', `/records/${strId}`, { token: jwt });
  r = await req('DELETE', `/users/${userId}`, { token: jwt });
  ok('delete user cleanup', r.status === 200);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('smoke test error:', err.message);
  process.exit(1);
});
