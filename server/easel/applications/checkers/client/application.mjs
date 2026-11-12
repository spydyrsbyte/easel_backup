export async function initialize() {
  await Easel.Interfaces.create("easel.board.controller@1").mount("Checkers");
}
