import { copy } from "./support.mjs";
import { graph, route } from "./network.mjs";
export default class GraphTool {
  create(nodes, edges = []) {
    graph(nodes, edges);
    return { nodes: copy(nodes), edges: copy(edges) };
  }
  neighbors(network, id) {
    const ids = graph(network.nodes, network.edges);
    if (!ids.has(id)) throw new Error("Unknown node");
    return [
      ...new Set(
        network.edges.flatMap((e) =>
          e.from === id ? [e.to] : !e.directed && e.to === id ? [e.from] : [],
        ),
      ),
    ];
  }
  connected(network, start, end) {
    return route(network.nodes, network.edges, start, end) !== null;
  }
}
