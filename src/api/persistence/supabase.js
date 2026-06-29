function trimSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

export function createSupabaseClient() {
  const url = trimSlash(process.env.SUPABASE_URL);
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const enabled = Boolean(
    url &&
      serviceKey &&
      /^https?:\/\//i.test(url) &&
      !url.includes("your_supabase_project_url"),
  );

  async function request(path, { method = "GET", body = null, headers = {} } = {}) {
    if (!enabled) {
      return { data: null, error: null, enabled: false };
    }

    const response = await fetch(`${url}/rest/v1/${path}`, {
      method,
      headers: {
        apikey: serviceKey,
        authorization: `Bearer ${serviceKey}`,
        "content-type": "application/json",
        prefer: "return=representation",
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) {
      return {
        data: null,
        error: new Error(typeof data === "string" ? data : JSON.stringify(data)),
        enabled: true,
      };
    }
    return { data, error: null, enabled: true };
  }

  async function select(table, query = "") {
    return request(`${table}${query}`);
  }

  async function insert(table, rows) {
    return request(table, { method: "POST", body: rows });
  }

  async function upsert(table, rows) {
    return request(table, {
      method: "POST",
      body: rows,
      headers: {
        prefer: "resolution=merge-duplicates,return=representation",
      },
    });
  }

  async function patch(table, filters, body) {
    const query = Object.entries(filters)
      .map(([key, value]) => `${encodeURIComponent(key)}=eq.${encodeURIComponent(value)}`)
      .join("&");
    return request(`${table}?${query}`, { method: "PATCH", body });
  }

  return {
    enabled,
    request,
    select,
    insert,
    upsert,
    patch,
  };
}
