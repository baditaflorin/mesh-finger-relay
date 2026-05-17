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
