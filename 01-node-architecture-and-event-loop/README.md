# Node.js Architecture & The Event Loop

This note explains what’s under the hood of Node.js (V8, bindings/N-API, libuv, JS stdlib) and clarifies the **single-threaded** model and how the **event loop** actually works.

---

## Table of Contents

- [1) High-level mental model](#1-high-level-mental-model)
- [2) “Single-threaded” — what it really means](#2-single-threaded-—-what-it-really-means)
- [3) The Event Loop — phases (libuv)](#3-the-event-loop-—-phases-libuv)
- [4) Where async actually comes from](#4-where-async-actually-comes-from)
- [5) Why the main thread blocks (and how to avoid)](#5-why-the-main-thread-blocks-and-how-to-avoid)
- [6) Main bullets](#6-main-bullets)
- [7) Practical Examples](#7-practical-examples)
  - [Example 01 – Basic Order (Realtime, Microtasks, Macrotasks)](#example-01-–-basic-order-realtime-microtasks-macrotasks)
  - [Example 02 – After I/O (setImmediate vs setTimeout)](#example-02-–-after-io-setimmediate-vs-settimeout)
  - [Example 03 – nextTick vs Promises](#example-03-–-nexttick-vs-promises)
  - [Example 04 – Blocking CPU](#example-04-–-blocking-cpu)
  - [Example 05 – Thread Pool with pbkdf2](#example-05-–-thread-pool-with-pbkdf2)

---

## 1) High-level mental model

```
+---------------------------  JavaScript you write  ---------------------------+
|  Your app code (JS/TS) → Node.js JS API (fs, net, http, timers, streams…)   |
+----------------------------------------------------------------------------+
                          |                         ^
                          v                         |
                 +-----------------+        +-------------------+
                 |  Bindings /     | <----> | Native Addons     |
                 |  N-API / C++    |        | (optional C/C++)  |
                 +-----------------+        +-------------------+
                          |
                          v
                 +-----------------+
                 |     libuv       |  (event loop + thread pool + cross-platform I/O)
                 +-----------------+
                          |
                          v
                 +-----------------+
                 |   OS Kernel     |  (epoll/kqueue/IOCP, files, sockets, timers)
                 +-----------------+

                     +-----------------+
                     |      V8         |  (JS engine: parser, JIT, GC)
                     +-----------------+
```

- **V8**: Google’s JavaScript engine. Parses, JIT-compiles, optimizes, and garbage-collects your JS.
- **Node.js JS API**: The modules you `require`/`import` (`fs`, `http`, `net`, `timers`, `stream`, etc.). Written mostly in JS, backed by C++.
- **Bindings / N-API**: The bridge between JS and native code. Translates JS calls into C/C++ functions and back.
- **libuv**: A C library providing a **portable event loop**, a **thread pool** for blocking tasks, and unified access to OS primitives (sockets, files, DNS, timers).
- **OS Kernel**: Provides the actual nonblocking I/O interfaces (epoll/kqueue/IOCP), file descriptors, network stacks, clocks.

---

## 2) “Single-threaded” — what it really means

- **The JavaScript execution environment is single-threaded**: your JS runs on **one main thread** (the “main event loop” thread).
- Node **is NOT entirely single-threaded**:
  - **libuv thread pool** (default size `UV_THREADPOOL_SIZE=4`) handles certain blocking tasks (e.g., file system ops, DNS lookup without c-ares, crypto like `pbkdf2`, `scrypt`, `bcrypt`, compression).
  - The **OS kernel** does async I/O for sockets using readiness/completion events.
- **Practical consequence**: if JavaScript code occupies the CPU for too long, the event loop is blocked (nothing else runs until it finishes). Asynchronous I/O does not block, but heavy synchronous CPU work does.

---

## 3) The Event Loop — phases (libuv)

These six steps are the internal phases that must be processed inside each **macrotask**.  
Remember: the overall flow is **Call Stack → Microtasks → Macrotasks (these phases)**.

Each **tick** of the loop processes queues in phases:

1. **Timers**: callbacks for `setTimeout` / `setInterval` that are due.
2. **Pending Callbacks**: some system-level callbacks deferred from prior ticks.
3. **Idle/Prepare**: internal use.
4. **Poll**: the heart of I/O — waits for I/O events, processes I/O callbacks.
5. **Check**: `setImmediate` callbacks.
6. **Close Callbacks**: e.g., `'close'` on a socket.

### Microtasks vs Macrotasks (Node specifics)
- **Microtasks**: `Promise` reactions / `queueMicrotask`. They run **after each callback completes**, **before** the loop moves on.
- **`process.nextTick`**: a **special queue** that runs **before** other microtasks (highest priority). Overuse can "freeze the loop."
- **Macrotasks**: the phases described above (timers, poll, check, etc.).

**Simplified order per callback:**
1. Run the current callback.  
2. Drain the **`process.nextTick`** queue.  
3. Drain the **microtasks** (Promises).  
4. Move to the next macrotask phase of the loop.  

---

## 4) Where async actually comes from

- **Network I/O** (sockets): usually **truly non-blocking** via the OS (epoll/kqueue/IOCP). libuv integrates these events into the loop.
- **File system & some crypto**: many operations **do not have** a consistent non-blocking I/O API across OSes → Node uses the **libuv thread pool** to “simulate” async: it delegates the task to a worker thread and schedules the callback once it finishes.
- That’s why **`fs.readFile` async** does not block the loop — but **`fs.readFileSync`** does.

---

## 5) Why the main thread blocks (and how to avoid)

- Any **heavy synchronous computation** (long loops, huge JSON parsing, synchronous zlib, synchronous crypto) **blocks** the loop.
- Strategies:
  - Use async I/O (`...Async` APIs).
  - Offload CPU-bound tasks to **Worker Threads** (or child processes).
  - Split long-running work into **chunks** and yield back to the loop (`setImmediate`, `await`, `queueMicrotask` carefully).
  - Tune **`UV_THREADPOOL_SIZE`** when helpful (crypto/FS intensive workloads).

---

## 6) Main bullets

- JS runs on **one** thread; Node uses **libuv** to integrate **async I/O + thread pool**.
- **Event loop** phases: timers → pending → poll → check → close.  
- **`process.nextTick`** > microtasks (Promises) in priority; they run **between callbacks**.  
- **Network I/O**: async via OS; **FS/crypto**: often via **thread pool**.  
- **Blocking** comes from **synchronous CPU** on the main thread – not from well-used async I/O.

---

## 7) Practical Examples

### Example 01 – Basic Order (Realtime, Microtasks, Macrotasks)

This example explains the execution order of different types of tasks in Node.js: synchronous code, `process.nextTick`, Promises (microtasks), and macrotasks such as `setTimeout` and `setImmediate`. It demonstrates how synchronous code runs first, followed by `process.nextTick` callbacks, then Promise reactions, and finally macrotasks.  
[01-basic-order.js](./examples/01-basic-order.js)

### Example 02 – After I/O (setImmediate vs setTimeout)

This example demonstrates the behavior of `setImmediate` and `setTimeout(0)` inside I/O callbacks. It shows that `setImmediate` callbacks execute before `setTimeout(0)` due to the event loop phases order: Poll → Check → Timers.  
[02-after-io.js](./examples/02-after-io.js)

### Example 03 – nextTick vs Promises

This example shows the priority difference between `process.nextTick` and Promise microtasks. It illustrates that `process.nextTick` callbacks run before Promise reactions in the microtask queue, giving them higher priority.  
[03-nexttick-vs-promises.js](./examples/03-nexttick-vs-promises.js)

### Example 04 – Blocking CPU

This example demonstrates how heavy synchronous CPU-bound operations, such as long loops, block the event loop. It shows how such blocking delays timers, immediates, and I/O callbacks, affecting the responsiveness of the application.  
[04-blocking-cpu.js](./examples/04-blocking-cpu.js)

### Example 05 – Thread Pool with pbkdf2

This example shows how libuv’s thread pool offloads CPU-intensive tasks like cryptographic operations (`pbkdf2`). It also explains how adjusting `UV_THREADPOOL_SIZE` can control concurrency and improve performance for workloads involving such tasks.  
[05-threadpool-pbkdf2.js](./examples/05-threadpool-pbkdf2.js)
