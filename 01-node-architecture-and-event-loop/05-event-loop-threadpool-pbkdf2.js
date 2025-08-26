// Goal: visualize libuv thread pool concurrency (and watch threads via top/ps).
// Run with different pool sizes to compare: UV_THREADPOOL_SIZE=2/4/8 ...

const { pbkdf2 } = require("crypto");
const os = require("os");


const POOL = process.env.UV_THREADPOOL_SIZE || 4;

console.log(`PID = ${process.pid}`);
console.log(`UV_THREADPOOL_SIZE = ${POOL} (default 4)`);
console.log(`Logical CPUs = ${os.cpus().length}`);
console.log("Starting 8 pbkdf2 jobs... \n");

const start = Date.now();
const TOTAL = 128;
let done = 0;

// keep process alive while jobs run (and give time to inspect with top)
const heartbeat = setInterval( () =>{},10_000);

function finish(label) {
  const elapsed = ((Date.now() - start) / 1000).toFixed(2);
  console.log(`${label} done at +${elapsed}s`);
  if (++done === TOTAL) {
    clearInterval(heartbeat);
    console.log("\nAll jobs done. Exiting.");
  }
}


function runPBKDF2(label) {
    pbkdf2("password","salt", 200_000, 64, "sha512", (err) => {
        if (err) throw err;
        finish(label);
    });
};

for (let i = 1; i <= TOTAL; i++) {
  runPBKDF2(`job-${i}`);
}

// Expected:
// - With pool=4, you should see ~4 jobs complete together, then more in batches.
// - With pool=8, more jobs complete in the first wave.
// This shows CPU-heavy crypto is executed on libuv worker threads, not the main event loop.