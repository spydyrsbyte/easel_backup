export function sampleBox(base = "/packages/modules/vtt/client/samples/") {
  return {
    width: 1600,
    ratio: { width: 16, height: 9 },
    elements: [
      { id: "line", name: "Narration", kind: "dialogue", visible: true, x: 250, y: 640, width: 1100, height: 210, fontSize: 34, speaker: "The Stranger", text: "You are late. The Collector does not like to be kept waiting, and neither do I.", color: "#f4f0e6", background: { color: "#0a0c14", opacity: 0.78 } },
      { id: "trees", name: "Foreground trees", kind: "image", visible: true, key: base + "stage-trees.svg", x: 0, y: 0, width: 1600, height: 900 },
      {
        id: "cast",
        name: "Cast",
        kind: "group",
        visible: true,
        children: [
          { id: "stranger", name: "Stranger", kind: "image", visible: true, key: base + "stage-stranger.svg", x: 980, y: 330, width: 300, height: 533, tint: "#ffd9c2", luminance: 0.5 },
          { id: "hero", name: "Hero", kind: "image", visible: true, key: base + "stage-hero.svg", x: 330, y: 360, width: 290, height: 516, flipH: false },
        ],
      },
      { id: "mist", name: "Mist", kind: "image", visible: true, key: base + "stage-mist.svg", x: 0, y: 560, width: 1600, height: 300, alpha: 0.8 },
      { id: "castle", name: "Castle", kind: "image", visible: true, key: base + "stage-castle.svg", x: 0, y: 0, width: 1600, height: 900 },
      { id: "hills", name: "Hills", kind: "image", visible: true, key: base + "stage-hills.svg", x: 0, y: 0, width: 1600, height: 900 },
      { id: "sky", name: "Night sky", kind: "image", visible: true, key: base + "stage-sky.svg", x: 0, y: 0, width: 1600, height: 900 },
    ],
    toggles: [
      { id: "t-stranger", name: "Stranger", on: true, targets: ["stranger"] },
      { id: "t-mist", name: "Mist", on: true, targets: ["mist"] },
      { id: "t-line", name: "Dialogue", on: true, targets: ["line"] },
    ],
  };
}

export default async function story({ Easel }) {
  const editing = globalThis.storyMode === "edit";
  await Easel.Interfaces.load("easel.maps.shadowbox@2");
  const component = Easel.Components.create("easel.maps.shadowbox@2", { id: "box", props: { box: sampleBox(), boxKey: "demo", canRun: true, editing, selectedId: editing ? "stranger" : "" } });
  component.on("select", ({ id }) => component.setProps({ selectedId: id }));
  component.on("boxChange", ({ box }) => component.setProps({ box }));
  component.on("toggle", ({ id, on }) => {
    const box = structuredClone(component.props.box);
    const toggle = box.toggles.find((entry) => entry.id === id);
    toggle.on = on;
    const set = (elements) => {
      for (const element of elements) {
        if (toggle.targets.includes(element.id)) element.visible = on;
        if (element.children) set(element.children);
      }
    };
    set(box.elements);
    component.setProps({ box });
  });
  Easel.Components.mountRoot(component);
  return "ok";
}
