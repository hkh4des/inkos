import { Command } from "commander";
import { PipelineRunner, StateManager } from "@actalk/inkos-core";
import { readdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { loadConfig, createClient, findProjectRoot, resolveContext, resolveBookId, log, logError } from "../utils.js";

export const writeCommand = new Command("write")
  .description("Write chapters");

writeCommand
  .command("next")
  .description("Write the next chapter for a book")
  .argument("[book-id]", "Book ID (auto-detected if only one book)")
  .option("--count <n>", "Number of chapters to write", "1")
  .option("--context <text>", "Creative guidance (natural language)")
  .option("--context-file <path>", "Read guidance from file")
  .option("--json", "Output JSON")
  .action(async (bookIdArg: string | undefined, opts) => {
    try {
      const config = await loadConfig();
      const client = createClient(config);
      const root = findProjectRoot();
      const bookId = await resolveBookId(bookIdArg, root);
      const context = await resolveContext(opts);

      const pipeline = new PipelineRunner({
        client,
        model: config.llm.model,
        projectRoot: root,
        notifyChannels: config.notify,
        ...(context ? { externalContext: context } : {}),
      });

      const count = parseInt(opts.count, 10);

      const results = [];
      for (let i = 0; i < count; i++) {
        if (!opts.json) log(`[${i + 1}/${count}] Writing chapter for "${bookId}"...`);

        const result = await pipeline.writeNextChapter(bookId);
        results.push(result);

        if (!opts.json) {
          log(`  Chapter ${result.chapterNumber}: ${result.title}`);
          log(`  Words: ${result.wordCount}`);
          log(`  Audit: ${result.auditResult.passed ? "PASSED" : "NEEDS REVIEW"}`);
          if (result.revised) {
            log("  Auto-revised: YES (critical issues were fixed)");
          }
          log(`  Status: ${result.status}`);

          if (result.auditResult.issues.length > 0) {
            log("  Issues:");
            for (const issue of result.auditResult.issues) {
              log(`    [${issue.severity}] ${issue.category}: ${issue.description}`);
            }
          }

          log("");
        }
      }

      if (opts.json) {
        log(JSON.stringify(results, null, 2));
      } else {
        log("Done.");
      }
    } catch (e) {
      if (opts.json) {
        log(JSON.stringify({ error: String(e) }));
      } else {
        logError(`Failed to write chapter: ${e}`);
      }
      process.exit(1);
    }
  });

writeCommand
  .command("rewrite")
  .description("Re-generate a specific chapter (removes it and writes fresh)")
  .argument("[book-id]", "Book ID (auto-detected if only one book)")
  .argument("<chapter>", "Chapter number to rewrite")
  .option("--force", "Skip confirmation prompt")
  .option("--json", "Output JSON")
  .action(async (bookIdArg: string, chapterStr: string, opts) => {
    try {
      const config = await loadConfig();
      const client = createClient(config);
      const root = findProjectRoot();
      const chapterNum = parseInt(chapterStr, 10);

      // If only one argument, it's the chapter number (book-id auto-detected)
      let bookId: string;
      if (!chapterStr || isNaN(chapterNum)) {
        // bookIdArg is actually the chapter number
        bookId = await resolveBookId(undefined, root);
        chapterStr = bookIdArg;
      } else {
        bookId = await resolveBookId(bookIdArg, root);
      }
      const chapter = parseInt(chapterStr, 10);

      if (!opts.force) {
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        const answer = await new Promise<string>((resolve) => {
          rl.question(`Rewrite chapter ${chapter} of "${bookId}"? This will delete chapter ${chapter} and all later chapters. (y/N) `, resolve);
        });
        rl.close();
        if (answer.toLowerCase() !== "y") {
          log("Cancelled.");
          return;
        }
      }

      const state = new StateManager(root);
      const bookDir = state.bookDir(bookId);
      const chaptersDir = join(bookDir, "chapters");

      // Remove existing chapter file
      const files = await readdir(chaptersDir);
      const paddedNum = String(chapter).padStart(4, "0");
      const existing = files.filter((f) => f.startsWith(paddedNum) && f.endsWith(".md"));
      for (const f of existing) {
        await unlink(join(chaptersDir, f));
        if (!opts.json) log(`Removed: ${f}`);
      }

      // Remove from index (and all chapters after it)
      const index = await state.loadChapterIndex(bookId);
      const trimmed = index.filter((ch) => ch.number < chapter);
      await state.saveChapterIndex(bookId, trimmed);

      // Also remove later chapter files since state will be rolled back
      const laterFiles = files.filter((f) => {
        const num = parseInt(f.slice(0, 4), 10);
        return num > chapter && f.endsWith(".md");
      });
      for (const f of laterFiles) {
        await unlink(join(chaptersDir, f));
        if (!opts.json) log(`Removed later chapter: ${f}`);
      }

      // Restore state to previous chapter's end-state
      if (chapter > 1) {
        const restored = await state.restoreState(bookId, chapter - 1);
        if (restored) {
          if (!opts.json) log(`State restored from chapter ${chapter - 1} snapshot.`);
        } else {
          if (!opts.json) log(`Warning: no snapshot for chapter ${chapter - 1}. Using current state.`);
        }
      }

      if (!opts.json) log(`Regenerating chapter ${chapter}...`);

      const pipeline = new PipelineRunner({
        client,
        model: config.llm.model,
        projectRoot: root,
        notifyChannels: config.notify,
      });

      const result = await pipeline.writeNextChapter(bookId);

      if (opts.json) {
        log(JSON.stringify(result, null, 2));
      } else {
        log(`  Chapter ${result.chapterNumber}: ${result.title}`);
        log(`  Words: ${result.wordCount}`);
        log(`  Audit: ${result.auditResult.passed ? "PASSED" : "NEEDS REVIEW"}`);
        log(`  Status: ${result.status}`);
      }
    } catch (e) {
      if (opts.json) {
        log(JSON.stringify({ error: String(e) }));
      } else {
        logError(`Failed to rewrite chapter: ${e}`);
      }
      process.exit(1);
    }
  });
