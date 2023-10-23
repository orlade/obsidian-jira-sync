import { Issue, Milestone, Project, Status } from "./types";

export type CreateIssue = Omit<Issue, "id"> & {};

export type UpdateIssue = Omit<CreateIssue, "title"> & {
  id: string;
  title?: string;
};

export type CreateMilestone = {
  title: string;
  status?: Status;
  description?: string;
};

export type UpdateMilestone = Omit<CreateMilestone, "title"> & {
  id: string;
  title?: string;
};

export type CreateProject = {
  title: string;
  status?: Status;
  description?: string;
};

export type UpdateProject = Omit<CreateProject, "title"> & {
  id: string;
  title?: string;
};

export abstract class IssueRepository {
  // Issues
  abstract fetchIssueById(id: string): Promise<Issue | undefined>;
  abstract fetchIssueByTitle(title: string): Promise<Issue | undefined>;
  abstract fetchIssuesInMilestone(milestoneId: string): Promise<Issue[]>;
  abstract fetchIssuesInProject(projectId: string): Promise<Issue[]>;

  abstract createIssue(props: CreateIssue): Promise<Issue>;
  abstract updateIssue(props: UpdateIssue): Promise<Issue>;
  abstract hideIssue(id: string): Promise<Issue>;

  abstract compareIds(a: string, b: string): number;

  // Milestones
  abstract fetchMilestoneByTitle(title: string): Promise<Milestone | undefined>;
  abstract fetchMilestones(): Promise<Milestone[]>;
  abstract createMilestone(props: CreateMilestone): Promise<Milestone>;
  abstract updateMilestone(props: UpdateMilestone): Promise<Milestone>;

  // Projects
  abstract fetchProjectByTitle(title: string): Promise<Project | undefined>;
  abstract fetchProjects(): Promise<Project[]>;
  abstract createProject(props: CreateProject): Promise<Project>;
  abstract updateProject(props: UpdateProject): Promise<Project>;
}
