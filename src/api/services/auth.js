import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { ApiError } from "../errors.js";
import { createId } from "../id.js";

function normalizeContact(input) {
  if (!input || typeof input !== "string") {
    throw new ApiError(400, "Contact is required");
  }
  return input.trim().toLowerCase();
}

function generateOtpCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function hasSupabaseAuthEnv() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);
}

function authMode() {
  return process.env.SUPABASE_AUTH_MODE === "real" || process.env.SUPABASE_AUTH_MODE === "supabase"
    ? "supabase"
    : "local";
}

function isEmail(contact) {
  return contact.includes("@");
}

function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  const hash = scryptSync(password, salt, 64).toString("hex");
  return { hash, salt, algorithm: "scrypt" };
}

function verifyPassword(password, user) {
  if (!user.passwordHash || !user.passwordSalt) return false;
  const candidate = scryptSync(password, user.passwordSalt, 64);
  const stored = Buffer.from(user.passwordHash, "hex");
  if (candidate.length !== stored.length) return false;
  return timingSafeEqual(candidate, stored);
}

function sanitizeUser(user) {
  const { passwordHash, passwordSalt, passwordAlgorithm, ...safeUser } = user;
  void passwordHash;
  void passwordSalt;
  void passwordAlgorithm;
  return safeUser;
}

async function supabaseRequest(path, body) {
  const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/${path}`, {
    method: "POST",
    headers: {
      apikey: process.env.SUPABASE_ANON_KEY,
      authorization: `Bearer ${process.env.SUPABASE_ANON_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new ApiError(response.status, payload?.msg || payload?.message || "Supabase auth request failed", payload);
  }
  return payload;
}

