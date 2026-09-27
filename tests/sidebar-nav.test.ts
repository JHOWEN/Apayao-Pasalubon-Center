import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isSidebarLinkActive } from "../src/utils/sidebar-nav";

describe("isSidebarLinkActive", () => {
  it("keeps the exact inventory route active", () => {
    assert.equal(isSidebarLinkActive("/inventory", "/inventory"), true);
  });

  it("keeps a nested route active when it matches its own link", () => {
    assert.equal(isSidebarLinkActive("/inventory/transactions", "/inventory/transactions"), true);
    assert.equal(isSidebarLinkActive("/products/new", "/products"), true);
  });

  it("does not mark unrelated links as active", () => {
    assert.equal(isSidebarLinkActive("/dashboard", "/inventory"), false);
    assert.equal(isSidebarLinkActive("/reports", "/products"), false);
  });
});
