export interface AttachmentInput {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  content: string | Buffer; // Raw text or base64
}

export interface AttachmentParseResult {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  extractedText: string;
  isTruncated: boolean;
  warning?: string;
  skipped: boolean;
}

export class AttachmentParser {
  // Allowed extensions: .txt, .md, .csv, .pdf
  private static readonly ALLOWED_EXTENSIONS = ['.txt', '.md', '.csv', '.pdf'];
  private static readonly MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
  private static readonly MAX_TEXT_PAYLOAD_BYTES = 200 * 1024; // 200 KB

  /**
   * Parses an attachment according to security constraints
   */
  static parseAttachment(attachment: AttachmentInput): AttachmentParseResult {
    const extMatch = attachment.filename.match(/\.[0-9a-z]+$/i);
    const extension = extMatch ? extMatch[0].toLowerCase() : '';

    // 1. Format check
    if (!this.ALLOWED_EXTENSIONS.includes(extension)) {
      return {
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        extractedText: '',
        isTruncated: false,
        warning: `Disallowed attachment format (${extension || 'unknown'}). Only .txt, .md, .csv, and .pdf are permitted.`,
        skipped: true,
      };
    }

    // 2. File size check (Max 5 MB)
    if (attachment.sizeBytes > this.MAX_FILE_SIZE) {
      return {
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        extractedText: '',
        isTruncated: false,
        warning: `Attachment exceeds maximum size of 5 MB (actual: ${(attachment.sizeBytes / (1024 * 1024)).toFixed(1)} MB).`,
        skipped: true,
      };
    }

    // 3. Extract text content
    let rawText = '';
    if (typeof attachment.content === 'string') {
      // Check if it's base64 or raw text
      if (attachment.mimeType.includes('pdf') || attachment.content.startsWith('JVBERi')) {
        // PDF simple textual stream extractor / placeholder for pure node without binary deps
        const buffer = Buffer.from(attachment.content, 'base64');
        rawText = this.extractTextFromPdfBuffer(buffer);
      } else {
        rawText = attachment.content;
      }
    } else if (Buffer.isBuffer(attachment.content)) {
      if (extension === '.pdf') {
        rawText = this.extractTextFromPdfBuffer(attachment.content);
      } else {
        rawText = attachment.content.toString('utf-8');
      }
    }

    // 4. Max text payload capping (200 KB)
    const textBuffer = Buffer.from(rawText, 'utf-8');
    let isTruncated = false;
    let extractedText = rawText;

    if (textBuffer.length > this.MAX_TEXT_PAYLOAD_BYTES) {
      isTruncated = true;
      extractedText = textBuffer.subarray(0, this.MAX_TEXT_PAYLOAD_BYTES).toString('utf-8');
    }

    return {
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      extractedText,
      isTruncated,
      skipped: false,
      warning: isTruncated ? 'Attachment text content truncated to 200 KB limit.' : undefined,
    };
  }

  /**
   * Text stream extraction from basic text-based PDF buffers
   */
  private static extractTextFromPdfBuffer(buffer: Buffer): string {
    const content = buffer.toString('latin1');
    const matches = content.match(/\(([^)]+)\)\s*Tj/g) || [];
    if (matches.length > 0) {
      return matches.map((m) => m.replace(/^\(/, '').replace(/\)\s*Tj$/, '')).join(' ');
    }
    // Fallback: extract visible ASCII string tokens
    const textTokens = content.match(/[A-Za-z0-9\s.,!?:;'"@#%&-_/]{4,}/g) || [];
    return textTokens.join(' ').trim();
  }
}
