import { App, Plugin, PluginSettingTab, Setting } from 'obsidian';
import YAML from 'yaml'

import Jira, { SmallIssue } from './jira'


interface JiraSyncPluginSettings {
	baseUrl: string;
	priorityMapping: {[key: string]: string};
	statusMapping: {[key: string]: string};
	parentFieldIds?: string[];
}

const DEFAULT_SETTINGS: JiraSyncPluginSettings = {
	baseUrl: '',
	priorityMapping: {
		"Highest": "p0",
		"High": "p1",
		"Medium": "p2",
		"Low": "p3",
		"Lowest": "p4",
	},
	statusMapping: {
		"In Progress": "wip",
		"In Analysis": "next",
		"TODO": "todo",
	},
}

export default class JiraSyncPlugin extends Plugin {
	settings: JiraSyncPluginSettings;

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: 'jira-download',
			name: 'Fetch Issues',
			callback: () => this.downloadIssues(),
		});

		this.addSettingTab(new SettingTab(this.app, this));
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

		const jira = new Jira({baseUrl: this.settings.baseUrl});
		const issues = await jira.fetchIssuesInEpic(id);
		console.debug(issues);

		const md = issues.map(i => this.toListItem(i)).join('\n');
		await this.app.vault.modify(file, md)
		return md;
	}

	toListItem(i: SmallIssue): string {
		const mapTag = (map: {[key:string]:string}, v: string) => map[v] && `#${map[v]}`;
		return [
			'-',
			i.key,
			i.summary,
			`@${i.assignee?.id || 'unassigned'}`,
			mapTag(this.settings.priorityMapping, i.priority),
			mapTag(this.settings.statusMapping, i.status),
		].filter(v => v).join(' ');
	}
}

class SettingTab extends PluginSettingTab {
	plugin: JiraSyncPlugin;

	constructor(app: App, plugin: JiraSyncPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		let {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Base URL')
			.setDesc('The host of your Jira instance')
			.addText(text => text
				.setPlaceholder('https://jira.your.host')
				.setValue(this.plugin.settings.baseUrl)
				.onChange(async (value: string) => {
					this.plugin.settings.baseUrl = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Priority tag mapping')
			.setDesc('Configure the tags to use for priorities')
			.addTextArea(text => text
				.setPlaceholder('priority: tag')
				.setValue(YAML.stringify(this.plugin.settings.priorityMapping))
				.onChange(async (value: string) => {
					this.plugin.settings.priorityMapping = YAML.parse(value);
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Status tag mapping')
			.setDesc('Configure the tags to use for statuses')
			.addTextArea(text => text
				.setPlaceholder('status: tag')
				.setValue(YAML.stringify(this.plugin.settings.statusMapping))
				.onChange(async (value: string) => {
					this.plugin.settings.statusMapping = YAML.parse(value);
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Parent field IDs')
			.setDesc('Enter any custom fields to use as parent IDs, comma-separated')
			.addText(text => text
				.setPlaceholder('customfield_12345, customfield_67890')
				.setValue(this.plugin.settings.parentFieldIds?.join(', '))
				.onChange(async (value: string) => {
					this.plugin.settings.parentFieldIds = value.split(/\s*,\s*/).filter(v => v);
					await this.plugin.saveSettings();
				}));
	}
}
