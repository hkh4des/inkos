import { Command } from "commander";
import { StateManager } from "@actalk/inkos-core";
import { findProjectRoot, resolveBookId, log, logError } from "../utils.js";

export const reviewCommand = new Command("review")
  .description("Review and approve chapters");

reviewCommand
  .command("list")
  .description("List chapters pending review")
  .argument("[book-id]", "Book ID (optional, lists all books if omitted)")
  .option("--json", "Output JSON")
  .action(async (bookId: string | undefined, opts) => {
    try {
      const root = findProjectRoot();
      const state = new StateManager(root);

      const bookIds = bookId ? [bookId] : await state.listBooks();
      const allPending: Array<{
        readonly bookId: string;
        readonly title: string;
        readonly chapter: number;
        readonly chapterTitle: string;
        readonly wordCount: number;
        readonly status: string;
        readonly issues: ReadonlyArray<string>;
      }> = [];

      for (const id of bookIds) {
        const index = await state.loadChapterIndex(id);
        const pending = index.filter(
          (ch) =>
            ch.status === "ready-for-review" || ch.status === "audit-failed",
        );

        if (pending.length === 0) continue;

        const book = await state.loadBookConfig(id);

        if (!opts.json) {
          log(`\n${book.title} (${id}):`);
        }
        for (const ch of pending) {
          allPending.push({
            bookId: id,
            title: book.title,
            chapter: ch.number,
            chapterTitle: ch.title,
            wordCount: ch.wordCount,
            status: ch.status,
            issues: ch.auditIssues,
          });
          if (!opts.json) {
            log(
              `  Ch.${ch.number} "${ch.title}" | ${ch.wordCount}字 | ${ch.status}`,
            );
            if (ch.auditIssues.length > 0) {
              for (const issue of ch.auditIssues) {
                log(`    - ${issue}`);
              }
            }
          }
        }
      }

      if (opts.json) {
        log(JSON.stringify({ pending: allPending }, null, 2));
      } else if (allPending.length === 0) {
        log("No chapters pending review.");
      }
    } catch (e) {
      if (opts.json) {
        log(JSON.stringify({ error: String(e) }));
      } else {
        logError(`Failed to list reviews: ${e}`);
      }
      process.exit(1);
    }
  });

reviewCommand
  .command("approve")
  .description("Approve a chapter")
  .argument("[book-id]", "Book ID (auto-detected if only one book)")
  .argument("<chapter>", "Chapter number")
  .option("--json", "Output JSON")
  .action(async (bookIdArg: string, chapterStr: string, opts) => {
    try {
      const root = findProjectRoot();

      let bookId: string;
      let chapterNum: number;
      if (!chapterStr || isNaN(parseInt(chapterStr, 10))) {
        bookId = await resolveBookId(undefined, root);
        chapterNum = parseInt(bookIdArg, 10);
      } else {
        bookId = await resolveBookId(bookIdArg, root);
        chapterNum = parseInt(chapterStr, 10);
      }

      const state = new StateManager(root);
      const index = [...(await state.loadChapterIndex(bookId))];
      const idx = index.findIndex((ch) => ch.number === chapterNum);
      if (idx === -1) {
        const msg = `Chapter ${chapterNum} not found in "${bookId}"`;
        if (opts.json) {
          log(JSON.stringify({ error: msg }));
        } else {
          logError(msg);
        }
        process.exit(1);
      }

      index[idx] = {
        ...index[idx]!,
        status: "approved",
        updatedAt: new Date().toISOString(),
      };
      await state.saveChapterIndex(bookId, index);

      if (opts.json) {
        log(JSON.stringify({ bookId, chapter: chapterNum, status: "approved" }));
      } else {
        log(`Chapter ${chapterNum} approved.`);
      }
    } catch (e) {
      if (opts.json) {
        log(JSON.stringify({ error: String(e) }));
      } else {
        logError(`Failed to approve: ${e}`);
      }
      process.exit(1);
    }
  });

reviewCommand
  .command("approve-all")
  .description("Approve all pending chapters for a book")
  .argument("[book-id]", "Book ID (auto-detected if only one book)")
  .option("--json", "Output JSON")
  .action(async (bookIdArg: string | undefined, opts) => {
    try {
      const root = findProjectRoot();
      const bookId = await resolveBookId(bookIdArg, root);
      const state = new StateManager(root);

      const index = [...(await state.loadChapterIndex(bookId))];
      let count = 0;
      const now = new Date().toISOString();

      const updated = index.map((ch) => {
        if (ch.status === "ready-for-review" || ch.status === "audit-failed") {
          count++;
          return { ...ch, status: "approved" as const, updatedAt: now };
        }
        return ch;
      });

      await state.saveChapterIndex(bookId, updated);

      if (opts.json) {
        log(JSON.stringify({ bookId, approvedCount: count }));
      } else {
        log(`${count} chapter(s) approved.`);
      }
    } catch (e) {
      if (opts.json) {
        log(JSON.stringify({ error: String(e) }));
      } else {
        logError(`Failed to approve: ${e}`);
      }
      process.exit(1);
    }
  });

reviewCommand
  .command("reject")
  .description("Reject a chapter")
  .argument("[book-id]", "Book ID (auto-detected if only one book)")
  .argument("<chapter>", "Chapter number")
  .option("--reason <reason>", "Rejection reason")
  .option("--json", "Output JSON")
  .action(async (bookIdArg: string, chapterStr: string, opts) => {
    try {
      const root = findProjectRoot();

      let bookId: string;
      let chapterNum: number;
      if (!chapterStr || isNaN(parseInt(chapterStr, 10))) {
        bookId = await resolveBookId(undefined, root);
        chapterNum = parseInt(bookIdArg, 10);
      } else {
        bookId = await resolveBookId(bookIdArg, root);
        chapterNum = parseInt(chapterStr, 10);
      }

      const state = new StateManager(root);
      const index = [...(await state.loadChapterIndex(bookId))];
      const idx = index.findIndex((ch) => ch.number === chapterNum);
      if (idx === -1) {
        const msg = `Chapter ${chapterNum} not found in "${bookId}"`;
        if (opts.json) {
          log(JSON.stringify({ error: msg }));
        } else {
          logError(msg);
        }
        process.exit(1);
      }

      index[idx] = {
        ...index[idx]!,
        status: "rejected",
        reviewNote: opts.reason ?? "Rejected without reason",
        updatedAt: new Date().toISOString(),
      };
      await state.saveChapterIndex(bookId, index);

      if (opts.json) {
        log(JSON.stringify({ bookId, chapter: chapterNum, status: "rejected" }));
      } else {
        log(`Chapter ${chapterNum} rejected.`);
      }
    } catch (e) {
      if (opts.json) {
        log(JSON.stringify({ error: String(e) }));
      } else {
        logError(`Failed to reject: ${e}`);
      }
      process.exit(1);
    }
  });
