const pw = require('C:/Users/shenwuqiang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const launch = pw.chromium.launch.bind(pw.chromium);
pw.chromium.launch = ({ channel, ...options } = {}) => launch({ ...options, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
module.exports = pw;
