import _, { compact, keyBy } from "lodash";
import { Notice, Plugin, TAbstractFile, TFile } from "obsidian";
import { IssueCache } from "./IssueCache";
import { SettingTab } from "./SettingTab";
import { Github } from "./github";
import { IssueRepository } from "./issues/repository";
import { Issue, Milestone } from "./issues/types";
import { AbstractNote, AppNote, CachedNote, PROPERTY_ID, PROPERTY_REPO, PROPERTY_TYPE, TrackedType } from "./markdown";

interface GithubSyncPluginSettings {
  baseUrl: string;
  accessToken: string;
  autoSync: boolean;
  // updateEvery: number;
  // priorityMapping: { [key: string]: string };
  // statusMapping: { [key: string]: string };
  // parentFieldIds?: string[];
}

const DEFAULT_SETTINGS: Omit<GithubSyncPluginSettings, "accessToken"> = {
  baseUrl: "https://github.com",
  autoSync: true,
  // priorityMapping: {
  //   Highest: "p0",
  //   High: "p1",
  //   Medium: "p2",
  //   Low: "p3",
  //   Lowest: "p4",
  // },
  // statusMapping: {
  //   "In Progress": "wip",
  //   "In Analysis": "next",
  //   TODO: "todo",
  // },
};

type Diff<T> = {
  added: T[];
  removed: T[];
  changed: {
    before: T;
    after: T;
  }[];
};

export class GithubSyncPlugin extends Plugin {
  settings!: GithubSyncPluginSettings;
  issueCache!: IssueCache;
  noteCache!: Record<string, string>;

  async onload() {
    await this.loadSettings();
    this.issueCache = new IssueCache();
    this.noteCache = {};

    this.addCommand({
      id: "github-fetch-issues",
      name: "Fetch Issues",
      callback: () => this.fetchIssues(),
    });
    this.addCommand({
      id: "github-create-milestone",
      name: "Create Milestone",
      callback: () => this.createMilestone(),
    });
    this.addCommand({
      id: "github-update-milestone",
      name: "Update Milestone",
      callback: () => this.updateMilestone(),
    });

    this.addSettingTab(new SettingTab(this.app, this));

    // @ts-ignore
    this.app.workspace.on("file-open", (file: TAbstractFile) => this.onOpened(file));
    this.app.vault.on("modify", (file: TAbstractFile) => this.onChanged(file));
  }

