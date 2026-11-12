import Binding from "./binding.mjs";

export default class SceneBinder extends Binding {
  bind(options) {
    this.configure(options);
    this.sceneSignature = undefined;
    this.selectedTokenId = "";
    this.listen(this.map, "resourceError", ({ message }) => this.onError?.(message));
    this.listen(this.map, "cameraChanged", ({ camera }) => { this.camera = camera; });
    this.listen(this.map, "tokenSelect", ({ tokenId }) => {
      this.selectedTokenId = tokenId;
      this.map.setProps({ selectedTokenId: tokenId });
      this.onSelect?.(this.selectedToken());
    });
    this.listen(this.map, "tokenMoveRequest", ({ tokenId, groundId, to }) => {
      if (this.scene) this.send("tokenMove", { tokenId, groundId, x: to.x, y: to.y });
    });
    this.listen(this.map, "doorToggleRequest", ({ wallId, open }) => {
      if (this.scene) this.send("doorToggle", { sceneId: this.scene.id, wallId, open });
    });
    this.listen(this.map, "dropRequest", ({ data, position, groundId }) => {
      if (!this.scene || !this.state.isGM) return;
      const actor = this.resolveActor?.(data.id);
      if (!actor) return this.onError?.("Drop a character from the Actors directory.");
      this.send("tokenCreate", { sceneId: this.scene.id, groundId, actorType: actor.type, actorId: actor.id, name: actor.name, x: position.x, y: position.y });
    });
    this.listen(this.map, "mapEditChange", ({ map }) => {
      if (this.scene && this.state.isGM) this.send("sceneSaveMap", { sceneId: this.scene.id, map });
    });
    this.listen(this.map, "gridCalibrated", ({ grid }) => {
      if (!this.scene || !this.state.isGM) return;
      const map = structuredClone(this.scene.map);
      const ground = map.layers.find((layer) => layer.type === "ground" && layer.id === this.map.props.activeGroundId);
      if (ground) ground.grid = grid;
      this.send("sceneSaveMap", { sceneId: this.scene.id, map });
    });
    this.listen(this.toolstrip, "select", ({ tool }) => this.map.setProps({ tool }));
    return this;
  }

  selectedToken() {
    return this.scene?.tokens.find((token) => token.id === this.selectedTokenId) ?? null;
  }

  update(state) {
    const changedScene = this.scene?.id !== state.activeScene?.id;
    this.state = state;
    this.scene = state.activeScene;
    if (changedScene) this.camera = null;
    const signature = JSON.stringify([this.scene, state.isGM]);
    if (signature === this.sceneSignature) return;
    this.sceneSignature = signature;
    if (changedScene || !this.selectedToken()) this.selectedTokenId = "";
    const map = this.scene?.map ?? {};
    const ground = map.layers?.find((layer) => layer.type === "ground");
    const tokens = this.scene?.tokens.filter((token) => !ground || token.groundId === ground.id) ?? [];
    this.map.setProps({
      title: this.scene?.name ?? "No active scene",
      disabled: !this.scene,
      gm: state.isGM,
      data: map,
      layers: map.layers ?? [],
      width: map.size?.width ?? map.width ?? 1000,
      height: map.size?.height ?? map.height ?? 700,
      grid: ground?.grid ?? map.grid ?? { visible: false },
      activeGroundId: ground?.id ?? "",
      tokens,
      items: [], walls: [], lights: [], drawings: [], roofs: [], templates: [],
      fog: !state.isGM && map.fogEnabled !== false && Boolean(this.scene),
      visionMask: map.visionMask ?? {},
      visionPolygons: map.visionPolygons ?? [],
      selectedTokenId: this.selectedTokenId,
      ...(changedScene ? { camera: { x: 0, y: 0, zoom: 1, rotation: 0 } } : this.camera ? { camera: this.camera } : {}),
    });
  }
}
