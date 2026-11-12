import {
  createInterfaces,
  createComponents,
  createRuntime,
  loadClientPackages,
} from "/runtime/runtime.mjs";

async function api(path, method = "GET", body) {
  const response = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = response.status === 204 ? null : await response.json();
  if (!response.ok)
    throw Object.assign(new Error(data?.error || "Request failed"), {
      status: response.status,
    });
  return data;
}

export async function startBrowser(root) {
  const registry = createInterfaces();
  const components = createComponents(registry, root);
  const Easel = Object.freeze({
    Interfaces: registry.api,
    Components: components.api,
  });
  globalThis.Easel = Easel;
  await loadClientPackages(await api("/runtime/shell.json"), registry, Easel);
  await Promise.all(
    ["shell", "header", "signin", "providers", "provider", "status", "action", "session"].map(
      (type) => Easel.Interfaces.load("easel.easel." + type + "@1"),
    ),
  );
  const create = (type, id, props) =>
    Easel.Components.create("easel.easel." + type + "@1", { id, props });
  const shell = create("shell", "shell");
  const header = create("header", "header");
  const signin = create("signin", "login");
  const providers = create("providers", "providers");
  const session = create("session", "session");
  const status = create("status", "status");
  const retry = create("action", "retry", {
    text: "Try again",
    visible: false,
  });
  const logout = create("action", "logout", {
    text: "Sign out",
    visible: false,
  });
  header.attach(shell, "header");
  logout.attach(header, "actions");
  signin.attach(shell, "content");
  providers.attach(signin, "providers");
  session.attach(shell, "content");
  status.attach(header, "status");
  retry.attach(session, "content");
  Easel.Components.mountRoot(shell);
  try {
    for (const name of await api("/api/providers")) {
      create("provider", "provider-" + name, { name }).attach(
        providers,
        "content",
      );
    }
  } catch (error) {
    signin.setProps({ error: error.message });
  }
  components.setApplicationMount(session, "game");
  let connection,
    stopped = false,
    timer;
  const setStatus = (text) => status.setProps({ text });
  const showLogin = () => {
    shell.setProps({
      signedIn: false,
      user: "",
      games: [],
      activeGame: "",
      view: "tables",
    });
    signin.setProps({ visible: true });
    session.setProps({ visible: false });
    logout.setProps({ visible: false });
  };
  async function connect() {
    clearTimeout(timer);
    signin.setProps({ visible: false });
    session.setProps({ visible: true });
    retry.setProps({ visible: false });
    setStatus("Connecting…");
    try {
      const account = await api("/api/me");
      const user = account.user || account;
      shell.setProps({ signedIn: true, user: user.displayName || "" });
      header.setProps({ user: user.displayName || "" });
      logout.setProps({ visible: true });
      connection = createRuntime(root, setStatus, {
        registry,
        components,
        onLevel: ({ game }) => {
          shell.setProps({ activeGame: game || "" });
          const selected = shell.props.games.find((item) => item.id === game);
          header.setProps({
            title: game
              ? selected?.name || "Table"
              : shell.props.view === "applications"
                ? "Applications"
                : shell.props.view === "settings"
                  ? "Settings"
                  : "My Games",
          });
          if (game) sessionStorage.setItem("easel.easel.activeGame", game);
          setStatus("Connected");
        },
      });
      await connection.connect(
        new URL("/client/http", location.href).href.replace(/^http/, "ws"),
      );
      connection.closed.then(async () => {
        if (stopped) return;
        setStatus("Connection lost. Reconnecting…");
        try {
          await api("/api/me");
          timer = setTimeout(() => location.reload(), 1500);
        } catch {
          location.reload();
        }
      });
    } catch (error) {
      connection?.destroy();
      if (error.status === 401) {
        showLogin();
        return;
      }
      shell.setProps({ signedIn: true });
      setStatus(error.message);
      retry.setProps({ visible: true });
    }
  }
  retry.on("pressed", () => location.reload());
  const navigate = async ({ view }) => {
    shell.setProps({ view });
    if (shell.props.activeGame) {
      sessionStorage.removeItem("easel.easel.activeGame");
      await connection.leave();
    } else Easel.Components.get("lobby")?.setProps({ view });
    header.setProps({
      title:
        view === "applications"
          ? "Applications"
          : view === "settings"
            ? "Settings"
            : "My Games",
    });
  };
  shell.on("navigate", (payload) =>
    navigate(payload).catch((error) => setStatus(error.message)),
  );
  header.on("navigate", (payload) =>
    navigate(payload).catch((error) => setStatus(error.message)),
  );
  shell.on("join", async ({ game }) => {
    try {
      if (shell.props.activeGame === game) return;
      if (shell.props.activeGame) {
        sessionStorage.removeItem("easel.easel.activeGame");
        await connection.leave();
      }
      await globalThis.Application.events.emit("lobby.join", { game });
    } catch (error) {
      setStatus(error.message);
    }
  });
  signin.on("modeChanged", ({ signup }) =>
    signin.setProps({ signup, error: "" }),
  );
  let challengeToken = "";
  const challenge = (name, token) => {
    challengeToken = token || "";
    signin.setProps({ challenge: challengeToken ? name || "" : "" });
  };
  const proceed = async (result) => {
    if (result?.challengeToken) {
      challenge(result.challenge, result.challengeToken);
      return;
    }
    challenge("", "");
    signin.setProps({ reset: signin.props.reset + 1 });
    stopped = false;
    await connect();
  };
  signin.on("submitted", async ({ username, password, displayName }) => {
    signin.setProps({ busy: true, error: "" });
    try {
      const signup = signin.props.signup;
      const body = { username, password };
      if (signup) body.displayName = displayName;
      await proceed(
        await api(signup ? "/api/accounts" : "/api/sessions", "POST", body),
      );
    } catch (error) {
      signin.setProps({ error: error.message });
    } finally {
      signin.setProps({ busy: false });
    }
  });
  signin.on("responded", async ({ response }) => {
    signin.setProps({ busy: true, error: "" });
    const token = challengeToken;
    try {
      await proceed(
        await api("/api/sessions/response", "POST", {
          challengeToken: token,
          response,
        }),
      );
    } catch (error) {
      challenge("", "");
      signin.setProps({
        reset: signin.props.reset + 1,
        error: error.message.replace(/\.$/, "") + ". Sign in again to retry.",
      });
    } finally {
      signin.setProps({ busy: false });
    }
  });
  signin.on("challengeCancelled", () => {
    challenge("", "");
    signin.setProps({ error: "" });
  });
  logout.on("pressed", async () => {
    logout.setProps({ enabled: false });
    try {
      await api("/api/sessions", "DELETE");
      sessionStorage.removeItem("easel.easel.activeGame");
      stopped = true;
      clearTimeout(timer);
      connection?.destroy();
      location.reload();
    } catch (error) {
      setStatus(error.message);
      logout.setProps({ enabled: true });
    }
  });
  const returned = new URLSearchParams(location.hash.slice(1));
  if (returned.get("challengeToken")) {
    history.replaceState(null, "", location.pathname + location.search);
    showLogin();
    challenge(returned.get("challenge"), returned.get("challengeToken"));
    return;
  }
  if (returned.get("error")) {
    history.replaceState(null, "", location.pathname + location.search);
    showLogin();
    signin.setProps({ error: returned.get("error") });
    return;
  }
  await connect();
}
