import { expect, test } from "@playwright/test";
import { openTwoPeers } from "@baditaflorin/mesh-common/testing";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
  name: string;
};
const storagePrefix = pkg.name;

test("current author's stroke syncs to canvas on other peer", async ({ browser, baseURL }) => {
  const { a, b, cleanup } = await openTwoPeers(browser, baseURL ?? "", { storagePrefix });
  try {
    await a.getByPlaceholder("your name").fill("alice");
    await b.getByPlaceholder("your name").fill("bob");
    await a.waitForTimeout(800);

    await a.getByRole("button", { name: "start", exact: true }).click();
    await a.waitForTimeout(400);

    const aIsMine = (await a.locator(".finger-turn.is-me").count()) > 0;
    const author = aIsMine ? a : b;
    const other = aIsMine ? b : a;

    await author.getByRole("button", { name: "test stroke", exact: true }).click();
    await other.waitForTimeout(400);

    const count = await other.locator(".finger-canvas polyline").count();
    if (count < 1) throw new Error("expected polyline on other peer");
    expect(count).toBeGreaterThanOrEqual(1);
  } finally {
    await cleanup();
  }
});

// Load-bearing test #1: drive the REAL advertised interaction — a freehand
// finger/pointer drag across the SVG canvas (not the `test stroke` stub) — on
// the current author, and assert the resulting polyline propagates to the
// OPPOSITE peer's canvas. This exercises onPointerDown→Move→Up→commitStroke→
// useEventLog and fails if the real drag path doesn't push to the shared doc.
test("a freehand pointer drag by the author syncs to the other peer", async ({
  browser,
  baseURL,
}) => {
  const { a, b, cleanup } = await openTwoPeers(browser, baseURL ?? "", { storagePrefix });
  try {
    await a.getByPlaceholder("your name").fill("alice");
    await b.getByPlaceholder("your name").fill("bob");
    await a.waitForTimeout(800);

    await a.getByRole("button", { name: "start", exact: true }).click();
    await a.waitForTimeout(400);

    const aIsMine = (await a.locator(".finger-turn.is-me").count()) > 0;
    const author = aIsMine ? a : b;
    const other = aIsMine ? b : a;

    const box = await author.locator(".finger-canvas").boundingBox();
    if (!box) throw new Error("canvas has no bounding box");
    // Real freehand drag: press, move through several points, release.
    await author.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.5);
    await author.mouse.down();
    await author.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.3, { steps: 4 });
    await author.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6, { steps: 4 });
    await author.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.4, { steps: 4 });
    await author.mouse.up();

    // The freehand stroke (multi-point) must appear on the other peer's canvas.
    await expect(other.locator(".finger-canvas polyline")).toHaveCount(1);
    const points = (await other.locator(".finger-canvas polyline").getAttribute("points")) ?? "";
    // A real drag produces many coordinate pairs, not the 3-point test stub.
    expect(points.trim().split(/\s+/).length).toBeGreaterThan(3);
  } finally {
    await cleanup();
  }
});

// Load-bearing test #2: the advertised "3 seconds per turn, rotating" guard
// must actually gate writes. The peer whose turn it is NOT cannot draw — a
// pointer drag by the non-author produces no stroke on either canvas. This
// proves the rotating-turn rule is enforced, not cosmetic.
test("a non-author cannot draw — the turn guard blocks their stroke", async ({
  browser,
  baseURL,
}) => {
  const { a, b, cleanup } = await openTwoPeers(browser, baseURL ?? "", { storagePrefix });
  try {
    await a.getByPlaceholder("your name").fill("alice");
    await b.getByPlaceholder("your name").fill("bob");
    await a.waitForTimeout(800);

    await a.getByRole("button", { name: "start", exact: true }).click();
    await a.waitForTimeout(400);

    const aIsMine = (await a.locator(".finger-turn.is-me").count()) > 0;
    const nonAuthor = aIsMine ? b : a;
    const author = aIsMine ? a : b;

    const box = await nonAuthor.locator(".finger-canvas").boundingBox();
    if (!box) throw new Error("canvas has no bounding box");
    await nonAuthor.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.5);
    await nonAuthor.mouse.down();
    await nonAuthor.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.5, { steps: 6 });
    await nonAuthor.mouse.up();

    await nonAuthor.waitForTimeout(400);
    // The blocked drag must produce zero strokes on BOTH peers.
    await expect(nonAuthor.locator(".finger-canvas polyline")).toHaveCount(0);
    await expect(author.locator(".finger-canvas polyline")).toHaveCount(0);
  } finally {
    await cleanup();
  }
});
