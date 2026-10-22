const http = require('http');
const fs = require('fs');
const path = require('path');

async function main() {
  console.log("=== Testing Real Audio Upload & Playback via Vite Proxy (Port 5173 -> 5000) ===");
  
  const candidates = [
    path.resolve(__dirname, "../../virasya-ai/data/input/Odia6.ogg"),
    path.resolve(__dirname, "../virasya-ai/data/input/Odia6.ogg"),
  ];
  let sampleAudioPath = candidates.find(p => fs.existsSync(p));
  if (!sampleAudioPath) {
    console.error("Audio sample Odia6.ogg not found!");
    process.exit(1);
  }
  
  const audioData = fs.readFileSync(sampleAudioPath);
  console.log(`Using real Odia audio file: Odia6.ogg (${audioData.length} bytes)`);

  // 1. Multipart Form Upload
  const boundary = '----VirasyaBoundary' + Date.now();
  const pre = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="e2e_verify_odia6.ogg"\r\n` +
    `Content-Type: audio/ogg\r\n\r\n`
  );
  const post = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body = Buffer.concat([pre, audioData, post]);

  console.log("Sending POST /api/upload to Vite proxy (http://127.0.0.1:5173/api/upload)...");
  const uploadRes = await new Promise((resolve, reject) => {
    const req = http.request('http://127.0.0.1:5173/api/upload', {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });

  console.log(`Upload response status: ${uploadRes.statusCode}`);
  console.log(`Upload response body  : ${uploadRes.body}`);

  if (uploadRes.statusCode !== 200) {
    console.error("FAIL: Upload did not return 200");
    process.exit(1);
  }

  const json = JSON.parse(uploadRes.body);
  if (!json.url || !json.filename) {
    console.error("FAIL: Upload response missing url or filename");
    process.exit(1);
  }

  // 2. Playback Verification via Vite Proxy
  console.log(`Verifying playback retrieval at GET http://127.0.0.1:5173${json.url}...`);
  const playbackRes = await new Promise((resolve, reject) => {
    const req = http.request(`http://127.0.0.1:5173${json.url}`, {
      method: 'GET'
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({
        statusCode: res.statusCode,
        contentType: res.headers['content-type'],
        contentLength: res.headers['content-length'],
        bytes: Buffer.concat(chunks)
      }));
    });
    req.on('error', reject);
    req.end();
  });

  console.log(`Playback response status: ${playbackRes.statusCode}`);
  console.log(`Playback content-type   : ${playbackRes.contentType}`);
  console.log(`Playback received bytes : ${playbackRes.bytes.length}`);

  if (playbackRes.statusCode !== 200) {
    console.error("FAIL: Audio playback returned non-200");
    process.exit(1);
  }
  if (playbackRes.bytes.length !== audioData.length) {
    console.error(`FAIL: Byte length mismatch! Uploaded: ${audioData.length}, Received: ${playbackRes.bytes.length}`);
    process.exit(1);
  }

  // 3. Test Unsupported Format
  console.log("Testing upload of unsupported file type (.exe)...");
  const badPre = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="test.exe"\r\n` +
    `Content-Type: application/octet-stream\r\n\r\n`
  );
  const badBody = Buffer.concat([badPre, Buffer.from("dummy binary content"), post]);
  const badRes = await new Promise((resolve, reject) => {
    const req = http.request('http://127.0.0.1:5173/api/upload', {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': badBody.length,
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.write(badBody);
    req.end();
  });
  console.log(`Unsupported format status: ${badRes.statusCode}, body: ${badRes.body}`);
  if (badRes.statusCode !== 400 || !badRes.body.includes("UNSUPPORTED_FILE_TYPE")) {
    console.error("FAIL: Did not get expected 400 UNSUPPORTED_FILE_TYPE");
    process.exit(1);
  }

  // 4. Test Empty File (0 bytes)
  console.log("Testing upload of empty file (0 bytes)...");
  const emptyPre = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="empty.wav"\r\n` +
    `Content-Type: audio/wav\r\n\r\n`
  );
  const emptyBody = Buffer.concat([emptyPre, Buffer.alloc(0), post]);
  const emptyRes = await new Promise((resolve, reject) => {
    const req = http.request('http://127.0.0.1:5173/api/upload', {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': emptyBody.length,
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.write(emptyBody);
    req.end();
  });
  console.log(`Empty file status: ${emptyRes.statusCode}, body: ${emptyRes.body}`);
  if (emptyRes.statusCode !== 400 || !emptyRes.body.includes("EMPTY_FILE")) {
    console.error("FAIL: Did not get expected 400 EMPTY_FILE");
    process.exit(1);
  }

  console.log("SUCCESS: Real Odia audio upload, playback, and edge-case validations all passed!");
}

main().catch(err => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
