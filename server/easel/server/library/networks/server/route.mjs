import { copy, list } from "./support.mjs";
import { graph, route } from "./network.mjs";
export default class RouteTool {
  find(network, start, end) {
    return route(network.nodes, network.edges, start, end);
  }
  validate(network, nodes) {
    const ids = graph(network.nodes, network.edges);
    list(nodes);
    if (nodes.some((id) => !ids.has(id))) throw new Error("Unknown route node");
    let cost = 0;
    for (let i = 1; i < nodes.length; i++) {
      const edge = network.edges.find(
        (e) =>
          (e.from === nodes[i - 1] && e.to === nodes[i]) ||
          (!e.directed && e.to === nodes[i - 1] && e.from === nodes[i]),
      );
      if (!edge) throw new Error("Route uses a missing edge");
      cost += edge.cost ?? 1;
    }
    return { nodes: copy(nodes), cost };
  }
}
