export type Status = "open" | "closed";
export type StatusReason = "completed" | "not_planned" | "reopened";

/** Details of an issue. */
export type Issue = {
  id: string;
  title: string;
  description?: string;
  status: Status;
  statusReason?: StatusReason;

  milestone?: Milestone;
};

export type Milestone = {
  id: string;
  title?: string;
  status?: Status;
};
