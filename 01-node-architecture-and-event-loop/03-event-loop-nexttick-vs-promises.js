// Goal: show that process.nextTick runs before Promise microtasks.

console.log("A) Start - realtime");

Promise.resolve().then( () => {
    console.log("C) Promise.then (microtask 1)");
    Promise.resolve().then( () => {
        console.log("E) Promise.then (microtask 2)");
    });
});

process.nextTick( () => {
    console.log("B) nextTick (microtask - Highest priority)");
    process.nextTick(() => {
        console.log("D) nextTick (nested)");
    });
});

setTimeout( () => {
    console.log("F) setTimeout 0ms (macrotask: Timers)");
},0);