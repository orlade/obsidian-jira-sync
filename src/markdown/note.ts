import { App, TFile } from "obsidian";

type IssueItem = {
  id: string;
  title: string;
};

export class Note {
  constructor(private app: App, private file?: TFile) {
    this.file ??= app.workspace.getActiveFile();
  }

  get content() {
    return this.app.vault.read(this.file);
  }

  /** Returns the `org/repo` string for the active note, based on the text following `Repo: `. */
  async getRepo(): Promise<{ org: string; repo: string } | undefined> {
    const [org, repo] =
      /Repo: ([^/]+)\/(.+)/.exec(await this.content)?.slice(1) ?? [];
    return org && repo ? { org, repo } : undefined;
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
   * Returns the list of issues tracked by the note.
   * The issues are bullet items in the "Issues" section: the "Issues" heading until either the next
   * heading or the end of the note.
   */
  async getIssues(): Promise<IssueItem[]> {
    const section = await this.getSection("Issues");
    return section
      .split("\n")
      .filter((i) => /^- \S+/.test(i))
      .map((i) => i.replace(/^- /, "").trim())
      .map((i) => {
        const [id] = /\((.*)\)$/.exec(i)?.slice(1) ?? [];
        const title = i.replace(/\(.*\)$/, "").trim();
        return { id, title };
      });
  }

  /**
   * Sets the ID of the issue with the given title.
   * @param title The title of the issue.
   * @param id The ID of the issue.
   */
  async setIdOnIssue(title: string, id: string): Promise<void> {
    await this.replaceLine(`- ${title}`, `- ${title} (${id})`);
  }

  /**
   * Updates the content of the note.
   * @param content The new content of the note.
   */
  async write(content: string): Promise<void> {
    await this.app.vault.modify(this.file, content);
  }

  async getSection(heading: string): Promise<string | null> {
    const noteContent = await this.content;
    const headingMatch = new RegExp(`^#+ ${heading}$`, "m").exec(noteContent);
    if (!headingMatch) return null;

    // Find the start and end of the section.
    const start = headingMatch.index + headingMatch[0].length;
    const endMatch = /^#+ /m.exec(noteContent.slice(start));
    const end = endMatch ? start + endMatch.index : noteContent.length;
    // Return the section content.
    return noteContent.slice(start, end).trim();
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

  async replaceLine(search: string, replace: string): Promise<void> {
    const content = await this.content;
    const lines = content.split("\n");
    const index = lines.findIndex((l) => l === search);
    if (index === -1) throw `line not found: ${search}`;
    lines[index] = replace;
    await this.write(lines.join("\n"));
  }
}
