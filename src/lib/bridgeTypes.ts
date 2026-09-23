/**
 * Wire-protocol types for the live bridge (`lib/bridge.ts`).
 *
 * These mirror `EngineQuery`/`EngineQueryResult`/`EngineQueryRequest`/
 * `EngineQueryResponse` from `packages/engine/src/bridge/QueryChannel.ts` in
 * the `emptysock-engine` repo byte-for-byte in shape. They are hand-mirrored
 * here rather than imported from a real `@emptysock/engine` package
 * dependency: that package is `private: true`, lives in a pnpm workspace
 * monorepo with native/WASM dependencies (Rapier, pixi.js, yoga-layout) and
 * is not published to any registry this server can install from, so adding
 * it as a real dependency would mean vendoring and building the entire
 * engine package just to get a handful of type declarations. If
 * `@emptysock/engine` is ever published (or this server moves into the
 * engine's own workspace), replace this file with
 * `import type { EngineQuery, EngineQueryResult, ... } from "@emptysock/engine"`
 * and delete it — do not let the two shapes drift in the meantime; any
 * change to `QueryChannel`'s query/result shapes must be mirrored here too.
 */

export interface Vec2 {
  x: number;
  y: number;
}

export interface ListEntitiesQuery {
  kind: 'listEntities';
}

export interface EntityInfoQuery {
  kind: 'entityInfo';
  entityId: number;
}

export interface GetComponentQuery {
  kind: 'getComponent';
  entityId: number;
  component: string;
}

export interface SetComponentQuery {
  kind: 'setComponent';
  entityId: number;
  component: string;
  patch: Record<string, unknown>;
}

export interface Raycast2DQuery {
  kind: 'raycast2d';
  origin: Vec2;
  direction: Vec2;
  maxToi?: number;
  solid?: boolean;
}

export interface OverlapCircle2DQuery {
  kind: 'overlapCircle2d';
  center: Vec2;
  radius: number;
}

export interface BodyState2DQuery {
  kind: 'bodyState2d';
  entityId: number;
}

/** `scene_create_entity` — spawn a bare entity and add named, already-registered components (defaults only). */
export interface CreateEntityQuery {
  kind: 'createEntity';
  tag?: string;
  components?: string[];
}

/** A message enqueued in an actor's mailbox — payload is caller-defined. */
export interface Message {
  type: string;
  payload?: unknown;
}

/** `actor_send_message` — enqueue a message in one actor's mailbox. */
export interface ActorSendMessageQuery {
  kind: 'actorSendMessage';
  actorId: string;
  message: Message;
}

/** `actor_broadcast` — enqueue a message in every registered actor's mailbox. */
export interface ActorBroadcastQuery {
  kind: 'actorBroadcast';
  message: Message;
}

/** `actor_inbox_size` — one actor's currently-queued (not yet flushed) message count. */
export interface ActorInboxSizeQuery {
  kind: 'actorInboxSize';
  actorId: string;
}

/** `actor_list` — every registered actor's id, in registration order. */
export interface ActorListQuery {
  kind: 'actorList';
}

/** `navmesh_find_path` — an A* waypoint path between two world-space points on the attached navmesh. */
export interface NavMeshFindPathQuery {
  kind: 'navmeshFindPath';
  from: Vec2;
  to: Vec2;
}

/** `navmesh_nearest_node` — the nearest walkable point on the attached navmesh to a world-space point. */
export interface NavMeshNearestNodeQuery {
  kind: 'navmeshNearestNode';
  point: Vec2;
}

export type EngineQuery =
  | ListEntitiesQuery
  | EntityInfoQuery
  | GetComponentQuery
  | SetComponentQuery
  | Raycast2DQuery
  | OverlapCircle2DQuery
  | BodyState2DQuery
  | CreateEntityQuery
  | ActorSendMessageQuery
  | ActorBroadcastQuery
  | ActorInboxSizeQuery
  | ActorListQuery
  | NavMeshFindPathQuery
  | NavMeshNearestNodeQuery;

/** Envelope a transport sends across the wire; `id` round-trips for request/response matching. */
export interface EngineQueryRequest {
  id: string;
  query: EngineQuery;
}

export type EngineQueryErrorCode =
  | 'no-live-instance'
  | 'no-physics-world'
  | 'no-actor-system'
  | 'no-navmesh'
  | 'not-found'
  | 'unknown-component';

export interface EngineQueryError {
  code: EngineQueryErrorCode;
  message: string;
}

export type EngineQueryResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: EngineQueryError };

/** Envelope a transport sends back; `id` matches the originating `EngineQueryRequest.id`. */
export interface EngineQueryResponse {
  id: string;
  result: EngineQueryResult<unknown>;
}

export interface EntitySummary {
  entityId: number;
  components: string[];
  name?: string;
  tags?: readonly string[];
  active?: boolean;
  x?: number;
  y?: number;
  rotation?: number;
}

export interface RaycastResultData {
  entityId: number;
  point: Vec2;
  normal: Vec2;
  toi: number;
}

export interface BodyStateData {
  position: Vec2;
  rotation: number;
  velocity: Vec2;
  type: string;
  isSensor: boolean;
}

export interface CreateEntityData {
  entityId: number;
  tag?: string;
  components: string[];
  /** Names from the request's `components` that no `ComponentDef` was resolvable for. */
  skipped: string[];
}

export interface ActorSendResultData {
  actorId: string;
  queued: true;
}

export interface ActorBroadcastResultData {
  delivered: number;
}
