export type Status = "open" | "closed";
export type StatusReason = "completed" | "not_planned" | "reopened";

/** Details of an issue. */
export class Issue {
  id: string;
  title: string;
  description?: string;
  status?: Status;
  statusReason?: StatusReason;

  milestoneId?: string;

  constructor(id: string, title: string, data: Omit<Partial<Issue>, "id" | "title"> = {}) {
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
      this.milestoneId === other.milestoneId
    );
  }
}

/** Details of a milestone. */
export class Milestone {
  id: string;
  title: string;
  description?: string;
  status?: Status;

  constructor(id: string, title: string, data: Omit<Partial<Milestone>, "id"> = {}) {
    this.id = id;
    this.title = title;
    Object.assign(this, data);
  }

  equals(other: Milestone): boolean {
    return (
      this.id === other.id &&
      this.title === other.title &&
      this.description === other.description &&
      this.status === other.status
    );
  }
}
