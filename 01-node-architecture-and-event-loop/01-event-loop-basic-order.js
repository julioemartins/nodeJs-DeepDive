//Goal: Show the order: Call Stack (realtime) -> microtasks -> macrotasks

console.log("A) start - Real Time");

process.nextTick( () => {
    console.log("B) nextTick (microtask - higest priority");
});

Promise.resolve().then( () => {
    console.log("C) Promise.then  (microtask)");
})

setTimeout( () => {
    console.log("D) SetTimeout 0ms (macrotask: Timers");
},0);

setImmediate( () => {
    console.log("E) setImediate (macrotask: Check)");
});

console.log("F) end - Realtime");

// Expected relative order (Node):
// A) start - realtime
// F) end - realtime
// B) nextTick (microtask - highest priority)
// C) Promise.then (microtask)
// D) setTimeout 0ms  OR  E) setImmediate
// E) setImmediate     OR  D) setTimeout 0ms
//
// Note: Between setTimeout(0) and setImmediate(), the order can vary on the *first tick*.
// After an I/O boundary, setImmediate tends to run before setTimeout(0).