import { isString } from "lodash";
import { App, TFile, stringifyYaml } from "obsidian";
import { Issue } from "src/issues/types";
import frontMatter from "front-matter";

type Properties = {
  host?: string;
  tracker?: string;
  repo?: string;
  type?: "milestone" | "project" | "issue" | "repo";
  project?: string;
  milestoneId?: string;
  projectId?: string;
  issueId?: string;
  title?: string;
};

/**
 * An abstract representation of a note, with methods for reading and writing the note's content, in
 * particular extracting and updating issue metadata.
 */
export abstract class AbstractNote {
  abstract get filename(): string;
  abstract get filePath(): string;
  abstract get content(): Promise<string>;

  get properties(): Promise<Properties> {
    return this.content.then((c) => frontMatter<Properties>(c).attributes);
  }

  async property(name: string): Promise<string | undefined> {
    return (await this.properties)[name];
  }

  /** Updates the value of the given property in the note's front matter. */
  async setProperty(name: string, value: string): Promise<string | undefined> {
    const props = await this.properties;
    const existingValue = props[name];
    props[name] = value;
    const newFrontMatter = `---\n${stringifyYaml(props)}\n---`;
    const contentStart = (await this.content).indexOf("---", 3) + 3 ?? 0;
    const content = (await this.content).slice(contentStart);
    await this.write(`${newFrontMatter}\n${content}`);
    return existingValue;
  }

  /** Returns the `org/repo` string for the active note, based on the text following `Repo: `. */
  async getRepo(): Promise<{ org: string; repo: string } | undefined> {
    const repoProp = await this.property("mission.repo");
    if (!repoProp) return undefined;
    const [, org, repo] = /^([^/]+)\/(.+)$/.exec(repoProp) ?? [];
    // Ignore placeholder names.
    if (!org || !repo || (org == "org" && repo == "repo")) return undefined;
    return { org, repo };
  }

  async getType(): Promise<string | undefined> {
    return await this.property("mission.type");
  }

  /** Returns the name of the milestone tracked by the note. */
  async getMilestoneName(): Promise<string> {
    return (await this.property("mission.title")) || this.filename.replace(".md", "");
  }

  /** Returns the ID of the milestone tracked by the note. */
  async getMilestoneId(): Promise<string | undefined> {
    return await this.property("mission.id");
  }

  /** Returns the ID of the project tracked by the note. */
  async getProjectId(): Promise<string | undefined> {
    return await this.property("project.id");
  }

  /** Returns the ID of the issue tracked by the note. */
  async getIssueId(): Promise<string | undefined> {
    return await this.property("issueId");
  }

  /**
   * Returns the list of issues tracked by the note.
   * The issues are bullet items in the "Issues" section: the "Issues" heading until either the next
   * heading or the end of the note.
   */
  async getIssues(): Promise<Issue[]> {
    const section = await this.getSection("Issues");
    if (!section) return [];
    const milestoneId = await this.getMilestoneId();
    const lines = section.split("\n");
    const issues: Issue[] = [];
    lines.forEach((line) => {
      if (/^- \S+/.test(line)) {
        const [, id] = /\((.*)\)$/.exec(line) ?? [];
        if (id) line = line.replace(/\s*\(\w+\)$/, "");
        const [, status, title] = /^- (?:\[(x| )\]\s*)?(.*)\s*$/.exec(line) ?? [];
        issues.push(
          new Issue(id, title, {
            status: status == "x" ? "closed" : "open",
            milestone: milestoneId ? { id: milestoneId } : undefined,
          })
        );
      } else if (issues.length && /^\s+- \S.+/.test(line)) {
        const [, desc] = /^\s+- (\S.+)/.exec(line)!;
        issues.at(-1)!.description = desc;
      } else if (issues.length && issues.at(-1)?.description && (!line || /^\s/.test(line))) {
        const [, desc] = /^\s*(.*)/.exec(line)!;
        issues.at(-1)!.description += `\n${desc}`;
      }
    });
    issues.forEach((i) => (i.description = i.description?.trim()));
    return issues;
  }

  /**
   * Sets the ID of the issue with the given title.
   * @param title The title of the issue.
   * @param id The ID of the issue.
   */
  async setIdOnIssue(title: string, id: string): Promise<void> {
    const escapeRegExp = (text: string) => text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");

    const pattern = new RegExp(`^(- (?:\\[(x| )\\])?\\s*${escapeRegExp(title)})\\s*$`, "m");

    await this.replaceLine(pattern, `$1 (${id})`);
  }

  /**
   * Updates the content of the note.
   * @param content The new content of the note.
   */
  abstract write(content: string): Promise<void>;

  /**
   * Returns the content of the section with the given heading, or null if the section doesn't exist.
   * @param heading The heading of the section to look for.
   * @returns The content of the section, or null if the section doesn't exist.
   */
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

  async replaceLine(search: string | RegExp, replace: string): Promise<void> {
    const content = await this.content;
    const lines = content.split("\n");
    const index = lines.findIndex((l) => (isString(search) ? l == search : search.test(l)));
    if (index === -1) throw `line not found: ${search}`;
    lines[index] = isString(search) ? replace : lines[index].replace(search, replace);
    await this.write(lines.join("\n"));
  }
}

export class AppNote extends AbstractNote {
  private file: TFile;

  constructor(private app: App, file?: TFile) {
    super();
    const noteFile = file ?? app.workspace.getActiveFile();
    if (!noteFile) throw new Error("no given or active file");
    this.file = noteFile;
  }

  override get filename() {
    return this.file.name;
  }

  override get filePath() {
    return this.file.path;
  }

  override get content() {
    return this.app.vault.read(this.file);
  }

  override async write(content: string): Promise<void> {
    await this.app.vault.modify(this.file, content);
  }
}

export class CachedNote extends AbstractNote {
  #filename: string;
  #path: string;
  #content: string;

  constructor(filename: string, path: string, content: string) {
    super();
    this.#filename = filename;
    this.#path = path;
    this.#content = content;
  }

  override get filename() {
    return this.#filename;
  }

  override get filePath() {
    return this.#path;
  }

  override get content() {
    return Promise.resolve(this.#content);
  }

  override async write(): Promise<void> {
    throw "cannot write to cached note";
  }
}
