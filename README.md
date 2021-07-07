# Obsidian Jira Sync Plugin

**Seamlessly sync [Jira](https://www.atlassian.com/software/jira) issues with [Obsidian](https://obsidian.md) notes.**

## Usage

Create a note with a name that starts with the key of a parent issue.

Run the "Jira download" command.

The note is populate with one bullet per child issue.

The order of the bullets is based on rank. Re-ordering them will re-rank the issues on Jira (TODO).

## References

- Based on [obsidian-sample-plugin](https://github.com/obsidianmd/obsidian-sample-plugin)
- Uses [Jira REST API](https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/)
