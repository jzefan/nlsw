const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const deployScript = fs.readFileSync(
  path.join(__dirname, '..', 'deploy', 'deploy.sh'),
  'utf8',
);

test('starts the frontend with the target Node installation absolute serve path', () => {
  assert.match(
    deployScript,
    /pm2 start "\\\$HOME\/\$NODE_INSTALL_DIR\/bin\/serve" --name nlsw-frontend/,
  );
});

test('verifies each restarted PM2 application has a running PID', () => {
  const restartSection = deployScript.slice(deployScript.indexOf('# 重启服务'));
  const onlineChecks = restartSection.match(/pm2 pid nlsw-(?:backend|frontend)/g) || [];

  assert.equal(onlineChecks.length, 2);
});

test('configures PM2 systemd startup through sudo with the target Node PATH', () => {
  assert.match(
    deployScript,
    /run_sudo env "PATH=\\\$PATH" pm2 startup systemd -u \$SERVER_USER --hp \/home\/\$SERVER_USER/,
  );
  assert.doesNotMatch(
    deployScript,
    /pm2 startup systemd -u \$SERVER_USER --hp \/home\/\$SERVER_USER \|\| true/,
  );
});
