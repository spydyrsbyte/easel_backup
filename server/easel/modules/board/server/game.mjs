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
    Application.events.register("easel.board.resign", { valid: 2 });
    Application.events.register("easel.board.draw", { valid: 2, action: "string" });
    Application.events.register("easel.board.leave", { valid: 2 });
    Application.events.register("easel.board.rematch", { valid: 2 });
    Application.events.register("easel.board.chat", { valid: 2, text: "string" });
    Application.events.register("easel.board.changed", {
      valid: 5,
      revision: "integer",
    });
    Application.events.register("easel.board.state", {
      valid: 1,
      match: "field",
      user: "string",
      canPlay: "boolean",
      canManage: "boolean",
      now: "number",
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
          result: match.result,
          drawOffer: match.drawOffer,
          captured: match.captured,
          clock: match.clock,
          turnStarted: match.turnStarted,
          chat: match.chat,
        },
        now: Date.now(),
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
    const sideOf = (match, user) =>
      match.seats.white === user ? "white" : match.seats.black === user ? "black" : "";
    const stopClock = (match, side) => {
      const now = Date.now();
      if (side && match.turnStarted)
        match.clock[side] = match.clock[side] + Math.max(0, now - match.turnStarted);
      match.turnStarted = match.winner ? 0 : now;
    };
    const edit = (connection, work) =>
      attempt(connection, () => {
        Application.security.require({ resource: matchID, action: "play" });
        const match = new easel.board.Match(matchID);
        work(match, sideOf(match, connection.user.id));
        match.save();
        Application.events.emit("easel.board.changed", { revision: match.revision });
      });
    const playing = (match, side) => {
      if (!side) throw new Error("Take a seat to do that.");
      if (match.winner) throw new Error("This game has finished.");
      if (!match.seats.white || !match.seats.black)
        throw new Error("Both players must take a seat.");
    };
    Application.events.on("easel.board.resign", (_, connection) =>
      edit(connection, (match, side) => {
        playing(match, side);
        match.winner = side === "white" ? "black" : "white";
        match.result = "resignation";
        match.drawOffer = "";
        stopClock(match, match.turn);
        match.revision += 1;
      }),
    );
    Application.events.on("easel.board.draw", ({ action }, connection) =>
      edit(connection, (match, side) => {
        playing(match, side);
        if (action === "offer") match.drawOffer = side;
        else if (action === "decline" || action === "withdraw") match.drawOffer = "";
        else if (action === "accept") {
          if (!match.drawOffer || match.drawOffer === side)
            throw new Error("There is no draw offer to accept.");
          match.winner = "draw";
          match.result = "agreement";
          match.drawOffer = "";
          stopClock(match, match.turn);
        } else throw new Error("Choose offer, accept or decline.");
        match.revision += 1;
      }),
    );
    Application.events.on("easel.board.leave", (_, connection) =>
      edit(connection, (match, side) => {
        if (!side) throw new Error("You are not seated.");
        if (match.history.length && !match.winner && match.seats.white && match.seats.black)
          throw new Error("Resign before leaving a game in progress.");
        match.seats[side] = "";
        match.names[side] = "";
        match.revision += 1;
      }),
    );
    Application.events.on("easel.board.rematch", (_, connection) =>
      edit(connection, (match, side) => {
        if (!match.winner) throw new Error("Finish this game first.");
        if (!side) Application.security.require({ resource: matchID, action: "manage" });
        match.squares = initialSquares(game);
        const seat = match.seats.white;
        const name = match.names.white;
        match.seats.white = match.seats.black;
        match.seats.black = seat;
        match.names.white = match.names.black;
        match.names.black = name;
        match.turn = "white";
        match.history = [];
        match.captured = [];
        match.chain = -1;
        match.winner = "";
        match.result = "";
        match.drawOffer = "";
        match.clock.white = 0;
        match.clock.black = 0;
        match.turnStarted = 0;
        match.revision += 1;
      }),
    );
    Application.events.on("easel.board.chat", ({ text }, connection) =>
      edit(connection, (match) => {
        const clean = String(text).trim().slice(0, 500);
        if (!clean) throw new Error("Write a message first.");
        match.chat = [
          ...match.chat.slice(-99),
          {
            id: "m" + Date.now() + "-" + Easel.Random.integer(1, 1000000),
            userId: connection.user.id,
            name: connection.user.displayName,
            text: clean,
            timestamp: Date.now(),
          },
        ];
      }),
    );
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
        const match = new easel.board.Match(matchID);
        const last = match.history[match.history.length - 1];
        stopClock(match, last ? last.side : "");
        match.save();
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
