module.exports = {
  apps: [{
    name: 'fitlife',
    script: 'node',
    args: '--env-file=.env server.js',
    cwd: '/home/user/webapp',
    env: { NODE_ENV: 'production' },
    watch: false,
    instances: 1,
    exec_mode: 'fork'
  }]
}
