import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { closeDatabase, getDb, initDatabase } from "../db/connection";
import {
  WorldBookEntryConflictError,
  bulkOperateEntries,
  createEntry,
  createWorldBook,
  getEntry,
  reorderEntries,
  updateEntry,
} from "./world-books.service";

const USER_ID = "user-1";

function initDb(): void {
  closeDatabase();
  initDatabase(":memory:");
  const db = getDb();
  db.run(`CREATE TABLE world_books (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    folder TEXT NOT NULL DEFAULT '',
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT 0
  )`);
  db.run(`CREATE TABLE world_book_entries (
    id TEXT PRIMARY KEY,
    world_book_id TEXT NOT NULL,
    uid TEXT NOT NULL,
    key TEXT NOT NULL DEFAULT '[]',
    keysecondary TEXT NOT NULL DEFAULT '[]',
    content TEXT NOT NULL DEFAULT '',
    comment TEXT NOT NULL DEFAULT '',
    position INTEGER NOT NULL DEFAULT 0,
    depth INTEGER NOT NULL DEFAULT 4,
    role TEXT,
    order_value INTEGER NOT NULL DEFAULT 100,
    selective INTEGER NOT NULL DEFAULT 0,
    constant INTEGER NOT NULL DEFAULT 0,
    disabled INTEGER NOT NULL DEFAULT 0,
    group_name TEXT NOT NULL DEFAULT '',
    group_override INTEGER NOT NULL DEFAULT 0,
    group_weight INTEGER NOT NULL DEFAULT 100,
    probability INTEGER NOT NULL DEFAULT 100,
    scan_depth INTEGER,
    case_sensitive INTEGER NOT NULL DEFAULT 0,
    match_whole_words INTEGER NOT NULL DEFAULT 0,
    automation_id TEXT,
    use_regex INTEGER NOT NULL DEFAULT 0,
    prevent_recursion INTEGER NOT NULL DEFAULT 0,
    exclude_recursion INTEGER NOT NULL DEFAULT 0,
    delay_until_recursion INTEGER NOT NULL DEFAULT 0,
    priority INTEGER NOT NULL DEFAULT 10,
    sticky INTEGER NOT NULL DEFAULT 0,
    cooldown INTEGER NOT NULL DEFAULT 0,
    delay INTEGER NOT NULL DEFAULT 0,
    selective_logic INTEGER NOT NULL DEFAULT 0,
    use_probability INTEGER NOT NULL DEFAULT 1,
    vectorized INTEGER NOT NULL DEFAULT 0,
    vector_index_status TEXT NOT NULL DEFAULT 'not_enabled',
    vector_indexed_at INTEGER,
    vector_index_error TEXT,
    extensions TEXT NOT NULL DEFAULT '{}',
    revision INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT 0
  )`);
}

beforeEach(initDb);
afterEach(() => closeDatabase());

function createFixtureEntries() {
  const book = createWorldBook(USER_ID, { name: "Concurrency" });
  const first = createEntry(USER_ID, book.id, { comment: "First", content: "A" })!;
  const second = createEntry(USER_ID, book.id, { comment: "Second", content: "B" })!;
  return { book, first, second };
}

describe("world book entry optimistic concurrency", () => {
  test("matching revision succeeds once and stale same-second write conflicts", () => {
    const { first } = createFixtureEntries();
    const updated = updateEntry(USER_ID, first.id, {
      comment: "Winner",
      expected_revision: first.revision,
    })!;

    expect(updated.revision).toBe(first.revision + 1);
    expect(() => updateEntry(USER_ID, first.id, {
      comment: "Loser",
      expected_revision: first.revision,
    })).toThrow(WorldBookEntryConflictError);
    expect(getEntry(USER_ID, first.id)?.comment).toBe("Winner");
  });

  test("mixed fresh and stale bulk request is all-or-nothing", () => {
    const { book, first, second } = createFixtureEntries();
    updateEntry(USER_ID, second.id, {
      priority: 44,
      expected_revision: second.revision,
    });

    expect(() => bulkOperateEntries(USER_ID, book.id, {
      action: "set_priority",
      entry_ids: [first.id, second.id],
      priority: 99,
      expected_revisions: {
        [first.id]: first.revision,
        [second.id]: second.revision,
      },
    })).toThrow(WorldBookEntryConflictError);

    expect(getEntry(USER_ID, first.id)?.priority).toBe(first.priority);
    expect(getEntry(USER_ID, first.id)?.revision).toBe(first.revision);
    expect(getEntry(USER_ID, second.id)?.priority).toBe(44);
    expect(getEntry(USER_ID, second.id)?.revision).toBe(second.revision + 1);
  });

  test("successful bulk and reorder increment each affected entry exactly once", () => {
    const { book, first, second } = createFixtureEntries();
    bulkOperateEntries(USER_ID, book.id, {
      action: "set_fields",
      entry_ids: [first.id, second.id],
      depth: 8,
      priority: 70,
      position: 4,
      trigger: "constant",
      enabled: true,
      expected_revisions: {
        [first.id]: first.revision,
        [second.id]: second.revision,
      },
    });
    const afterBulkFirst = getEntry(USER_ID, first.id)!;
    const afterBulkSecond = getEntry(USER_ID, second.id)!;
    expect(afterBulkFirst.revision).toBe(first.revision + 1);
    expect(afterBulkSecond.revision).toBe(second.revision + 1);
    expect(afterBulkFirst).toMatchObject({ depth: 8, priority: 70, position: 4, constant: true, disabled: false });

    expect(reorderEntries(
      USER_ID,
      book.id,
      [second.id, first.id],
      {
        [first.id]: afterBulkFirst.revision,
        [second.id]: afterBulkSecond.revision,
      },
    )).toBe(true);
    expect(getEntry(USER_ID, first.id)?.revision).toBe(first.revision + 2);
    expect(getEntry(USER_ID, second.id)?.revision).toBe(second.revision + 2);
  });

  test("stale reorder mutates no order values", () => {
    const { book, first, second } = createFixtureEntries();
    updateEntry(USER_ID, first.id, {
      comment: "Changed",
      expected_revision: first.revision,
    });
    const before = [getEntry(USER_ID, first.id)!.order_value, getEntry(USER_ID, second.id)!.order_value];

    expect(() => reorderEntries(
      USER_ID,
      book.id,
      [second.id, first.id],
      {
        [first.id]: first.revision,
        [second.id]: second.revision,
      },
    )).toThrow(WorldBookEntryConflictError);

    expect([getEntry(USER_ID, first.id)!.order_value, getEntry(USER_ID, second.id)!.order_value]).toEqual(before);
  });

  test("bulk copy creates revision one entries without mutating source revisions", () => {
    const { book, first, second } = createFixtureEntries();
    const target = createWorldBook(USER_ID, { name: "Target" });
    const result = bulkOperateEntries(USER_ID, book.id, {
      action: "copy",
      entry_ids: [first.id, second.id],
      target_book_id: target.id,
      expected_revisions: {
        [first.id]: first.revision,
        [second.id]: second.revision,
      },
    })!;

    expect(result.affected).toBe(2);
    expect(getEntry(USER_ID, first.id)?.revision).toBe(first.revision);
    expect(getEntry(USER_ID, second.id)?.revision).toBe(second.revision);
    const copies = getDb().query(
      "SELECT revision FROM world_book_entries WHERE world_book_id = ? ORDER BY id",
    ).all(target.id) as Array<{ revision: number }>;
    expect(copies).toHaveLength(2);
    expect(copies.every((copy) => copy.revision === 1)).toBe(true);
  });
});
