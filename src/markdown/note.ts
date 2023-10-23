import { isString, merge } from "lodash";
import { App, TFile, stringifyYaml } from "obsidian";
import { Issue, Milestone, Project } from "src/issues/types";
import frontMatter from "front-matter";
import { nthIndex } from "src/util";

type Properties = {
  host?: string;
  tracker?: string;
  [PROPERTY_REPO]?: string;
  [PROPERTY_TYPE]?: "milestone" | "project" | "issue" | "repo";
  [PROPERTY_ID]?: string;
  [PROPERTY_NAME]?: string;
};

export const PROPERTY_ID = "mission.id";
export const PROPERTY_NAME = "mission.title";
export const PROPERTY_TYPE = "mission.type";
export const PROPERTY_REPO = "mission.repo";
export const REPO_PLACEHOLDER = "org/repo";

export enum TrackedType {
  Milestone = "milestone",
  Project = "project",
  Issue = "issue",
  Repo = "repo",
}

const SECTION_HEADING_ISSUES = "Issues";
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
    return (await this.setProperties({ [name]: value }))[name];
  }

  /** Updates the values of the given properties in the note's front matter. */
  async setProperties(newProps: Partial<Properties>): Promise<Properties> {
    const oldProps = await this.properties;
    const props = merge({}, oldProps, newProps);
    const newFrontMatter = `---\n${stringifyYaml(props)}\n---`;
    const contentStart = (await this.content).indexOf("---", 3) + 3 ?? 0;
    const content = (await this.content).slice(contentStart);
    await this.write(`${newFrontMatter}\n${content}`);
    return oldProps;
  }

  /** Returns the `org/repo` string for the active note, based on the text following `Repo: `. */
  async getRepo(): Promise<{ org: string; repo: string } | undefined> {
    const repoProp = await this.property(PROPERTY_REPO);
    if (!repoProp) return undefined;
    const [, org, repo] = /^([^/]+)\/(.+)$/.exec(repoProp) ?? [];
    // Ignore placeholder names.
    if (!org || !repo || (org == "org" && repo == "repo")) return undefined;
    return { org, repo };
  }

  /** Returns the type of thing tracked by the note. */
  async getTrackedType(): Promise<string | undefined> {
    return await this.property(PROPERTY_TYPE);
  }

  /** Returns the name of the thing tracked by the note. */
  async getTrackedName(): Promise<string> {
    return (await this.property(PROPERTY_NAME)) || this.filename.replace(".md", "");
  }

  /** Returns the ID of the thing tracked by the note. */
  async getTrackedId(): Promise<string | undefined> {
    return await this.property(PROPERTY_ID);
  }

  /**
   * Returns the details of the milestone tracked by the note, or `undefined` if the note doesn't
   * track a milestone.
   */
  async getTrackedMilestone(): Promise<Milestone | undefined> {
    if ((await this.getTrackedType()) != TrackedType.Milestone) return undefined;

    const id = await this.getTrackedId();
    if (!id) return undefined;

    return new Milestone(id, await this.getTrackedName(), {
      description: (await this.getHeadSection()) ?? undefined,
    });
  }

  /**
   * Returns the details of the Project tracked by the note, or `undefined` if the note doesn't
   * track a Project.
   */
  async getTrackedProject(): Promise<Project | undefined> {
    if ((await this.getTrackedType()) != TrackedType.Project) return undefined;
    return new Project({
      id: await this.getTrackedId(),
      title: await this.getTrackedName(),
      description: (await this.getHeadSection()) ?? undefined,
    });
  }

  /**
   * Returns the list of issues tracked in the note.
   *
   * The issues are bullet items in the "Issues" section: the "Issues" heading until either the next
   * heading or the end of the note.
   */
  async getIssues(): Promise<Issue[]> {
    const section = await this.getSection(SECTION_HEADING_ISSUES);
    if (!section) return [];
    const lines = section.split("\n");
    const issues: Issue[] = [];
    lines.forEach((line) => {
      if (/^- \S+/.test(line)) {
        const [, id] = /\((.*)\)$/.exec(line) ?? [];
        if (id) line = line.replace(/\s*\(\w+\)$/, "");
        const [, statusX, title] = /^- (?:\[(x| )\]\s*)?(.*)\s*$/.exec(line) ?? [];
        const status = statusX == "x" ? "closed" : "open";
        issues.push(new Issue(id, title, { status }));
      } else if (issues.length && /^\s+- \S.+/.test(line)) {
        const [, desc] = /^\s+- (\S.+)/.exec(line)!;
        issues.at(-1)!.description = desc;
      } else if (issues.length && issues.at(-1)?.description && (!line || /^\s/.test(line))) {
        const [, desc] = /^\s*(.*)/.exec(line)!;
        issues.at(-1)!.description += `\n${desc}`;
      }
    });
    const milestone = await this.getTrackedMilestone();
    const project = await this.getTrackedProject();
    issues.forEach((i) => {
      i.description = i.description?.trim();
      i.milestoneId = milestone?.id;
      i.projectId = project?.id;
    });
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
   * Returns the start and end indexes of the content at the beginning of the note, from the end of the front matter to the first heading.
   * @param content The content to search.
   * @returns The start and end indexes of the content at the beginning of the note. `end` is undefined if there is no heading.
   */
  getHeadSectionIndexes(content: string): { start: number; end: number | undefined } {
    const frontMatterEnd = nthIndex(content, "\n", frontMatter(content).bodyBegin - 1) + 1;
    const start = frontMatterEnd == -1 ? 0 : frontMatterEnd;
    const headingMatch = /^#+ /m.exec(content);
    const end = headingMatch ? headingMatch.index : undefined;
    return { start, end };
  }

  /**
   * Returns the content at the beginning of the note, from the end of the front matter to the first heading.
   */
  async getHeadSection(): Promise<string | null> {
    const content = await this.content;
    const { start, end } = this.getHeadSectionIndexes(content);
    return content.slice(start, end).trim();
  }

  /**
   * Writes `content` at the beginning of the note (before the first heading), replacing any existing
   * content.
   * @param content The content to write.
   */
  async setHeadSection(content: string): Promise<void> {
    const noteContent = await this.content;
    const headingMatch = /^#+ /m.exec(noteContent);
    if (!headingMatch) {
      await this.write(content);
    } else {
      await this.write(content + noteContent.slice(headingMatch.index));
    }
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
