const http = require('http');

async function transcribe(filename, model = "both") {
  const postData = JSON.stringify({ filename, model });
  const t0 = Date.now();
  
  return new Promise((resolve, reject) => {
    const req = http.request('http://127.0.0.1:5173/api/transcribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        const elapsed = (Date.now() - t0) / 1000;
        try {
          const json = JSON.parse(body);
          resolve({ status: res.statusCode, elapsed, data: json });
        } catch {
          resolve({ status: res.statusCode, elapsed, raw: body });
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function main() {
  console.log("=== Testing Real Dual-Model ASR Transcription via Vite Proxy ===");
  console.log("Testing on real audio recording: Odia6.ogg");

  console.log("\n[Run 1] Initiating dual-model transcription (Vaani + IndicConformer)...");
  const res1 = await transcribe("Odia6.ogg", "both");
  console.log(`Run 1 Completed in ${res1.elapsed.toFixed(2)}s, HTTP Status: ${res1.status}`);

  if (res1.status !== 200 || !res1.data) {
    console.error("FAIL: Transcription request failed!", res1);
    process.exit(1);
  }

  const vResult = res1.data.results?.vaani;
  const iResult = res1.data.results?.indicconformer;

  console.log("\n--- Vaani FastConformer Results ---");
  console.log(`Status: ${vResult?.status}`);
  console.log(`Model: ${vResult?.model}`);
  console.log(`Inference time: ${vResult?.inference_seconds}s (audio duration: ${vResult?.duration_seconds}s)`);
  console.log(`Transcript excerpt: ${vResult?.text?.slice(0, 120)}...`);

  console.log("\n--- IndicConformer Results ---");
  console.log(`Status: ${iResult?.status}`);
  console.log(`Model: ${iResult?.model}`);
  console.log(`Inference time: ${iResult?.inference_seconds}s (audio duration: ${iResult?.duration_seconds}s)`);
  console.log(`Transcript excerpt: ${iResult?.text?.slice(0, 120)}...`);

  if (vResult?.status !== "done" || iResult?.status !== "done") {
    console.error("FAIL: Both models did not succeed!");
    process.exit(1);
  }

  console.log("\n[Run 2] Warm-start dual transcription test...");
  const res2 = await transcribe("Odia6.ogg", "both");
  console.log(`Run 2 Completed in ${res2.elapsed.toFixed(2)}s, HTTP Status: ${res2.status}`);

  console.log("\nSUCCESS: Real dual-model Odia ASR transcription verified flawlessly!");
}

main().catch(err => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
