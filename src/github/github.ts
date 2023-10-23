// Use the Octokit library to interact with the GitHub API and create a new issue
// https://octokit.github.io/rest.js/v18

import { graphql } from "@octokit/graphql";
import { Octokit } from "octokit";
import {
  CreateIssue,
  CreateMilestone,
  CreateProject,
  IssueRepository,
  UpdateIssue,
  UpdateMilestone,
  UpdateProject,
} from "src/issues/repository";
import { Issue, Milestone, Project, Status } from "src/issues/types";

export type GithubOptions = {
  baseUrl?: string;
  accessToken: string;
  org: string;
  repo: string;
};

export type GitHubIssue = Awaited<ReturnType<Octokit["rest"]["issues"]["listForRepo"]>>["data"][0];

export type GitHubMilestone = Awaited<ReturnType<Octokit["rest"]["issues"]["listMilestones"]>>["data"][0];
// export type GitHubProject = Awaited<ReturnType<Octokit["rest"]["projects"]["listForRepo"]>>["data"][0];
export type GitHubProject = {
  number?: number;
  id?: string;
  title?: string;
  shortDescription?: string;
  closedAt?: string;
};

export type GitHubProjectIssueItem = {
  number: number;
  id: string;
  title: string;
  body?: string;
  state: string;
  stateReason: "completed" | "reopened" | "not_planned" | null;
  milestone?: {
    number: number;
  };
};

export class Github extends IssueRepository {
  #octokit: Octokit;
  #org: string;
  #repo: string;
  #graphql: typeof graphql;
  #orgNodeId?: Promise<string>;

  constructor({ baseUrl, accessToken, org, repo }: GithubOptions) {
    super();
    this.#org = org;
    this.#repo = repo;
    this.#octokit = new Octokit({ baseUrl, auth: accessToken });
    this.#graphql = graphql.defaults({ headers: { authorization: `token ${accessToken}` } });
  }

