import { Plugin } from "obsidian";
import { SettingTab } from "./SettingTab";
import Jira, { SmallIssue } from "./jira/jira";

interface JiraSyncPluginSettings {
  baseUrl: string;
  priorityMapping: { [key: string]: string };
  statusMapping: { [key: string]: string };
  parentFieldIds?: string[];
}

const DEFAULT_SETTINGS: JiraSyncPluginSettings = {
  baseUrl: "",
  priorityMapping: {
    Highest: "p0",
    High: "p1",
    Medium: "p2",
    Low: "p3",
    Lowest: "p4",
  },
  statusMapping: {
    "In Progress": "wip",
    "In Analysis": "next",
    TODO: "todo",
  },
};

export class JiraSyncPlugin extends Plugin {
  settings: JiraSyncPluginSettings;

  async onload() {
    await this.loadSettings();

    this.addCommand({
      id: "jira-download",
      name: "Fetch Issues",
      callback: () => this.downloadIssues(),
    });

    // this.addSettingTab(new SettingTab(this.app, this));
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async downloadIssues(): Promise<string> {
    const file = this.app.workspace.getActiveFile();
    const [id] = /^[A-Z]+-\d+/.exec(file.name);
    if (!id) {
      console.log("not an issue note");
      return;
    }

    console.log("issue note", id);

    const jira = new Jira({ baseUrl: this.settings.baseUrl });
    const issues = await jira.fetchIssuesInEpic(id);
    console.debug(issues);

    const md = issues.map((i) => this.toListItem(i)).join("\n");
    await this.app.vault.modify(file, md);
    return md;
  }

  toListItem(i: SmallIssue): string {
    const mapTag = (map: { [key: string]: string }, v: string) =>
      map[v] && `#${map[v]}`;
    return [
      "-",
      i.key,
      i.summary,
      `@${i.assignee?.id || "unassigned"}`,
      mapTag(this.settings.priorityMapping, i.priority),
      mapTag(this.settings.statusMapping, i.status),
    ]
      .filter((v) => v)
      .join(" ");
  }
}
