const base='http://127.0.0.1:3000';
const rand = Date.now();
const print = (name, data) => console.log(`--- ${name} ---`, JSON.stringify(data));

const post = async (path, body, token) => {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return { ok: res.ok, status: res.status, data: await res.json() };
};

const get = async (path, token) => {
  const res = await fetch(`${base}${path}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  let data;
  try { data = await res.json(); } catch (err) { data = { error: 'invalid-json' }; }
  return { ok: res.ok, status: res.status, data };
};

(async () => {
  try {
    print('HEALTH', await get('/health'));

    const admin = {
      name: 'Admin User',
      email: `admin${rand}@test.com`,
      password: '123456',
      role: 'admin',
    };
    const register = await post('/api/auth/register', admin);
    print('REGISTER', register);
    if (!register.ok) return;

    const login = await post('/api/auth/login', { email: admin.email, password: admin.password });
    print('LOGIN', login);
    if (!login.ok) return;
    const token = login.data.token;

    print('ME', await get('/api/auth/me', token));
    print('USERS', await get('/api/users', token));

    const project = await post('/api/projects', {
      title: 'Test Project',
      category: 'CRM',
      description: 'Test project for verification',
      owner: register.data.data._id,
      members: [],
      status: 'active',
    }, token);
    print('PROJECT_CREATE', project);
    if (!project.ok) return;

    print('PROJECTS_LIST', await get('/api/projects', token));

    const issue = await post('/api/issues', {
      title: 'Login bug',
      description: 'Cannot login through UI',
      project: project.data.data._id,
      priority: 'high',
      severity: 'major',
    }, token);
    print('ISSUE_CREATE', issue);
    if (!issue.ok) return;

    print('ISSUES_LIST', await get('/api/issues', token));

    const comment = await post('/api/comments', {
      issue: issue.data.data._id,
      message: 'This is a test comment',
    }, token);
    print('COMMENT_CREATE', comment);

    print('COMMENTS_LIST', await get('/api/comments', token));

    print('ANALYTICS_ISSUES', await get('/api/analytics/issues', token));
    print('ANALYTICS_PROJECTS', await get('/api/analytics/projects', token));
    print('ANALYTICS_DEVELOPERS', await get('/api/analytics/developers', token));

    const sync = await post('/api/sync', [
      { name: 'Sync User', email: `sync${rand}@test.com`, password: '123456', role: 'developer' },
    ], token);
    print('SYNC', sync);
  } catch (error) {
    console.error('TEST_ERROR', error);
  }
})();
