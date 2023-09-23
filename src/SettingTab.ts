import { App, PluginSettingTab, Setting } from "obsidian";
import { GithubSyncPlugin } from "./GithubSyncPlugin";

export class SettingTab extends PluginSettingTab {
  plugin: GithubSyncPlugin;

  constructor(app: App, plugin: GithubSyncPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    let { containerEl } = this;

    containerEl.empty();

    new Setting(containerEl)
      .setName("Base URL")
      .setDesc("The host of your GitHub server")
      .addText((text) =>
        text
          .setPlaceholder("https://github.com")
          .setValue(this.plugin.settings.baseUrl)
          .onChange(async (value: string) => {
            this.plugin.settings.baseUrl = value;
            await this.plugin.saveSettings();
          })
      );
    new Setting(containerEl)
      .setName("Access token")
      .setDesc("Personal access token to use the GitHub API")
      .addText((text) =>
        text.setValue(this.plugin.settings.accessToken).onChange(async (value: string) => {
          this.plugin.settings.accessToken = value;
          await this.plugin.saveSettings();
        })
      );
    new Setting(containerEl)
      .setName("Auto sync")
      .setDesc("Automatically sync issues when files are saved")
      .addToggle((value) =>
        value.setValue(this.plugin.settings.autoSync).onChange(async (value: boolean) => {
          this.plugin.settings.autoSync = value;
          await this.plugin.saveSettings();
        })
      );

    // new Setting(containerEl)
    //   .setName("Priority tag mapping")
    //   .setDesc("Configure the tags to use for priorities")
    //   .addTextArea((text) =>
    //     text
    //       .setPlaceholder("priority: tag")
    //       .setValue(YAML.stringify(this.plugin.settings.priorityMapping))
    //       .onChange(async (value: string) => {
    //         this.plugin.settings.priorityMapping = YAML.parse(value);
    //         await this.plugin.saveSettings();
    //       })
    //   );

    // new Setting(containerEl)
    //   .setName("Status tag mapping")
    //   .setDesc("Configure the tags to use for statuses")
    //   .addTextArea((text) =>
    //     text
    //       .setPlaceholder("status: tag")
    //       .setValue(YAML.stringify(this.plugin.settings.statusMapping))
    //       .onChange(async (value: string) => {
    //         this.plugin.settings.statusMapping = YAML.parse(value);
    //         await this.plugin.saveSettings();
    //       })
    //   );

    // new Setting(containerEl)
    //   .setName("Parent field IDs")
    //   .setDesc("Enter any custom fields to use as parent IDs, comma-separated")
    //   .addText((text) =>
    //     text
    //       .setPlaceholder("customfield_12345, customfield_67890")
    //       .setValue(this.plugin.settings.parentFieldIds?.join(", "))
    //       .onChange(async (value: string) => {
    //         this.plugin.settings.parentFieldIds = value
    //           .split(/\s*,\s*/)
    //           .filter((v) => v);
    //         await this.plugin.saveSettings();
    //       })
    //   );
  }
}
