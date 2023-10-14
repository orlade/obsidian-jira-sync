# Obsidian Issues Sync Plugin

**Seamlessly sync your issue tracker with [Obsidian](https://obsidian.md) notes**

Supports:

- [GitHub (github.com)](https://github.com/)

TODO:

- [Jira](https://www.atlassian.com/software/jira)
- [GitHub Enterprise Server (self-hosted)](https://docs.github.com/en/enterprise-server@3.6/admin/overview/about-github-enterprise-server)
- [GitLab](https://gitlab.com/)

## The Problem

Virtually all issue trackers are equally good at storing your tasks. Once you've entered your backlog, they're all pretty good for running a two-week sprint. But the user interface falls over once projects get more complex, or when you're just starting to sketch out something new and exciting. They're clunky, slow, and frustrating.

So you resort to a fast, flexible, familiar note-taking app like Obsidian to get all of your thoughts out of your head. But that's no good either. If your notes are private, you have to copy every change into your issue tracker. If you share your notes, they likely can't or won't be edited, if your team can understand them at all.

You need an issue tracker, but you need the speed and flexibility of notes. It's the same information, so let's just keep them both in sync.

## Usage

> Note: we use GitHub terminology, but you can substitute equivalent concepts from other issues trackers.

Before the plugin can do anything, you'll need to [create a Personal Access Token (PAT) on GitHub](https://github.com/settings/tokens). This can be a regular token with the `repo` scope, or fine-grained token (recommended) with "read and write" access to Issues. Copy the token and paste it into the plugin settings.

You can work with issues in a few different ways:

- **Repository note**: Repository metadata, followed by a list all of the issues in the repository
- **Milestone note**: milestone metadata, followed by a list all of the issues in the milestone
- **Project note**: project metadata, followed by a list all of the issues in the project
- **Issue note**: detailed issue metadata.

To get started, create a new note. You'll use the note's front matter (properties) to tell the plugin what to do. At minimum, you'll need to set some of:

- `mission.host`: the root URL of the issue tracker to sync with. This will default to the host set in the plugin settings (which defaults to github.com). This also suggests which issue tracker is being used.
- `mission.tracker` (optional): if the issue tracker is not implied by the `host`, you can specify it with `tracker`. This should be `github`, `gitlab`, or `jira`.
- `mission.repo` (for Git hosts): the URL of the repository to sync with, e.g. `https://github.com/orlade/obsidian-jira-sync`. This also suggests which issue tracker is being used.\ (e.g. github.com vs gitlab.com)
- `mission.project` (for Jira): the key of the project to sync with, e.g. `FOO`.

To specify how the note should be populated, set one of the following properties. If you are using the note to create a new issue, set the ID to `new`.

- `mission.type`: the kinda of note sync to perform. This should be `repo`, `milestone`, `project`, or `issue`.
- `mission.id` (for a milestone note): the ID of the milestone, e.g. `1`

By default, the title of the note will be used as the title of the new issue. To specify a different title, set the `title` property.

Run the "Issue Sync: Sync" command.

The note is populated with one bullet per child issue.

The order of the bullets is based on rank. Re-ordering them will re-rank the issues on Jira (TODO).

## Development

Clone this repo into the `.obsidian/plugins/obsidian-jira-sync` folder of your Obsidian vault, and run `yarn` to install dependencies.

## References

- Based on [obsidian-sample-plugin](https://github.com/obsidianmd/obsidian-sample-plugin)
- Uses [Jira REST API](https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/)
