import { access, moveToken } from "./interaction.mjs";

export class Actor extends easel.vtt.Actor {
  access(userId) { return access(this, userId); }
  canRead(userId) { return access(this, userId).read; }
  canWrite(userId) { return access(this, userId).write; }
  canControl(userId) { return access(this, userId).control; }

  tokens() {
    return easel.vtt.Token.ids().map((id) => new easel.vtt.Token(id)).filter((token) => token.actorId === this.id && !token.isDefault);
  }

  moveToken(tokenId, groundId, x, y, userId) {
    const token = new easel.vtt.Token(tokenId);
    if (token.actorId !== this.id) throw new Error("The token does not belong to this actor.");
    moveToken(token, groundId, x, y, userId);
  }

  setDefaultToken(settings, userId) {
    if (!this.canWrite(userId)) throw new Error("Only an owner can change the default token.");
    const token = this.defaultTokenId ? new easel.vtt.Token(this.defaultTokenId) : new easel.vtt.Token();
    token.actorId = this.id;
    token.actorType = this.type;
    token.isDefault = true;
    token.name = settings.name || this.name;
    for (const key of ["image", "width", "height", "rotation", "disposition", "vision"]) if (key in settings) token[key] = settings[key];
    token.save();
    this.defaultTokenId = token.id;
    this.save();
    Application.events.emit("easel.vtt.changed", {});
    return token.id;
  }
}
