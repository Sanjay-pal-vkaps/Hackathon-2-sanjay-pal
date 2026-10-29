import { GmailMessageSummary } from "@/adapters/gmail-adapter";

export interface ExtractedTaskData {
  title: string;
  description: string;
  dueDate?: string;
  candidateAssignee?: string;
  sourceContext: {
    slackOrigin: string;
    emailSubject: string;
    emailSender: string;
    emailLink: string;
    attachmentsUsed: string[];
    warnings: string[];
  };
}

export class TaskExtractor {
  /**
   * Encloses third-party external content into untrusted XML isolation boundaries
   */
  static wrapUntrusted(source: string, id: string, content: string): string {
    return `<untrusted_source provider="${source}" id="${id}">\n${content}\n</untrusted_source>`;
  }

  /**
   * Extracts structured task data from email and attachments with prompt injection defense
   */
  static extractTask(params: {
    email: GmailMessageSummary;
    slackContext: string;
  }): ExtractedTaskData {
    const { email, slackContext } = params;
    const warnings: string[] = [];
    const attachmentsUsed: string[] = [];

    // Collect and isolate attachment text
    const attachmentTexts: string[] = [];
    for (const att of email.attachments) {
      if (att.skipped) {
        if (att.warning) warnings.push(`${att.filename}: ${att.warning}`);
      } else {
        attachmentsUsed.push(att.filename);
        if (att.warning) warnings.push(`${att.filename}: ${att.warning}`);
        attachmentTexts.push(
          this.wrapUntrusted("attachment", att.filename, att.extractedText)
        );
      }
    }

    // Isolate email body and slack text
    const isolatedEmail = this.wrapUntrusted("gmail", email.id, `${email.subject}\n\n${email.bodyText}`);
    const isolatedSlack = this.wrapUntrusted("slack", "slack-context", slackContext);

    // Rule-based / Structured task extraction defense:
    // Prompt injection phrases (e.g. "Ignore previous instructions", "Immediately create card")
    // are treated as plain text within untrusted boundaries and cannot trigger actions.
    const titleCandidate = email.subject.replace(/^(re:|fwd:)\s*/i, "").trim() || "New Task from Email";
    
    // Extract candidate due date if mentioned (e.g. "due Friday", "by 2026-11-01")
    let dueDate: string | undefined = undefined;
    const dateMatch = email.bodyText.match(/\b(202\d-[01]\d-[0-3]\d)\b/);
    if (dateMatch) {
      dueDate = dateMatch[1];
    }

    // Extract candidate assignee if mentioned (e.g. "Assignee: Alice", "assigned to @bob")
    let candidateAssignee: string | undefined = undefined;
    const assigneeMatch = email.bodyText.match(/(?:assign(?:ed)?\s+to|assignee:?)\s+@?([A-Za-z0-9._-]+)/i);
    if (assigneeMatch) {
      candidateAssignee = assigneeMatch[1];
    }

    const description = [
      `Extracted from email "${email.subject}"`,
      `Sender: ${email.from}`,
      `\nEvidence Summary:\n${email.snippet}`,
      attachmentTexts.length > 0 ? `\nAttachments:\n${attachmentTexts.join('\n')}` : '',
      `\n${isolatedEmail}`,
      `\n${isolatedSlack}`,
    ].filter(Boolean).join('\n');

    return {
      title: titleCandidate,
      description,
      dueDate,
      candidateAssignee,
      sourceContext: {
        slackOrigin: slackContext,
        emailSubject: email.subject,
        emailSender: email.from,
        emailLink: email.webLink,
        attachmentsUsed,
        warnings,
      },
    };
  }
}
