import { createRules } from "./rules.mjs";
export default class Rules {
  create(host) {
    return createRules(host);
  }
}
