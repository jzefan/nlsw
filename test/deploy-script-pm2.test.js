const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const deployScript = fs.readFileSync(
  path.join(__dirname, '..', 'deploy', 'deploy.sh'),
  'utf8',
);
const envExample = fs.readFileSync(
  path.join(__dirname, '..', '.env.example'),
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

test('standalone deployment can enable attendance and persists the setting', () => {
  assert.match(deployScript, /DEPLOY_MODE="standalone"[\s\S]*?read -p "启用考勤管理\? \(y\/n\) \[n\]: /);
  assert.match(deployScript, /ENABLE_ATTENDANCE="true"[\s\S]*?ENABLE_ATTENDANCE=\$ENABLE_ATTENDANCE/);
  assert.match(envExample, /^ENABLE_ATTENDANCE=false$/m);
});
