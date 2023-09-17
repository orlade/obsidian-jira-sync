import { App, TFile } from "obsidian";

export class Note {
  constructor(private app: App, private file?: TFile) {
    this.file ??= app.workspace.getActiveFile();
  }

  get content() {
    return this.app.vault.cachedRead(this.file);
  }

  /** Returns the `org/repo` string for the active note, based on the text following `Repo: `. */
  async getRepo(): Promise<string | undefined> {
    const [repo] = /Repo: (.*)/.exec(await this.content)?.slice(1) ?? [];
    return repo;
  }

  /** Returns the name of the milestone tracked by the note. */
  async getMilestoneName(): Promise<string | undefined> {
    const [name] = /Milestone: (.*)/.exec(await this.content)?.slice(1) ?? [];
    if (!name) return this.file.name.replace(".md", "");
    return name;
  }

  /** Returns the ID of the milestone tracked by the note. */
  async getMilestoneNumber(): Promise<number | undefined> {
    const [id] = /ID: (.*)/.exec(await this.content)?.slice(1) ?? [];
    return parseInt(id);
  }

  /**
   * Updates the content of the note.
   * @param content The new content of the note.
   */
  async write(content: string): Promise<void> {
    await this.app.vault.modify(this.file, content);
  }

  /**
   * Writes `content` beneath `heading` in the note, creating the heading at the end of the note if it
   *  doesn't exist, and replacing the existing content if it does.
   * @param heading The heading to write beneath.
   * @param content The content to write.
   */
  async writeSection(heading: string, content: string) {
    const noteContent = await this.content;
    const headingRegex = new RegExp(`^## ${heading}$`, "m");
    const headingMatch = headingRegex.exec(noteContent);
    if (headingMatch) {
      // Replace the existing content.
      const start = headingMatch.index + headingMatch[0].length;
      const end = noteContent.indexOf("\n#", start);
      await this.write(`${noteContent.slice(0, start)}\n\n${content}\n\n`);
    } else {
      // Create the heading at the end of the note, ensuring exactly two newlines after the final text (including any existing newlines).
      const existing = noteContent.replace(/\n+$/, "");
      await this.write(`${existing}\n\n## ${heading}\n\n${content}`);
    }
  }

  async prependLine(content: string): Promise<void> {
    return this.prepend(content + "\n");
  }

  async prepend(content: string): Promise<void> {
    return this.write(content + (await this.content));
  }

  async append(content: string): Promise<void> {
    return this.write((await this.content) + "\n" + content);
  }
}
