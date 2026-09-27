import test from "node:test";
import assert from "node:assert/strict";

import { paginateItems } from "../src/utils/paginate";

test("paginateItems returns the requested slice and metadata", () => {
  const items = [1, 2, 3, 4, 5, 6, 7, 8, 9];

  const result = paginateItems(items, 2, 3);

  assert.deepEqual(result.items, [4, 5, 6]);
  assert.equal(result.page, 2);
  assert.equal(result.pageSize, 3);
  assert.equal(result.totalItems, 9);
  assert.equal(result.totalPages, 3);
  assert.equal(result.startIndex, 3);
  assert.equal(result.endIndex, 6);
});

test("paginateItems clamps invalid pages to the last available page", () => {
  const items = [1, 2, 3, 4];

  const result = paginateItems(items, 99, 2);

  assert.deepEqual(result.items, [3, 4]);
  assert.equal(result.page, 2);
  assert.equal(result.totalPages, 2);
});
