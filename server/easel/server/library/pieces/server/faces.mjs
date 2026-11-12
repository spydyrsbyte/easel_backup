import { copy, list, integer } from "./support.mjs";
export default class FacesTool {
  select(faces, index) {
    list(faces);
    integer(index, 0, faces.length - 1);
    return copy(faces[index]);
  }
  next(faces, index, allowed = true) {
    list(faces);
    integer(index, 0, faces.length - 1);
    if (!allowed) throw new Error("Flip is not allowed");
    return {
      index: (index + 1) % faces.length,
      face: copy(faces[(index + 1) % faces.length]),
    };
  }
}
