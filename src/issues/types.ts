export type Status = "open" | "closed";
export type StatusReason = "completed" | "not_planned" | "reopened";

/** Details of an issue. */
export class Issue {
  id: string;
  title: string;
  description?: string;
  status?: Status;
  statusReason?: StatusReason;

  milestone?: Milestone;

  constructor(id: string, title: string, data: Omit<Partial<Issue>, "id" | "title">) {
    this.id = id;
    this.title = title;
    Object.assign(this, data);
  }

  equals(other: Issue): boolean {
    return (
      this.id === other.id &&
      this.title === other.title &&
      this.description === other.description &&
      this.status === other.status &&
      this.statusReason === other.statusReason &&
      this.milestone?.id === other.milestone?.id
    );
  }
}

export type Milestone = {
  id: string;
  title?: string;
  status?: Status;
};
