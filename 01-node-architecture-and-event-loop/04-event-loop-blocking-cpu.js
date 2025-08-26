// Goal: demonstrate that heavy synchronous CPU work blocks the event loop.
// We'll schedule timers and an async fs.readFile, then run a busy loop.

const fs = require("fs");
const { performance } = require("perf_hooks");

function busy(ms) {
    const end = performance.now() + ms;
    while (performance.now() < end) {
        //burn CPU
    };
};


console.log("A) start - realtime");

// Schedule things that should run "soon"
setTimeout( () => {
    console.log("B) setTimeout 0ms (Timers)");
},0);

setImmediate( () => {
    console.log("C) setImediate (Check)");
});

fs.readFile(__filename, () => {
    console.log("D) I/O callback (Poll)");
});

// Now block the main thread for ~1500ms
const t0 = performance.now();
busy(1500);

const dt = Math.round(performance.now() - t0);

console.log(`E) finished busy loop (~${dt} ms) - still realtime`);


// Expected:
// - B, C, D will only print AFTER the busy() loop finishes.
// - This proves that synchronous CPU on the main thread blocks the loop.
//
// Typical output order:
// A) start - realtime
// E) finished busy loop (~1500 ms) - still realtime
// B) setTimeout 0ms (Timers)
// C) setImmediate (Check)
// D) I/O callback (Poll)