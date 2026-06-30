import { ApiError } from "../errors.js";
import { createId } from "../id.js";

function isAdmin(member) {
  return member?.role === "admin" && member.status === "active";
}

export function createHouseService(store, logActivity, persistence) {
  function assertHouseMember(houseId, userId) {
    const member = store.houseMembers.get(`${houseId}:${userId}`);
    if (!member || member.status !== "active") {
      throw new ApiError(403, "House membership required");
    }
    return member;
  }

  return {
    async createHouse({ creatorUserId, name, address = null, city = null, baseCurrency = "PKR", timezone = "Asia/Karachi", creatorRole = "manager" }) {
      if (!name) throw new ApiError(400, "House name is required");

      const houseId = createId();
      const house = {
        id: houseId,
        name,
        address,
        city,
        country: "PK",
        baseCurrency,
        timezone,
        createdBy: creatorUserId,
        currentMonthStart: null,
        currentMonthEnd: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      store.houses.set(houseId, house);
      await persistence.saveHouse(house);

      const member = {
        id: createId(),
        houseId,
        userId: creatorUserId,
        role: creatorRole,
        status: "active",
        joinedAt: new Date().toISOString(),
        leftAt: null,
        roomName: null,
        phoneDisplay: null,
        isDefaultPayer: true,
      };
      store.houseMembers.set(`${houseId}:${creatorUserId}`, member);
      await persistence.saveHouseMember(member);

      logActivity(houseId, creatorUserId, "house.created", "house", houseId, { name });
      logActivity(houseId, creatorUserId, "house.member_added", "house_member", member.id, { role: creatorRole });

      return { house, member };
    },

    getHouse(houseId) {
      return store.houses.get(houseId) || null;
    },

    listMembers(houseId) {
      return [...store.houseMembers.values()].filter((member) => member.houseId === houseId);
    },

    async addMember({ houseId, actorUserId, user, role = "flatmate" }) {
      assertHouseMember(houseId, actorUserId);
      const actor = store.houseMembers.get(`${houseId}:${actorUserId}`);
      if (!isAdmin(actor)) {
        throw new ApiError(403, "Only the admin can add members");
      }

      if (!user || (!user.fullName && !user.id)) {
        throw new ApiError(400, "Member user details are required");
      }

      let memberUser = user.id ? store.users.get(user.id) : null;
      if (!memberUser) {
        const normalizedContact = user.contact ? String(user.contact).trim().toLowerCase() : null;
        if (normalizedContact && store.usersByContact.has(normalizedContact)) {
          memberUser = store.usersByContact.get(normalizedContact);
        }
      }

      if (!memberUser) {
        const userId = user.id || createId();
        memberUser = {
          id: userId,
          contact: user.contact ? String(user.contact).trim().toLowerCase() : null,
          phone: user.phone || null,
          email: user.email || null,
          fullName: user.fullName,
          avatarUrl: user.avatarUrl || null,
          defaultCurrency: user.defaultCurrency || "PKR",
          locale: user.locale || "en-PK",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        store.users.set(memberUser.id, memberUser);
        if (memberUser.contact) {
          store.usersByContact.set(memberUser.contact, memberUser);
        }
      }

      const member = {
        id: createId(),
        houseId,
        userId: memberUser.id,
        role,
        status: "active",
        joinedAt: new Date().toISOString(),
        leftAt: null,
        roomName: user.roomName || null,
        phoneDisplay: user.phoneDisplay || null,
        isDefaultPayer: Boolean(user.isDefaultPayer),
      };

      store.houseMembers.set(`${houseId}:${memberUser.id}`, member);
      await persistence.saveUser(memberUser);
      await persistence.saveHouseMember(member);
      logActivity(houseId, actorUserId, "house.member_added", "house_member", member.id, { role, userId: memberUser.id });

      return { member, user: memberUser };
    },

    async updateMember({ houseId, actorUserId, memberUserId, patch }) {
      assertHouseMember(houseId, actorUserId);
      const actor = store.houseMembers.get(`${houseId}:${actorUserId}`);
      if (!isAdmin(actor)) {
        throw new ApiError(403, "Only the admin can update members");
      }

      const key = `${houseId}:${memberUserId}`;
      const member = store.houseMembers.get(key);
      if (!member) throw new ApiError(404, "Member not found");

      const updated = {
        ...member,
        ...patch,
      };
      store.houseMembers.set(key, updated);
      await persistence.saveHouseMember(updated);
      logActivity(houseId, actorUserId, "house.member_updated", "house_member", updated.id, patch);
      return updated;
    },

    async removeMember({ houseId, actorUserId, memberUserId }) {
      return this.updateMember({
        houseId,
        actorUserId,
        memberUserId,
        patch: {
          status: "left",
          leftAt: new Date().toISOString(),
        },
      });
    },

    async createInvitation({ houseId, actorUserId, contact, role = "flatmate" }) {
      assertHouseMember(houseId, actorUserId);
      const actor = store.houseMembers.get(`${houseId}:${actorUserId}`);
      if (!isAdmin(actor)) {
        throw new ApiError(403, "Only the admin can invite members");
      }

      const invitationId = createId();
      const invitation = {
        id: invitationId,
        houseId,
        contact: String(contact).trim().toLowerCase(),
        role,
        createdBy: actorUserId,
        status: "pending",
        createdAt: new Date().toISOString(),
      };
      store.houseInvitations.set(invitationId, invitation);
      await persistence.saveInvitation(invitation);
      logActivity(houseId, actorUserId, "house.invitation_created", "house_invitation", invitationId, { contact, role });
      return invitation;
    },
  };
}
