import { Types, type PipelineStage } from "mongoose";
import { escapeRegex, first, type SearchParams, type SortDir } from "@/service/workspace/[workspaceId]/unit/unit-list";

export const USER_PAGE_SIZE = 20;
export const USER_LIST_COLLATION = { locale: "pt", strength: 1 };
const SORT_FIELDS = ["name", "email"] as const;
const ROLE_ID_PATTERN = /^[0-9a-f]{24}$/i;
const STATUSES = ["active", "pending", "expired"] as const;
const ACCENT_CLASSES: Record<string, string> = {
  a: "[aàáâãäå]",
  e: "[eèéêë]",
  i: "[iìíîï]",
  o: "[oòóôõö]",
  u: "[uùúûü]",
  c: "[cç]",
  n: "[nñ]",
};

export type UserSortField = (typeof SORT_FIELDS)[number];
export type UserStatus = (typeof STATUSES)[number];
export type UserListQuery = {
  q: string;
  sort: UserSortField;
  dir: SortDir;
  role: string;
  status: UserStatus | "";
  page: number;
};

export type UserListItem = {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  roleId: string;
  status: UserStatus;
};

export type UserListPage = { rows: UserListItem[]; total: number };

export function parseUserListQuery(params: SearchParams): UserListQuery {
  const sort = first(params.sort);
  const role = first(params.role);
  const status = first(params.status);
  const page = first(params.page);
  return {
    q: first(params.q)?.trim() ?? "",
    sort: SORT_FIELDS.includes(sort as UserSortField) ? (sort as UserSortField) : "name",
    dir: first(params.dir) === "desc" ? "desc" : "asc",
    role: ROLE_ID_PATTERN.test(role ?? "") ? role! : "",
    status: STATUSES.includes(status as UserStatus) ? (status as UserStatus) : "",
    page: page && /^[1-9]\d*$/.test(page) ? Number(page) : 1,
  };
}

function accentInsensitivePattern(q: string) {
  const plain = q.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  return escapeRegex(plain).replace(/[aeioucn]/g, (letter) => ACCENT_CLASSES[letter]);
}

export function userListPipeline(
  workspaceId: string,
  { q, sort, dir, role, status, page }: UserListQuery,
  now: Date,
): PipelineStage[] {
  const workspace = new Types.ObjectId(workspaceId);

  const match: Record<string, unknown> = {};
  if (role) match.roleId = role;
  if (status) match.status = status;
  if (q) {
    const regex = { $regex: accentInsensitivePattern(q), $options: "i" };
    match.$or = [{ name: regex }, { email: regex }];
  }

  return [
    { $match: { workspaceId: workspace } },
    { $lookup: { from: "users", localField: "userId", foreignField: "_id", as: "user" } },
    { $set: { user: { $first: "$user" } } },
    {
      $project: {
        _id: 0,
        id: { $toString: "$_id" },
        roleId: { $toString: "$roleId" },
        email: "$user.email",
        name: { $ifNull: ["$user.name", null] },
        image: { $ifNull: ["$user.avatarUrl", null] },
        status: { $literal: "active" },
      },
    },
    {
      $unionWith: {
        coll: "invites",
        pipeline: [
          { $match: { workspaceId: workspace } },
          {
            $project: {
              _id: 0,
              id: { $toString: "$_id" },
              roleId: { $toString: "$roleId" },
              email: 1,
              name: { $literal: null },
              image: { $literal: null },
              status: { $cond: [{ $lte: ["$expiresAt", now] }, "expired", "pending"] },
            },
          },
        ],
      },
    },
    ...(Object.keys(match).length ? [{ $match: match }] : []),
    { $set: { sortKey: sort === "name" ? { $ifNull: ["$name", "$email"] } : "$email" } },
    { $sort: { sortKey: dir === "desc" ? -1 : 1, id: 1 } },
    {
      $facet: {
        rows: [{ $skip: (page - 1) * USER_PAGE_SIZE }, { $limit: USER_PAGE_SIZE }, { $unset: "sortKey" }],
        total: [{ $count: "n" }],
      },
    },
    { $project: { rows: 1, total: { $ifNull: [{ $first: "$total.n" }, 0] } } },
  ];
}
