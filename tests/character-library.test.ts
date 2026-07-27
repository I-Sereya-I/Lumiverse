import { beforeEach, describe, expect, test } from "bun:test";
import { join } from "path";
import { closeDatabase, getDb, initDatabase } from "../src/db/connection";
import * as charactersSvc from "../src/services/characters.service";

const USER_ID = "character-library-user";
const PAGE = { limit: 50, offset: 0 };

async function applyBaseline(): Promise<void> {
  const db = getDb();
  db.run("PRAGMA foreign_keys = OFF");
  db.run(await Bun.file(join(import.meta.dir, "..", "src", "db", "baseline.sql")).text());
}

describe("character library backend", () => {
  beforeEach(async () => {
    closeDatabase();
    initDatabase(":memory:");
    await applyBaseline();
  });

  test("normalizes scope writes and returns selected preview/chat-scoped summaries", () => {
    const mine = charactersSvc.createCharacter(USER_ID, {
      name: "Mine",
      extensions: { world_book_ids: ["book-1"] },
    });
    const shared = charactersSvc.createCharacter(USER_ID, {
      name: "Shared",
      library_scope: "shared",
    });

    expect(mine.library_scope).toBe("mine");
    expect(shared.library_scope).toBe("shared");

    const updated = charactersSvc.updateCharacter(USER_ID, mine.id, { library_scope: "shared" });
    expect(updated?.library_scope).toBe("shared");
    expect(updated?.extensions._lumiverse_library_scope).toBe("shared");

    const duplicate = charactersSvc.duplicateCharacter(USER_ID, mine.id);
    expect(duplicate?.library_scope).toBe("shared");

    const now = Math.floor(Date.now() / 1000);
    getDb().query(`
      INSERT INTO world_books (id, user_id, name, description, folder, metadata, created_at, updated_at)
      VALUES (?, ?, ?, '', '', '{}', ?, ?)
    `).run("book-1", USER_ID, "The Accord", now, now);
    getDb().query(`
      INSERT INTO chats (id, user_id, character_id, name, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, '{}', ?, ?)
    `).run("chat-1", USER_ID, mine.id, "Latest", now, now);
    getDb().query(`
      INSERT INTO messages (id, chat_id, index_in_chat, content, created_at)
      VALUES (?, ?, 0, ?, ?)
    `).run("message-1", "chat-1", "Last message preview", now);
    getDb().query(`
      INSERT INTO chats (id, user_id, character_id, name, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, '{}', ?, ?)
    `).run("empty-chat", USER_ID, mine.id, "Newer empty chat", now + 1, now + 1);
    getDb().query(`
      INSERT INTO chats (id, user_id, character_id, name, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      "group-1",
      USER_ID,
      mine.id,
      "Group",
      JSON.stringify({ group: true, character_ids: [mine.id, shared.id] }),
      now,
      now,
    );

    const soloScope = charactersSvc.listCharacterSummaries(USER_ID, PAGE, { chatId: "chat-1" });
    expect(soloScope.data.map((character) => character.id)).toEqual([mine.id]);

    const groupScope = charactersSvc.listCharacterSummaries(USER_ID, PAGE, { chatId: "group-1" });
    expect(new Set(groupScope.data.map((character) => character.id))).toEqual(new Set([mine.id, shared.id]));

    const sharedScope = charactersSvc.listCharacterSummaries(USER_ID, PAGE, { scope: "shared" });
    expect(new Set(sharedScope.data.map((character) => character.id))).toEqual(
      new Set([mine.id, shared.id, duplicate!.id]),
    );
    expect(sharedScope.data.every((character) => character.library_scope === "shared")).toBe(true);

    const preview = charactersSvc.getCharacterPreview(USER_ID, mine.id);
    expect(preview?.lorebooks).toEqual([{ id: "book-1", name: "The Accord" }]);
    expect(preview?.last_chat?.last_message_preview).toBe("Last message preview");
    expect(preview?.open_chat_id).toBe("chat-1");
  });
});
