// Use the Octokit library to interact with the GitHub API and create a new issue
// https://octokit.github.io/rest.js/v18

import { Octokit } from "octokit";
import { CreateIssue, CreateMilestone, IssueRepository, UpdateIssue, UpdateMilestone } from "src/issues/repository";
import { Issue, Milestone, Status } from "src/issues/types";

export type GithubOptions = {
  baseUrl?: string;
  accessToken: string;
  org: string;
  repo: string;
};

// export type CreateIssue = {
//   title: string;
//   body?: string;
//   milestone?: number;
//   labels?: string[];
//   assignee?: string;
//   assignees?: string[];
// };

// export type UpdateIssue = Omit<CreateIssue, "title"> & {
//   issue_number: number;
//   title?: string;
// };

export type GitHubIssue = Awaited<ReturnType<Octokit["rest"]["issues"]["listForRepo"]>>["data"][0];

export type GitHubMilestone = Awaited<ReturnType<Octokit["rest"]["issues"]["listMilestones"]>>["data"][0];

export class Github extends IssueRepository {
  #octokit: Octokit;
  #org: string;
  #repo: string;

  constructor({ baseUrl, accessToken, org, repo }: GithubOptions) {
    super();
    this.#org = org;
    this.#repo = repo;
    this.#octokit = new Octokit({ baseUrl, auth: accessToken });
  }

  get repoProps() {
    return { owner: this.#org, repo: this.#repo };
  }

  /**
   * Creates a new issue and returns its data.
   * @param props The data for the new issue.
   * @returns The created issue.
   * @see https://docs.github.com/en/rest/reference/issues#create-an-issue
   */
  async createIssue(props: CreateIssue): Promise<Issue> {
    const payload = {
      ...this.repoProps,
      title: props.title,
      body: props.description,
      state: toState(props.status),
      state_reason: props.statusReason,
      milestone: props.milestone ? parseInt(props.milestone.id) : undefined,
    };
    console.debug("create issue", payload);
    const { data } = await this.#octokit.rest.issues.create(payload);
    return toIssue(data);
  }

  /**
   * Updates the issue with the given number and returns its data.
   * @param props The data to update the issue with.
   * @returns The updated issue.
   * @see https://docs.github.com/en/rest/reference/issues#update-an-issue
   */
  async updateIssue(props: UpdateIssue): Promise<Issue> {
    const payload = {
      ...this.repoProps,
      issue_number: props.id ? parseInt(props.id) : undefined,
      title: props.title,
      body: props.description,
      state: toState(props.status),
      state_reason: props.statusReason,
      milestone: props.milestone ? parseInt(props.milestone.id) : undefined,
    };
    console.debug("update issue", payload);
    const { data } = await this.#octokit.rest.issues.update(payload);
    return toIssue(data);
  }

  /**
   * Hides the issue with the given ID.
   */
  async hideIssue(id: string): Promise<Issue> {
    const { data } = await this.#octokit.rest.issues.update({
      ...this.repoProps,
      issue_number: parseInt(id),
      state: "closed",
      state_reason: "not_planned",
    });
    return toIssue(data);
  }

  /**
   * Fetches the issue with the given ID.
   */
  async fetchIssueById(id: string): Promise<Issue | undefined> {
    const { data } = await this.#octokit.rest.issues.get({
      ...this.repoProps,
      issue_number: parseInt(id),
    });
    return data ? toIssue(data) : undefined;
  }

  /**
   * Fetches the issue with the given title.
   */
  async fetchIssueByTitle(title: string): Promise<Issue | undefined> {
    const { data } = await this.#octokit.rest.issues.listForRepo({ ...this.repoProps, state: "all" });
    const issue = data.find((i) => i.title === title);
    return issue ? toIssue(issue) : undefined;
  }

  /**
   * Returns the issues in the milestone with the given ID.
   */
  async fetchIssuesInMilestone(milestoneId: string): Promise<Issue[]> {
    const payload = {
      ...this.repoProps,
      milestone: parseInt(milestoneId) as any, // pass int to filter by milestone
    };
    console.debug("fetch issues by milestone", payload);
    const { data } = await this.#octokit.rest.issues.listForRepo(payload);
    return data.map(toIssue).filter((i) => i.statusReason != "not_planned");
  }

  /**
   * Creates a new milestone and returns its ID.
   */
  async createMilestone(props: CreateMilestone): Promise<Milestone> {
    const { data } = await this.#octokit.rest.issues.createMilestone({
      ...this.repoProps,
      title: props.title,
      state: toState(props.status),
    });
    return toMilestone(data);
  }
  /**
   * Updates the milestone with the given ID and returns its ID.
   */
  async updateMilestone(props: UpdateMilestone): Promise<Milestone> {
    const { data } = await this.#octokit.rest.issues.updateMilestone({
      ...this.repoProps,
      milestone_number: parseInt(props.id),
      title: props.title,
      state: toState(props.status),
    });
    return toMilestone(data);
  }

  /**
   * Fetches all milestones in the repository.
   */
  async fetchMilestones(): Promise<Milestone[]> {
    const { data } = await this.#octokit.rest.issues.listMilestones({ ...this.repoProps });
    return data.map(toMilestone);
  }

  compareIds(a: string, b: string): number {
    return parseInt(a) - parseInt(b);
  }
}

function toIssue(issue: GitHubIssue): Issue {
  return {
    id: issue.number?.toString(),
    title: issue.title,
    status: toStatus(issue.state),
    statusReason: issue.state_reason,
    milestone: issue.milestone ? { id: issue.milestone?.toString() } : undefined,
  };
}

function toMilestone(milestone: GitHubMilestone): Milestone {
  return {
    id: milestone.number?.toString(),
    title: milestone.title,
    status: toStatus(milestone.state),
  };
}

function toState(status: Status | undefined): "open" | "closed" {
  if (status == undefined) return undefined;
  return status == "closed" ? "closed" : "open";
}

function toStatus(state: string): Status {
  if (state == undefined) return undefined;
  return state == "closed" ? "closed" : "open";
}
