import { bindTable } from "./table.mjs";

export function initialize(options = {}) {
  const ctrl = Easel.Interfaces.create("easel.pf1e.controller@1");
  ctrl.mount({ ...options, integrated: true });
  ctrl.tableBindings = bindTable(ctrl);
  return ctrl;
}
