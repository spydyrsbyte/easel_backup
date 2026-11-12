import { startTable } from "./table.mjs";

const game = Easel.Interfaces.create("easel.pf1e.game@1");
const table = Easel.Interfaces.create("easel.vtt.table@1");
const publishRoll = startTable(table, game);
game.start({ table, publishRoll });