export function createAuthService(store, persistence) {
  return {
    async createPasswordUser({ contact, fullName, password, role = "flatmate" }) {
      const normalized = normalizeContact(contact);
      if (!fullName || typeof fullName !== "string") {
        throw new ApiError(400, "Full name is required");
      }
      if (!password || typeof password !== "string" || password.length < 6) {
        throw new ApiError(400, "Password must be at least 6 characters");
      }
      const existingUser = store.usersByContact.get(normalized);
      if (existingUser?.passwordHash) {
        throw new ApiError(409, "A user with this login already exists");
      }

      const passwordRecord = hashPassword(password);
      const user = {
        ...(existingUser || {}),
        id: existingUser?.id || createId(),
        contact: normalized,
        phone: existingUser?.phone || (normalized.includes("@") ? null : normalized),
        email: existingUser?.email || (normalized.includes("@") ? normalized : null),
        fullName: fullName.trim(),
        avatarUrl: existingUser?.avatarUrl || null,
        defaultCurrency: existingUser?.defaultCurrency || "PKR",
        locale: existingUser?.locale || "en-PK",
        passwordHash: passwordRecord.hash,
        passwordSalt: passwordRecord.salt,
        passwordAlgorithm: passwordRecord.algorithm,
        createdAt: existingUser?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      store.users.set(user.id, user);
      store.usersByContact.set(normalized, user);
      await persistence.saveUser(user);

      return { user: sanitizeUser(user), role };
    },

    async loginWithPassword({ contact, password }) {
      const normalized = normalizeContact(contact);
      const user = store.usersByContact.get(normalized);
      if (!user || !verifyPassword(password, user)) {
        throw new ApiError(401, "Invalid login or password");
      }

      const sessionToken = createId();
      store.sessions.set(sessionToken, {
        userId: user.id,
        createdAt: Date.now(),
      });
      await persistence.saveSession(sessionToken, user.id);

      return {
        token: sessionToken,
        user: sanitizeUser(user),
        provider: "password",
      };
    },

    async changePassword({ userId, currentPassword, newPassword }) {
      const user = store.users.get(userId);
      if (!user || !verifyPassword(currentPassword, user)) {
        throw new ApiError(401, "Current password is incorrect");
      }
      if (!newPassword || typeof newPassword !== "string" || newPassword.length < 6) {
        throw new ApiError(400, "New password must be at least 6 characters");
      }

      const passwordRecord = hashPassword(newPassword);
      const updated = {
        ...user,
        passwordHash: passwordRecord.hash,
        passwordSalt: passwordRecord.salt,
        passwordAlgorithm: passwordRecord.algorithm,
        updatedAt: new Date().toISOString(),
      };
      store.users.set(updated.id, updated);
      if (updated.contact) store.usersByContact.set(updated.contact, updated);
      await persistence.saveUser(updated);
      return { user: sanitizeUser(updated) };
    },

    async requestOtp({ contact, fullName = null }) {
      const normalized = normalizeContact(contact);
      if (authMode() === "supabase" && hasSupabaseAuthEnv()) {
        const payload = isEmail(normalized)
          ? { email: normalized, create_user: true, data: { full_name: fullName || null } }
          : { phone: normalized, channel: "sms", create_user: true, data: { full_name: fullName || null } };

        await supabaseRequest("otp", payload);
        return {
          contact: normalized,
          expiresInSeconds: 600,
          devCode: null,
          provider: "supabase",
        };
      }

      const code = generateOtpCode();
      const expiresAt = Date.now() + 10 * 60 * 1000;

      const otp = { contact: normalized, code, expiresAt, fullName };
      store.otps.set(normalized, otp);
      await persistence.saveOtp(otp);

      return {
        contact: normalized,
        expiresInSeconds: 600,
        devCode: code,
        provider: "local",
      };
    },

    async verifyOtp({ contact, code, fullName = null }) {
      const normalized = normalizeContact(contact);

      if (authMode() === "supabase" && hasSupabaseAuthEnv()) {
        const payload = isEmail(normalized)
          ? { email: normalized, token: String(code), type: "email" }
          : { phone: normalized, token: String(code), type: "sms" };

        const session = await supabaseRequest("verify", payload);
        const authUser = session.user;
        const accessToken = session.access_token;

        const user = {
          id: authUser.id,
          contact: normalized,
          phone: authUser.phone || (isEmail(normalized) ? null : normalized),
          email: authUser.email || (isEmail(normalized) ? normalized : null),
          fullName:
            authUser.user_metadata?.full_name ||
            authUser.user_metadata?.name ||
            fullName ||
            "New User",
          avatarUrl: authUser.user_metadata?.avatar_url || null,
          defaultCurrency: "PKR",
          locale: "en-PK",
          createdAt: authUser.created_at || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        store.users.set(user.id, user);
        store.usersByContact.set(normalized, user);
        await persistence.saveUser(user);

        store.sessions.set(accessToken, {
          userId: user.id,
          createdAt: Date.now(),
        });
        await persistence.saveSession(accessToken, user.id);

        return {
          token: accessToken,
          user: sanitizeUser(user),
          provider: "supabase",
        };
      }

      const record = store.otps.get(normalized);
      if (!record) {
        throw new ApiError(400, "OTP not requested");
      }
      if (record.expiresAt < Date.now()) {
        store.otps.delete(normalized);
        throw new ApiError(400, "OTP expired");
      }
      if (record.code !== String(code)) {
        throw new ApiError(401, "Invalid OTP");
      }

      let user = store.usersByContact.get(normalized);
      if (!user) {
        const id = createId();
        user = {
          id,
          contact: normalized,
          phone: normalized.includes("@") ? null : normalized,
          email: normalized.includes("@") ? normalized : null,
          fullName: fullName || record.fullName || "New User",
          avatarUrl: null,
          defaultCurrency: "PKR",
          locale: "en-PK",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        store.users.set(id, user);
        store.usersByContact.set(normalized, user);
        await persistence.saveUser(user);
      }

      const sessionToken = createId();
      store.sessions.set(sessionToken, {
        userId: user.id,
        createdAt: Date.now(),
      });
      await persistence.saveSession(sessionToken, user.id);
      store.otps.delete(normalized);

      return {
        token: sessionToken,
        user: sanitizeUser(user),
        provider: "local",
      };
    },

    getCurrentUser(userId) {
      return store.users.get(userId) || null;
    },
  };
}
