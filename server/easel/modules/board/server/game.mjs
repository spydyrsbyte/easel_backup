import { definitions } from "./automations.mjs";

const initialSquares = (game) =>
  Array.from({ length: 64 }, (_, index) => {
    const x = index % 8,
      y = Math.floor(index / 8);
    let side = "",
      kind = "";
    if (game === "chess") {
      if (y < 2 || y > 5) {
        side = y < 2 ? "black" : "white";
        kind =
          y === 1 || y === 6
            ? "pawn"
            : [
                "rook",
                "knight",
                "bishop",
                "queen",
                "king",
                "bishop",
                "knight",
                "rook",
              ][x];
      }
    } else if ((x + y) % 2 === 1 && (y < 3 || y > 4)) {
      side = y < 3 ? "black" : "white";
      kind = "checker";
    }
    return { x, y, side, kind };
  });

export default class Game {
  start(game) {
    let matchID;
    Application.events.register("easel.board.refresh", { valid: 2 });
    Application.events.register("easel.board.seat", { valid: 2, side: "string" });
    Application.events.register("easel.board.move", {
      valid: 2,
      from: "integer",
      to: "integer",
      revision: "integer",
    });
    Application.events.register("easel.board.reset", { valid: 2 });
    Application.events.register("easel.board.changed", {
      valid: 4,
      revision: "integer",
    });
    Application.events.register("easel.board.state", {
      valid: 1,
      match: "field",
      user: "string",
      canPlay: "boolean",
      canManage: "boolean",
    });
    Application.events.register("easel.board.error", { valid: 1, message: "string" });
    Server.events.on("Load.Data.Ready", () => {
      const ids = easel.board.Match.ids();
      if (ids.length) {
        matchID = ids[0];
        return;
      }
      const match = new easel.board.Match();
      match.game = game;
      match.squares = initialSquares(game);
      match.save();
      matchID = match.id;
    });
    Server.events.on("Load.Automation.Ready", () => {
      for (const definition of definitions())
        Application.automations.define(definition);
    });
    const state = (connection) => {
      const match = new easel.board.Match(matchID);
      connection.send("easel.board.state", {
        match: {
          game: match.game,
          squares: match.squares,
          turn: match.turn,
          seats: match.seats,
          names: match.names,
          history: match.history,
          revision: match.revision,
          chain: match.chain,
          winner: match.winner,
        },
        user: connection.user.id,
        canPlay: Application.security.can({
          resource: matchID,
          action: "play",
        }),
        canManage: Application.security.can({
          resource: matchID,
          action: "manage",
        }),
      });
    };
    const attempt = (connection, work) => {
      try {
        work();
      } catch (error) {
        connection.send("easel.board.error", {
          message: error.message || String(error),
        });
      }
    };
    Application.events.on("easel.board.refresh", (_, connection) =>
      state(connection),
    );
    Application.events.on("easel.board.seat", ({ side }, connection) =>
      attempt(connection, () => {
        Application.security.require({ resource: matchID, action: "play" });
        Application.automations.run("easel.board.Seat", [
          matchID,
          connection.user.displayName,
          side,
        ]);
      }),
    );
    Application.events.on("easel.board.move", ({ from, to, revision }, connection) =>
      attempt(connection, () => {
        Application.security.require({ resource: matchID, action: "play" });
        Application.automations.run("easel.board.Move", [
          matchID,
          from,
          to,
          revision,
        ]);
      }),
    );
    Application.events.on("easel.board.reset", (_, connection) =>
      attempt(connection, () => {
        Application.security.require({ resource: matchID, action: "manage" });
        Application.automations.run("easel.board.Reset", [
          matchID,
          initialSquares(game),
        ]);
      }),
    );
  }
}
