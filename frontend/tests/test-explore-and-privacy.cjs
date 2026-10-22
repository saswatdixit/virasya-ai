const http = require('http');

function requestJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, raw: body });
        }
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function main() {
  console.log("=== Testing Explore Feed, Reader Drawer Privacy & Access Control ===");

  const timestamp = Date.now();
  const publicStoryId = `story_test_public_${timestamp}`;
  const privateStoryId = `story_test_private_${timestamp}`;
  const draftStoryId = `story_test_draft_${timestamp}`;

  // 1. Create a Public Preserved Story
  console.log("\n1. Creating public preserved story...");
  await requestJson(`http://127.0.0.1:5173/api/stories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: publicStoryId,
      title: "ମାଟି ଦୀପର ଇତିହାସ",
      carrier: "ଶ୍ରୀମତୀ ବିନୋଦିନୀ ଦେବୀ",
      category: "Rituals & Sacred",
      place: "Puri, Odisha",
      language: "Odia",
      period: "1965",
      relationship: "Grandmother",
      status: "draft",
      audio: { filename: "Odia6.ogg", url: "/api/audio/Odia6.ogg", size: 117041 },
      story: "ପୁରୀ ବଡ଼ଦାଣ୍ଡରେ କାର୍ତ୍ତିକ ମାସରେ ମାଟି ଦୀପ ଜଳାଇବାର ବିଶେଷ ପରମ୍ପରା ରହିଛି।",
      final_text: "ପୁରୀ ବଡ଼ଦାଣ୍ଡରେ କାର୍ତ୍ତିକ ମାସରେ ମାଟି ଦୀପ ଜଳାଇବାର ବିଶେଷ ପରମ୍ପରା ରହିଛି। ପ୍ରତି ସନ୍ଧ୍ୟାରେ ଘର ଆଗରେ ଦୀପ ଜଳାଯାଏ।",
      provenance_id: `prov_pub_${timestamp}`,
    })
  });

  // Preserve public story
  await requestJson(`http://127.0.0.1:5173/api/stories/${publicStoryId}/preserve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      visibility: "public",
      confirmed: true,
      permissionConfirmed: true,
      final_text: "ପୁରୀ ବଡ଼ଦାଣ୍ଡରେ କାର୍ତ୍ତିକ ମାସରେ ମାଟି ଦୀପ ଜଳାଇବାର ବିଶେଷ ପରମ୍ପରା ରହିଛି। ପ୍ରତି ସନ୍ଧ୍ୟାରେ ଘର ଆଗରେ ଦୀପ ଜଳାଯାଏ।",
      vocabulary: [{ preferred: "ମାଟି ଦୀପ", meaning: "Earthen clay lamp", language: "Odia" }]
    })
  });

  // 2. Create a Private Preserved Story
  console.log("2. Creating private preserved story...");
  await requestJson(`http://127.0.0.1:5173/api/stories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: privateStoryId,
      title: "ଗୁପ୍ତ ପାରିବାରିକ ସ୍ମୃତି",
      carrier: "ଗୋପନୀୟ ବ୍ୟକ୍ତି",
      category: "Personal & Memoir",
      place: "Cuttack, Odisha",
      status: "draft",
      story: "ଏହା କେବଳ ପରିବାର ମଧ୍ୟରେ ସଂରକ୍ଷିତ।",
      provenance_id: `prov_priv_${timestamp}`,
    })
  });

  // Preserve private story
  await requestJson(`http://127.0.0.1:5173/api/stories/${privateStoryId}/preserve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      visibility: "private",
      confirmed: true,
      permissionConfirmed: true,
      final_text: "ଏହା କେବଳ ପରିବାର ମଧ୍ୟରେ ସଂରକ୍ଷିତ। ଏହି କଥା କାହାକୁ କୁହାଯାଇ ନାହିଁ।"
    })
  });

  // 3. Create an Unpreserved Draft Story
  console.log("3. Creating unpreserved draft story...");
  await requestJson(`http://127.0.0.1:5173/api/stories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: draftStoryId,
      title: "ଅଧା ଲେଖା କାହାଣୀ",
      carrier: "ଅଜ୍ଞାତ",
      status: "draft",
      story: "ଏହା ଏକ ଚିଠା କାହାଣୀ।"
    })
  });

  // 4. Test GET /api/explore (Public Feed)
  console.log("\n4. Testing GET /api/explore feed filtering...");
  const feed = await requestJson('http://127.0.0.1:5173/api/explore');
  if (feed.status !== 200 || !feed.data?.stories) {
    console.error("FAIL: Explore feed request failed", feed);
    process.exit(1);
  }

  const publicFound = feed.data.stories.find(s => s.id === publicStoryId);
  const privateFound = feed.data.stories.find(s => s.id === privateStoryId);
  const draftFound = feed.data.stories.find(s => s.id === draftStoryId);

  if (!publicFound) {
    console.error("FAIL: Public story not found in Explore feed!");
    process.exit(1);
  }
  if (privateFound) {
    console.error("FAIL: Private story leaked in Explore feed!", privateFound);
    process.exit(1);
  }
  if (draftFound) {
    console.error("FAIL: Draft story leaked in Explore feed!", draftFound);
    process.exit(1);
  }
  console.log("PASS: Explore feed contains public story, excludes private and draft stories.");

  // 5. Test GET /api/explore/:id (Direct Details)
  console.log("\n5. Testing direct story detail endpoint access control...");
  
  // Public story detail
  const pubDetail = await requestJson(`http://127.0.0.1:5173/api/explore/${publicStoryId}`);
  if (pubDetail.status !== 200 || !pubDetail.data?.story) {
    console.error("FAIL: Failed to get public story detail", pubDetail);
    process.exit(1);
  }
  const story = pubDetail.data.story;
  if (story.raw_transcripts || story.vaani || story.indicconformer) {
    console.error("FAIL: Raw ASR transcripts leaked in public story detail!", story);
    process.exit(1);
  }
  if (!story.final_text || !story.provenance_id || !story.audio) {
    console.error("FAIL: Missing expected narrative, audio, or provenance in public story detail", story);
    process.exit(1);
  }
  console.log("PASS: Public story detail returned clean payload with narrative, audio, and provenance (zero raw transcripts).");

  // Private story detail (must return 403 Forbidden)
  const privDetail = await requestJson(`http://127.0.0.1:5173/api/explore/${privateStoryId}`);
  if (privDetail.status !== 403) {
    console.error(`FAIL: Private story detail did not return 403 Forbidden! Returned: ${privDetail.status}`, privDetail);
    process.exit(1);
  }
  console.log("PASS: Private story detail blocked with 403 Forbidden.");

  // Draft story detail (must return 403 Forbidden)
  const draftDetail = await requestJson(`http://127.0.0.1:5173/api/explore/${draftStoryId}`);
  if (draftDetail.status !== 403) {
    console.error(`FAIL: Draft story detail did not return 403 Forbidden! Returned: ${draftDetail.status}`, draftDetail);
    process.exit(1);
  }
  console.log("PASS: Draft story detail blocked with 403 Forbidden.");

  console.log("\nSUCCESS: All Explore feed, detail privacy, and payload sanitization checks passed 100%!");
}

main().catch(err => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
