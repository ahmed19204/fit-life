module.exports = {
  apps: [{
    name: 'fitlife',
    script: 'npx',
    args: 'vite preview --host 0.0.0.0 --port 3000',
    cwd: '/home/user/webapp',
    env: { NODE_ENV: 'production' },
    watch: false,
    instances: 1,
    exec_mode: 'fork'
  }]
}
