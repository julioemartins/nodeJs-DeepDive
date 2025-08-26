// Goal: after an I/O callback, setImmediate usually fires before setTimeout(0).

const fs = require("fs");

fs.readFile(__filename, () => {
  console.log("A) I/O callback (Poll phase)");

  setTimeout(() => {
    console.log("B) setTimeout 0ms (Timers)");
  }, 0);

  setImmediate(() => {
    console.log("C) setImmediate (Check)");
  });
});

// Expected order (typical in Node after an I/O boundary):
// A) I/O callback (Poll phase)
// C) setImmediate (Check)
// B) setTimeout 0ms (Timers)
//
// Rationale: once we return from Poll, the loop goes to Check before the next Timers phase.


/**
 * The 6 phases of the Node.js event loop (inside each macrotask tick):
 *
 * 1. Timers
 *    - Executes callbacks scheduled by setTimeout() and setInterval() whose timers have expired.
 *
 * 2. Pending Callbacks
 *    - Executes some system-level callbacks deferred from the previous tick
 *      (e.g. TCP errors, certain OS callbacks).
 *
 * 3. Idle/Prepare
 *    - Internal use only. Used by libuv to prepare for the next poll phase.
 *
 * 4. Poll
 *    - The heart of the loop.
 *    - Retrieves new I/O events and executes I/O callbacks (e.g. fs.readFile, sockets, http).
 *    - If there are no timers due and no immediate callbacks, the poll phase can block
 *      and wait for new I/O.
 *
 * 5. Check
 *    - Executes callbacks scheduled with setImmediate().
 *
 * 6. Close Callbacks
 *    - Executes 'close' event callbacks (e.g. socket.on('close', ...)).
 *
 * General flow:
 * Call Stack → process.nextTick queue → Microtasks (Promises) → Macrotask phases (1–6 above)
 */