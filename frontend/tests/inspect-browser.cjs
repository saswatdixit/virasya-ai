const { spawn } = require('child_process');
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = 9333;
const targetUrl = process.argv[2] || 'http://127.0.0.1:5173/';

const chrome = spawn(chromePath, [
  '--headless',
  '--remote-debugging-port=' + port,
  '--window-size=1440,900',
  targetUrl
]);

async function check() {
  try {
    let target = null;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 200));
      try {
        const res = await fetch(`http://127.0.0.1:${port}/json/list`);
        const list = await res.json();
        target = list.find(t => t.type === 'page');
        if (target) break;
      } catch {}
    }
    if (!target) {
      console.log('No page target found');
      chrome.kill();
      return;
    }

    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

    let id = 1;
    function send(method, params = {}) {
      return new Promise((res) => {
        const curId = id++;
        const handler = (evt) => {
          const d = JSON.parse(evt.data);
          if (d.id === curId) {
            ws.removeEventListener('message', handler);
            res(d.result);
          }
        };
        ws.addEventListener('message', handler);
        ws.send(JSON.stringify({ id: curId, method, params }));
      });
    }

    ws.addEventListener('message', (evt) => {
      const d = JSON.parse(evt.data);
      if (d.method === 'Runtime.consoleAPICalled') {
        console.log('[BROWSER CONSOLE]', d.params.type, d.params.args.map(a => a.value || a.description).join(' '));
      }
      if (d.method === 'Runtime.exceptionThrown') {
        console.error('[BROWSER EXCEPTION]', d.params.exceptionDetails?.text, d.params.exceptionDetails?.exception?.description);
      }
    });

    await send('Runtime.enable');
    await send('Page.enable');
    await new Promise(r => setTimeout(r, 2500));

    const evalRes = await send('Runtime.evaluate', { expression: 'document.getElementById("root") ? document.getElementById("root").innerHTML : "NO_ROOT"' });
    console.log('ROOT INNER HTML LENGTH:', evalRes.result?.value?.length);
    console.log('ROOT PREVIEW:', evalRes.result?.value?.slice(0, 300));

    const textRes = await send('Runtime.evaluate', { expression: 'document.body.innerText' });
    console.log('PAGE INNER TEXT PREVIEW:\n', textRes.result?.value?.slice(0, 800));

    const bodyStyleRes = await send('Runtime.evaluate', { expression: 'window.getComputedStyle(document.body).display + " / " + window.getComputedStyle(document.body).visibility' });
    console.log('BODY COMPUTED STYLE:', bodyStyleRes.result?.value);

    ws.close();
    chrome.kill();
  } catch(e) {
    console.error('Error:', e);
    chrome.kill();
  }
}
check();
