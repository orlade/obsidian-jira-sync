import { isEmpty } from "lodash";
import { Plugin } from "obsidian";
import { SettingTab } from "./SettingTab";
import { Github, Issue } from "./github";
import { Note } from "./markdown";

interface GithubSyncPluginSettings {
  baseUrl: string;
  accessToken: string;
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

    this.addSettingTab(new SettingTab(this.app, this));
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async createMilestone(): Promise<number> {
    if (!this.settings.accessToken) throw "no access token";
    const note = new Note(this.app);

    const [org, repo] = (await note.getRepo())?.split("/");
    const github = new Github({
      org,
      repo,
      accessToken: this.settings.accessToken,
    });

    let id = await note.getMilestoneNumber();
    if (id) throw "milestone already exists";

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

  async fetchIssues(): Promise<string> {
    if (!this.settings.accessToken) throw "no access token";
    const note = new Note(this.app);
    const id = await note.getMilestoneNumber();
    if (!id) throw "no milestone ID found in note";
    const [org, repo] = (await note.getRepo())?.split("/");

    const github = new Github({
      org,
      repo,
      accessToken: this.settings.accessToken,
    });
    const issues = await github.fetchIssuesInMilestone(id);
    console.debug(issues);

    const md = issues.length
      ? issues.map((i) => this.toListItem(i)).join("\n")
      : "No issues found.";
    await note.writeSection("Issues", md);
    return md;
  }

  toListItem(i: Issue): string {
    const mapTag = (map: { [key: string]: string }, v: string) =>
      map[v] && `#${map[v]}`;
    return [
      "-",
      i.id,
      i.title,
      `@${i.assignee?.id || "unassigned"}`,
      // mapTag(this.settings.priorityMapping, i.priority),
      // mapTag(this.settings.statusMapping, i.status),
    ]
      .filter((v) => v)
      .join(" ");
  }
}
