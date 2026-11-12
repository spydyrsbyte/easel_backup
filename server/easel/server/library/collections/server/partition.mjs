import { copy, list, integer, record } from "./support.mjs";
export default class PartitionTool {
  create(members, size = 100) {
    list(members);
    integer(size, 1, 10000);
    const pages = [];
    for (let i = 0; i < members.length; i += size)
      pages.push(copy(members.slice(i, i + size)));
    return { size, total: members.length, pages };
  }
  page(partition, index) {
    record(partition);
    list(partition.pages);
    integer(index, 0, Math.max(0, partition.pages.length - 1));
    return copy(partition.pages[index] ?? []);
  }
  locate(partition, id) {
    for (let page = 0; page < list(partition.pages).length; page++) {
      const index = partition.pages[page].findIndex(
        (v) => v === id || v?.id === id,
      );
      if (index >= 0) return { page, index };
    }
    return null;
  }
}
