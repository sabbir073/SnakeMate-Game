import { MapSchema, Schema, type } from "@colyseus/schema";

/** Colyseus-synchronized state. Deliberately COMPACT (spec §29):
 *  only what remote clients need to render — the body is reconstructed
 *  client-side from head state (path-based worms, ADR-004). */
export class WormSchema extends Schema {
  @type("string") id = "";
  @type("string") nickname = "";
  @type("string") skinId = "s0";
  @type("float32") x = 0;
  @type("float32") y = 0;
  @type("float32") angle = 0;
  @type("float32") speed = 0;
  @type("float32") mass = 0;
  @type("boolean") boosting = false;
  @type("boolean") alive = true;
  @type("uint32") lastInputSeq = 0;
  /** Comma-joined active powerup kinds (e.g. "SPEED,MAGNET"). */
  @type("string") effects = "";
}

export class FoodSchema extends Schema {
  @type("uint32") id = 0;
  @type("string") kind = "COMMON";
  @type("float32") x = 0;
  @type("float32") y = 0;
  @type("uint8") value = 1;
}

export class PowerupSchema extends Schema {
  @type("uint32") id = 0;
  @type("string") kind = "SPEED";
  @type("float32") x = 0;
  @type("float32") y = 0;
}

export class ArenaState extends Schema {
  @type("uint32") tick = 0;
  @type("uint32") worldSize = 0;
  @type({ map: WormSchema }) worms = new MapSchema<WormSchema>();
  @type({ map: FoodSchema }) food = new MapSchema<FoodSchema>();
  @type({ map: PowerupSchema }) powerups = new MapSchema<PowerupSchema>();
}
