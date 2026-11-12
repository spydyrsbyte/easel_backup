import { shuffled } from "./random.mjs";
export default class ShuffleTool {
  shuffle(sequence, source) {
    return shuffled(sequence, source);
  }
}
