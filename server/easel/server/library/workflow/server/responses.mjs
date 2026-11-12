import { copy, list, record, key, unique } from "./support.mjs";
export default class ResponsesTool {
  submit(state, participants, actor, response) {
    record(state);
    unique(list(participants).map(key));
    if (!participants.includes(actor)) throw new Error("Unknown responder");
    if (response === undefined) throw new Error("Missing response");
    const responses = { ...copy(state), [actor]: copy(response) },
      waiting = participants.filter(
        (id) => !Object.prototype.hasOwnProperty.call(responses, id),
      );
    return { responses, waiting, complete: !waiting.length };
  }
}
