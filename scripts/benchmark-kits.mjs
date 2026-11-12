import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
const root = path.resolve("server/easel/server/library");
const Partition = (
  await import(
    pathToFileURL(path.join(root, "collections/server/partition.mjs"))
  )
).default;
const Transfer = (
  await import(
    pathToFileURL(path.join(root, "collections/server/transfer.mjs"))
  )
).default;
const partition = new Partition(),
  transfer = new Transfer(),
  results = [];
for (const count of [1200, 5000]) {
  const cards = Object.fromEntries(
    Array.from({ length: count }, (_, i) => [
      "card-" + i,
      {
        id: "card-" + i,
        name: "Card " + i,
        description:
          "A representative card description for the table benchmark.",
        image: "/cards/" + i + ".jpg",
        owner: "player-" + (i % 6),
      },
    ]),
  );
  const refs = Object.keys(cards),
    pages = partition.create(refs, 100).pages;
  const aggregate = {
    cards,
    library: refs,
    hands: Object.fromEntries(
      Array.from({ length: 6 }, (_, i) => ["player-" + i, []]),
    ),
  };
  const full = [],
    partial = [];
  let fullBytes = 0,
    partialBytes = 0;
  for (let n = 0; n < 100; n++) {
    let begin = performance.now();
    const serialized = JSON.stringify(aggregate),
      next = JSON.parse(serialized);
    const moved = transfer.move(
      next.library,
      next.hands["player-0"],
      next.library[0],
    );
    next.library = moved.source;
    next.hands["player-0"] = moved.destination;
    full.push(performance.now() - begin);
    fullBytes = Buffer.byteLength(serialized);
    begin = performance.now();
    const page = structuredClone(pages[0]),
      hand = [];
    const movedPage = transfer.move(page, hand, page[0]);
    const patch = { page: movedPage.source, hand: movedPage.destination };
    partialBytes = Buffer.byteLength(JSON.stringify(patch));
    partial.push(performance.now() - begin);
  }
  let state = {
      pages: structuredClone(pages),
      hands: Object.fromEntries(
        Array.from({ length: 6 }, (_, i) => ["player-" + i, []]),
      ),
      revision: 0,
    },
    conflicts = 0;
  await Promise.all(
    Array.from({ length: 6 }, (_, player) =>
      (async () => {
        for (let n = 0; n < 20; n++) {
          let committed = false;
          while (!committed) {
            const revision = state.revision,
              pageIndex = state.pages.findIndex((p) => p.length),
              id = state.pages[pageIndex][0],
              moved = transfer.move(
                state.pages[pageIndex],
                state.hands["player-" + player],
                id,
              );
            await Promise.resolve();
            if (revision !== state.revision) {
              conflicts++;
              continue;
            }
            const pages = state.pages.slice();
            pages[pageIndex] = moved.source;
            state = {
              pages,
              hands: {
                ...state.hands,
                ["player-" + player]: moved.destination,
              },
              revision: revision + 1,
            };
            committed = true;
          }
        }
      })(),
    ),
  );
  const all = [...state.pages.flat(), ...Object.values(state.hands).flat()];
  if (
    all.length !== count ||
    new Set(all).size !== count ||
    state.revision !== 120
  )
    throw new Error("Concurrent transfer corrupted membership");
  const stats = (times) => ({
    meanMs: times.reduce((a, b) => a + b, 0) / times.length,
    p95Ms: [...times].sort((a, b) => a - b)[Math.floor(times.length * 0.95)],
  });
  results.push({
    cards: count,
    pageSize: 100,
    iterations: 100,
    aggregate: { ...stats(full), serializedBytes: fullBytes },
    partitionPatch: { ...stats(partial), serializedBytes: partialBytes },
    concurrent: {
      actors: 6,
      commits: state.revision,
      retries: conflicts,
      membershipPreserved: true,
    },
  });
}
fs.writeFileSync(
  "bin/kit-benchmark.json",
  JSON.stringify(
    {
      scope:
        "In-process value cloning and optimistic membership transfer; not PostgreSQL or network latency.",
      results,
    },
    null,
    2,
  ),
);
console.log(JSON.stringify(results, null, 2));
