import { startBrowser } from "/runtime/session.mjs";

startBrowser(document.getElementById("easel-root")).catch(console.error);
