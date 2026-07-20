import { createServerFn } from "@tanstack/react-start";

type Role = "admin" | "cashier" | "custom";
type ModuleKey =
  | "pos"
  | "inventory"
  | "categories"
  | "customers"
  | "suppliers"
  | "sales"
  | "purchases"
  | "expenses"
  | "accounting"
  | "reconciliation"
  | "statistics"
  | "settings"
  | "users";

type UserInput = {
  username: string;
  fullName: string;
  password?: string;
  role: Role;
  permissions: ModuleKey[];
  active: boolean;
};

type TokenInput = { token: string };
type LoginInput = { username: string; password: string };
type UpdateInput = { token: string; id: string; user: Partial<UserInput> };
type CreateInput = { token: string; user: UserInput };
type DeleteInput = { token: string; id: string };
type MigrateInput = { token: string; users: Array<UserInput & { username: string }> };

export const loginUser = createServerFn({ method: "POST" })
  .inputValidator((data: LoginInput) => data)
  .handler(async ({ data }) => {
    const { loginWithPassword } = await import("./auth.server");
    return loginWithPassword(data.username, data.password);
  });

export const getCurrentUser = createServerFn({ method: "POST" })
  .inputValidator((data: TokenInput) => data)
  .handler(async ({ data }) => {
    const { getSessionFromToken } = await import("./auth.server");
    return getSessionFromToken(data.token);
  });

export const logoutUser = createServerFn({ method: "POST" })
  .inputValidator((data: TokenInput) => data)
  .handler(async ({ data }) => {
    const { logoutByToken } = await import("./auth.server");
    return logoutByToken(data.token);
  });

export const listAppUsers = createServerFn({ method: "POST" })
  .inputValidator((data: TokenInput) => data)
  .handler(async ({ data }) => {
    const { listUsersForAdmin } = await import("./auth.server");
    return listUsersForAdmin(data.token);
  });

export const createAppUser = createServerFn({ method: "POST" })
  .inputValidator((data: CreateInput) => data)
  .handler(async ({ data }) => {
    const { createUserForAdmin } = await import("./auth.server");
    return createUserForAdmin(data.token, data.user);
  });

export const updateAppUser = createServerFn({ method: "POST" })
  .inputValidator((data: UpdateInput) => data)
  .handler(async ({ data }) => {
    const { updateUserForAdmin } = await import("./auth.server");
    return updateUserForAdmin(data.token, data.id, data.user);
  });

export const deleteAppUser = createServerFn({ method: "POST" })
  .inputValidator((data: DeleteInput) => data)
  .handler(async ({ data }) => {
    const { deleteUserForAdmin } = await import("./auth.server");
    return deleteUserForAdmin(data.token, data.id);
  });

export const migrateLegacyAppUsers = createServerFn({ method: "POST" })
  .inputValidator((data: MigrateInput) => data)
  .handler(async ({ data }) => {
    const { migrateLegacyUsersForAdmin } = await import("./auth.server");
    return migrateLegacyUsersForAdmin(data.token, data.users);
  });