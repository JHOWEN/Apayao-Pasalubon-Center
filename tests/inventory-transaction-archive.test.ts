import assert from "node:assert/strict";
import test from "node:test";
import { buildInventoryAuditPaymentData } from "../src/features/inventory/lib/inventory";
import {
  normalizeArchiveAction,
  normalizeArchiveFilter,
  normalizeArchiveIds,
} from "../src/lib/inventory-transaction-archive";

test("normalizes valid archive and restore actions", () => {
  assert.equal(normalizeArchiveAction("archive"), "archive");
  assert.equal(normalizeArchiveAction("restore"), "restore");
  assert.equal(normalizeArchiveAction("ARCHIVE"), "archive");
  assert.equal(normalizeArchiveAction("RESTORE"), "restore");
});

test("rejects invalid archive actions", () => {
  assert.equal(normalizeArchiveAction(""), null);
  assert.equal(normalizeArchiveAction(undefined), null);
  assert.equal(normalizeArchiveAction("remove"), null);
});

test("treats the all view as the active ledger while archived stays explicit", () => {
  assert.equal(normalizeArchiveFilter(undefined), "all");
  assert.equal(normalizeArchiveFilter(""), "all");
  assert.equal(normalizeArchiveFilter("all"), "all");
  assert.equal(normalizeArchiveFilter("active"), "all");
  assert.equal(normalizeArchiveFilter("archived"), "archived");
});

test("normalizes bulk archive ids from arrays and comma-separated values", () => {
  assert.deepEqual(normalizeArchiveIds(["a", "b", "", "a"]), ["a", "b"]);
  assert.deepEqual(normalizeArchiveIds("a, b, c"), ["a", "b", "c"]);
  assert.deepEqual(normalizeArchiveIds(undefined), []);
});

test("records payment metadata for both POS and storefront inventory audit entries", () => {
  assert.deepEqual(
    buildInventoryAuditPaymentData({
      paymentMethod: "GCASH",
      paymentStatus: "PENDING",
      paymentReference: "REF-7654",
    }),
    {
      paymentMethod: "GCASH",
      paymentStatus: "PENDING",
      paymentReference: "REF-7654",
    },
  );

  assert.deepEqual(
    buildInventoryAuditPaymentData({
      paymentMethod: "CASH",
      paymentStatus: "PAID",
      paymentReference: "",
    }),
    {
      paymentMethod: "CASH",
      paymentStatus: "PAID",
      paymentReference: null,
    },
  );

  assert.deepEqual(
    buildInventoryAuditPaymentData({
      paymentMethod: undefined,
      paymentStatus: undefined,
      paymentReference: undefined,
    }),
    {
      paymentMethod: null,
      paymentStatus: null,
      paymentReference: null,
    },
  );
});
