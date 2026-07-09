function configuredAdminIds() {
  return String(process.env.GLOBAL_ADMIN_USER_IDS || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function isGlobalAdminUser(user) {
  if (!user) return false;
  const userId = String(user.id || "").toLowerCase();
  const appRole = user.appRole || user.app_role || "user";
  return appRole === "admin" || (userId && configuredAdminIds().includes(userId));
}

export function isGlobalAdminUserId(store, userId) {
  return isGlobalAdminUser(store.users.get(userId));
}
