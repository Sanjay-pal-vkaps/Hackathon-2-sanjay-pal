import { describe, it, expect } from "vitest";
import { AttachmentParser } from "@/adapters/attachment-parser";

describe("Milestone 2: Attachment Safety & Normalization", () => {
  it("parses valid .txt attachment under 5 MB", () => {
    const content = "Meeting Action Item: Update Q4 roadmap by Friday.";
    const result = AttachmentParser.parseAttachment({
      filename: "notes.txt",
      mimeType: "text/plain",
      sizeBytes: Buffer.byteLength(content),
      content,
    });

    expect(result.skipped).toBe(false);
    expect(result.extractedText).toBe(content);
    expect(result.isTruncated).toBe(false);
    expect(result.warning).toBeUndefined();
  });

  it("parses valid .csv and .md attachments", () => {
    const csvContent = "task,assignee,due\nReview design,Alice,2026-11-01";
    const resCsv = AttachmentParser.parseAttachment({
      filename: "tasks.csv",
      mimeType: "text/csv",
      sizeBytes: Buffer.byteLength(csvContent),
      content: csvContent,
    });
    expect(resCsv.skipped).toBe(false);
    expect(resCsv.extractedText).toContain("Review design");

    const mdContent = "# Release Checklist\n- [x] Run security audit";
    const resMd = AttachmentParser.parseAttachment({
      filename: "checklist.md",
      mimeType: "text/markdown",
      sizeBytes: Buffer.byteLength(mdContent),
      content: mdContent,
    });
    expect(resMd.skipped).toBe(false);
    expect(resMd.extractedText).toContain("Run security audit");
  });

  it("T-009: skips disallowed file extensions (.exe, .zip, .js, .sh) with warning note", () => {
    const exts = ["malware.exe", "bundle.zip", "script.sh", "code.js", "macro.xlsm"];
    for (const filename of exts) {
      const result = AttachmentParser.parseAttachment({
        filename,
        mimeType: "application/octet-stream",
        sizeBytes: 1024,
        content: "binary-or-script-content",
      });

      expect(result.skipped).toBe(true);
      expect(result.extractedText).toBe("");
      expect(result.warning).toContain("Disallowed attachment format");
    }
  });

  it("T-010: skips oversized attachment (>5 MB) safely without crashing", () => {
    const size6MB = 6 * 1024 * 1024;
    const result = AttachmentParser.parseAttachment({
      filename: "large_dataset.csv",
      mimeType: "text/csv",
      sizeBytes: size6MB,
      content: "lots of data...",
    });

    expect(result.skipped).toBe(true);
    expect(result.warning).toContain("Attachment exceeds maximum size of 5 MB");
  });

  it("truncates extracted text content to 200 KB safely with truncation warning", () => {
    // Generate text larger than 200 KB (e.g. 250 KB)
    const largeText = "A".repeat(250 * 1024);
    const result = AttachmentParser.parseAttachment({
      filename: "long_document.txt",
      mimeType: "text/plain",
      sizeBytes: 250 * 1024,
      content: largeText,
    });

    expect(result.skipped).toBe(false);
    expect(result.isTruncated).toBe(true);
    expect(Buffer.byteLength(result.extractedText, "utf-8")).toBe(200 * 1024);
    expect(result.warning).toContain("truncated to 200 KB limit");
  });
});
