const res = await fetch("https://streaming-demo.labs.vercel.dev/suspense-demo", {
  headers: { "Accept-Encoding": "identity" },
});

const reader = res.body.getReader();
const decoder = new TextDecoder();
let i = 0;
const start = Date.now();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  console.log(`\nchunk ${i++} (+${Date.now() - start}ms)\n`);
  console.log(decoder.decode(value));
}