  /** Returns the node ID of the organization. */
  get orgNodeId(): Promise<string> {
    if (this.#orgNodeId) return this.#orgNodeId;
    return (this.#orgNodeId = this.#octokit.rest.users
      .getByUsername({ username: this.#org })
      .then(({ data }) => data.node_id));
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
      milestone: props.milestoneId ? parseInt(props.milestoneId) : undefined,
    };
    console.debug("create issue", payload);
    const { data } = await this.#octokit.rest.issues.create(payload);
    const issue = toIssue(data);
    if (props.projectId) await this.addIssueToProject(issue.id, props.projectId);
    return issue;
  }

  /**
   * Updates the issue with the given number and returns its data.
   * @param props The data to update the issue with.
   * @returns The updated issue.
   * @see https://docs.github.com/en/rest/reference/issues#update-an-issue
   */
  async updateIssue(props: UpdateIssue): Promise<Issue> {
    const id = parseInt(props.id);
    if (!id) throw new Error(`invalid issue id for update: ${props.id}`);
    const payload = {
      ...this.repoProps,
      issue_number: id,
      title: props.title,
      body: props.description,
      state: toState(props.status),
      state_reason: props.statusReason,
      milestone: props.milestoneId ? parseInt(props.milestoneId) : undefined,
    };
    if (props.projectId) await this.addIssueToProject(id, props.projectId);
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
    const data = await this.#fetchIssueById(id);
    return data ? toIssue(data) : undefined;
  }

  async #fetchIssueById(id: string): Promise<GitHubIssue | undefined> {
    const { data } = await this.#octokit.rest.issues.get({
      ...this.repoProps,
      issue_number: parseInt(id),
    });
    return data;
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
    const payload = {
      ...this.repoProps,
      title: props.title,
      state: toState(props.status),
    };
    const { data } = await this.#octokit.rest.issues.createMilestone(payload);
    console.debug("create milestone", payload);
    return toMilestone(data);
  }
  /**
   * Updates the milestone with the given ID and returns its ID.
   */
  async updateMilestone(props: UpdateMilestone): Promise<Milestone> {
    const payload = {
      ...this.repoProps,
      milestone_number: parseInt(props.id),
      title: props.title,
      description: props.description,
      state: toState(props.status),
    };
    const { data } = await this.#octokit.rest.issues.updateMilestone(payload);
    console.debug("update milestone", payload);
    return toMilestone(data);
  }

  /**
   * Fetches all milestones in the repository.
   */
  async fetchMilestones(): Promise<Milestone[]> {
    const { data } = await this.#octokit.rest.issues.listMilestones({ ...this.repoProps });
    return data.map(toMilestone);
  }

  /**
   * Fetches the milestone with the given title.
   */
  async fetchMilestoneByTitle(title: string): Promise<Milestone | undefined> {
    const { data } = await this.#octokit.rest.issues.listMilestones({ ...this.repoProps });
    const milestone = data.find((m) => m.title === title);
    return milestone ? toMilestone(milestone) : undefined;
  }

  /**
   * Creates a new project and returns its ID.
   */
  async createProject(props: CreateProject): Promise<Project> {
    const input = `{ownerId: "${await this.#orgNodeId}" title: "${props.title}"}`;
    const query = `
      mutation {
        createProjectV2(input: ${input}) {
          projectV2 {
            id, number, title, readme, shortDescription
          }
        }
      }`;
    const res: any = await this.#graphql(query);
    return toProject(res.createProjectV2.projectV2);
  }

  /**
   * Updates the project with the given ID and returns its ID.
   */
  async updateProject(props: UpdateProject): Promise<Project> {
    const input = `
    {
      projectId: "${props.id}"
      title: "${props.title}"
      shortDescription: "${props.description}"
      closed: ${props.status == "closed"}
    }`;
    const query = `
      mutation {
        updateProjectV2(input: ${input}) {
          projectV2 {
            id, number, title, readme, shortDescription
          }
        }
      }`;
    const res: any = await this.#graphql(query);
    return toProject(res.updateProjectV2.projectV2);
  }

  /**
   * Fetches all projects in the repository.
   */
  async fetchProjects(): Promise<Project[]> {
    const input = `
    {
      user(login:"${this.#org}") {
        projectsV2(first: 100) {
          nodes {
            number
            title
            shortDescription
            closedAt
          }
        }
      }
    }`;
    const res: any = await this.#graphql(input);
    return res.user.projectsV2.nodes.map(toProject);
  }

  /**
   * Fetches the project with the given title.
   */
  async fetchProjectByTitle(title: string): Promise<Project | undefined> {
    const input = `
    {
      user(login:"${this.#org}") {
        projectsV2(query: "${title}" first: 1) {
          nodes {
            number
            title
            shortDescription
            closedAt
          }
        }
      }
    }`;
    const res: any = await this.#graphql(input);
    const existing = res.user.projectsV2.nodes[0];
    return existing ? toProject(existing) : undefined;
  }

  /**
   * Fetches issues in project with the given ID.
   */
  async fetchIssuesInProject(id: string): Promise<Issue[]> {
    const input = `
    {
      user(login:"${this.#org}") {
        projectsV2(query: "id:${id}" first: 1) {
          nodes {
            number
            title
            shortDescription
            closedAt
            items(first: 100) {
              nodes {
                id
                type
                content {
                  __typename
                  ...on Issue{
                    number
                    title
                    body
                  }
                }
              }
            }
          }
        }
      }
    }`;
    console.debug("fetch issues in project", input);
    const res: any = await this.#graphql(input);
    const existing = res.user.projectsV2.nodes[0].items.nodes.map((n) => n.content);
    return existing.map(projectItemToIssue);
  }

  async addIssueToProject(issueId: number | string, projectId: string): Promise<string> {
    const nodeId = (await this.#fetchIssueById(issueId.toString()))?.node_id;
    const input = `
      mutation {
        addProjectV2ItemById(input: {projectId: "${projectId}" contentId: "${nodeId}"}) {
          item {
            id
          }
        }
      }
    `;
    console.debug("add issue to project", input);
    const res: any = await this.#graphql(input);
    return res.addProjectV2ItemById.item.id;
  }

  /**
   * Compares two IDs by comparing their integer values.
   */
  compareIds(a: string, b: string): number {
    return parseInt(a) - parseInt(b);
  }
}

function toIssue(issue: GitHubIssue): Issue {
  return new Issue(issue.number.toString(), issue.title, {
    description: issue.body || undefined,
    status: toStatus(issue.state),
    statusReason: issue.state_reason || undefined,
    milestoneId: issue.milestone?.id.toString() ?? undefined,
  });
}

function projectItemToIssue(issue: GitHubProjectIssueItem): Issue {
  return new Issue(issue.number.toString(), issue.title, {
    description: issue.body || undefined,
    status: toStatus(issue.state),
    statusReason: issue.stateReason || undefined,
    milestoneId: issue.milestone?.number.toString() ?? undefined,
  });
}

function toMilestone(milestone: GitHubMilestone): Milestone {
  return new Milestone(milestone.number?.toString(), milestone.title, {
    description: milestone.description || undefined,
    status: toStatus(milestone.state),
  });
}

function toProject(project: GitHubProject): Project {
  return new Project({
    id: project.id,
    number: project.number,
    title: project.title,
    description: project.shortDescription || undefined,
    status: toStatus(project.closedAt ? "closed" : "open"),
  });
}

function toState(status: Status | undefined): "open" | "closed" | undefined {
  if (status == undefined) return undefined;
  return status == "closed" ? "closed" : "open";
}

function toStatus(state: string): Status | undefined {
  if (state == undefined) return undefined;
  return state.toLowerCase() == "closed" ? "closed" : "open";
}
