// Use the Octokit library to interact with the GitHub API and create a new issue
// https://octokit.github.io/rest.js/v18

import { Octokit } from "octokit";

export type GithubOptions = {
  baseUrl?: string;
  accessToken: string;
  org: string;
  repo: string;
};

export type CreateIssue = {
  title: string;
  body?: string;
  milestone?: number;
  labels?: string[];
  assignee?: string;
  assignees?: string[];
};

export type UpdateIssue = Omit<CreateIssue, "title"> & {
  issue_number: number;
  title?: string;
};

export type Issue = Awaited<
  ReturnType<Octokit["rest"]["issues"]["listForRepo"]>
>["data"][0];

export type Milestone = Awaited<
  ReturnType<Octokit["rest"]["issues"]["listMilestones"]>
>["data"][0];

export class Github {
  #octokit: Octokit;
  #org: string;
  #repo: string;

  constructor({ baseUrl, accessToken, org, repo }: GithubOptions) {
    this.#org = org;
    this.#repo = repo;
    this.#octokit = new Octokit({ baseUrl, auth: accessToken });
  }

  /**
   * Creates a new issue and returns its data.
   * @param props The data for the new issue.
   * @returns The created issue.
   * @see https://docs.github.com/en/rest/reference/issues#create-an-issue
   */
  async createIssue(props: CreateIssue): Promise<Issue> {
    const res = await this.#octokit.rest.issues.create({
      owner: this.#org,
      repo: this.#repo,
      ...props,
    });
    return res.data;
  }

  /**
   * Updates the issue with the given number and returns its data.
   * @param props The data to update the issue with.
   * @returns The updated issue.
   * @see https://docs.github.com/en/rest/reference/issues#update-an-issue
   */
  async updateIssue(props: UpdateIssue): Promise<Issue> {
    const res = await this.#octokit.rest.issues.update({
      owner: this.#org,
      repo: this.#repo,
      ...props,
    });
    return res.data;
  }

  /**
   * Creates a new milestone and returns its ID.
   */
  async createMilestone(milestone: string): Promise<number> {
    const res = await this.#octokit.rest.issues.createMilestone({
      owner: this.#org,
      repo: this.#repo,
      title: milestone,
    });
    return res.data.number;
  }

  /**
   * Fetches all milestones in the repository.
   */
  async fetchMilestones(): Promise<Milestone[]> {
    const res = await this.#octokit.rest.issues.listMilestones({
      owner: this.#org,
      repo: this.#repo,
    });
    return res.data;
  }

  /**
   * Returns the issues in the milestone with the given ID.
   */
  async fetchIssuesInMilestone(milestone: number): Promise<Issue[]> {
    const res = await this.#octokit.rest.issues.listForRepo({
      owner: this.#org,
      repo: this.#repo,
      milestone: milestone.toString(),
    });
    return res.data;
  }

  /**
   * Fetches the issue with the given title.
   */
  async fetchIssueByTitle(title: string): Promise<Issue | undefined> {
    const res = await this.#octokit.rest.issues.listForRepo({
      owner: this.#org,
      repo: this.#repo,
      state: "all",
    });
    return res.data.find((i) => i.title === title);
  }

  /**
   * Fetches the issue with the given ID.
   */
  async fetchIssueById(issue_number: number): Promise<Issue | undefined> {
    const res = await this.#octokit.rest.issues.get({
      owner: this.#org,
      repo: this.#repo,
      issue_number,
    });
    return res.data;
  }
}
