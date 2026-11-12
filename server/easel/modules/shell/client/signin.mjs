import { el } from "./dom.mjs";

export default class SignIn {
  constructor() {
    this.element = document.createElement("section");
    this.element.className = "auth-layout";
    const story = el("section", "auth-story");
    const brand = el("a", "brand");
    brand.href = "/";
    brand.append(el("span", "", "Easel"));
    const copy = el("div", "story-copy");
    copy.append(
      el("span", "eyebrow", "YOUR SPACE TO PLAY"),
      el("h1", "", "Easel"),
      el(
        "p",
        "",
        "A shared space for your games and the people you play them with.",
      ),
    );
    story.append(
      brand,
      copy,
      el("footer", "", "Your games. Your rules. Your server."),
    );
    const side = el("section", "auth-side");
    const box = el("div", "auth-box");
    side.append(box);
    this.element.append(story, side);
    const eyebrow = document.createElement("p");
    eyebrow.className = "eyebrow";
    eyebrow.textContent = "WELCOME TO EASEL";
    this.title = document.createElement("h2");
    this.title.textContent = "Sign in";
    const intro = document.createElement("p");
    intro.className = "muted";
    intro.textContent = "Sign in to join your game.";
    this.form = document.createElement("form");
    this.form.className = "auth-form";
    const field = (name, text, autocomplete, type = "text") => {
      const label = document.createElement("label");
      label.htmlFor = name;
      label.className = "field";
      label.append(el("span", "", text));
      const input = document.createElement("input");
      input.id = name;
      input.name = name;
      input.type = type;
      input.autocomplete = autocomplete;
      label.append(input);
      this.form.append(label);
      return { label, input };
    };
    this.username = field("username", "Username", "username").input;
    this.username.required = true;
    this.username.minLength = 3;
    this.username.maxLength = 32;
    this.password = field(
      "password",
      "Password",
      "current-password",
      "password",
    ).input;
    this.password.required = true;
    this.display = field("displayName", "Display name", "nickname");
    this.display.input.maxLength = 64;
    this.submit = document.createElement("button");
    this.submit.type = "submit";
    this.submit.className = "button primary wide";
    this.form.append(this.submit);
    this.error = document.createElement("p");
    this.error.className = "login-error";
    this.error.setAttribute("role", "alert");
    this.toggle = document.createElement("button");
    this.toggle.type = "button";
    this.toggle.className = "auth-toggle";
    const authSwitch = el("p", "auth-switch");
    authSwitch.append(this.toggle);
    const providers = document.createElement("div");
    this.slots = { providers };
    box.append(
      eyebrow,
      this.title,
      intro,
      this.form,
      this.error,
      authSwitch,
      providers,
    );
    this.onSubmit = (event) => {
      event.preventDefault();
      this.onEvent?.("submitted", {
        username: this.username.value,
        password: this.password.value,
        displayName: this.display.input.value,
      });
    };
    this.onToggle = () =>
      this.onEvent?.("modeChanged", { signup: !this.signup });
    this.form.addEventListener("submit", this.onSubmit);
    this.toggle.addEventListener("click", this.onToggle);
  }
  update(props) {
    this.element.hidden = !props.visible;
    this.signup = props.signup;
    this.title.textContent = props.signup ? "Join us" : "Sign in";
    this.display.label.hidden = !props.signup;
    this.display.input.hidden = !props.signup;
    this.password.autocomplete = props.signup
      ? "new-password"
      : "current-password";
    this.password.minLength = props.signup ? 8 : 1;
    this.submit.textContent = props.signup ? "Create account" : "Sign in";
    this.submit.disabled = props.busy;
    this.toggle.disabled = props.busy;
    this.toggle.textContent = props.signup
      ? "Already have an account? Sign in"
      : "Create an account";
    this.error.textContent = props.error;
    if (this.reset !== props.reset) this.password.value = "";
    this.reset = props.reset;
  }
  destroy() {
    this.form.removeEventListener("submit", this.onSubmit);
    this.toggle.removeEventListener("click", this.onToggle);
    this.password.value = "";
  }
}
