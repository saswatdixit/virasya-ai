const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const artifactDir = 'C:\\Users\\saswa\\.gemini\\antigravity\\brain\\91bb8ced-e3ff-438a-ad4a-e0bfc88f8142';

async function run() {
  const port = 9222;
  const chrome = spawn(chromePath, [
    '--headless',
    '--remote-debugging-port=' + port,
    '--window-size=1440,900',
    '--hide-scrollbars',
    'http://localhost:4173/'
  ]);

  try {
    let target = null;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 300));
      try {
        const res = await fetch(`http://127.0.0.1:${port}/json/list`);
        const list = await res.json();
        target = list.find(t => t.type === 'page');
        if (target) break;
      } catch {}
    }

    if (!target) throw new Error('Could not find target page');

    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      ws.onopen = res;
      ws.onerror = rej;
    });

    let msgId = 1;
    const errors = [];
    const networkFailures = [];

    ws.addEventListener('message', (evt) => {
      const data = JSON.parse(evt.data);
      if (data.method === 'Console.messageAdded' && data.params.message.level === 'error') {
        errors.push(data.params.message.text);
      }
      if (data.method === 'Log.entryAdded' && data.params.entry.level === 'error') {
        errors.push(data.params.entry.text);
      }
      if (data.method === 'Network.loadingFailed') {
        networkFailures.push(data.params.errorText + ' for ' + data.params.requestId);
      }
    });

    function send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = msgId++;
        const handler = (evt) => {
          const data = JSON.parse(evt.data);
          if (data.id === id) {
            ws.removeEventListener('message', handler);
            if (data.error) reject(data.error);
            else resolve(data.result);
          }
        };
        ws.addEventListener('message', handler);
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Log.enable');
    await send('Network.enable');

    // Wait for Three.js initialization and GeoJSON load
    await new Promise(r => setTimeout(r, 2500));

    // 1. Desktop 1440x900 - Hero
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    });
    await send('Runtime.evaluate', { expression: `window.scrollTo(0, 0)` });
    await new Promise(r => setTimeout(r, 600));
    const snapHero1440 = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(artifactDir, 'audit_desktop_hero_1440.png'), Buffer.from(snapHero1440.data, 'base64'));

    // 2. Desktop 1440x900 - India Map (directly after portal)
    await send('Runtime.evaluate', {
      expression: `(() => {
        const mapSec = document.querySelector('#integrations');
        if (mapSec) mapSec.scrollIntoView({ behavior: 'instant', block: 'start' });
      })()`
    });
    await new Promise(r => setTimeout(r, 800));
    const snapMap1440 = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(artifactDir, 'audit_desktop_indiamap_1440.png'), Buffer.from(snapMap1440.data, 'base64'));

    // 3. Tablet 1024x768 - Hero
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1024,
      height: 768,
      deviceScaleFactor: 1,
      mobile: false
    });
    await send('Runtime.evaluate', { expression: `window.scrollTo(0, 0)` });
    await new Promise(r => setTimeout(r, 600));
    const snapHero1024 = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(artifactDir, 'audit_tablet_hero_1024.png'), Buffer.from(snapHero1024.data, 'base64'));

    // 4. Tablet 1024x768 - India Map
    await send('Runtime.evaluate', {
      expression: `(() => {
        const mapSec = document.querySelector('#integrations');
        if (mapSec) mapSec.scrollIntoView({ behavior: 'instant', block: 'start' });
      })()`
    });
    await new Promise(r => setTimeout(r, 800));
    const snapMap1024 = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(artifactDir, 'audit_tablet_indiamap_1024.png'), Buffer.from(snapMap1024.data, 'base64'));

    // 5. Mobile 375x812 - Hero
    await send('Emulation.setDeviceMetricsOverride', {
      width: 375,
      height: 812,
      deviceScaleFactor: 2,
      mobile: true
    });
    await send('Runtime.evaluate', { expression: `window.scrollTo(0, 0)` });
    await new Promise(r => setTimeout(r, 600));
    const snapHero375 = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(artifactDir, 'audit_mobile_hero_375.png'), Buffer.from(snapHero375.data, 'base64'));

    // 6. Mobile 375x812 - India Map
    await send('Runtime.evaluate', {
      expression: `(() => {
        const mapSec = document.querySelector('#integrations');
        if (mapSec) mapSec.scrollIntoView({ behavior: 'instant', block: 'start' });
      })()`
    });
    await new Promise(r => setTimeout(r, 800));
    const snapMap375 = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(artifactDir, 'audit_mobile_indiamap_375.png'), Buffer.from(snapMap375.data, 'base64'));

    console.log(JSON.stringify({
      status: 'SUCCESS',
      errors,
      networkFailures,
      screenshots: [
        'audit_desktop_hero_1440.png',
        'audit_desktop_indiamap_1440.png',
        'audit_tablet_hero_1024.png',
        'audit_tablet_indiamap_1024.png',
        'audit_mobile_hero_375.png',
        'audit_mobile_indiamap_375.png'
      ]
    }, null, 2));

    ws.close();
  } finally {
    chrome.kill();
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