  async onOpened(file: TAbstractFile) {
    if (!(file instanceof TFile) || !file.path.endsWith(".md")) return;
    console.debug("opened", file.path);
    const note = new AppNote(this.app);
    this.noteCache = { [note.filePath]: await note.content };
    this.issueCache.setAll(await note.getIssues());
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  getRepo(org: string, repo: string): IssueRepository {
    const { accessToken } = this.settings;
    if (!accessToken) throw "no access token";
    return new Github({ org, repo, accessToken });
  }

  get issueRepo(): Promise<IssueRepository> {
    const { accessToken } = this.settings;
    if (!accessToken) throw "no access token";
    return new AppNote(this.app).getRepo().then((r) => {
      if (!r) throw new Error("no repo");
      return this.getRepo(r.org, r.repo);
    });
  }

  async milestoneDiff(before: AbstractNote, after: AbstractNote): Promise<Diff<Milestone>> {
    const beforeMilestone = await before.getTrackedMilestone();
    const afterMilestone = await after.getTrackedMilestone();

    return {
      added: !beforeMilestone && afterMilestone ? [afterMilestone] : [],
      removed: beforeMilestone && !afterMilestone ? [beforeMilestone] : [],
      changed:
        beforeMilestone && afterMilestone && !beforeMilestone.equals(afterMilestone)
          ? [{ before: beforeMilestone, after: afterMilestone }]
          : [],
    };
  }

  async issuesDiff(before: AbstractNote, after: AbstractNote): Promise<Diff<Issue>> {
    const beforeIssues = await before.getIssues();
    const afterIssues = await after.getIssues();

    return {
      added: afterIssues.filter((i) => !i.id),
      removed: _.differenceBy(beforeIssues, afterIssues, "id"),
      changed: _(afterIssues)
        .filter((issue) => !!issue.id)
        .map((issue) => {
          const b = beforeIssues.find((b) => b.id == issue.id);
          if (b && !b.equals(issue)) return { before: b, after: issue };
          return undefined;
        })
        .compact()
        .value(),
    };
  }

  /**
   * Handles a change to a file, computing the diff between the previous and current content and
   * updating any relevant issues in GitHub.
   * @param file The file that changed.
   * @returns A promise that resolves when the change has been handled.
   */
  async onChanged(file: TAbstractFile): Promise<void> {
    if (!this.settings.autoSync) return;

    const ignorePattern = /\/\.obsidian\/|\/\.git\//;
    if (!(file instanceof TFile) || !file.path.endsWith(".md") || ignorePattern.test(file.path)) return;

    const content = await this.app.vault.read(file as TFile);
    console.debug("changed", file.path);

    const prev = this.noteCache[file.path];
    if (!prev) {
      console.debug("no previous content", file.path);
      this.noteCache[file.path] = content;
      return;
    }

    const [prevNote, currentNote] = [prev, content].map((c) => new CachedNote(file.name, file.path, c));
    const diff = await this.issuesDiff(prevNote, currentNote);
    const milestoneDiff = await this.milestoneDiff(prevNote, currentNote);

    console.debug("changed issues", diff);
    console.debug("changed milestones", milestoneDiff);

    const note = new AppNote(this.app, file as TFile);

    if (diff.added.length || milestoneDiff.added.length) {
      // Clear the cache for the file so that the next change is ignored.
      delete this.noteCache[file.path];
    } else {
      this.noteCache[file.path] = content;
    }

    const { org, repo } = (await note.getRepo()) ?? {};
    if (org && repo) {
      const issueRepo = this.getRepo(org, repo);
      await Promise.all([
        ...diff.added.map((i) => this.handleNewIssue(i, issueRepo, note)),
        ...diff.removed.map(async (i) => {
          await issueRepo.hideIssue(i.id);
          this.issueCache.remove(i.id);
        }),
        ...diff.changed.map(async (i) => {
          await issueRepo.updateIssue(i.after);
          this.issueCache.update(i.after);
        }),
        ...milestoneDiff.added.map(async (m) => {
          await this.handleNewMilestone(m, issueRepo, note);
        }),
        ...milestoneDiff.changed.map(async (m) => {
          await issueRepo.updateMilestone(m.after);
        }),
      ]);
    }
  }

  async handleNewMilestone(milestone: Milestone, repo: IssueRepository, note: AbstractNote): Promise<Milestone> {
    // Check whether a milestone with the same title exists in GitHub.
    // If it does, update the note with the milestone ID. Otherwise, create it and do the same.
    const sourceMilestone = await repo.fetchMilestoneByTitle(milestone.title);
    if (sourceMilestone) {
      milestone.id = sourceMilestone.id;
    } else {
      console.debug(`creating milestone ${milestone.title}`);
      const { id } = await repo.createMilestone(milestone);
      milestone.id = id;
    }

    console.debug(`setting milestone ID for ${milestone.title}`);
    await note.setProperties({
      [PROPERTY_TYPE]: TrackedType.Milestone,
      [PROPERTY_ID]: milestone.id,
    });
    note.setHeadSection(milestone.description ?? "");

    return milestone;
  }

  async handleNewIssue(issue: Issue, repo: IssueRepository, note: AbstractNote): Promise<Issue> {
    // Check whether an issue with the same title exists in GitHub.
    // If it does, update the note with the issue ID. Otherwise, create it and do the same.
    const sourceIssue = await repo.fetchIssueByTitle(issue.title);
    if (sourceIssue) {
      issue.id = sourceIssue.id;
      if (issue.milestoneId && issue.milestoneId != sourceIssue.milestoneId) {
        console.debug(`updating milestone for issue ${issue.id}`);
        await repo.updateIssue(issue);
      }
    } else {
      console.debug(`creating issue ${issue.title}`);
      const { id } = await repo.createIssue(issue);
      issue.id = id;
    }
    console.debug(`setting issue ID for ${issue.title}`);
    try {
      await note.setIdOnIssue(issue.title, issue.id);
    } catch (err) {
      console.warn("failed to set ID on issue line", err);
    }

    this.issueCache.add(issue);

    return issue;
  }

  async createMilestone(): Promise<void> {
    const note = new AppNote(this.app);
    let repo: IssueRepository;
    try {
      repo = await this.issueRepo;
    } catch (err) {
      new Notice("Please set property `mission.repo` in the note to specify which repo to create the milestone on");
      note.setProperty("mission.repo", "org/repo");
      return;
    }

    let milestoneId = await note.getTrackedId();
    if (milestoneId) {
      new Notice(`Milestone already exists (${milestoneId})`);
    }

    new Notice("Creating milestone");

    // Check that a milestone doesn't already exist with the same name.
    const milestones = await repo.fetchMilestones();
    const milestoneName = await note.getTrackedName();
    const existing = milestones.find((m) => m.title === milestoneName);
    milestoneId = existing?.id;

    if (milestoneId) {
      console.log(`milestone already exists: ${milestoneId}, updating note`);
    } else {
      const milestone = await repo.createMilestone({ title: milestoneName });
      milestoneId = milestone.id;
    }
    // Insert the milestone ID into the note on the first line.
    await note.setProperty("mission.type", "milestone");
    await note.setProperty("mission.id", milestoneId);
  }

  async updateMilestone(): Promise<void> {
    const repo = await this.issueRepo;

    const note = new AppNote(this.app);
    const milestoneId = await note.getTrackedId();
    if (!milestoneId) throw "no milestone ID found in note";

    new Notice(`Updating milestone ${milestoneId}`);
    const issues = await note.getIssues();

    // For each issue with an ID, update the issue in GitHub if the title has changed.
    await Promise.all(
      issues
        .filter((i) => i.id)
        .map(async (i) => {
          const issue = await repo.fetchIssueById(i.id);
          if (issue?.title != i.title) {
            console.debug(`updating title of issue ${i.id}`);
            await repo.updateIssue(i);
          }
        })
    );

    // Sync each issue in the note that doesn't have an ID.
    await Promise.all(issues.filter((i) => !i.id).map((i) => this.handleNewIssue(i, repo, note)));

    this.issueCache.setAll(issues);
  }

  async fetchIssues(): Promise<string> {
    const repo = await this.issueRepo;
    const note = new AppNote(this.app);
    const id = await note.getTrackedId();
    if (!id) throw "no milestone ID found in note";

    new Notice(`Fetching issues for milestone ${id}`);
    const issues = await repo.fetchIssuesInMilestone(id);
    console.debug(issues);
    this.issueCache.setAll(issues);

    const md = issues.length
      ? issues
          .sort((a, b) => -(a.status ?? "open").localeCompare(b.status ?? "open") || repo.compareIds(a.id, b.id))
          .map((i) => this.toListItem(i))
          .join("\n")
      : "No issues found.";
    // Ignore subsequent change to content.
    delete this.noteCache[note.filePath];
    await note.writeSection("Issues", md);
    return md;
  }

  toListItem(i: Issue): string {
    // const mapTag = (map: { [key: string]: string }, v: string) =>
    //   map[v] && `#${map[v]}`;
    const checkbox = i.status === "closed" ? "[x]" : "[ ]";
    let md = compact([
      "-",
      checkbox,
      i.title,
      `(${i.id})`,
      // `@${i.assignee?.id || "unassigned"}`,
      // mapTag(this.settings.priorityMapping, i.priority),
      // mapTag(this.settings.statusMapping, i.status),
    ]).join(" ");
    if (i.description) md += `\n\t- ${i.description}`;
    return md;
  }
}
