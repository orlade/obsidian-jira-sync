import { isEmpty } from "lodash";
import { Notice, Plugin, TAbstractFile } from "obsidian";
import { SettingTab } from "./SettingTab";
import { Github, Issue } from "./github";
import { Note } from "./markdown";
import { parse } from "path";

interface GithubSyncPluginSettings {
  baseUrl: string;
  accessToken: string;
  // updateEvery: number;
  // priorityMapping: { [key: string]: string };
  // statusMapping: { [key: string]: string };
  // parentFieldIds?: string[];
}

const DEFAULT_SETTINGS: Omit<GithubSyncPluginSettings, "accessToken"> = {
  baseUrl: "https://github.com",
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

export class GithubSyncPlugin extends Plugin {
  settings: GithubSyncPluginSettings;

  async onload() {
    await this.loadSettings();

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

    this.app.vault.on("modify", (file: TAbstractFile) => this.onChanged(file));
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  get github() {
    const { accessToken } = this.settings;
    if (!accessToken) throw "no access token";
    return new Note(this.app)
      .getRepo()
      .then(({ org, repo }) => new Github({ org, repo, accessToken }));
  }

  async onChanged(file: TAbstractFile) {
    // console.log("changed", file.path);
    // TODO: Keep a copy of issue data and update it if its state in the note changes (e.g. checkbox).
  }

  async createMilestone(): Promise<number> {
    const github = await this.github;
    const note = new Note(this.app);

    let id = await note.getMilestoneNumber();
    if (id) throw "milestone already exists";

    new Notice("Creating milestone");

    // Check that a milestone doesn't already exist with the same name.
    const milestones = await github.fetchMilestones();
    const milestoneName = await note.getMilestoneName();
    const existing = milestones.find((m) => m.title === milestoneName);
    id = existing?.number;

    if (id) {
      console.log(`milestone already exists: ${id}, updating note`);
    } else {
      id = await github.createMilestone(milestoneName);
    }
    // Insert the milestone ID into the note on the first line.
    await note.prependLine(`ID: ${id}`);
    return id;
  }

  async updateMilestone(): Promise<void> {
    const github = await this.github;

    const note = new Note(this.app);
    const milestone = await note.getMilestoneNumber();
    if (!milestone) throw "no milestone ID found in note";

    new Notice(`Updating milestone ${milestone}`);
    const issues = await note.getIssues();

    // For each issue with an ID, update the issue in GitHub if the title has changed.
    await Promise.all(
      issues
        .filter((i) => i.id)
        .map(async (i) => {
          const id = parseInt(i.id);
          const issue = await github.fetchIssueById(id);
          if (issue?.title != i.title) {
            console.debug(`updating title of issue ${i.id}`);
            await github.updateIssue({
              issue_number: id,
              title: i.title,
              milestone,
            });
          }
        })
    );

    // For each issue without and ID, check whether an issue with the same title exists in GitHub.
    // If it does, update the note with the issue ID.
    await Promise.all(
      issues
        .filter((i) => !i.id)
        .map(async (i) => {
          const issue = await github.fetchIssueByTitle(i.title);
          if (issue) {
            i.id = issue.number.toString();
            console.debug(`updating issue ID for ${i.title}`);
            await note.setIdOnIssue(i.title, i.id);
            if (issue.milestone?.number !== milestone) {
              console.debug(`updating milestone for issue ${issue.number}`);
              await github.updateIssue({
                issue_number: issue.number,
                title: i.title,
                milestone,
              });
            }
          }
        })
    );

    // Create the issues in GitHub if they don't have IDs.
    const createdIssues = await Promise.all(
      issues
        .filter((i) => !i.id)
        .map(async (i) => {
          console.debug(`creating issue ${i.title}`);
          const issue = await github.createIssue({
            title: i.title,
            milestone,
          });
          i.id = issue.number.toString();
          return i;
        })
    );

    // For each created issue, update the note with the new ID.
    await Promise.all(
      createdIssues
        .filter((i) => i.id)
        .map(async (i) => await note.setIdOnIssue(i.title, i.id))
    );
  }

  async fetchIssues(): Promise<string> {
    const github = await this.github;
    const note = new Note(this.app);
    const id = await note.getMilestoneNumber();
    if (!id) throw "no milestone ID found in note";

    new Notice(`Fetching issues for milestone ${id}`);
    const issues = await github.fetchIssuesInMilestone(id);
    console.log(id, issues);

    const md = issues.length
      ? issues
          .sort(
            (a, b) => -a.state.localeCompare(b.state) || a.number - b.number
          )
          .map((i) => this.toListItem(i))
          .join("\n")
      : "No issues found.";
    await note.writeSection("Issues", md);
    return md;
  }

  toListItem(i: Issue): string {
    // const mapTag = (map: { [key: string]: string }, v: string) =>
    //   map[v] && `#${map[v]}`;
    const checkbox = i.state === "closed" ? "[x]" : "[ ]";
    return [
      "-",
      checkbox,
      i.title,
      `(${i.number})`,
      // `@${i.assignee?.id || "unassigned"}`,
      // mapTag(this.settings.priorityMapping, i.priority),
      // mapTag(this.settings.statusMapping, i.status),
    ]
      .filter((v) => v)
      .join(" ");
  }
}
